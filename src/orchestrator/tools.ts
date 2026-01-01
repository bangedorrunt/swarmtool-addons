import { tool, type PluginInput } from '@opencode-ai/plugin';
import { resolveAgent, listAllAgents } from './skill-agent-resolution';
import {
  spawnChildAgent,
  waitForSessionCompletion,
  fetchSessionResult,
} from './session-coordination';
import { loadActorState } from './actor/state';
import { processMessage } from './actor/core';
import { canCallAgent } from './access-control';
import { loadLedger, saveLedger, updateTaskStatus, logActivity } from './ledger';
import { getTaskRegistry } from './task-registry';
import { WorkflowLoader, WorkflowProcessor } from './workflow-engine';

interface AgentConfig {
  name: string;
  config: {
    prompt?: string;
    model?: string;
    description?: string;
    tools?: string[];
    temperature?: number;
    metadata?: Record<string, unknown>;
  };
}

interface ToolContext {
  sessionID?: string;
  messageID?: string;
  agent?: string;
  abort?: () => void;
}

// Import dialogue utilities from standalone module (enables testing without @opencode-ai/plugin)
import { extractDialogueState, BLOCKING_STATUSES, type DialogueState } from './dialogue-utils';

// Re-export for backwards compatibility
export { extractDialogueState, BLOCKING_STATUSES, type DialogueState } from './dialogue-utils';

