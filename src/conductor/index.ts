/**
 * Conductor Module
 *
 * Spec-Driven Development (SDD) protocol with quality gates and checkpoints.
 * Refactored to use adapter pattern and event-driven async coordination.
 */

// Tools
export { conductorTools } from './tools';
export {
  conductor_init,
  conductor_verify,
  conductor_checkpoint,
  conductor_read_track,
} from './tools';

// Hooks
export { conductorCheckpointHook, conductorVerifyHook } from './tools';

// Parser functions and types
export { parseMarkdown, parseCheckboxes } from './parser';
export type { ParsedMarkdown, TaskItem } from './parser';
