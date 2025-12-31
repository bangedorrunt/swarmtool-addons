/**
 * Orchestrator Hooks - Session Learning
 *
 * Provides both standalone and OpenCode-integrated session learning hooks.
 */

// Standalone hooks (no OpenCode dependency)
export {
  createSessionLearningInjector,
  createSessionLearningCapture,
  trackAssumption,
  getTrackedAssumptions,
  clearTrackedAssumptions,
  verifyAssumption,
  type TrackedAssumption,
} from './session-learning';

// OpenCode-integrated hooks (requires OpenCode plugin context)
export {
  createOpenCodeSessionLearningHook,
  queryLearnings,
  storeLearning,
} from './opencode-session-learning';
