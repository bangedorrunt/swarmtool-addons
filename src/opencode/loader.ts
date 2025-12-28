import path from 'path';
import fs from 'node:fs';

export interface AgentConfig {
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  prompt: string;
  tools?: Record<string, boolean>;
  [key: string]: any;
}

export interface ParsedAgent {
  name: string;
  config: AgentConfig;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
export function parseFrontmatter(content: string): { frontmatter: any; body: string } {
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
 * Load all command .md files from a directory
 */
export async function loadCommands(commandDir: string): Promise<any[]> {
  const commands: any[] = [];

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
 * Simple frontmatter parser for markdown agents
 */
export function parseAgentMarkdown(content: string, name: string): AgentConfig {
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    ...frontmatter,
    name,
    prompt: body,
  };
}

const SKILL_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '.',
  '.config',
  'opencode',
  'skill'
);

/**
 * Loads all agent .md files from the local agent directory
 */
export async function loadLocalAgents(agentDir: string): Promise<ParsedAgent[]> {
  const agents: ParsedAgent[] = [];

  if (!fs.existsSync(agentDir)) {
    return agents;
  }

  const glob = new Bun.Glob('**/*.md');

  for await (const file of glob.scan({ cwd: agentDir, absolute: true })) {
    const content = await Bun.file(file).text();
    const relativePath = path.relative(agentDir, file);
    const name = relativePath.replace(/\.md$/, '');
    const config = parseAgentMarkdown(content, name);

    agents.push({
      name,
      config,
    });
  }

  return agents;
}

/**
 * Discovers and loads all skill-based agents
 */
export async function loadSkillAgents(): Promise<ParsedAgent[]> {
  const agents: ParsedAgent[] = [];

  if (!fs.existsSync(SKILL_DIR)) {
    return agents;
  }

  const skills = fs.readdirSync(SKILL_DIR);
  for (const skillName of skills) {
    const skillPath = path.join(SKILL_DIR, skillName);
    if (!fs.statSync(skillPath).isDirectory()) continue;

    const agentDirs = ['agent', 'agents'];
    for (const dirName of agentDirs) {
      const agentPath = path.join(skillPath, dirName);
      if (fs.existsSync(agentPath) && fs.statSync(agentPath).isDirectory()) {
        const subDirs = fs.readdirSync(agentPath);
        for (const agentName of subDirs) {
          const subAgentPath = path.join(agentPath, agentName);
          const fullName = `${skillName}/${agentName}`;

          if (fs.statSync(subAgentPath).isDirectory()) {
            // Check for SKILL.md
            const skillMdPath = path.join(subAgentPath, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
              const content = await Bun.file(skillMdPath).text();
              const config = parseAgentMarkdown(content, fullName);
              agents.push({ name: fullName, config });
            }
          } else if (agentName.endsWith('.md')) {
            const content = await Bun.file(subAgentPath).text();
            const name = agentName.replace(/\.md$/, '');
            const config = parseAgentMarkdown(content, `${skillName}/${name}`);
            agents.push({ name: `${skillName}/${name}`, config });
          } else if (agentName.endsWith('.ts')) {
            // TypeScript agents would be dynamically imported
            // For now, we'll just note them
            try {
              const module = await import(subAgentPath);
              if (module.default || module.agent) {
                const config = module.default || module.agent;
                agents.push({ name: fullName, config: { ...config, name: fullName } });
              }
            } catch (e) {
              // Failed to load TS agent - silent skip or log elsewhere
            }
          }
        }
      }
    }
  }

  return agents;
}
