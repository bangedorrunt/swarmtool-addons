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
import path from 'path';
import { memoryLaneTools, triggerMemoryExtraction } from './memory-lane';
import { loadConfig } from './opencode';
import { loadLocalAgents, loadSkillAgents, loadCommands } from './opencode';
import { createSkillAgentTools } from './opencode';
import { createOpenCodeSessionLearningHook } from './orchestrator/hooks';

export const SwarmToolAddons: Plugin = async (input) => {
  // Load configuration
  const userConfig = loadConfig();

  // Load commands and agents from .md files
  const agentDir = path.join(import.meta.dir, 'opencode', 'agent');
  const commandDir = path.join(import.meta.dir, 'opencode', 'command');

  const [commands, localAgents, skillAgents] = await Promise.all([
    loadCommands(commandDir),
    loadLocalAgents(agentDir),
    loadSkillAgents(),
  ]);

  const agents = [...localAgents, ...skillAgents];

  // DATABASE PATH RESOLUTION - CRITICAL CONFIGURATION
  const projectPath = process.cwd();

  // Create tools with client access
  const skillAgentTools = createSkillAgentTools(input.client);

  // Create session learning hook with skill_agent integration
  const sessionLearningHook = createOpenCodeSessionLearningHook(input, {
    maxMemories: 10,
    captureEnabled: true,
    captureDelay: 2000,
    skillAgent: async (args) => {
      // Use the skill_agent tool for spawning memory-catcher
      // Note: Context is constructed internally, we just need to satisfy the type
      const result = await skillAgentTools.skill_agent.execute(args, {} as any);
      return JSON.parse(result);
    },
  });

  return {
    // Register custom tools
    tool: {
      ...memoryLaneTools,
      ...skillAgentTools,
    },

    // OpenCode Hooks
    hook: {
      // Synchronous context injection
      'tool.execute.before': async (input: { tool: string }, output: { context: string[] }) => {
        const memoryTools = ['semantic-memory_find', 'memory-lane_find'];

        if (memoryTools.includes(input.tool)) {
          output.context.push(
            'SYSTEM: Memory Lane Guidance\n' +
            'When searching for behavioral context (corrections, decisions, preferences), ' +
            "ALWAYS prioritize 'memory-lane_find' over 'semantic-memory_find'.\n" +
            "Memory Lane provides intent boosting and entity filtering which 'semantic-memory_find' lacks."
          );
        }
      },

      // Post-tool execution hooks
      'tool.execute.after': async (
        input: { tool: string; args: any },
        output: { context: string[] }
      ) => {
        if (input.tool === 'swarmmail_init') {
          output.context.push(
            'SYSTEM: Memory Lane System Active\n' +
            "You have access to 'memory-lane_find' and 'memory-lane_store'.\n" +
            "ALWAYS use these instead of 'semantic-memory_*' tools. Memory Lane provides " +
            'superior high-integrity search, intent boosting, and entity filtering.'
          );
        }

        if (input.tool === 'swarm_complete') {
          try {
            const outcomeData = {
              bead_id: input.args.bead_id,
              summary: input.args.summary,
              files_touched: input.args.files_touched || [],
              success: true,
              duration_ms: 0,
              agent_name: input.args.agent_name,
            };

            triggerMemoryExtraction(projectPath, outcomeData, Bun.$);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[memory-lane] Failed to trigger immediate extraction:', error);
          }
        }
      },

      // Session learning hook - handles session.created, message.created, session.idle, session.deleted
      event: sessionLearningHook,
    },

    // Config Hook
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

      for (const agt of agents) {
        const modelOverride = userConfig.models[agt.name];
        const model = modelOverride?.model ?? agt.config.model;

        const agentConfig: any = {
          ...agt.config,
          model,
        };

        config.agent[agt.name] = agentConfig;
      }

    },
  };
};
