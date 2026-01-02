/**
 * OpenCode Plugin Template
 *
 * This is an example plugin that demonstrates the plugin capabilities:
 * - Custom tools (tools callable by the LLM)
 * - Custom slash commands (user-invokable /commands loaded from .md files)
 * - Config hooks (modify config at runtime)
 * - Session learning hooks (self-learning across sessions)
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import path from 'node:path';
import crypto from 'node:crypto';
import { memoryLaneTools } from './memory-lane';
import { loadConfig, DEFAULT_MODELS } from './opencode';
import { SignalBuffer } from './orchestrator/signal-buffer';
import { PromptBuffer } from './orchestrator/prompt-buffer';
import { loadLocalAgents, loadSkillAgents, loadCommands } from './opencode';
import { createSkillAgentTools, startTaskObservation, getTaskRegistry } from './orchestrator';
import { createOpenCodeSessionLearningHook } from './orchestrator/hooks';
import { createModuleLogger } from './utils/logger';

const log = createModuleLogger('Plugin');

import { loadChiefOfStaffSkills } from './opencode/config/skill-loader';
import { createAgentTools } from './agent-spawn';
import { createEventLogTools } from './event-log';
import { initializeDurableStream, getDurableStream } from './durable-stream';
import { ledgerTools, ledgerEventTools } from './orchestrator/tools/ledger-tools';
import { checkpointTools } from './orchestrator/tools/checkpoint-tools';
import { formatYieldMessage } from './orchestrator/hitl';
import {
  loadLedger,
  saveLedger,
  DEFAULT_LEDGER_PATH,
  clearActiveDialogue,
} from './orchestrator/ledger';
import { getLedgerProjector } from './orchestrator/ledger-projector';
import {
  buildDialogueContinuationPrompt,
  getUserTextFromParts,
  isCancelMessage,
  isSlashCommand,
  shouldRouteToActiveDialogue,
} from './orchestrator/dialogue-routing';

const activeAgentCalls = new Map<string, string>();

type OpenCodeClient = PluginInput['client'];

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
 * Creates flat structure for OpenCode skill discovery:
 * - .opencode/skill/chief-of-staff/SKILL.md (orchestrator)
 * - .opencode/skill/architect/SKILL.md
 * - .opencode/skill/interviewer/SKILL.md
 * etc.
 */
