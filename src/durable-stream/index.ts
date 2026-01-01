/**
 * Durable Stream Module - Public API
 *
 * This module provides event-sourced orchestration for OpenCode plugins.
 * It bridges SDK events to a durable log, enabling:
 * - Crash recovery
 * - Human-in-the-loop checkpoints
 * - Workflow lineage tracking
 */

// Types
export type {
    EventType,
    StreamEvent,
    StreamEventInput,
    StreamFilter,
    IStreamStore,
    Checkpoint,
    CheckpointOption,
    Intent,
    IntentSpec,
    ResumeResult,
} from './types';

// Core (Pure Functions)
export {
    generateEventId,
    generateCorrelationId,
    createEvent,
    filterByType,
    filterByStream,
    filterByActor,
    filterByTimeRange,
    applyFilter,
    extractPendingCheckpoints,
    extractActiveIntents,
    isCheckpointExpired,
    buildLineageTree,
    getDescendants,
    serializeEvent,
    deserializeEvent,
} from './core';

// Store
export { JsonlStore, getDefaultStore, initializeDefaultStore } from './store';
export type { JsonlStoreConfig } from './store';

// Orchestrator (Class Façade)
export {
    DurableStream,
    getDurableStream,
    initializeDurableStream,
    shutdownDurableStream,
} from './orchestrator';
export type { DurableStreamConfig } from './orchestrator';
