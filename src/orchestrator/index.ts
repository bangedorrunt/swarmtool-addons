/**
 * Orchestrator Module
 *
 * This module contains orchestration patterns, research, and skill-based
 * agent definitions. The orchestrator focuses on multi-agent coordination
 * patterns (e.g., Sisyphus, Conductor).
 *
 * The orchestrator provides its own tool implementations for spawning
 * specialized subagents, decoupled from opencode/agent to maintain
 * module isolation as a proper addon.
 */

// Export orchestrator-specific skill_agent tools
export { createSkillAgentTools } from './tools';

// Re-export agent loading functions (shared infrastructure)
export { loadSkillAgents, loadLocalAgents } from '../opencode';
