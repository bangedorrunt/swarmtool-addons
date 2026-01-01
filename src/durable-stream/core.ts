/**
 * Durable Stream Core - Pure Functions
 *
 * This module contains stateless, pure functions for event manipulation.
 * These are the building blocks used by the DurableStream class façade.
 * All functions are side-effect free and easy to unit test.
 */

import { randomBytes } from 'crypto';
import type { StreamEvent, StreamEventInput, EventType, StreamFilter, Checkpoint, Intent } from './types';

// ============================================================================
// Event Creation
// ============================================================================

/**
 * Generate a ULID-like ID (timestamp prefix + random suffix).
 * Ensures sortability by creation time.
 */
export function generateEventId(): string {
    const timestamp = Date.now().toString(36).padStart(9, '0');
    const random = randomBytes(8).toString('hex');
    return `${timestamp}_${random}`;
}

/**
 * Generate a correlation ID for a workflow run.
 */
export function generateCorrelationId(): string {
    return randomBytes(8).toString('hex');
}

/**
 * Create a full StreamEvent from input (adds id and timestamp).
 */
export function createEvent<T>(input: StreamEventInput<T>): StreamEvent<T> {
    return {
        ...input,
        id: generateEventId(),
        timestamp: input.timestamp ?? Date.now(),
    };
}

// ============================================================================
// Event Filtering (Pure)
// ============================================================================

/**
 * Filter events by type.
 */
export function filterByType(events: StreamEvent[], types: EventType | EventType[]): StreamEvent[] {
    const typeSet = new Set(Array.isArray(types) ? types : [types]);
    return events.filter((e) => typeSet.has(e.type));
}

/**
 * Filter events by stream ID.
 */
export function filterByStream(events: StreamEvent[], streamId: string): StreamEvent[] {
    return events.filter((e) => e.stream_id === streamId);
}

/**
 * Filter events by actor.
 */
export function filterByActor(events: StreamEvent[], actor: string): StreamEvent[] {
    return events.filter((e) => e.actor === actor);
}

/**
 * Filter events by time range.
 */
export function filterByTimeRange(events: StreamEvent[], since?: number, until?: number): StreamEvent[] {
    return events.filter((e) => {
        if (since !== undefined && e.timestamp < since) return false;
        if (until !== undefined && e.timestamp > until) return false;
        return true;
    });
}

/**
 * Apply a StreamFilter to an array of events.
 */
export function applyFilter(events: StreamEvent[], filter: StreamFilter): StreamEvent[] {
    let result = events;

    if (filter.stream_id) {
        result = filterByStream(result, filter.stream_id);
    }
    if (filter.type) {
        result = filterByType(result, filter.type);
    }
    if (filter.actor) {
        result = filterByActor(result, filter.actor);
    }
    if (filter.since !== undefined || filter.until !== undefined) {
        result = filterByTimeRange(result, filter.since, filter.until);
    }
    if (filter.limit !== undefined) {
        result = result.slice(0, filter.limit);
    }

    return result;
}

// ============================================================================
// Checkpoint Logic (Pure)
// ============================================================================

/**
 * Extract pending checkpoints from events.
 */
export function extractPendingCheckpoints(events: StreamEvent[]): Checkpoint[] {
    const checkpointMap = new Map<string, Checkpoint>();

    for (const event of events) {
        if (event.type === 'checkpoint.requested') {
            const payload = event.payload as Checkpoint;
            checkpointMap.set(payload.id, payload);
        } else if (event.type === 'checkpoint.approved' || event.type === 'checkpoint.rejected') {
            const payload = event.payload as { checkpoint_id: string };
            checkpointMap.delete(payload.checkpoint_id);
        }
    }

    return Array.from(checkpointMap.values());
}

/**
 * Check if a checkpoint is expired.
 */
export function isCheckpointExpired(checkpoint: Checkpoint, now: number = Date.now()): boolean {
    return checkpoint.expires_at !== undefined && checkpoint.expires_at < now;
}

// ============================================================================
// Intent Logic (Pure)
// ============================================================================

/**
 * Extract active intents from events.
 */
export function extractActiveIntents(events: StreamEvent[]): Intent[] {
    const intentMap = new Map<string, Intent>();

    for (const event of events) {
        if (event.type === 'agent.spawned') {
            const payload = event.payload as Intent;
            if (payload.id) {
                intentMap.set(payload.id, { ...payload, status: 'running' });
            }
        } else if (event.type === 'agent.completed' || event.type === 'agent.failed' || event.type === 'agent.aborted') {
            const payload = event.payload as { intent_id?: string };
            if (payload.intent_id) {
                intentMap.delete(payload.intent_id);
            }
        }
    }

    return Array.from(intentMap.values()).filter((i) => i.status === 'pending' || i.status === 'running');
}

// ============================================================================
// Lineage / Tracing (Pure)
// ============================================================================

/**
 * Build a lineage tree from events (parent -> children).
 */
export function buildLineageTree(events: StreamEvent[]): Map<string, string[]> {
    const tree = new Map<string, string[]>();

    for (const event of events) {
        if (event.causation_id) {
            const children = tree.get(event.causation_id) || [];
            children.push(event.id);
            tree.set(event.causation_id, children);
        }
    }

    return tree;
}

/**
 * Get all descendant event IDs for a given event.
 */
export function getDescendants(lineageTree: Map<string, string[]>, eventId: string): string[] {
    const descendants: string[] = [];
    const queue = [eventId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const children = lineageTree.get(current) || [];
        descendants.push(...children);
        queue.push(...children);
    }

    return descendants;
}

// ============================================================================
// Serialization (Pure)
// ============================================================================

/**
 * Serialize an event to a JSON line (for JSONL storage).
 */
export function serializeEvent(event: StreamEvent): string {
    return JSON.stringify(event);
}

/**
 * Deserialize a JSON line to an event.
 */
export function deserializeEvent(line: string): StreamEvent | null {
    try {
        return JSON.parse(line) as StreamEvent;
    } catch {
        return null;
    }
}
