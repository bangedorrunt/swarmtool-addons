/**
 * OpenCode Plugin Template
 *
 * This is an example plugin that demonstrates the plugin capabilities:
 * - Custom tools (tools callable by the LLM)
 * - Custom slash commands (user-invokable /commands loaded from .md files)
 * - Config hooks (modify config at runtime)
 *
 * Replace this with your own plugin implementation.
 */

import type { Plugin } from '@opencode-ai/plugin';
import path from 'path';
import fs from 'node:fs';
import { memoryLaneTools } from './memory-lane/index';

// COMMAND LOADER
// Loads .md files from src/command/ directory as slash commands

interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}

interface ParsedCommand {
  name: string;
  frontmatter: CommandFrontmatter;
  template: string;
}

interface AgentFrontmatter {
  description?: string;
  model?: string;
}

interface ParsedAgent {
  name: string;
  frontmatter: AgentFrontmatter;
  prompt: string;
}

/**
 * Parse YAML frontmatter from a markdown file
 * Format:
 * ---
 * description: Command description
 * agent: optional-agent
 * ---
 * Template content here
 */
function parseFrontmatter(content: string): { frontmatter: any; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const [, yamlContent, body] = match;
  const frontmatter: any = {};

  // Simple YAML parsing for key: value pairs
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'description') frontmatter.description = value;
    if (key === 'agent') frontmatter.agent = value;
    if (key === 'model') frontmatter.model = value;
    if (key === 'subtask') frontmatter.subtask = value === 'true';
  }

  return { frontmatter, body: body.trim() };
}

/**
 * Load all command .md files from the command directory
 */
async function loadCommands(): Promise<ParsedCommand[]> {
  const commands: ParsedCommand[] = [];
  const commandDir = path.join(import.meta.dir, 'command');

  if (!fs.existsSync(commandDir)) {
    return commands;
  }

  const glob = new Bun.Glob('**/*.md');

  for await (const file of glob.scan({ cwd: commandDir, absolute: true })) {
    const content = await Bun.file(file).text();
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract command name from filename (e.g., "hello.md" -> "hello")
    const relativePath = path.relative(commandDir, file);
    const name = relativePath.replace(/\.md$/, '').replace(/\//g, '-');

    commands.push({
      name,
      frontmatter,
      template: body,
    });
  }

  return commands;
}

/**
 * Load all agent .md files from the agent directory
 */
async function loadAgents(): Promise<ParsedAgent[]> {
  const agents: ParsedAgent[] = [];
  const agentDir = path.join(import.meta.dir, 'agent');

  if (!fs.existsSync(agentDir)) {
    return agents;
  }

  const glob = new Bun.Glob('**/*.md');

  for await (const file of glob.scan({ cwd: agentDir, absolute: true })) {
    const content = await Bun.file(file).text();
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract agent name from filename (e.g., "swarm/worker.md" -> "swarm/worker")
    const relativePath = path.relative(agentDir, file);
    const name = relativePath.replace(/\.md$/, '');

    agents.push({
      name,
      frontmatter,
      prompt: body,
    });
  }

  return agents;
}

export const SwarmToolAddons: Plugin = async () => {
  // Load commands and agents from .md files
  const [commands, agents] = await Promise.all([loadCommands(), loadAgents()]);

  // Set project path for tool hooks
  const projectPath = process.cwd();

  return {
    // Register custom tools
    tool: {
      ...memoryLaneTools,
    },

    // OpenCode Hooks
    hook: {
      // Synchronous context injection
      // Intercepts memory tool calls to prioritize Memory Lane
      'tool.execute.before': async (input: any, output: any) => {
        const memoryTools = ['semantic-memory_find', 'memory-lane_find'];

        if (memoryTools.includes(input.tool)) {
          // Inject context to guide the agent toward better retrieval patterns
          output.context.push(
            'SYSTEM: Memory Lane Guidance\n' +
              'When searching for behavioral context (corrections, decisions, preferences), ' +
              "ALWAYS prioritize 'memory-lane_find' over 'semantic-memory_find'.\n" +
              "Memory Lane provides intent boosting and entity filtering which 'semantic-memory_find' lacks."
          );
        }
      },

      // Post-tool execution hooks
      // Used for immediate memory extraction after task completion
      'tool.execute.after': async (input: any, output: any) => {
        // Inject guidance when a swarm session is initialized
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
            const { triggerMemoryExtraction } = await import('./memory-lane/hooks');

            // Extract outcome data from tool arguments
            // swarm_complete args match our SwarmCompletionData interface
            const outcomeData = {
              bead_id: input.args.bead_id,
              summary: input.args.summary,
              files_touched: input.args.files_touched || [],
              success: true, // swarm_complete implies success if it returned
              duration_ms: 0, // Not easily available from args
              agent_name: input.args.agent_name,
            };

            // Trigger extraction (non-blocking)
            triggerMemoryExtraction(projectPath, outcomeData, Bun.$);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[memory-lane] Failed to trigger immediate extraction:', error);
          }
        }
      },

      // Cleanup when session ends or plugin is unloaded
      event: async () => {
        // No cleanup needed - we use tool hooks only, no persistent connections
      },
    },

    // Config Hook
    // Modify config at runtime - use this to inject custom commands and agents
    async config(config) {
      // Initialize records if they don't exist
      config.command = config.command ?? {};
      config.agent = config.agent ?? {};

      // Register all loaded commands
      for (const cmd of commands) {
        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model: cmd.frontmatter.model,
          subtask: cmd.frontmatter.subtask,
        };
      }

      // Register all loaded agents
      for (const agt of agents) {
        config.agent[agt.name] = {
          prompt: agt.prompt,
          description: agt.frontmatter.description,
          model: agt.frontmatter.model,
        };
      }
    },
  };
};
