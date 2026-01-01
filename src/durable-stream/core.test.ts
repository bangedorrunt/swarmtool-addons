/**
 * Durable Stream Core Tests
 *
 * Tests for the pure functional core of the Durable Stream module.
 */

import { describe, it, expect } from 'vitest';
import {
    generateEventId,
    generateCorrelationId,
    createEvent,
    filterByType,
    filterByStream,
    filterByActor,
    filterByTimeRange,
    applyFilter,
    extractPendingCheckpoints,
    isCheckpointExpired,
    serializeEvent,
    deserializeEvent,
} from './core';
import type { StreamEvent, StreamEventInput, Checkpoint } from './types';

describe('core', () => {
    describe('generateEventId', () => {
        it('should generate a unique ID with timestamp prefix', () => {
            const id1 = generateEventId();
            const id2 = generateEventId();

            expect(id1).toBeTruthy();
            expect(id2).toBeTruthy();
            expect(id1).not.toBe(id2);
            expect(id1).toContain('_');
        });
    });

    describe('generateCorrelationId', () => {
        it('should generate a hex string', () => {
            const id = generateCorrelationId();
            expect(id).toMatch(/^[0-9a-f]{16}$/);
        });
    });

    describe('createEvent', () => {
        it('should add id and timestamp to input', () => {
            const input: StreamEventInput = {
                type: 'lifecycle.session.created',
                stream_id: 'session-123',
                correlation_id: 'corr-456',
                actor: 'system',
                payload: { foo: 'bar' },
            };

            const event = createEvent(input);

            expect(event.id).toBeTruthy();
            expect(event.timestamp).toBeGreaterThan(0);
            expect(event.type).toBe('lifecycle.session.created');
            expect(event.stream_id).toBe('session-123');
            expect(event.payload).toEqual({ foo: 'bar' });
        });

        it('should preserve provided timestamp', () => {
            const input: StreamEventInput = {
                type: 'lifecycle.session.idle',
                stream_id: 'session-123',
                correlation_id: 'corr-456',
                actor: 'system',
                payload: {},
                timestamp: 1234567890,
            };

            const event = createEvent(input);
            expect(event.timestamp).toBe(1234567890);
        });
    });

    describe('filterByType', () => {
        const events: StreamEvent[] = [
            { id: '1', type: 'lifecycle.session.created', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 1, payload: {} },
            { id: '2', type: 'agent.spawned', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 2, payload: {} },
            { id: '3', type: 'lifecycle.session.created', stream_id: 's2', correlation_id: 'c1', actor: 'a', timestamp: 3, payload: {} },
        ];

        it('should filter by single type', () => {
            const result = filterByType(events, 'agent.spawned');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should filter by multiple types', () => {
            const result = filterByType(events, ['lifecycle.session.created', 'agent.spawned']);
            expect(result).toHaveLength(3);
        });
    });

    describe('filterByStream', () => {
        const events: StreamEvent[] = [
            { id: '1', type: 'lifecycle.session.created', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 1, payload: {} },
            { id: '2', type: 'agent.spawned', stream_id: 's2', correlation_id: 'c1', actor: 'a', timestamp: 2, payload: {} },
        ];

        it('should filter by stream_id', () => {
            const result = filterByStream(events, 's1');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });
    });

    describe('filterByActor', () => {
        const events: StreamEvent[] = [
            { id: '1', type: 'lifecycle.session.created', stream_id: 's1', correlation_id: 'c1', actor: 'system', timestamp: 1, payload: {} },
            { id: '2', type: 'agent.spawned', stream_id: 's1', correlation_id: 'c1', actor: 'chief-of-staff/oracle', timestamp: 2, payload: {} },
        ];

        it('should filter by actor', () => {
            const result = filterByActor(events, 'chief-of-staff/oracle');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });
    });

    describe('filterByTimeRange', () => {
        const events: StreamEvent[] = [
            { id: '1', type: 'lifecycle.session.created', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 100, payload: {} },
            { id: '2', type: 'agent.spawned', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 200, payload: {} },
            { id: '3', type: 'agent.completed', stream_id: 's1', correlation_id: 'c1', actor: 'a', timestamp: 300, payload: {} },
        ];

        it('should filter by since', () => {
            const result = filterByTimeRange(events, 150);
            expect(result).toHaveLength(2);
        });

        it('should filter by until', () => {
            const result = filterByTimeRange(events, undefined, 250);
            expect(result).toHaveLength(2);
        });

        it('should filter by range', () => {
            const result = filterByTimeRange(events, 150, 250);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });
    });

    describe('applyFilter', () => {
        const events: StreamEvent[] = [
            { id: '1', type: 'lifecycle.session.created', stream_id: 's1', correlation_id: 'c1', actor: 'system', timestamp: 100, payload: {} },
            { id: '2', type: 'agent.spawned', stream_id: 's1', correlation_id: 'c1', actor: 'oracle', timestamp: 200, payload: {} },
            { id: '3', type: 'agent.completed', stream_id: 's2', correlation_id: 'c1', actor: 'oracle', timestamp: 300, payload: {} },
        ];

        it('should apply multiple filters', () => {
            const result = applyFilter(events, {
                stream_id: 's1',
                actor: 'oracle',
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should apply limit', () => {
            const result = applyFilter(events, { limit: 2 });
            expect(result).toHaveLength(2);
        });
    });

    describe('extractPendingCheckpoints', () => {
        it('should extract pending checkpoints', () => {
            const checkpoint: Checkpoint = {
                id: 'cp-1',
                decision_point: 'Deploy to prod?',
                options: [{ id: 'yes', label: 'Yes' }],
                requested_by: 'oracle',
                requested_at: Date.now(),
            };

            const events: StreamEvent[] = [
                { id: '1', type: 'checkpoint.requested', stream_id: 's1', correlation_id: 'c1', actor: 'oracle', timestamp: 100, payload: checkpoint },
            ];

            const result = extractPendingCheckpoints(events);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('cp-1');
        });

        it('should remove approved checkpoints', () => {
            const checkpoint: Checkpoint = {
                id: 'cp-1',
                decision_point: 'Deploy to prod?',
                options: [],
                requested_by: 'oracle',
                requested_at: Date.now(),
            };

            const events: StreamEvent[] = [
                { id: '1', type: 'checkpoint.requested', stream_id: 's1', correlation_id: 'c1', actor: 'oracle', timestamp: 100, payload: checkpoint },
                { id: '2', type: 'checkpoint.approved', stream_id: 's1', correlation_id: 'c1', actor: 'user', timestamp: 200, payload: { checkpoint_id: 'cp-1' } },
            ];

            const result = extractPendingCheckpoints(events);
            expect(result).toHaveLength(0);
        });
    });

    describe('isCheckpointExpired', () => {
        it('should return true for expired checkpoint', () => {
            const checkpoint: Checkpoint = {
                id: 'cp-1',
                decision_point: 'test',
                options: [],
                requested_by: 'oracle',
                requested_at: Date.now() - 10000,
                expires_at: Date.now() - 1000,
            };

            expect(isCheckpointExpired(checkpoint)).toBe(true);
        });

        it('should return false for non-expired checkpoint', () => {
            const checkpoint: Checkpoint = {
                id: 'cp-1',
                decision_point: 'test',
                options: [],
                requested_by: 'oracle',
                requested_at: Date.now(),
                expires_at: Date.now() + 10000,
            };

            expect(isCheckpointExpired(checkpoint)).toBe(false);
        });

        it('should return false if no expiry set', () => {
            const checkpoint: Checkpoint = {
                id: 'cp-1',
                decision_point: 'test',
                options: [],
                requested_by: 'oracle',
                requested_at: Date.now(),
            };

            expect(isCheckpointExpired(checkpoint)).toBe(false);
        });
    });

    describe('serialization', () => {
        it('should serialize and deserialize events', () => {
            const event: StreamEvent = {
                id: 'test-123',
                type: 'lifecycle.session.created',
                stream_id: 's1',
                correlation_id: 'c1',
                actor: 'system',
                timestamp: 1234567890,
                payload: { key: 'value' },
            };

            const serialized = serializeEvent(event);
            const deserialized = deserializeEvent(serialized);

            expect(deserialized).toEqual(event);
        });

        it('should return null for invalid JSON', () => {
            const result = deserializeEvent('not valid json');
            expect(result).toBeNull();
        });
    });
});
