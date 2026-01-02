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

// Export LEDGER tools for agents (consolidated in tools/ directory)
export { createLedgerTools, ledgerTools, ledgerEventTools } from './tools/ledger-tools';

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

// Export Event-Driven Ledger Integration
export {
  EventDrivenLedger,
  getEventDrivenLedger,
  initializeEventDrivenLedger,
  shutdownEventDrivenLedger,
  createLedgerEventHandlers,
  type LedgerEventConfig,
  type LedgerEventType,
  type LedgerEventPayload,
} from './event-driven-ledger';

// Export Checkpoint System (HITL)
export {
  CheckpointManager,
  getCheckpointManager,
  initializeCheckpointManager,
  shutdownCheckpointManager,
  createCheckpointWorkflow,
  CHECKPOINT_TEMPLATES,
  type CheckpointDefinition,
  type CheckpointResult,
  type CheckpointHandler,
} from './checkpoint';

// Export Crash Recovery
export {
  CrashRecoverySystem,
  performRecovery,
  getRecoveryStatus,
  createRecoveryWorkflow,
  type RecoveryState,
  type RecoveryOptions,
  type RecoveryReport,
} from './crash-recovery';

// Export Learning Extraction Pipeline
export {
  LearningExtractor,
  getLearningExtractor,
  initializeLearningExtractor,
  shutdownLearningExtractor,
  extractSessionLearnings,
  extractEventLearnings,
  type Learning,
  type LearningExtractorConfig,
} from './learning-extractor';

// Export Progress System (v5.0)
export {
  emitProgress,
  emitPhaseStart,
  emitPhaseComplete,
  emitUserActionNeeded,
  emitContextHandoff,
  formatStatusLine,
  subscribeToProgress,
  AGENT_PHASES,
  type AgentName,
} from './progress';

// Export HITL Utilities (v5.0)
export {
  formatPoll,
  formatConfirmation,
  formatInputRequest,
  formatYieldMessage,
  parseUserResponse,
  requestPoll,
  requestConfirmation,
  strategicPoll,
  type PollOption,
  type PollConfig,
  type UserResponse,
} from './hitl';

// Export Session Strategy (v5.0)
export {
  getSessionMode,
  requiresContext,
  buildHandoffContext,
  prepareChildSessionPrompt,
  canUseInlineMode,
  AGENT_SESSION_CONFIG,
  type SessionMode,
  type AgentSessionConfig,
} from './session-strategy';

// Import shutdown functions for graceful shutdown
import { stopTaskObservation } from './observer';
import { resetTaskRegistry } from './task-registry';
import { shutdownCheckpointManager } from './checkpoint';
import { shutdownLearningExtractor } from './learning-extractor';
import { shutdownEventDrivenLedger } from './event-driven-ledger';

// ============================================================================
// Graceful Shutdown (v5.1)
// ============================================================================

export async function shutdownAll(): Promise<void> {
  console.log('[Orchestrator] Starting graceful shutdown...');

  // Stop task observation first
  try {
    stopTaskObservation();
    console.log('[Orchestrator] Task observer stopped');
  } catch (err) {
    console.error('[Orchestrator] Error stopping task observer:', err);
  }

  // Reset task registry
  try {
    resetTaskRegistry();
    console.log('[Orchestrator] Task registry reset');
  } catch (err) {
    console.error('[Orchestrator] Error resetting task registry:', err);
  }

  // Shutdown checkpoint manager
  try {
    await shutdownCheckpointManager();
    console.log('[Orchestrator] Checkpoint manager shutdown');
  } catch (err) {
    console.error('[Orchestrator] Error shutting down checkpoint manager:', err);
  }

  // Shutdown learning extractor
  try {
    await shutdownLearningExtractor();
    console.log('[Orchestrator] Learning extractor shutdown');
  } catch (err) {
    console.error('[Orchestrator] Error shutting down learning extractor:', err);
  }

  // Shutdown event-driven ledger
  try {
    await shutdownEventDrivenLedger();
    console.log('[Orchestrator] Event-driven ledger shutdown');
  } catch (err) {
    console.error('[Orchestrator] Error shutting down event-driven ledger:', err);
  }

  // Shutdown durable stream (imported from durable-stream)
  try {
    const { shutdownDurableStream } = await import('../durable-stream');
    await shutdownDurableStream();
    console.log('[Orchestrator] Durable stream shutdown');
  } catch (err) {
    console.error('[Orchestrator] Error shutting down durable stream:', err);
  }

  // Shutdown memory lane store (imported from memory-lane)
  try {
    const { resetMemoryLaneStore } = await import('../memory-lane');
    resetMemoryLaneStore();
    console.log('[Orchestrator] Memory lane store reset');
  } catch (err) {
    console.error('[Orchestrator] Error resetting memory lane store:', err);
  }

  console.log('[Orchestrator] Graceful shutdown complete');
}
