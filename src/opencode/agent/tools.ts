import { tool } from '@opencode-ai/plugin';
import { loadSkillAgents, type ParsedAgent } from '../loader';

/**
 * Skill-Based Subagent Tools
 *
 * Provides tools for spawning specialized subagents defined within skills.
 * Implements the Skill-Based Subagent System from PLAN.md.
 *
 * Tools:
 * - skill_agent: Spawn single agent with context
 * - skill_list: Discover available agents
 * - skill_spawn_batch: Parallel agent execution
 * - skill_gather: Collect background results
 */

// Track background tasks for gathering
const backgroundTasks = new Map<string, {
  taskId: string;
  agent: string;
  prompt: string;
  startedAt: number;
  status: 'pending' | 'completed' | 'failed';
  result?: any;
}>();

/**
 * Context object for rich agent invocation
 */
interface SkillAgentContext {
  /** Explicit user direction (goals, constraints) */
  explicit_direction?: {
    goals?: string[];
    constraints?: string[];
    priorities?: string[];
  };
  /** Tracked assumptions from Chief-of-Staff */
  assumptions?: Array<{
    worker?: string;
    assumed: string;
    confidence: number;
    verified?: boolean;
  }>;
  /** Relevant memories from Memory Lane */
  relevant_memories?: Array<{
    type: string;
    information: string;
    confidence?: number;
  }>;
  /** Files assigned to this agent */
  files_assigned?: string[];
  /** Ledger snapshot for continuity */
  ledger_snapshot?: string;
  /** Spec from spec-writer (SDD pipeline) */
  spec?: any;
  /** Plan from planner (SDD pipeline) */
  plan?: any;
  /** Previous dialogue state for multi-turn interactions */
  dialogue_state?: DialogueState;
}

/**
 * Interaction modes for skill_agent
 * - 'one_shot': Agent returns structured output, pipeline continues (default)
 * - 'dialogue': Agent enters interactive loop, requires user approval to exit
 */
type InteractionMode = 'one_shot' | 'dialogue';

/**
 * Dialogue status returned by interactive agents
 * Used to control the interaction loop
 */
type DialogueStatus =
  | 'needs_input'        // Agent needs more information from user
  | 'needs_approval'     // Agent has a proposal, needs user to approve
  | 'needs_verification' // Agent made assumptions, needs user to verify
  | 'approved'           // User approved, ready to proceed
  | 'rejected'           // User rejected, agent should abort or retry
  | 'completed';         // Dialogue naturally completed

/**
 * State for multi-turn dialogue interactions
 */
interface DialogueState {
  /** Current status of the dialogue */
  status: DialogueStatus;
  /** Turn number in this dialogue (1-indexed) */
  turn: number;
  /** Questions or proposals pending user response */
  pending_questions?: string[];
  /** Accumulated explicit direction from dialogue */
  accumulated_direction?: {
    goals?: string[];
    constraints?: string[];
    preferences?: string[];
    decisions?: string[];
  };
  /** Assumptions pending verification */
  pending_assumptions?: Array<{
    assumed: string;
    confidence: number;
    context?: string;
  }>;
  /** Proposal pending approval (for 'needs_approval' status) */
  proposal?: {
    type: 'spec' | 'plan' | 'checkpoint' | 'other';
    summary: string;
    details: any;
  };
  /** Message to display to user */
  message_to_user?: string;
  /** History of this dialogue session */
  history?: Array<{
    role: 'agent' | 'user';
    content: string;
    timestamp: string;
  }>;
}