export function createSkillAgentTools(client: PluginInput['client']) {
  return {
    agent_yield: tool({
      description:
        'Suspend execution and save state to LEDGER. Use when waiting for user input or external events.',
      args: {
        reason: tool.schema.string().describe('Reason for yielding (e.g. "Ask User about Port")'),
        summary: tool.schema.string().describe('Summary of current reasoning state to resume from'),
      },
      async execute(args, execContext) {
        const { reason, summary } = args;
        const sessionId = execContext?.sessionID;
        const agent = (execContext as unknown as ToolContext)?.agent;

        if (!sessionId || !agent) {
          return JSON.stringify({
            success: false,
            error: 'NO_CONTEXT',
            message: 'Cannot yield without session ID and agent context',
          });
        }

        // 1. Update Ledger
        try {
          const ledger = await loadLedger();
          if (ledger.epic) {
            // Find task for this agent/session
            const task = ledger.epic.tasks.find(
              (t) => t.sessionId === sessionId || (t.agent === agent && t.status === 'running')
            );
            if (task) {
              task.status = 'suspended';
              task.yieldReason = reason;
              await saveLedger(ledger);
            }
          }
        } catch (e) {
          console.error('[agent_yield] Failed to update ledger:', (e as Error).message);
        }

        // 2. Return Handoff Intent (Signal)
        return JSON.stringify({
          success: true,
          status: 'HANDOFF_INTENT',
          message: `Agent suspended: ${reason}`,
          metadata: {
            handoff: {
              type: 'UPWARD_SIGNAL',
              target_agent: 'parent', // System resolves this
              reason: reason,
              summary: summary,
              session_id: sessionId,
            },
          },
        });
      },
    }),

    agent_resume: tool({
      description: 'Resume execution of a suspended agent by injecting a signal.',
      args: {
        task_id: tool.schema.string().optional().describe('Task ID to resume (from Ledger)'),
        session_id: tool.schema.string().optional().describe('Session ID to resume'),
        signal_data: tool.schema
          .string()
          .describe('Instruction/Data to inject to resume the agent'),
      },
      async execute(args, execContext) {
        const { task_id, session_id, signal_data } = args;

        let targetSessionId = session_id;

        // 1. Resolve Session ID from Ledger if task_id provided
        const ledger = await loadLedger();
        if (task_id && ledger.epic) {
          const task = ledger.epic.tasks.find((t) => t.id === task_id);
          if (task) {
            targetSessionId = task.sessionId;
            // Update status back to running
            task.status = 'running';
            task.yieldReason = undefined;
            await saveLedger(ledger);
          }
        }

        if (!targetSessionId) {
          return JSON.stringify({
            success: false,
            error: 'NOT_FOUND',
            message: 'Target session not found',
          });
        }

        // 2. Trigger Resume Prompt
        try {
          await client.session.promptAsync({
            path: { id: targetSessionId },
            body: {
              agent: 'system', // or implicit
              parts: [{ type: 'text', text: `[SYSTEM: RESUME SIGNAL]\n${signal_data}` }],
            },
          });
        } catch (e) {
          return JSON.stringify({
            success: false,
            error: 'PROMPT_FAILED',
            message: (e as Error).message,
          });
        }

        return JSON.stringify({
          success: true,
          message: `Resumed session ${targetSessionId}`,
        });
      },
    }),

    skill_agent: tool({
      description:
        'Spawn a specialized subagent. Use async:false for sequential orchestration (waits for result).',
      args: {
        skill_name: tool.schema
          .string()
          .optional()
          .describe('Name of the skill (e.g., "chief-of-staff")'),
        agent_name: tool.schema.string().optional().describe('Name of the agent (e.g., "oracle")'),
        agent: tool.schema.string().optional().describe('Alias for agent_name'),
        prompt: tool.schema.string().describe('Task or message for the agent'),
        session_id: tool.schema.string().optional().describe('Existing sub-session ID to continue'),
        context: tool.schema.any().optional().describe('Metadata context for the agent'),
        async: tool.schema
          .boolean()
          .optional()
          .default(true)
          .describe('true: handoff (async), false: wait for result (sync)'),
        timeout_ms: tool.schema
          .number()
          .optional()
          .default(60000)
          .describe('Timeout in ms for sync mode (default: 60000)'),
        complexity: tool.schema
          .enum(['low', 'medium', 'high'])
          .optional()
          .default('medium')
          .describe('Task complexity (affects supervision interval)'),
      },
      async execute(args, execContext) {
        const {
          skill_name,
          agent_name: raw_agent_name,
          agent: agent_alias,
          prompt,
          session_id,
          context,
          async: isAsync = true,
          timeout_ms = 60000,
          complexity = 'medium',
        } = args;

        const agent_name = raw_agent_name || agent_alias;

        if (!agent_name) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_ARGUMENT',
            message: "Missing 'agent_name' or 'agent' parameter.",
          });
        }

        // Combine prompt with additional context if provided
        const finalPrompt = context
          ? `Context: ${typeof context === 'string' ? context : JSON.stringify(context, null, 2)}\n\nTask: ${prompt}`
          : prompt;

        // 1. Resolve agent
        const agent = await resolveAgent({
          skill_name,
          agent_name: raw_agent_name,
          agent: agent_alias,
        });

        if (!agent) {
          return JSON.stringify({
            success: false,
            error: 'AGENT_NOT_FOUND',
            message: `Agent not found: ${raw_agent_name || agent_alias}`,
          });
        }

        const targetAgentName = agent.name;

        // 1.5 Load Actor State for Trace Propagation & Loop Detection
        const actorState = await loadActorState();
        const executionStack = actorState?.executionStack || [];

        // Loop Detection (Max depth 10 or agent recursion)
        if (executionStack.includes(targetAgentName) || executionStack.length > 10) {
          return JSON.stringify({
            success: false,
            error: 'RECURSION_DETECTED',
            message: `Recursion or max depth detected: ${targetAgentName} cannot be spawned.`,
            stack: executionStack,
          });
        }

        // 2. Synchronous Pattern - Uses spawnChildAgent with proper coordination
        if (!isAsync) {
          const registry = getTaskRegistry();
          const taskId = await registry.register({
            sessionId: '',
            agentName: targetAgentName,
            prompt: finalPrompt,
            maxRetries: 2,
            timeoutMs: timeout_ms,
            complexity,
            parentSessionId: execContext?.sessionID,
          });

          let targetSessionId = session_id;

          // If no session_id, create new child session
          if (!targetSessionId) {
            try {
              const createResult = await client.session.create({
                body: {
                  parentID: execContext?.sessionID,
                  title: `Sync: ${skill_name || 'skill'} - ${agent_name}`,
                },
              });
              if (createResult.error) throw new Error(JSON.stringify(createResult.error));
              if (!createResult.data?.id) throw new Error('Session ID not returned');
              targetSessionId = createResult.data.id;
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              registry.updateStatus(taskId, 'failed', undefined, errorMessage);
              return JSON.stringify({
                success: false,
                error: 'SESSION_CREATE_FAILED',
                message: `Failed to create session: ${errorMessage}`,
              });
            }
          }

          registry.updateSessionId(taskId, targetSessionId);

          // Send prompt to session
          try {
            await client.session.prompt({
              path: { id: targetSessionId },
              body: {
                agent: targetAgentName,
                parts: [{ type: 'text', text: finalPrompt }],
              },
            });
          } catch (err: any) {
            if (!err.message.includes('Unexpected EOF')) {
              registry.updateStatus(taskId, 'failed', undefined, err.message);
              return JSON.stringify({
                success: false,
                error: 'PROMPT_FAILED',
                message: err.message,
                session_id: targetSessionId,
              });
            }
          }

          // Wait for completion using robust Event-Driven Logic (Fixes deadlock)
          const completionResult = await waitForSessionCompletion(
            client,
            targetSessionId,
            targetAgentName,
            timeout_ms,
            () => registry.heartbeat(taskId)
          );

          let responseText = completionResult.result || '';
          let timedOut =
            completionResult.status === 'failed' && completionResult.error?.includes('Timeout');

          if (timedOut) {
            // Fallback: Fetch whatever is there (Original Logic)
            const fetchRes = await fetchSessionResult(client, targetSessionId, targetAgentName);
            responseText = fetchRes.result || '';
          } else if (completionResult.status === 'failed') {
            registry.updateStatus(taskId, 'failed', undefined, completionResult.error);
            return JSON.stringify({
              success: false,
              error: 'AGENT_EXECUTION_FAILED',
              message: completionResult.error,
              session_id: targetSessionId,
            });
          }

          // Extract dialogue_state using robust multi-strategy parser
          const dialogueState = extractDialogueState(responseText);

          if (timedOut) {
            registry.updateStatus(taskId, 'timeout', responseText);
          } else {
            registry.updateStatus(taskId, 'completed', responseText);
          }

          // Return structured response with session_id for continuation
          return JSON.stringify(
            {
              success: true,
              agent: targetAgentName,
              session_id: targetSessionId,
              task_id: taskId,
              result: responseText,
              dialogue_state: dialogueState,
              timed_out: timedOut,
              continuation_hint:
                dialogueState?.status && BLOCKING_STATUSES.includes(dialogueState.status)
                  ? `To continue dialogue, call skill_agent with session_id: "${targetSessionId}"`
                  : null,
            },
            null,
            2
          );
        }

        // 3. Asynchronous Pattern - Handoff intent
        let activeSessionID = session_id || execContext?.sessionID;

        if (!activeSessionID) {
          try {
            const createResult = await client.session.create({
              body: {
                parentID: execContext?.sessionID,
                title: `Skill: ${skill_name || 'Generic'} - ${agent_name}`,
              },
            });
            if (createResult.error) throw new Error(JSON.stringify(createResult.error));
            if (!createResult.data?.id) throw new Error('Session ID not returned');
            activeSessionID = createResult.data.id;
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return JSON.stringify({
              success: false,
              error: 'SESSION_CREATE_FAILED',
              message: `Failed to create sub-session: ${errorMessage}`,
            });
          }
        }

        // 4. Send prompt to child (this triggers execution)
        try {
          await client.session.prompt({
            path: { id: activeSessionID! },
            body: {
              agent: targetAgentName,
              parts: [{ type: 'text', text: finalPrompt }],
            },
          });
        } catch (err: any) {
          // OpenCode quirk: unexpected EOF is actually a success
          if (!err.message.includes('Unexpected EOF')) {
            return JSON.stringify({
              success: false,
              error: 'PROMPT_FAILED',
              message: err.message,
              session_id: activeSessionID,
            });
          }
        }

        // Return HANDOOF_INTENT
        return JSON.stringify({
          success: true,
          status: 'HANDOFF_INTENT',
          message: `Spawned ${targetAgentName} asynchronously`,
          agent: targetAgentName,
          session_id: activeSessionID,
          metadata: {
            handoff: {
              type: 'DELEGATION',
              target_agent: targetAgentName,
              session_id: activeSessionID,
            },
          },
        });
      },
    }),

    /**
     * task_heartbeat - Signal that a task is still in progress
     */
    task_heartbeat: tool({
      description: 'Signal that a task is still in progress (prevents timeout)',
      args: {
        task_id: tool.schema.string().describe('Task ID from TaskRegistry or LEDGER'),
      },
      async execute(args) {
        const { task_id } = args;
        const registry = getTaskRegistry();
        registry.heartbeat(task_id);
        return JSON.stringify({ success: true, message: 'Heartbeat recorded' });
      },
    }),

    /**
     * task_status - Get the status of a specific task
     */
    skill_list: tool({
      description: 'List available skill-based agents',
      args: {},
      async execute() {
        const uniqueAgents = await listAllAgents();

        return JSON.stringify(
          {
            success: true,
            agents: uniqueAgents,
            count: uniqueAgents.length,
          },
          null,
          2
        );
      },
    }),

    /**
     * skill_gather - Gather results from all child sessions
     */
    skill_gather: tool({
      description: 'Gather results from all spawned child agents. Use after async spawns.',
      args: {
        timeout_ms: tool.schema
          .number()
          .optional()
          .default(60000)
          .describe('Timeout in ms to wait for each child'),
      },
      async execute(args, execContext) {
        const { timeout_ms = 60000 } = args;
        const parentSessionId = execContext?.sessionID;

        if (!parentSessionId) {
          return JSON.stringify({
            success: false,
            error: 'NO_SESSION',
            message: 'No parent session to gather from',
          });
        }

        const { gatherChildResults } = await import('./session-coordination');
        const results = await gatherChildResults(client, parentSessionId, timeout_ms);

        const completed = results.filter((r) => r.status === 'completed');
        const failed = results.filter((r) => r.status === 'failed');

        return JSON.stringify(
          {
            success: true,
            total: results.length,
            completed: completed.length,
            failed: failed.length,
            results: results.map((r) => ({
              agent: r.agent,
              status: r.status,
              result: r.result?.slice(0, 500),
              error: r.error,
            })),
          },
          null,
          2
        );
      },
    }),

    /**
     * skill_spawn_batch - Spawn multiple agents in parallel
     */
    skill_spawn_batch: tool({
      description: 'Spawn multiple agents in parallel. Returns when all complete or timeout.',
      args: {
        tasks: tool.schema
          .array(
            tool.schema.object({
              agent_name: tool.schema.string().describe('Name of the agent'),
              prompt: tool.schema.string().describe('Task for the agent'),
              skill_name: tool.schema.string().optional().describe('Skill namespace'),
            })
          )
          .describe('Array of tasks to spawn in parallel'),
        wait: tool.schema
          .boolean()
          .optional()
          .default(true)
          .describe('true: wait for all to complete, false: fire-and-forget'),
        timeout_ms: tool.schema
          .number()
          .optional()
          .default(120000)
          .describe('Total timeout for all tasks (default: 120000)'),
      },
      async execute(args, execContext) {
        const { tasks, wait = true, timeout_ms = 120000 } = args;

        if (!tasks || tasks.length === 0) {
          return JSON.stringify({
            success: false,
            error: 'NO_TASKS',
            message: 'No tasks provided',
          });
        }

        // Batch spawning agents

        // Spawn all tasks in parallel
        const spawnPromises = tasks.map(async (task, index) => {
          const agent = await resolveAgent({
            skill_name: task.skill_name,
            agent_name: task.agent_name,
          });

          if (!agent) {
            return {
              task_id: index,
              agent: task.agent_name,
              success: false,
              status: 'failed' as const,
              error: `Agent not found: ${task.agent_name}`,
            };
          }

          const result = await spawnChildAgent(client, agent.name, task.prompt, {
            parentSessionId: execContext?.sessionID,
            waitForCompletion: wait,
            timeoutMs: timeout_ms / tasks.length,
          });

          return {
            task_id: index,
            ...result,
          };
        });

        const results = await Promise.all(spawnPromises);
        const completed = results.filter((r) => r.status === 'completed');
        const failed = results.filter((r) => r.status === 'failed');
        const spawned = results.filter((r) => r.status === 'spawned');

        return JSON.stringify(
          {
            success: failed.length === 0,
            total: results.length,
            completed: completed.length,
            failed: failed.length,
            spawned: spawned.length,
            results: results.map((r) => ({
              task_id: r.task_id,
              agent: r.agent,
              status: r.status,
              result: 'result' in r ? r.result?.slice(0, 300) : undefined,
              error: r.error,
            })),
          },
          null,
          2
        );
      },
    }),

    execute_workflow: tool({
      description: 'Execute a predefined multi-agent workflow from a markdown file.',
      args: {
        workflow_name: tool.schema.string().describe('Name of the workflow (e.g. "sdd-workflow")'),
        initial_task: tool.schema.string().describe('The primary task to execute'),
      },
      async execute(args, execContext) {
        const { workflow_name, initial_task } = args;
        const parentSessionId = execContext?.sessionID;

        if (!parentSessionId) {
          return 'Error: No session context available.';
        }

        const loader = new WorkflowLoader();
        const workflows = await loader.loadAll();
        const workflow = workflows.find((w) => w.name === workflow_name);

        if (!workflow) {
          return `Error: Workflow "${workflow_name}" not found. Available: ${workflows.map((w) => w.name).join(', ')}`;
        }

        const processor = new WorkflowProcessor(client, workflow);

        // Start execution in background (or foreground depends on wait)
        // For simplicity we'll wait here, but in a real app we might background it.
        await processor.execute(parentSessionId, initial_task);

        return `Workflow "${workflow_name}" started. Check LEDGER.md for real-time progress.`;
      },
    }),
  };
}
