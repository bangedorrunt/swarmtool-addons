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
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmedLine.slice(0, colonIndex).trim();
    const value = trimmedLine.slice(colonIndex + 1).trim();

    // Special handling for specific types
    if (key === 'subtask') {
      frontmatter.subtask = value === 'true';
    } else if (key === 'temperature') {
      frontmatter.temperature = Number(value);
    } else if (key === 'disable') {
      frontmatter.disable = value === 'true';
    } else if (key === 'forcedSkills') {
      frontmatter.forcedSkills = value.split(',').map((s: string) => s.trim());
    } else if (key === 'agent') {
      frontmatter.agent = value === 'true' ? true : value;
    } else if (key === 'metadata') {
      // Very basic metadata parsing (for simple key: value nested one level)
      // Note: This is a fallback since we aren't using a full YAML parser here
      frontmatter.metadata = frontmatter.metadata || {};
    } else {
      // Default: store as string
      frontmatter[key] = value;
    }
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
 * Discovers and loads all skill-based agents from local and global directories.
 *
 * Search priority:
 * 1. .opencode/skill (local project)
 * 2. .claude/skills (local compatibility)
 * 3. ~/.config/opencode/skill (global)
 */
export async function loadSkillAgents(): Promise<ParsedAgent[]> {
  const agents: ParsedAgent[] = [];
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '.';

  const searchPaths = [
    // Local project directories
    path.join(process.cwd(), '.opencode', 'skill'),
    path.join(process.cwd(), '.claude', 'skills'),
    // Global config directory
    path.join(homeDir, '.config', 'opencode', 'skill'),
  ];

  for (const skillBaseDir of searchPaths) {
    if (!fs.existsSync(skillBaseDir)) continue;

    const skills = fs.readdirSync(skillBaseDir);
    for (const skillName of skills) {
      const skillPath = path.join(skillBaseDir, skillName);
      if (!fs.statSync(skillPath).isDirectory()) continue;

      // 1. Check for flattened skill (SKILL.md in root)
      const rootSkillMdPath = path.join(skillPath, 'SKILL.md');
      if (fs.existsSync(rootSkillMdPath)) {
        const content = await Bun.file(rootSkillMdPath).text();
        const { frontmatter } = parseFrontmatter(content);

        // ONLY treat as agent if specifically marked as one
        if (frontmatter.agent) {
          // Use name from frontmatter or directory name
          const agentName = frontmatter.name ? String(frontmatter.name) : skillName;

          if (!agents.some((a) => a.name === agentName)) {
            const config = parseAgentMarkdown(content, agentName);
            // Pass along the metadata for visibility control
            config.metadata = frontmatter.metadata;
            agents.push({ name: agentName, config });
          }
        }
      }

      // 2. Check for nested agents in agent/agents subdirectories
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
                const { frontmatter } = parseFrontmatter(content);
                // Use name from frontmatter or constructed name
                const finalName = frontmatter.name ? String(frontmatter.name) : fullName;

                if (!agents.some((a) => a.name === finalName)) {
                  const config = parseAgentMarkdown(content, finalName);
                  agents.push({ name: finalName, config });
                }
              }
            } else if (agentName.endsWith('.md')) {
              const content = await Bun.file(subAgentPath).text();
              const name = agentName.replace(/\.md$/, '');
              const fullAgentName = `${skillName}/${name}`;

              const { frontmatter } = parseFrontmatter(content);
              const finalName = frontmatter.name ? String(frontmatter.name) : fullAgentName;

              if (!agents.some((a) => a.name === finalName)) {
                const config = parseAgentMarkdown(content, finalName);
                agents.push({ name: finalName, config });
              }
            }
          }
        }
      }
    }
  }

  return agents;
}
