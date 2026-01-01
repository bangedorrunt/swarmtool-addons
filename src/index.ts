/**
 * OpenCode Plugin Template
 *
 * This is an example plugin that demonstrates the plugin capabilities:
 * - Custom tools (tools callable by the LLM)
 * - Custom slash commands (user-invokable /commands loaded from .md files)
 * - Config hooks (modify config at runtime)
 * - Session learning hooks (self-learning across sessions)
 */

import type { Plugin } from '@opencode-ai/plugin';
import path from 'node:path';
import { memoryLaneTools } from './memory-lane';
import { loadConfig, DEFAULT_MODELS } from './opencode';
import { SignalBuffer } from './orchestrator/signal-buffer';
import { loadLocalAgents, loadSkillAgents, loadCommands } from './opencode';
import { createSkillAgentTools, startTaskObservation, getTaskRegistry } from './orchestrator';
import { createOpenCodeSessionLearningHook } from './orchestrator/hooks';
import { loadChiefOfStaffSkills } from './opencode/config/skill-loader';
import { createAgentTools } from './agent-spawn';
import { createEventLogTools } from './event-log';
import { initializeDurableStream, getDurableStream } from './durable-stream';
import { ledgerEventTools } from './orchestrator/tools/ledger-tools';
import { checkpointTools } from './orchestrator/tools/checkpoint-tools';

interface SkillAgentArgs {
  skill_name?: string;
  agent_name: string;
  prompt: string;
  session_id?: string;
  context?: unknown;
  async?: boolean;
  timeout_ms?: number;
}

interface HandoffData {
  target_agent: string;
  prompt: string;
  session_id: string;
}

/**
 * Auto-migrate chief-of-staff skills to .opencode/skill/ if not found.
 * Ensures OpenCode can discover our skills.
 */
async function ensureChiefOfStaffSkills(): Promise<void> {
  const fsp = await import('node:fs/promises');
  const projectRoot = process.cwd();
  const targetDir = path.join(projectRoot, '.opencode', 'skill');
  const sourceDir = path.join(import.meta.dir, 'orchestrator', 'chief-of-staff');

  // Check if already migrated by looking for chief-of-staff/oracle
  const oracleSkill = path.join(targetDir, 'chief-of-staff', 'agents', 'oracle', 'SKILL.md');
  try {
    await fsp.access(oracleSkill);
    return; // Already migrated
  } catch {
    // Continue with migration
  }

  // Ensure target directory exists
  await fsp.mkdir(targetDir, { recursive: true });

  // Copy parent chief-of-staff skill
  const chiefOfStaffTarget = path.join(targetDir, 'chief-of-staff');
  await fsp.mkdir(chiefOfStaffTarget, { recursive: true });

  const chiefOfStaffSource = path.join(sourceDir, 'SKILL.md');
  try {
    await fsp.copyFile(chiefOfStaffSource, path.join(chiefOfStaffTarget, 'SKILL.md'));
  } catch {
    // Source file may not exist
  }

  // Copy all agent skills as flat chief-of-staff-* directories
  const agentsDir = path.join(sourceDir, 'agents');
  try {
    const agents = await fsp.readdir(agentsDir);
    for (const agentName of agents) {
      const agentPath = path.join(agentsDir, agentName);
      const stat = await fsp.stat(agentPath);
      if (stat.isDirectory()) {
        const skillMd = path.join(agentPath, 'SKILL.md');
        try {
          await fsp.access(skillMd);
          // Keep hierarchical structure: .opencode/skill/chief-of-staff/agents/{agent}/SKILL.md
          const targetAgentDir = path.join(chiefOfStaffTarget, 'agents', agentName);
          await fsp.mkdir(targetAgentDir, { recursive: true });
          await fsp.copyFile(skillMd, path.join(targetAgentDir, 'SKILL.md'));
        } catch {
          // Skill file doesn't exist, skip
        }
      }
    }
  } catch {
    // Agents directory may not exist
  }
}

