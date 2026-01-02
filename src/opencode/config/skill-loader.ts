/**
 * Skill Loader - Reads SKILL.md files and prepares them for OpenCode agent registration
 *
 * This module reads skill definitions from SKILL.md files and converts them into
 * the format expected by OpenCode's config.agent hook.
 *
 * v5.0: Updated for consolidated 8-agent roster with flat naming.
 */

import fs from 'node:fs';
import path from 'path';
import matter from 'gray-matter';

export interface SkillDefinition {
  /** Hierarchical name (e.g., "chief-of-staff/architect") or flat name (e.g., "architect") */
  name: string;
  /** Full description for agent listing */
  description: string;
  /** Model to use (e.g., "google/gemini-2.5-flash") */
  model?: string;
  /** Temperature setting */
  temperature?: number;
  /** Full SKILL.md content (used as system prompt) */
  prompt: string;
  /** Tool permissions */
  tools?: Record<string, boolean>;
  /** Agent mode (subagent for all skill-based agents) */
  mode: 'subagent';
  /** Optional metadata for visibility and categorization */
  metadata?: any;
}

/**
 * Active agents in v5.0 roster.
 * Deprecated agents are excluded from loading.
 */
const ACTIVE_AGENTS = [
  'interviewer',
  'architect',
  'executor',
  'reviewer',
  'validator',
  'debugger',
  'explore',
  'librarian',
];

/**
 * Load all chief-of-staff skill agents from the orchestrator directory
 */
export async function loadChiefOfStaffSkills(): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  // Path to chief-of-staff agents in the source
  const agentsDir = path.join(
    import.meta.dir,
    '..',
    '..',
    'orchestrator',
    'chief-of-staff',
    'agents'
  );

  if (!fs.existsSync(agentsDir)) {
    console.warn(`[skill-loader] Agents directory not found: ${agentsDir}`);
    return skills;
  }

  const agentDirs = fs.readdirSync(agentsDir);

  for (const agentName of agentDirs) {
    // Skip deprecated agents - only load active agents
    if (!ACTIVE_AGENTS.includes(agentName)) {
      continue;
    }

    const agentPath = path.join(agentsDir, agentName);

    if (!fs.statSync(agentPath).isDirectory()) continue;

    const skillMdPath = path.join(agentPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const { data, content: markdownContent } = matter(content);

      // v5.0: Use name from frontmatter if available, otherwise derive from directory
      // Supports both flat names (executor) and hierarchical (chief-of-staff/executor)
      const skillName = data.name || `chief-of-staff/${agentName}`;

      const skill: SkillDefinition = {
        name: skillName,
        description: data.description || `${agentName} agent`,
        model: data.model,
        temperature: data.temperature,
        prompt: markdownContent.trim(),
        tools: parseTools(data.tools),
        mode: 'subagent',
        metadata: data.metadata,
      };

      skills.push(skill);
    } catch (error) {
      console.error(`[skill-loader] Failed to load ${agentName}:`, error);
    }
  }

  return skills;
}

/**
 * Parse tools from SKILL.md frontmatter into OpenCode format
 */
function parseTools(tools: any): Record<string, boolean> | undefined {
  if (!tools) return undefined;

  const result: Record<string, boolean> = {};

  // Handle OpenCode-style tool permissions
  if (typeof tools === 'object') {
    for (const [key, value] of Object.entries(tools)) {
      if (typeof value === 'boolean') {
        result[key] = value;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Get available skill names (for discovery)
 */
export async function getAvailableSkillNames(): Promise<string[]> {
  const skills = await loadChiefOfStaffSkills();
  return skills.map((s) => s.name);
}
