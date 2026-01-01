/**
 * Agent Spawn - Minimal OpenCode SDK Implementation with Dialogue Support
 *
 * This module provides a clean, dependency-free way to:
 * 1. List ALL available agents (built-in + plugin)
 * 2. Spawn any agent with one-shot or dialogue mode
 *
 * Uses ONLY OpenCode SDK native APIs:
 * - client.app.agents() - List all registered agents
 * - client.session.prompt({agent}) - Spawn agent
 *
 * DIALOGUE MODE: Enables loop-until-approved interactions
 * - interaction_mode: 'dialogue' returns dialogue_state
 * - Status values: needs_input, needs_approval, approved, rejected, completed
 * - Pass previous dialogue_state to continue conversation
 *
 * NO external dependencies. NO MCP. NO swarm-tools.
 */

import { tool, type ToolContext } from '@opencode-ai/plugin';
import { getDurableStream } from './durable-stream';

/**
 * Dialogue state for multi-turn interactions
 */
export interface DialogueState {
  status:
    | 'needs_input'
    | 'needs_approval'
    | 'needs_verification'
    | 'approved'
    | 'rejected'
    | 'completed';
  turn: number;
  message_to_user: string;
  pending_questions?: string[];
  pending_assumptions?: Array<{ assumed: string; confidence: number }>;
  proposal?: { type: string; summary: string; details?: any };
  accumulated_direction?: { goals: string[]; constraints: string[]; decisions: string[] };
  history?: Array<{ role: 'agent' | 'user'; content: string; timestamp: string }>;
}

/**
 * Create minimal agent tools using pure OpenCode SDK
 */
