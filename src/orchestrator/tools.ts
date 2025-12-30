import { tool } from '@opencode-ai/plugin';
import { loadSkillAgents } from '../opencode/loader';
import { loadChiefOfStaffSkills, getAvailableSkillNames } from '../opencode/config/skill-loader';
import { spawnChildAgent } from './session-coordination';
import { loadActorState } from './actor/state';
import { processMessage } from './actor/core';

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

export function createSkillAgentTools(client: {
  session: {
    create: (opts: { body: { parentID?: string; title: string } }) => Promise<{
      error?: { message?: string };
      data?: { id: string };
    }>;
    prompt: (opts: {
      path: { id: string };
      body: { agent: string; parts: Array<{ type: string; text: string }> };
    }) => Promise<void>;
    promptAsync: (opts: {
      path: { id: string };
      body: { agent: string; parts: Array<{ type: string; text: string }> };
    }) => Promise<void>;
    status: () => Promise<{
      data?: Record<string, { type: string }>;
    }>;
    messages: (opts: { path: { id: string } }) => Promise<{
      data?: Array<{
        info?: { role?: string; time?: { created?: number } };
        parts?: Array<{ type: string; text: string }>;
      }>;
    }>;
  };
}) {
  return {
    skill_agent: tool({
      description:
        'Spawn a specialized subagent. Use async:false for sequential orchestration (waits for result).',
      args: {
        skill_name: tool.schema
          .string()
          .optional()
          .describe('Name of the skill (e.g., "chief-of-staff")'),
        agent_name: tool.schema.string().describe('Name of the agent (e.g., "oracle")'),
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
          agent_name,
          prompt,
          session_id,
          context,
          async: isAsync = true,
          timeout_ms = 60000,
        } = args;

        // Combine prompt with additional context if provided
        const finalPrompt = context
          ? `Context: ${typeof context === 'string' ? context : JSON.stringify(context, null, 2)}\n\nTask: ${prompt}`
          : prompt;

        // 1. Resolve agent
        const searchNames = [agent_name];
        if (skill_name) {
          searchNames.push(`${skill_name}/${agent_name}`);
          searchNames.push(`${skill_name}-${agent_name}`);
        }

        const [skillAgents, chiefOfStaffSkills] = await Promise.all([
          loadSkillAgents(),
          loadChiefOfStaffSkills(),
        ]);

        const allAgents = [
          ...skillAgents,
          ...chiefOfStaffSkills.map((s) => ({ name: s.name, config: s })),
        ];

        const agent = allAgents.find((a: any) => searchNames.includes(a.name));

        if (!agent) {
          return JSON.stringify({
            success: false,
            error: 'AGENT_NOT_FOUND',
            message: `Agent '${agent_name}' not found under skill '${skill_name}'.`,
          });
        }

        const targetAgentName = agent.name;

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

          // Wait for completion
          const startTime = Date.now();
          let pollInterval = 500;
          const maxPollInterval = 3000;

          while (Date.now() - startTime < timeout_ms) {
            const statusResult = await client.session.status();
            const sessionStatus = statusResult.data?.[targetSessionId as string];

            if (!sessionStatus || sessionStatus.type === 'idle') {
              break;
            }

            await new Promise((r) => setTimeout(r, pollInterval));
            pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
          }

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

          // Parse for dialogue_state to detect if continuation needed
          let dialogueState = null;
          try {
            const parsed = JSON.parse(responseText);
            if (parsed.dialogue_state) {
              dialogueState = parsed.dialogue_state;
            }
          } catch {
            // Not JSON, just return as text
          }

          // Return structured response with session_id for continuation
          return JSON.stringify(
            {
              success: true,
              agent: targetAgentName,
              session_id: targetSessionId,
              result: responseText,
              dialogue_state: dialogueState,
              continuation_hint:
                dialogueState?.status === 'needs_input'
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
        const skills = await getAvailableSkillNames();
        return JSON.stringify(
          {
            success: true,
            agents: skills,
            count: skills.length,
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
