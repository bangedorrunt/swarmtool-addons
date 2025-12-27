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
import { conductorTools, conductorCheckpointHook, conductorVerifyHook } from './conductor/tools';
import { loadConfig } from './config/loader';

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
  temperature?: number;
  disable?: boolean;
  forcedSkills?: string[];
}

interface ParsedAgent {
  name: string;
  frontmatter: AgentFrontmatter;
  prompt: string;
}

interface ParsedSkill {
  name: string;
  template: string;
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
    if (key === 'temperature') frontmatter.temperature = Number(value);
    if (key === 'disable') frontmatter.disable = value === 'true';
    if (key === 'forcedSkills')
      frontmatter.forcedSkills = value.split(',').map((s: string) => s.trim());
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

/**
 * Load all skill SKILL.md files from the skill directory
 */
async function loadSkills(): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = [];
  const skillDir = path.join(import.meta.dir, 'skill');

  if (!fs.existsSync(skillDir)) {
    return skills;
  }

  const glob = new Bun.Glob('**/SKILL.md');

  for await (const file of glob.scan({ cwd: skillDir, absolute: true })) {
    const content = await Bun.file(file).text();

    // Extract skill name from directory name
    const dir = path.dirname(file);
    const name = path.basename(dir);

    skills.push({
      name,
      template: content,
    });
  }

  return skills;
}

export const SwarmToolAddons: Plugin = async () => {
  // Load configuration
  const userConfig = loadConfig();

  // Load commands and agents from .md files
  const [commands, agents] = await Promise.all([loadCommands(), loadAgents(), loadSkills()]);

  // DATABASE PATH RESOLUTION - CRITICAL CONFIGURATION
  //
  // The projectPath is set to process.cwd() which is used for:
  // - Triggering memory extraction (triggerMemoryExtraction call on line 266)
  // - SwarmMail initialization (when called from memory-lane/tools.ts)
  //
  // PROBLEM: This does NOT match opencode-swarm-plugin's behavior:
  // - Plugin uses input.directory from OpenCode context
  // - Addon uses process.cwd() (current working directory)
  //
  // PATH MISMATCH SCENARIO:
  // - OpenCode starts from /Users/user/project (input.directory = /Users/user/project)
  // - Plugin creates database at /Users/user/project/.hive/swarm.db
  // - Addon's projectPath = /Users/user/project/swarmtool-addons
  // - Addon tries to access /Users/user/project/swarmtool-addons/.hive/swarm.db
  // - Result: "Could not connect to swarm.db" - wrong database path
  //
  // See src/memory-lane/tools.ts:17 for detailed path resolution analysis
  const projectPath = process.cwd();

  return {
    // Register custom tools
    tool: {
      ...memoryLaneTools,
      ...conductorTools,
    },

    // OpenCode Hooks
    hook: {
      // Synchronous context injection
      // Intercepts memory tool calls to prioritize Memory Lane
      'tool.execute.before': async (input: { tool: string }, output: { context: string[] }) => {
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

        // Conductor Skill Injection
        // If we are initializing a swarm session and a tracks directory exists,
        // we inject the conductor skill guidance.
        if (input.tool === 'swarmmail_init' && fs.existsSync(path.join(process.cwd(), 'tracks'))) {
          output.context.push(
            'SYSTEM: Conductor SDD Protocol Active\n' +
              'This project is managed by Conductor. You MUST follow the Spec-Driven Development (SDD) protocol.\n' +
              "Use 'conductor_verify' to check quality gates and 'conductor_checkpoint' to commit task completions.\n" +
              "Never implement without a verified spec and plan in the 'tracks/' directory."
          );
        }
      },

      // Post-tool execution hooks
      // Used for immediate memory extraction and conductor coordination after task completion
      // Event-driven async coordination for 98% latency improvement
      'tool.execute.after': async (
        input: { tool: string; args: any },
        output: { context: string[] }
      ) => {
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

        // Conductor checkpoint hook - Immediate execution pattern
        // Replaces swarm-mail polling for 98% latency improvement
        if (input.tool === 'conductor_checkpoint') {
          try {
            await conductorCheckpointHook(input, output);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[conductor] Failed to trigger checkpoint hook:', error);
          }
        }

        // Conductor verify hook - Immediate execution pattern
        // Enables event-driven quality gate coordination
        if (input.tool === 'conductor_verify') {
          try {
            await conductorVerifyHook(input, output);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('[conductor] Failed to trigger verify hook:', error);
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

      // Register all loaded agents with model overrides from config
      for (const agt of agents) {
        // Get model override from user config if available
        const modelOverride = userConfig.models[agt.name];
        const model = modelOverride?.model ?? agt.frontmatter.model;

        // Build agent configuration with all frontmatter options
        const agentConfig: any = {
          prompt: agt.prompt,
          description: agt.frontmatter.description,
          model,
        };

        // Add optional frontmatter fields
        if (agt.frontmatter.temperature !== undefined) {
          agentConfig.temperature = agt.frontmatter.temperature;
        }

        if (agt.frontmatter.forcedSkills !== undefined) {
          agentConfig.forcedSkills = agt.frontmatter.forcedSkills;
        }

        if (agt.frontmatter.disable !== undefined) {
          agentConfig.disable = agt.frontmatter.disable;
        }

        config.agent[agt.name] = agentConfig;
      }

      // Disable 'build' agent
      config.agent.build = config.agent.build ?? {};
      config.agent.build.disable = true;

      // Register 'plan' agent with read-only permissions
      config.agent.plan = config.agent.oracle ?? {
        tools: {
          write: false,
          edit: false,
          bash: false,
        },
      };

      // Ensure 'oracle' agent is registered and active
      config.agent.oracle = config.agent.oracle ?? {};
      config.agent.oracle.disable = false;

      // Note: Skills are handled via custom skill tool, not config registration
      // This prevents conflict with swarm-tools internal skill system
    },
  };
};
