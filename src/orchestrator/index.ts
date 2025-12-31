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

// Export LEDGER.md utilities
export {
  // Types
  type Ledger,
  type Epic,
  type Task,
  type Learnings,
  type Handoff,
  type ArchiveEntry,
  type LedgerMeta,
  type LedgerPhase,
  type TaskStatus,
  type TaskOutcome,
  type EpicStatus,
  // Core functions
  loadLedger,
  saveLedger,
  createEpic,
  createTask,
  updateTaskStatus,
  addLearning,
  addContext,
  createHandoff,
  archiveEpic,
  getProgress,
  getReadyTasks,
  canStartTask,
  surfaceLearnings,
  // Constants
  DEFAULT_LEDGER_PATH,
  MAX_TASKS_PER_EPIC,
  MAX_ARCHIVE_ENTRIES,
} from './ledger';

// Export LEDGER session hooks
export {
  onSessionStart,
  onTaskComplete,
  onPreCompact,
  onSessionEnd,
  formatSessionContext,
  type SessionContext,
  type TaskResult,
  type SessionStartResult,
  type SessionEndResult,
} from './ledger-hooks';

// Export LEDGER tools for agents
export { createLedgerTools, ledgerTools } from './ledger-tools';

// Export Resilient Orchestration - Task Registry
export {
  TaskRegistry,
  getTaskRegistry,
  resetTaskRegistry,
  type RegistryTask,
  type RegistryTaskStatus,
  type TaskRegistryOptions,
} from './task-registry';

// Export Resilient Orchestration - Task Observer
export {
  TaskObserver,
  getTaskObserver,
  startTaskObservation,
  stopTaskObservation,
  type ObserverConfig,
  type ObserverStats,
} from './observer';

// Export Resilient Orchestration - Tools
export { createResilienceTools, resilienceTools } from './resilience-tools';
