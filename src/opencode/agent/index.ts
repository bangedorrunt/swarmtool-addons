/**
 * OpenCode Agent Module
 *
 * Exports agent loading and skill-based subagent tools.
 * This module provides the delegation infrastructure for spawning specialized
 * agents defined within skills.
 */

// Agent loading functions
export { loadLocalAgents, loadSkillAgents, loadCommands } from '../loader';

// Skill-based subagent tools
export { createSkillAgentTools } from './tools';

// Types
export type { AgentConfig, ParsedAgent } from '../loader';
