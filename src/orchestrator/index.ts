/**
 * Orchestrator Module
 *
 * This module contains orchestration patterns, research, and skill-based
 * agent definitions. The orchestrator focuses on multi-agent coordination
 * patterns (e.g., Chief-of-Staff, Conductor).
 *
 * Key Components:
 * - Skill-based agent tools (skill_agent, skill_list, skill_spawn_batch, skill_gather)
 * - Session learning hooks (automatic learning injection and capture)
 * - Workflow agents (Chief-of-Staff, Interviewer, Spec-Writer, etc.)
 */

// Export orchestrator-specific skill_agent tools
export { createSkillAgentTools } from './tools';

// Re-export agent loading functions (shared infrastructure)
export { loadSkillAgents, loadLocalAgents } from '../opencode';

// Export session learning hooks
export {
    createSessionLearningInjector,
    createSessionLearningCapture,
    trackAssumption,
    getTrackedAssumptions,
    clearTrackedAssumptions,
    verifyAssumption,
    type TrackedAssumption,
    // OpenCode-integrated hooks
    createOpenCodeSessionLearningHook,
    queryLearnings,
    storeLearning,
} from './hooks';

// Export Actor Model components
export {
    // State
    type ActorState,
    type ActorPhase,
    type TrackedAssumption as ActorTrackedAssumption,
    type SubAgentState,
    type ExplicitDirection,
    loadActorState,
    saveActorState,
    clearActorState,
    hasActorState,
    createInitialState,
    // Messages
    type ActorMessage,
    createMessage,
    // Core
    receive,
    processMessage,
    resumeFromOffset,
    // Tools
    createActorTools,
} from './actor';

// Export session coordination utilities
export {
    spawnChildAgent,
    getChildSessions,
    gatherChildResults,
    type SpawnResult,
    type SpawnOptions,
} from './session-coordination';
