/**
 * Memory Lane System
 *
 * Standalone memory storage and retrieval for OpenCode.
 * No external dependencies on swarm-mail or swarm-tools.
 */

export { memoryLaneTools } from './tools';
export { triggerMemoryExtraction } from './hooks';
export { MemoryLaneStore, getMemoryLaneStore, resetMemoryLaneStore } from './memory-store';
export { EntityResolver } from './resolver';
export { PRIORITY_WEIGHTS, MemoryLaneMetadataSchema } from './taxonomy';
export type { MemoryType } from './taxonomy';
export type { SwarmCompletionData } from './hooks';

// Backward compatibility - deprecated
export { MemoryLaneStore as MemoryLaneAdapter } from './memory-store';