async function ensureChiefOfStaffSkills(): Promise<void> {
  const fsp = await import('node:fs/promises');
  const projectRoot = process.cwd();
  const targetDir = path.join(projectRoot, '.opencode', 'skill');
  const sourceDir = path.join(import.meta.dir, 'orchestrator', 'chief-of-staff');

  // Check if already migrated by looking for flat structure
  const architectSkill = path.join(targetDir, 'architect', 'SKILL.md');
  try {
    await fsp.access(architectSkill);
    return; // Already migrated
  } catch {
    // Continue with migration
  }

  // Ensure target directory exists
  await fsp.mkdir(targetDir, { recursive: true });

  // Copy parent chief-of-staff skill (orchestrator stays in its own directory)
  const chiefOfStaffTarget = path.join(targetDir, 'chief-of-staff');
  await fsp.mkdir(chiefOfStaffTarget, { recursive: true });

  const chiefOfStaffSource = path.join(sourceDir, 'SKILL.md');
  try {
    await fsp.copyFile(chiefOfStaffSource, path.join(chiefOfStaffTarget, 'SKILL.md'));
  } catch {
    // Source file may not exist
  }

  // Copy all agent skills as FLAT directories in .opencode/skill/
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
          // Create flat structure: .opencode/skill/{agent}/SKILL.md
          const targetAgentDir = path.join(targetDir, agentName);
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

  // Create tools with client access
  const skillAgentTools = createSkillAgentTools(input.client as OpenCodeClient);
  const agentTools = createAgentTools(input.client as OpenCodeClient);
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
    log.info(
      { pendingCheckpoints: resumeResult.pending_checkpoints.length },
      'Resumed with pending checkpoints'
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
      ...ledgerTools,
      ...ledgerEventTools,
      ...checkpointTools,
    },

    // Multi-turn dialogue routing (v5.1)
    // If there's an active dialogue bound to this session, route user replies to chief-of-staff.
    'chat.message': async (hookInput, hookOutput) => {
      const text = getUserTextFromParts(hookOutput.parts);

      if (!text) return;
      if (isSlashCommand(text)) return; // don't interfere with slash commands

      let ledger;
      try {
        ledger = await loadLedger(DEFAULT_LEDGER_PATH);
      } catch {
        return;
      }

      const active = ledger.activeDialogue;
      const routing = shouldRouteToActiveDialogue(active, hookInput.sessionID);
      if (!routing.shouldRoute) return;

      // If the dialogue was started/updated from a child session, adopt the current root session
      // so subsequent replies keep routing correctly.
      if (routing.sessionMismatch && ledger.activeDialogue) {
        ledger.activeDialogue.sessionId = hookInput.sessionID;
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);
      }

      if (isCancelMessage(text)) {
        clearActiveDialogue(ledger);
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);
        return;
      }

      // Force continuation to the orchestrator regardless of current selected agent.
      hookOutput.message.agent = 'chief-of-staff';

      const firstTextPart = (hookOutput.parts || []).find((p: any) => p?.type === 'text');
      if (firstTextPart && active) {
        (firstTextPart as any).text = buildDialogueContinuationPrompt({
          userResponse: text,
          activeDialogue: active,
        });
      }
    },

    // 2. OpenCode Hooks (must be flat on this object)

    // Synchronous context injection
    'tool.execute.before': async (
      input: { tool: string; callID: string },
      output: { args: any }
    ) => {
      // Logic for context injection or logging before tool starts
      // Capture agent name for title setting
      if (input.tool === 'skill_agent' || input.tool === 'agent_spawn') {
        const agentName = output.args?.agent_name || output.args?.agent;
        if (agentName) {
          activeAgentCalls.set(input.callID, agentName);
        }
      }
    },

    // Post-tool execution hooks - CRITICAL for Lifecycle Handoff 2.0
    'tool.execute.after': async (
      hookInput: { tool: string; sessionID: string; callID: string },
      hookOutput: { title: string; output: string; metadata: any }
    ) => {
      // 1. Set Display Title (UI Polish)
      const initialAgentName = activeAgentCalls.get(hookInput.callID);
      if (initialAgentName) {
        hookOutput.title = initialAgentName;
        activeAgentCalls.delete(hookInput.callID);
      }

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

          // FIX: Set localized title for agent tools (Investigate subagent name)
          if (
            (hookInput.tool === 'skill_agent' || hookInput.tool === 'agent_spawn') &&
            parsed.agent
          ) {
            hookOutput.title = parsed.agent;
          }

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
                // Push immediately with user-friendly format (v5.0)
                const formattedMessage = formatYieldMessage(
                  signalPayload.sourceAgent,
                  handoffData.reason,
                  handoffData.summary || '',
                  handoffData.options
                );
                await input.client.session.promptAsync({
                  path: { id: parentID },
                  body: {
                    agent: 'system',
                    parts: [
                      {
                        type: 'text',
                        text: formattedMessage,
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
            log.error({ err: e }, 'Failed to process upward signal');
          }
          return; // Done with Upward Signal
        }

        // Standard Handoff (Lateral)
        const handoff = handoffData as HandoffData;
        const { target_agent, prompt, session_id } = handoff;
        const messageID = (handoffData as any).message_id || (handoffData as any).messageID;

        if (target_agent && prompt && session_id) {
          // Use a fixed delay for settling
          setTimeout(async () => {
            try {
              await input.client.session.promptAsync({
                path: { id: session_id },
                body: {
                  agent: target_agent,
                  ...(messageID ? { messageID } : {}),
                  parts: [{ type: 'text', text: prompt }],
                },
              });
            } catch (err) {
              const errorMessage = err instanceof Error ? err.toString() : String(err);
              log.error({ error: errorMessage }, 'Handoff prompt failed; enqueueing for retry');

              try {
                await PromptBuffer.getInstance().enqueue({
                  id: messageID || crypto.randomUUID(),
                  targetSessionId: session_id,
                  agent: target_agent,
                  prompt,
                  messageID,
                  createdAt: Date.now(),
                });
              } catch (enqueueErr) {
                log.error({ err: enqueueErr }, 'Failed to enqueue prompt');
              }
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

      // 1.0 Ledger projection (DurableStream -> LEDGER.md) on safe trigger
      if (event.type === 'session.idle') {
        await getLedgerProjector()
          .project()
          .catch(() => {});
      }

      // 1.1 Runtime telemetry is captured by Durable Stream (no separate activity.jsonl)

      // 2. SignalBuffer Auto-Flush (Parent Busy Resolution)
      if (event.type === 'session.status') {
        // event.data object keys are sessionIds, values are Status({type: 'idle'|'busy'})
        const statuses = event.data || {};
        const buffer = SignalBuffer.getInstance();
        const promptBuffer = PromptBuffer.getInstance();

        for (const [sessionId, status] of Object.entries(statuses)) {
          // If a session becomes IDLE and has pending prompts, flush them!
          if ((status as any).type === 'idle' && promptBuffer.hasPrompts(sessionId)) {
            const prompts = promptBuffer.flush(sessionId);
            for (const p of prompts) {
              try {
                await input.client.session.promptAsync({
                  path: { id: sessionId },
                  body: {
                    agent: p.agent,
                    ...(p.messageID ? { messageID: p.messageID } : {}),
                    parts: [{ type: 'text', text: p.prompt }],
                  },
                });
              } catch (e) {
                const attempts = p.attempts + 1;
                if (attempts < 3) {
                  await promptBuffer.enqueue({ ...p, attempts });
                } else {
                  log.error(
                    { err: e, sessionId, messageID: p.messageID },
                    'Failed to flush deferred prompt'
                  );
                }
              }
            }
          }

          // If a session becomes IDLE and has pending signals, flush them!
          if ((status as any).type === 'idle' && buffer.hasSignals(sessionId)) {
            const signals = buffer.flush(sessionId);
            for (const sig of signals) {
              log.debug({ sessionId, reason: sig.payload.reason }, 'Auto-flushing signal');
              // Prompt the parent with user-friendly wake-up signal (v5.0)
              try {
                const formattedSignal = formatYieldMessage(
                  sig.sourceAgent,
                  sig.payload.reason,
                  sig.payload.data?.summary || '',
                  undefined
                );
                await input.client.session.promptAsync({
                  path: { id: sessionId },
                  body: {
                    agent: 'system',
                    parts: [
                      {
                        type: 'text',
                        text: formattedSignal,
                      },
                    ],
                  },
                });
              } catch (e) {
                log.error({ err: e, sessionId }, 'Failed to flush signal');
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
        // Apply model override from userConfig if exists, otherwise use frontmatter model
        const modelOverride = userConfig.models[cmd.frontmatter.agent];
        const model = modelOverride?.model ?? cmd.frontmatter.model ?? 'opencode/grok-code';
        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model,
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
