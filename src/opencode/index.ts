/**
 * OpenCode Module
 *
 * Provides agent loading, skill discovery, and command parsing
 * for the swarm-tool-addons plugin.
 *
 * Module exports:
 * - Agent loading functions (loadLocalAgents, loadSkillAgents, loadCommands)
 * - Frontmatter parsing (parseFrontmatter, parseAgentMarkdown)
 * - Configuration (types, loading, validation)
 * - Skill-based agent tools (createSkillAgentTools)
 */

// Agent loading and parsing
export {
  loadLocalAgents,
  loadSkillAgents,
  loadCommands,
  parseFrontmatter,
  parseAgentMarkdown,
} from './loader';

export type { AgentConfig, ParsedAgent } from './loader';

// Configuration module
export * from './config';
