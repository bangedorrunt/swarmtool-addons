import { tool, type PluginInput } from '@opencode-ai/plugin';
import { loadSkillAgents } from '../opencode/loader';
import { loadChiefOfStaffSkills, getAvailableSkillNames } from '../opencode/config/skill-loader';
import { spawnChildAgent } from './session-coordination';
import { loadActorState } from './actor/state';
import { processMessage } from './actor/core';
import { canCallAgent } from './access-control';

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
        'Suspend execution and save state. Use when waiting for long-running external events.',
      args: {
        reason: tool.schema.string().describe('Reason for yielding'),
      },
      async execute(args, execContext) {
        const { reason } = args;
        const sessionId = execContext?.sessionID;
        const agent = (execContext as unknown as ToolContext)?.agent;

        if (!sessionId || !agent) {
          return JSON.stringify({
            success: false,
            error: 'NO_CONTEXT',
            message: 'Cannot yield without session ID and agent context',
          });
        }

        // Notify orchestrator via ActorState
        const actorState = await loadActorState();
        if (actorState) {
          await processMessage(actorState, {
            type: 'agent.yield',
            payload: { agent, sessionId, reason },
          });
        }

        return JSON.stringify({
          success: true,
          status: 'SUSPENDED',
          message: `Agent ${agent} yielded: ${reason}`,
        });
      },
    }),

    agent_resume: tool({
      description: 'Resume execution of a suspended agent',
      args: {
        session_id: tool.schema.string().describe('Session ID to resume'),
        signal_data: tool.schema.any().optional().describe('Data to inject into resumption'),
      },
      async execute(args, execContext) {
        const { session_id, signal_data } = args;
        const callingAgent = (execContext as unknown as ToolContext)?.agent || 'unknown';

        const actorState = await loadActorState();
        if (actorState) {
          await processMessage(actorState, {
            type: 'agent.resume',
            payload: { agent: callingAgent, sessionId: session_id, signalData: signal_data },
          });

          // Trigger resumption in the session if needed (e.g. send a prompt)
          // For now, we just update state. The Orchestrator loop would handle the actual wake up.
        }

        return JSON.stringify({
          success: true,
          message: `Resumed session ${session_id}`,
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
        const searchNames = [agent_name];

        const [skillAgents, chiefOfStaffSkills] = await Promise.all([
          loadSkillAgents(),
          loadChiefOfStaffSkills(),
        ]);

        const allAgents = [
          ...skillAgents,
          ...chiefOfStaffSkills.map((s) => ({ name: s.name, config: s })),
        ];

        const agent = allAgents.find((a: any) => searchNames.includes(a.name));
        const targetAgentName = agent ? agent.name : agent_name;

        // If not found in custom skills, we assume it's a native agent and allow passthrough
        // However, we must still respect access control for KNOWN internal agents

        // ============================================================================
        // ACCESS CONTROL (Refactored)
        // ============================================================================
        const callingAgent = (execContext as unknown as ToolContext)?.agent || '';

        // Use our functional guard
        const accessCheck = canCallAgent(callingAgent, targetAgentName, !!agent);

        if (!accessCheck.allowed) {
          return JSON.stringify({
            success: false,
            error: 'ACCESS_DENIED',
            message: accessCheck.reason,
            suggestion: accessCheck.suggestion,
            caller: callingAgent,
          });
        }

        // 2. Synchronous Pattern - Uses spawnChildAgent with proper coordination
        // If session_id provided, continue existing dialogue; otherwise create new
        if (!isAsync) {
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
              return JSON.stringify({
                success: false,
                error: 'SESSION_CREATE_FAILED',
                message: `Failed to create session: ${errorMessage}`,
              });
            }
          } else {
            // Continuing dialog in session
          }

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
              return JSON.stringify({
                success: false,
                error: 'PROMPT_FAILED',
                message: err.message,
                session_id: targetSessionId,
              });
            }
          }

          // Wait for completion with timeout detection
          const startTime = Date.now();
          let pollInterval = 500;
          const maxPollInterval = 3000;
          let timedOut = false;

          while (Date.now() - startTime < timeout_ms) {
            const statusResult = await client.session.status();
            const sessionStatus = statusResult.data?.[targetSessionId as string];

            if (!sessionStatus || sessionStatus.type === 'idle') {
              break;
            }

            await new Promise((r) => setTimeout(r, pollInterval));
            pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
          }

          // Check if we timed out
          timedOut = Date.now() - startTime >= timeout_ms;

          // Fetch the result
          const msgResult = await client.session.messages({ path: { id: targetSessionId } });
          const messages = msgResult.data || [];
          const lastAssistantMsg = messages
            .filter((m: any) => m.info?.role === 'assistant')
            .sort(
              (a: any, b: any) => (b.info?.time?.created || 0) - (a.info?.time?.created || 0)
            )[0];

          const responseText =
            lastAssistantMsg?.parts
              ?.filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('\n') || '';

          // Extract dialogue_state using robust multi-strategy parser
          const dialogueState = extractDialogueState(responseText);

          // Return structured response with session_id for continuation
          return JSON.stringify(
            {
              success: true,
              agent: targetAgentName,
              session_id: targetSessionId,
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
              error: 'SPAWN_FAILED',
              message: err.message,
            });
          }
        }

        // Track spawn in actor state (if initialized)
        const actorState = await loadActorState();
        if (actorState) {
          await processMessage(actorState, {
            type: 'subagent.spawn',
            payload: { agent: targetAgentName, sessionId: activeSessionID!, prompt: finalPrompt },
          });
        }

        // Handoff to target agent

        return JSON.stringify(
          {
            success: true,
            status: 'HANDOFF',
            agent: targetAgentName,
            session_id: activeSessionID,
            message: `Handed off to ${targetAgentName}. Monitor for response.`,
          },
          null,
          2
        );
      },
    }),

    /**
     * skill_list - List available registered agents
     */
    skill_list: tool({
      description: 'List available skill-based agents',
      args: {},
      async execute() {
        const [skillAgents, chiefOfStaffSkills] = await Promise.all([
          loadSkillAgents(),
          loadChiefOfStaffSkills(),
        ]);

        const allAgentNames = [
          ...skillAgents.map((a) => a.name),
          ...chiefOfStaffSkills.map((s) => s.name),
        ];

        // Deduplicate and sort
        const uniqueAgents = [...new Set(allAgentNames)].sort();

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

        // Resolve all agents first
        const [skillAgents, chiefOfStaffSkills] = await Promise.all([
          loadSkillAgents(),
          loadChiefOfStaffSkills(),
        ]);

        const allAgents = [
          ...skillAgents,
          ...chiefOfStaffSkills.map((s) => ({ name: s.name, config: s })),
        ];

        // Spawn all tasks in parallel
        const spawnPromises = tasks.map(async (task, index) => {
          const searchNames = [task.agent_name];
          if (task.skill_name) {
            searchNames.push(`${task.skill_name}/${task.agent_name}`);
            searchNames.push(`${task.skill_name}-${task.agent_name}`);
          }

          const agent = allAgents.find((a) => searchNames.includes(a.name));
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
  };
}