export function createAgentTools(client: any) {
  return {
    /**
     * agent_list - List ALL available agents from OpenCode
     */
    agent_list: tool({
      description: 'List all available agents in OpenCode (built-in and plugin agents)',
      args: {},
      async execute() {
        try {
          const response = await client.app.agents();
          const agents = response.data || [];

          if (agents.length > 0) {
            return JSON.stringify(
              {
                success: true,
                count: agents.length,
                agents: agents.map((a: any) => ({
                  name: a.id, // ID is the actionable name
                  description: a.description || '',
                  // If id has a slash, it's likely a skill agent
                  type: a.id.includes('/') ? 'squad-agent' : 'root-agent',
                })),
                usage: 'Use agent_spawn or skill_agent with the "name" field value.',
              },
              null,
              2
            );
          }

          return JSON.stringify({
            success: true,
            count: 0,
            agents: [],
            note: 'No agents registered. Check OpenCode configuration.',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'AGENT_LIST_FAILED',
            message: error.message || 'Failed to list agents',
          });
        }
      },
    }),

    /**
     * agent_spawn - Spawn any agent with optional dialogue mode
     *
     * Modes:
     * - one_shot (default): Fire-and-forget, returns immediately
     * - dialogue: Waits for response, returns dialogue_state for loop-until-approved
     */
    agent_spawn: tool({
      description:
        'Spawn an agent in the current session. Use interaction_mode="dialogue" for clarification/approval loops.',
      args: {
        agent: tool.schema
          .string()
          .describe('Agent name (e.g., "chief-of-staff/oracle", "chief-of-staff/interviewer")'),
        prompt: tool.schema.string().describe('Task or question for the agent'),
        context: tool.schema
          .string()
          .optional()
          .describe('Additional context to prepend to the prompt'),
        interaction_mode: tool.schema
          .enum(['one_shot', 'dialogue'])
          .optional()
          .describe('Mode: one_shot (fire-and-forget) or dialogue (loop-until-approved)'),
        dialogue_state: tool.schema
          .string()
          .optional()
          .describe('Previous dialogue state JSON for continuing a conversation'),
        session_id: tool.schema
          .string()
          .optional()
          .describe(
            'Existing session ID for dialogue continuation (reuses session instead of creating new)'
          ),
        timeout_ms: tool.schema
          .number()
          .optional()
          .default(60000)
          .describe('Timeout in milliseconds for synchronous execution (default: 60000)'),
        async: tool.schema
          .boolean()
          .optional()
          .default(true)
          .describe(
            'true: handoff to sub-agent (asynchronous), false: wait for response (synchronous)'
          ),
      },
      async execute(args, ctx: ToolContext) {
        const {
          agent,
          prompt,
          context,
          interaction_mode = 'one_shot',
          dialogue_state,
          session_id,
          timeout_ms = 60000,
          async: isAsync = true,
        } = args;

        // Parse previous dialogue state
        let previousState: DialogueState | null = null;
        if (dialogue_state) {
          try {
            previousState = JSON.parse(dialogue_state);
          } catch {
            // Invalid JSON, ignore
          }
        }

        // Build full prompt
        const fullPrompt = context ? `${context}\n\n---\n\n${prompt}` : prompt;

        // Add dialogue context if needed
        const dialogueMarker = previousState
          ? `\n\n[DIALOGUE CONTINUATION]\nPrevious status: ${previousState.status}\nTurn: ${previousState.turn || 1}\n${
              previousState.accumulated_direction
                ? `Accumulated Direction: ${JSON.stringify(previousState.accumulated_direction)}\n`
                : ''
            }${
              (previousState as any).proposal
                ? `Previous Proposal: ${JSON.stringify((previousState as any).proposal)}\n`
                : ''
            }`
          : '';

        const finalPrompt = fullPrompt + dialogueMarker;

        // 1. Synchronous Pattern (Sequential orchestration)
        if (!isAsync) {
          // Reuse existing session if provided, otherwise create new
          let syncSessionID = session_id;

          if (!syncSessionID) {
            try {
              const createResult = await client.session.create({
                body: {
                  parentID: ctx.sessionID,
                  title: `Sync Spawn: ${agent}`,
                },
              });
              if (createResult.error) throw new Error(JSON.stringify(createResult.error));
              syncSessionID = createResult.data.id;
            } catch (err: any) {
              return `Error: Failed to create sync session for ${agent}: ${err.message}`;
            }
          }

          try {
            await client.session.prompt({
              path: { id: syncSessionID },
              body: {
                agent: agent,
                parts: [{ type: 'text', text: finalPrompt }],
              },
            });

            // Event-Driven Wait (Deadlock Fix 001.1)
            const orchestrator = getDurableStream();

            // Race Condition Check: Verify if completion occurred before subscription
            const history = orchestrator.getEventHistory();
            const completedEvent = history.find(
              (e) => e.type === 'agent.completed' && (e.payload as any).intent_id === syncSessionID
            );
            if (completedEvent) {
              return (completedEvent.payload as any).result || '';
            }

            const failedEvent = history.find(
              (e) => e.type === 'agent.failed' && (e.payload as any).intent_id === syncSessionID
            );
            if (failedEvent) {
              throw new Error((failedEvent.payload as any).error || 'Agent execution failed');
            }

            return await new Promise<string>((resolve, reject) => {
              let isResolved = false;
              let timer: ReturnType<typeof setTimeout>;

              const cleanup = () => {
                if (unsubscribeComplete) unsubscribeComplete();
                if (unsubscribeFailed) unsubscribeFailed();
                if (timer) clearTimeout(timer);
              };

              const unsubscribeComplete = orchestrator.subscribe('agent.completed', (event) => {
                const payload = event.payload as any;
                if (payload.intent_id === syncSessionID && !isResolved) {
                  isResolved = true;
                  cleanup();
                  const result = payload.result || '';
                  resolve(result);
                }
              });

              const unsubscribeFailed = orchestrator.subscribe('agent.failed', (event) => {
                const payload = event.payload as any;
                if (payload.intent_id === syncSessionID && !isResolved) {
                  isResolved = true;
                  cleanup();
                  reject(new Error(payload.error || 'Agent execution failed'));
                }
              });

              timer = setTimeout(() => {
                if (!isResolved) {
                  isResolved = true;
                  cleanup();
                  reject(new Error(`Timeout waiting for agent ${agent} after ${timeout_ms}ms`));
                }
              }, timeout_ms);
            });
          } catch (err: any) {
            return `Error during synchronous agent spawn: ${err.message}`;
          }
        }

        // 2. Asynchronous Pattern (Interactive Handoff)
        try {
          return JSON.stringify({
            success: true,
            agent: agent,
            mode: interaction_mode,
            status: 'HANDOFF_INTENT',
            message: 'Agent interaction initiated asynchronously. Monitor main chat for response.',
            dialogue_state:
              interaction_mode === 'dialogue'
                ? {
                    status: 'needs_input',
                    message_to_user: 'Please check the main chat for the agent response.',
                  }
                : undefined,
            metadata: {
              handoff: {
                target_agent: agent,
                prompt: finalPrompt,
                session_id: ctx.sessionID,
              },
            },
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'SPAWN_FAILED',
            message: error.message || 'Failed to spawn agent',
            agent: agent,
          });
        }
      },
    }),

    /**
     * agent_dialogue - Helper for dialogue loop (convenience wrapper)
     *
     * Spawns interviewer/clarifier agents and manages dialogue state
     */
    agent_dialogue: tool({
      description:
        'Start a dialogue with an agent for clarification or approval. Returns structured dialogue_state.',
      args: {
        agent: tool.schema
          .string()
          .optional()
          .describe('Agent name (default: chief-of-staff/interviewer)'),
        question: tool.schema.string().describe('What to clarify or ask'),
        previous_state: tool.schema
          .string()
          .optional()
          .describe('Previous dialogue_state JSON if continuing'),
        async: tool.schema
          .boolean()
          .optional()
          .default(true)
          .describe(
            'true: handoff to sub-agent (asynchronous), false: wait for response (synchronous)'
          ),
      },
      async execute(args, ctx: ToolContext) {
        const {
          agent = 'chief-of-staff/interviewer',
          question,
          previous_state,
          async: isAsync = true,
        } = args;

        // Parse previous state
        let prevState: DialogueState | null = null;
        if (previous_state) {
          try {
            prevState = JSON.parse(previous_state);
          } catch {
            // Invalid JSON
          }
        }

        const dialoguePrompt = prevState
          ? `[Continuing dialogue - Turn ${(prevState.turn || 0) + 1}]\n\nUser response: ${question}\n\nPrevious context:\n- Questions asked: ${
              prevState.pending_questions?.join(', ') || 'N/A'
            }\n- Accumulated direction: ${JSON.stringify(prevState.accumulated_direction || {})}\n- Previous proposal: ${JSON.stringify((prevState as any).proposal || 'None')}`
          : `[Starting clarification dialogue]\n\n${question}`;

        // 1. Synchronous Pattern
        if (!isAsync) {
          let syncSessionID;
          try {
            const createResult = await client.session.create({
              body: {
                parentID: ctx.sessionID,
                title: `Sync Dialogue: ${agent}`,
              },
            });
            if (createResult.error) throw new Error(JSON.stringify(createResult.error));
            syncSessionID = createResult.data.id;
          } catch (err: any) {
            return `Error: Failed to create sync session for ${agent}: ${err.message}`;
          }

          try {
            await client.session.prompt({
              path: { id: syncSessionID },
              body: {
                agent: agent,
                parts: [{ type: 'text', text: dialoguePrompt }],
              },
            });

            // Event-Driven Wait (Deadlock Fix 001.1)
            const orchestrator = getDurableStream();

            // Race Condition Check: Verify if completion occurred before subscription
            const history = orchestrator.getEventHistory();
            const completedEvent = history.find(
              (e) => e.type === 'agent.completed' && (e.payload as any).intent_id === syncSessionID
            );
            if (completedEvent) {
              return (completedEvent.payload as any).result || '';
            }

            const failedEvent = history.find(
              (e) => e.type === 'agent.failed' && (e.payload as any).intent_id === syncSessionID
            );
            if (failedEvent) {
              throw new Error((failedEvent.payload as any).error || 'Agent execution failed');
            }

            return await new Promise<string>((resolve, reject) => {
              let isResolved = false;
              let timer: ReturnType<typeof setTimeout>;

              const cleanup = () => {
                if (unsubscribeComplete) unsubscribeComplete();
                if (unsubscribeFailed) unsubscribeFailed();
                if (timer) clearTimeout(timer);
              };

              const unsubscribeComplete = orchestrator.subscribe('agent.completed', (event) => {
                const payload = event.payload as any;
                if (payload.intent_id === syncSessionID && !isResolved) {
                  isResolved = true;
                  cleanup();
                  const result = payload.result || '';
                  resolve(result);
                }
              });

              const unsubscribeFailed = orchestrator.subscribe('agent.failed', (event) => {
                const payload = event.payload as any;
                if (payload.intent_id === syncSessionID && !isResolved) {
                  isResolved = true;
                  cleanup();
                  reject(new Error(payload.error || 'Agent execution failed'));
                }
              });

              timer = setTimeout(() => {
                if (!isResolved) {
                  isResolved = true;
                  cleanup();
                  reject(new Error(`Timeout waiting for agent ${agent} after 60000ms`));
                }
              }, 60000);
            });
          } catch (err: any) {
            return `Error during synchronous agent dialogue: ${err.message}`;
          }
        }

        // 2. Asynchronous Pattern
        try {
          const activeSessionID = ctx.sessionID;

          const newState: DialogueState = {
            status: 'needs_input',
            turn: prevState ? prevState.turn + 1 : 1,
            message_to_user: 'Please check main chat for response.',
            pending_questions: [],
            history: [
              ...(prevState?.history || []),
              { role: 'user', content: question, timestamp: new Date().toISOString() },
            ],
          };

          return JSON.stringify({
            success: true,
            agent: agent,
            dialogue_state: newState,
            next_action: 'Monitor chat for agent question/response.',
            status: 'HANDOFF_INTENT',
            metadata: {
              handoff: {
                target_agent: agent,
                prompt: dialoguePrompt,
                session_id: activeSessionID,
              },
            },
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'DIALOGUE_FAILED',
            message: error.message || 'Failed to start dialogue',
          });
        }
      },
    }),
  };
}