export const SwarmToolAddons: Plugin = async (input) => {
  // Load configuration
  const userConfig = loadConfig();

  // Ensure chief-of-staff skills are migrated to .opencode/skill/
  await ensureChiefOfStaffSkills();

  // Load commands and agents from .md files
  const agentDir = path.join(import.meta.dir, 'opencode', 'agent');
  const commandDir = path.join(import.meta.dir, 'opencode', 'command');

  const [commands, localAgents, skillAgents, chiefOfStaffSkills] = await Promise.all([
    loadCommands(commandDir),
    loadLocalAgents(agentDir),
    loadSkillAgents(),
    loadChiefOfStaffSkills(),
  ]);

  const agents = [...localAgents, ...skillAgents];

  // DATABASE PATH RESOLUTION - CRITICAL CONFIGURATION
  const projectPath = process.cwd();

  // Create tools with client access
  const skillAgentTools = createSkillAgentTools(input.client as any);
  const agentTools = createAgentTools(input.client as any);
  const eventLogTools = createEventLogTools();

  // Start Task Observation (Resilient Orchestration)
  const registry = getTaskRegistry({ syncToLedger: true });
  await registry.loadFromLedger(); // Crash Recovery
  startTaskObservation(input.client as any, { verbose: !!userConfig.debug });

  // Initialize Durable Stream (Event Sourcing Layer)
  const durableStream = await initializeDurableStream({
    storePath: '.opencode/durable_stream.jsonl',
  });
  const resumeResult = await durableStream.resume();
  if (resumeResult.pending_checkpoints.length > 0) {
    console.log(
      `[DurableStream] Resumed with ${resumeResult.pending_checkpoints.length} pending checkpoints`
    );
  }

  // Create session learning hook with skill_agent integration
  const sessionLearningHook = createOpenCodeSessionLearningHook(input, {
    maxMemories: 10,
    captureEnabled: true,
    captureDelay: 2000,
    skillAgent: async (args: unknown) => {
      const skillArgs = args as SkillAgentArgs;
      const result = await skillAgentTools.skill_agent.execute(
        {
          prompt: skillArgs.prompt,
          async: true,
          timeout_ms: skillArgs.timeout_ms ?? 60000,
          complexity: 'medium',
          skill_name: skillArgs.skill_name,
          agent_name: skillArgs.agent_name,
          session_id: skillArgs.session_id,
          context: skillArgs.context,
        },
        { sessionID: '', messageID: '', agent: '', abort: () => {} } as any
      );
      try {
        return JSON.parse(result as string);
      } catch {
        return { error: 'Invalid JSON response', raw: result };
      }
    },
  });

  return {
    // 1. Register custom tools
    tool: {
      ...memoryLaneTools,
      ...skillAgentTools,
      ...agentTools,
      ...eventLogTools,
      ...ledgerEventTools,
      ...checkpointTools,
    },

    // 2. OpenCode Hooks (must be flat on this object)

    // Synchronous context injection
    'tool.execute.before': async (
      _tool: { tool: string; sessionID: string; callID: string },
      _output: { args: any }
    ) => {
      // Logic for context injection or logging before tool starts
    },

    // Post-tool execution hooks - CRITICAL for Lifecycle Handoff 2.0
    'tool.execute.after': async (
      hookInput: { tool: string; sessionID: string; callID: string },
      hookOutput: { title: string; output: string; metadata: any }
    ) => {
      // Agent Lifecycle Handoff 2.0 (Detected via metadata or output)
      let handoffData = null;
      let isHandoffIntent = false;

      // 1. Check Metadata for explicit HANDOOF_INTENT
      if (hookOutput.metadata?.handoff) {
        handoffData = hookOutput.metadata.handoff;
        isHandoffIntent = hookOutput.metadata.status === 'HANDOFF_INTENT';
      } else if (typeof hookOutput.output === 'string') {
        // 2. Fallback to parsing text for legacy or dynamic handoffs
        try {
          const parsed = JSON.parse(hookOutput.output);
          if (parsed.metadata?.handoff) {
            handoffData = parsed.metadata.handoff;
            isHandoffIntent = parsed.status === 'HANDOFF_INTENT';
          }
        } catch {
          // Not JSON or missing handoff, ignore
        }
      }

      // ONLY trigger if HANDOFF_INTENT is true.
      // Synchronous tools return raw text/JSON without this intent to avoid duplicate prompts.
      if (handoffData && isHandoffIntent) {
        // New: Handle UPWARD_SIGNAL for Yielding
        if (handoffData.type === 'UPWARD_SIGNAL') {
          // We need to route this to the PARENT session.
          try {
            const sessionRes = await input.client.session.get({
              path: { id: hookInput.sessionID },
            });
            const parentID = sessionRes.data?.parentID;

            if (parentID) {
              const buffer = SignalBuffer.getInstance();
              // Check Parent Status
              const statusRes = await input.client.session.status();
              const parentStatus = statusRes.data?.[parentID];

              const signalPayload = {
                id: crypto.randomUUID(),
                sourceAgent: handoffData.target_agent || 'child',
                targetSessionId: parentID,
                createdAt: Date.now(),
                payload: {
                  type: 'ASK_USER',
                  reason: handoffData.reason,
                  data: { summary: handoffData.summary },
                },
              };

              if (parentStatus?.type === 'idle') {
                // Push immediately
                await input.client.session.promptAsync({
                  path: { id: parentID },
                  body: {
                    agent: 'system',
                    parts: [
                      {
                        type: 'text',
                        text: `[SYSTEM: SUBAGENT SIGNAL]\nSource: ${signalPayload.sourceAgent}\nMessage: ${handoffData.reason}\n\n(Agent yielded)`,
                      },
                    ],
                  },
                });
              } else {
                // Queue it
                await buffer.enqueue(signalPayload as any);
              }
            }
          } catch (e) {
            console.error('[UPWARD_SIGNAL] Failed to process:', e);
          }
          return; // Done with Upward Signal
        }

        // Standard Handoff (Lateral)
        const handoff = handoffData as HandoffData;
        const { target_agent, prompt, session_id } = handoff;

        if (target_agent && prompt && session_id) {
          // Use a fixed delay for settling
          setTimeout(async () => {
            try {
              await input.client.session.promptAsync({
                path: { id: session_id },
                body: {
                  agent: target_agent,
                  parts: [{ type: 'text', text: prompt }],
                },
              });
            } catch (err) {
              const errorMessage = err instanceof Error ? err.toString() : String(err);
              console.error('[ERROR] Handoff prompt failed:', errorMessage);
            }
          }, 800);
        }
      }
    },

    // Session learning hook (unified event handler)
    event: async (eventInput: { event: any }) => {
      const { event } = eventInput;

      // 0. Durable Stream Bridge (Event Sourcing)
      const stream = getDurableStream();
      if (stream.isInitialized()) {
        const bridge = stream.createBridgeHooks();
        if (bridge.event) {
          await bridge.event(eventInput).catch(() => {});
        }
      }

      // 1. Session Learning
      await sessionLearningHook(eventInput);

      // 2. SignalBuffer Auto-Flush (Parent Busy Resolution)
      if (event.type === 'session.status') {
        // event.data object keys are sessionIds, values are Status({type: 'idle'|'busy'})
        const statuses = event.data || {};
        const buffer = SignalBuffer.getInstance();

        for (const [sessionId, status] of Object.entries(statuses)) {
          // If a session becomes IDLE and has pending signals, flush them!
          if ((status as any).type === 'idle' && buffer.hasSignals(sessionId)) {
            const signals = buffer.flush(sessionId);
            for (const sig of signals) {
              console.log(
                `[SignalBuffer] Auto-flushing signal to ${sessionId}: ${sig.payload.reason}`
              );
              // Prompt the parent with the wake-up signal
              try {
                await input.client.session.promptAsync({
                  path: { id: sessionId },
                  body: {
                    agent: 'system',
                    parts: [
                      {
                        type: 'text',
                        text: `[SYSTEM: SUBAGENT SIGNAL]\nSource: ${sig.sourceAgent}\nMessage: ${sig.payload.reason}\nSummary: ${sig.payload.data?.summary || 'N/A'}\n\nReview the request and use 'agent_resume' when ready.`,
                      },
                    ],
                  },
                });
              } catch (e) {
                console.error(`[SignalBuffer] Failed to flush signal: ${(e as Error).message}`);
                // Re-queue if critical? For now log and drop to avoid loop.
              }
            }
          }
        }
      }
    },

    // 3. Config Hook - Apply model overrides
    async config(config) {
      config.command = config.command ?? {};
      config.agent = config.agent ?? {};

      for (const cmd of commands) {
        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model: cmd.frontmatter.model,
          subtask: cmd.frontmatter.subtask,
        };
      }

      // 1. Register local and skill-based agents with model overrides
      for (const agt of agents) {
        const modelOverride = userConfig.models[agt.name];
        const model = modelOverride?.model ?? agt.config.model ?? 'opencode/grok-code';
        config.agent[agt.name] = {
          ...agt.config,
          model,
          metadata: agt.config.metadata,
        };
      }

      // 2. Register chief-of-staff sub-agents (internal)
      for (const skill of chiefOfStaffSkills) {
        const modelOverride = userConfig.models[skill.name];
        const model = modelOverride?.model ?? skill.model ?? 'opencode/grok-code';
        config.agent[skill.name] = {
          mode: 'subagent',
          model,
          prompt: skill.prompt,
          description: skill.description,
          tools: skill.tools,
          temperature: skill.temperature,
          metadata: { ...skill.metadata, visibility: 'internal' }, // Force hidden
        };
      }

      // 3. Apply user config overrides for ANY agent path (including native OpenCode agents)
      // This allows users to override native agents like 'Code', 'Ask', etc.
      for (const [agentPath, modelConfig] of Object.entries(userConfig.models)) {
        // Skip if disabled
        if (modelConfig.disable) {
          continue;
        }

        // If agent already exists, override its model
        if (config.agent[agentPath]) {
          config.agent[agentPath].model = modelConfig.model;
          if (modelConfig.temperature !== undefined) {
            config.agent[agentPath].temperature = modelConfig.temperature;
          }
        } else {
          // Create new agent entry for native OpenCode agents or custom paths
          config.agent[agentPath] = {
            model: modelConfig.model,
            ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
          };
        }
      }

      // 4. Apply DEFAULT_MODELS fallback for skill-based agents that are still missing
      for (const [name, model] of Object.entries(DEFAULT_MODELS)) {
        if (!config.agent[name]) {
          config.agent[name] = { model };
        }
      }
    },
  };
};