export function createSkillAgentTools(client: any) {
  return {
    /**
     * skill_agent - Spawn a specialized subagent with optional context
     *
     * Enhanced from original to support:
     * - Structured context injection
     * - Rich error messages with available agents
     * - Interactive dialogue mode with user approval loops
     *
     * Interaction Modes:
     * - 'one_shot' (default): Agent returns structured output, pipeline continues
     * - 'dialogue': Agent returns dialogue state, caller handles user interaction loop
     */
    skill_agent: tool({
      description:
        'Spawn a specialized subagent. Supports context injection and interactive dialogue mode for multi-turn user interactions.',
      args: {
        skill_name: tool.schema.string().describe('Name of the skill (e.g., "sisyphus")'),
        agent_name: tool.schema.string().describe('Name of the subagent (e.g., "planner")'),
        prompt: tool.schema.string().describe('Task description for the subagent'),
        interaction_mode: tool.schema
          .enum(['one_shot', 'dialogue'])
          .optional()
          .describe('Interaction mode: "one_shot" (default) for immediate return, "dialogue" for multi-turn with user approval'),
        run_in_background: tool.schema
          .boolean()
          .optional()
          .describe('Run in background (non-blocking). Defaults to false. Not compatible with dialogue mode.'),
        context: tool.schema
          .any()
          .optional()
          .describe(
            'Structured context: { explicit_direction, assumptions, relevant_memories, files_assigned, spec, plan, dialogue_state }'
          ),
      },
      async execute(args, _context) {
        const { skill_name, agent_name, prompt, interaction_mode, run_in_background, context } = args;
        const fullName = `${skill_name}/${agent_name}`;
        const mode = interaction_mode || 'one_shot';

        // Validate: dialogue mode not compatible with background
        if (mode === 'dialogue' && run_in_background) {
          return JSON.stringify({
            success: false,
            error: 'INVALID_ARGS',
            message: 'Dialogue mode is not compatible with background execution. Use one_shot mode for background tasks.',
          });
        }

        // Discover all agents
        const allAgents = await loadSkillAgents();
        const agent = allAgents.find((a) => a.name === fullName);

        if (!agent) {
          const skillAgents = allAgents
            .filter((a) => a.name.startsWith(`${skill_name}/`))
            .map((a) => a.name.split('/')[1]);

          return JSON.stringify({
            success: false,
            error: 'AGENT_NOT_FOUND',
            message:
              `Agent '${agent_name}' not found in skill '${skill_name}'. ` +
              (skillAgents.length > 0
                ? `Available: ${skillAgents.join(', ')}`
                : `No agents found for skill '${skill_name}'.`),
            available_agents: skillAgents,
          });
        }

        // Build enhanced prompt with context
        let enhancedPrompt = prompt;
        const ctx = (context as SkillAgentContext) || {};
        const contextSection: string[] = [];

        // Add dialogue mode instructions if applicable
        if (mode === 'dialogue') {
          contextSection.push('## INTERACTION MODE: DIALOGUE');
          contextSection.push('');
          contextSection.push('You are in DIALOGUE mode. You MUST return a structured response with:');
          contextSection.push('');
          contextSection.push('```json');
          contextSection.push('{');
          contextSection.push('  "dialogue_state": {');
          contextSection.push('    "status": "needs_input" | "needs_approval" | "needs_verification" | "approved" | "rejected" | "completed",');
          contextSection.push('    "turn": <number>,');
          contextSection.push('    "message_to_user": "<your message or question>",');
          contextSection.push('    "pending_questions": ["<question1>", ...],  // if status is needs_input');
          contextSection.push('    "pending_assumptions": [{...}],  // if status is needs_verification');
          contextSection.push('    "proposal": {...},  // if status is needs_approval');
          contextSection.push('    "accumulated_direction": { goals: [], constraints: [], ... }');
          contextSection.push('  },');
          contextSection.push('  "output": { ... }  // your structured output when completed/approved');
          contextSection.push('}');
          contextSection.push('```');
          contextSection.push('');
          contextSection.push('**CRITICAL**: Do NOT proceed to next phase until status is "approved" or "completed".');
          contextSection.push('If you need user input or approval, return the appropriate status and WAIT.');
          contextSection.push('');

          // Include previous dialogue state if continuing
          if (ctx.dialogue_state) {
            contextSection.push('## Previous Dialogue State');
            contextSection.push(`Turn: ${ctx.dialogue_state.turn}`);
            contextSection.push(`Previous Status: ${ctx.dialogue_state.status}`);
            if (ctx.dialogue_state.accumulated_direction) {
              const dir = ctx.dialogue_state.accumulated_direction;
              if (dir.goals?.length) contextSection.push(`Goals so far: ${dir.goals.join(', ')}`);
              if (dir.constraints?.length) contextSection.push(`Constraints so far: ${dir.constraints.join(', ')}`);
              if (dir.decisions?.length) contextSection.push(`Decisions so far: ${dir.decisions.join(', ')}`);
            }
            if (ctx.dialogue_state.history?.length) {
              contextSection.push('');
              contextSection.push('## Dialogue History');
              for (const h of ctx.dialogue_state.history) {
                contextSection.push(`[${h.role.toUpperCase()}]: ${h.content}`);
              }
            }
            contextSection.push('');
          }
        }

        if (ctx.explicit_direction) {
          contextSection.push('## Explicit Direction');
          if (ctx.explicit_direction.goals?.length) {
            contextSection.push(`Goals: ${ctx.explicit_direction.goals.join(', ')}`);
          }
          if (ctx.explicit_direction.constraints?.length) {
            contextSection.push(`Constraints: ${ctx.explicit_direction.constraints.join(', ')}`);
          }
        }

        if (ctx.assumptions?.length) {
          contextSection.push('## Known Assumptions');
          for (const a of ctx.assumptions) {
            contextSection.push(
              `- ${a.assumed} (confidence: ${a.confidence}${a.verified ? ', verified' : ''})`
            );
          }
        }

        if (ctx.relevant_memories?.length) {
          contextSection.push('## Relevant Past Learnings');
          for (const m of ctx.relevant_memories) {
            contextSection.push(`- [${m.type}]: ${m.information}`);
          }
        }

        if (ctx.files_assigned?.length) {
          contextSection.push(`## Assigned Files: ${ctx.files_assigned.join(', ')}`);
        }

        if (contextSection.length > 0) {
          enhancedPrompt = `${contextSection.join('\n')}\n\n---\n\n${prompt}`;
        }

        // Prepare spawn arguments
        const spawnArgs = {
          description: enhancedPrompt,
          agent: agent.name,
        };

        try {
          if (run_in_background) {
            const taskId = await client.call('background_task', spawnArgs);

            // Track for gathering
            backgroundTasks.set(taskId, {
              taskId,
              agent: fullName,
              prompt,
              startedAt: Date.now(),
              status: 'pending',
            });

            return JSON.stringify({
              success: true,
              taskId,
              agent: fullName,
              mode: 'background',
            });
          } else {
            const result = await client.call('task', spawnArgs);

            // For dialogue mode, include mode info in response
            if (mode === 'dialogue') {
              return JSON.stringify({
                success: true,
                output: result,
                agent: fullName,
                mode: 'dialogue',
                interaction_hint: 'Check output.dialogue_state.status to determine if user input is needed before proceeding.',
              });
            }

            return JSON.stringify({
              success: true,
              output: result,
              agent: fullName,
              mode: 'foreground',
            });
          }
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'SPAWN_FAILED',
            message: error.message || String(error),
            agent: fullName,
          });
        }
      },
    }),

    /**
     * skill_list - Discover available skill-based agents
     *
     * Use this before delegation to know what agents are available.
     */
    skill_list: tool({
      description:
        'List available skill-based agents. Use to discover agents before spawning.',
      args: {
        skill: tool.schema
          .string()
          .optional()
          .describe('Filter by skill name (e.g., "sisyphus")'),
        include_metadata: tool.schema
          .boolean()
          .optional()
          .describe('Include model, tool_access, and other metadata'),
      },
      async execute(args) {
        const allAgents = await loadSkillAgents();

        let filtered = allAgents;
        if (args.skill) {
          filtered = allAgents.filter((a) => a.name.startsWith(`${args.skill}/`));
        }

        const agents = filtered.map((a) => {
          const base = {
            name: a.name,
            description: a.config.description || 'No description',
          };

          if (args.include_metadata) {
            return {
              ...base,
              model: a.config.model,
              tool_access: a.config.metadata?.tool_access || [],
              type: a.config.metadata?.type,
            };
          }

          return base;
        });

        // Group by skill for readability
        const bySkill: Record<string, typeof agents> = {};
        for (const agent of agents) {
          const [skill] = agent.name.split('/');
          if (!bySkill[skill]) bySkill[skill] = [];
          bySkill[skill].push(agent);
        }

        return JSON.stringify({
          total: agents.length,
          by_skill: bySkill,
          agents,
        });
      },
    }),

    /**
     * skill_spawn_batch - Spawn multiple agents in parallel
     *
     * Use for MapReduce patterns where tasks are independent.
     */
    skill_spawn_batch: tool({
      description:
        'Spawn multiple agents in parallel. Use for MapReduce patterns.',
      args: {
        tasks: tool.schema
          .array(
            tool.schema.object({
              skill: tool.schema.string().describe('Skill name'),
              agent: tool.schema.string().describe('Agent name'),
              prompt: tool.schema.string().describe('Task prompt'),
              context: tool.schema.any().optional().describe('Optional context'),
            })
          )
          .describe('Array of tasks to spawn'),
        wait: tool.schema
          .boolean()
          .optional()
          .describe('Wait for all to complete (blocking). Defaults to false.'),
        timeout_ms: tool.schema
          .number()
          .optional()
          .describe('Max wait time in ms. Defaults to 120000 (2 min).'),
      },
      async execute(args, context) {
        const { tasks, wait = false, timeout_ms = 120000 } = args;
        const allAgents = await loadSkillAgents();

        // Validate all agents exist first
        const validationErrors: string[] = [];
        for (const t of tasks) {
          const fullName = `${t.skill}/${t.agent}`;
          if (!allAgents.find((a) => a.name === fullName)) {
            validationErrors.push(`Agent '${fullName}' not found`);
          }
        }

        if (validationErrors.length > 0) {
          return JSON.stringify({
            success: false,
            error: 'VALIDATION_FAILED',
            errors: validationErrors,
          });
        }

        // Spawn all in parallel
        const taskIds: string[] = [];
        const spawnResults = await Promise.all(
          tasks.map(async (t) => {
            try {
              const fullName = `${t.skill}/${t.agent}`;
              const agent = allAgents.find((a) => a.name === fullName)!;

              // Build enhanced prompt
              let enhancedPrompt = t.prompt;
              if (t.context) {
                enhancedPrompt = `## Context\n${JSON.stringify(t.context, null, 2)}\n\n---\n\n${t.prompt}`;
              }

              const taskId = await client.call('background_task', {
                description: enhancedPrompt,
                agent: agent.name,
              });

              // Track for gathering
              backgroundTasks.set(taskId, {
                taskId,
                agent: fullName,
                prompt: t.prompt,
                startedAt: Date.now(),
                status: 'pending',
              });

              taskIds.push(taskId);
              return { success: true, taskId, agent: fullName };
            } catch (error: any) {
              return { success: false, error: error.message, agent: `${t.skill}/${t.agent}` };
            }
          })
        );

        // If not waiting, return immediately
        if (!wait) {
          return JSON.stringify({
            success: true,
            task_ids: taskIds,
            spawned: spawnResults.filter((r) => r.success).length,
            failed: spawnResults.filter((r) => !r.success).length,
            spawn_results: spawnResults,
          });
        }

        // Wait for completion with timeout
        const startTime = Date.now();
        const results: Array<{ task_id: string; success: boolean; output?: any; error?: string }> = [];

        while (Date.now() - startTime < timeout_ms && results.length < taskIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2s

          for (const taskId of taskIds) {
            if (results.find((r) => r.task_id === taskId)) continue;

            const tracked = backgroundTasks.get(taskId);
            if (tracked && tracked.status !== 'pending') {
              results.push({
                task_id: taskId,
                success: tracked.status === 'completed',
                output: tracked.result,
                error: tracked.status === 'failed' ? tracked.result : undefined,
              });
            }
          }
        }

        const pending = taskIds.filter((id) => !results.find((r) => r.task_id === id));

        return JSON.stringify({
          success: pending.length === 0,
          task_ids: taskIds,
          results,
          pending,
          timed_out: pending.length > 0,
        });
      },
    }),

    /**
     * skill_gather - Collect results from background tasks
     *
     * Use after skill_spawn_batch or skill_agent with run_in_background.
     */
    skill_gather: tool({
      description:
        'Collect results from background tasks. Use after skill_spawn_batch.',
      args: {
        task_ids: tool.schema
          .array(tool.schema.string())
          .describe('Task IDs to gather results for'),
        timeout_ms: tool.schema
          .number()
          .optional()
          .describe('Max wait time in ms. Defaults to 60000 (1 min).'),
        partial: tool.schema
          .boolean()
          .optional()
          .describe('Return partial results if some still pending. Defaults to false.'),
      },
      async execute(args) {
        const { task_ids, timeout_ms = 60000, partial = false } = args;

        const startTime = Date.now();
        const completed: Array<{ task_id: string; success: boolean; output?: any; agent?: string }> = [];
        const failed: Array<{ task_id: string; error: string; agent?: string }> = [];
        let pending = [...task_ids];

        while (Date.now() - startTime < timeout_ms && pending.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1s

          const stillPending: string[] = [];

          for (const taskId of pending) {
            const tracked = backgroundTasks.get(taskId);
            if (!tracked) {
              // Unknown task ID
              failed.push({ task_id: taskId, error: 'UNKNOWN_TASK_ID' });
              continue;
            }

            if (tracked.status === 'completed') {
              completed.push({
                task_id: taskId,
                success: true,
                output: tracked.result,
                agent: tracked.agent,
              });
            } else if (tracked.status === 'failed') {
              failed.push({
                task_id: taskId,
                error: tracked.result || 'Task failed',
                agent: tracked.agent,
              });
            } else {
              stillPending.push(taskId);
            }
          }

          pending = stillPending;

          // If partial mode and we have some results, return early check
          if (partial && (completed.length > 0 || failed.length > 0) && Date.now() - startTime > 5000) {
            break;
          }
        }

        return JSON.stringify({
          completed,
          failed,
          pending,
          all_done: pending.length === 0,
          duration_ms: Date.now() - startTime,
        });
      },
    }),
  };
}

/**
 * Update background task status (called by task completion hooks)
 */
export function updateBackgroundTaskStatus(
  taskId: string,
  status: 'completed' | 'failed',
  result?: any
) {
  const task = backgroundTasks.get(taskId);
  if (task) {
    task.status = status;
    task.result = result;
  }
}

/**
 * Get all tracked background tasks
 */
export function getBackgroundTasks() {
  return Array.from(backgroundTasks.values());
}
