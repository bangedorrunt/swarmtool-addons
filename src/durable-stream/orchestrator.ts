/**
 * Durable Stream Orchestrator - Class Façade
 *
 * This is the developer-facing API. It wraps the functional core
 * and storage layer, providing a clean interface for:
 * - Event observation (bridging SDK hooks)
 * - Intent management (workflow registration)
 * - Checkpoint handling (HITL)
 * - State recovery (resume after crash)
 */

import type { OpencodeClient } from '@opencode-ai/sdk';
import type { Hooks } from '@opencode-ai/plugin';
import { EventEmitter } from 'events';
import type {
    IStreamStore,
    StreamEvent,
    StreamEventInput,
    StreamFilter,
    EventType,
    Checkpoint,
    CheckpointOption,
    Intent,
    IntentSpec,
    ResumeResult,
} from './types';
import {
    createEvent,
    generateCorrelationId,
    extractPendingCheckpoints,
    extractActiveIntents,
} from './core';
import { JsonlStore, getDefaultStore } from './store';

export interface DurableStreamConfig {
    /** Custom store implementation (default: JsonlStore) */
    store?: IStreamStore;
    /** Path to JSONL file (if using default store) */
    storePath?: string;
    /** Default checkpoint timeout in ms (default: 5 minutes) */
    checkpointTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<Omit<DurableStreamConfig, 'store'>> = {
    storePath: '.opencode/durable_stream.jsonl',
    checkpointTimeoutMs: 5 * 60 * 1000,
};

export class DurableStream extends EventEmitter {
    private store: IStreamStore;
    private config: Required<Omit<DurableStreamConfig, 'store'>>;
    private correlationId: string;
    private initialized = false;
    private eventHistory: StreamEvent[] = []; // In-memory cache for fast lookups

    // In-memory projections (derived from events)
    private pendingCheckpoints: Map<string, Checkpoint> = new Map();
    private activeIntents: Map<string, Intent> = new Map();

    constructor(config?: DurableStreamConfig) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.store = config?.store ?? getDefaultStore({ path: this.config.storePath });
        this.correlationId = generateCorrelationId();
    }

    // ==========================================================================
    // Lifecycle
    // ==========================================================================

    /**
     * Initialize the Durable Stream.
     * Must be called before any other operations.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        if (this.store instanceof JsonlStore) {
            await this.store.initialize();
        }

        this.initialized = true;
    }

    /**
     * Resume state from disk after a crash/restart.
     */
    async resume(): Promise<ResumeResult> {
        await this.initialize();

        const events = await this.store.query({});
        this.eventHistory = events; // Hydrate cache

        const pendingCheckpoints = extractPendingCheckpoints(events);
        const activeIntents = extractActiveIntents(events);

        // Populate projections
        for (const cp of pendingCheckpoints) {
            this.pendingCheckpoints.set(cp.id, cp);
        }
        for (const intent of activeIntents) {
            this.activeIntents.set(intent.id, intent);
        }

        return {
            events_replayed: events.length,
            pending_checkpoints: pendingCheckpoints,
            active_intents: activeIntents,
            last_event_at: events.length > 0 ? events[events.length - 1].timestamp : undefined,
        };
    }

    /**
     * Shutdown the Durable Stream.
     */
    async shutdown(): Promise<void> {
        await this.store.close();
        this.initialized = false;
    }

    // ==========================================================================
    // Event Appending
    // ==========================================================================

    /**
     * Append a new event to the stream.
     */
    async append<T>(input: StreamEventInput<T>): Promise<StreamEvent<T>> {
        await this.initialize();

        const event = createEvent(input);
        await this.store.append(event as StreamEvent);

        // Update projections based on event type
        this.updateProjections(event as StreamEvent);

        return event;
    }

    /**
     * Subscribe to specific event types (Legacy Compatibility)
     */
    subscribe(type: string, handler: (event: StreamEvent) => void): () => void {
        this.on(type, handler);
        return () => this.off(type, handler);
    }

    /**
     * Get entire event history (Legacy Compatibility)
     */
    getEventHistory(): StreamEvent[] {
        return this.eventHistory;
    }

    /**
     * Update in-memory projections based on event type.
     */
    private updateProjections(event: StreamEvent): void {
        this.eventHistory.push(event); // Add to cache

        // Emit for real-time subscribers
        this.emit(event.type, event);
        this.emit('*', event);

        if (event.type === 'checkpoint.requested') {
            const checkpoint = event.payload as Checkpoint;
            this.pendingCheckpoints.set(checkpoint.id, checkpoint);
        } else if (event.type === 'checkpoint.approved' || event.type === 'checkpoint.rejected') {
            const payload = event.payload as { checkpoint_id: string };
            this.pendingCheckpoints.delete(payload.checkpoint_id);
        } else if (event.type === 'agent.spawned') {
            const intent = event.payload as Intent;
            if (intent.id) {
                this.activeIntents.set(intent.id, intent);
            }
        } else if (event.type === 'agent.completed' || event.type === 'agent.failed' || event.type === 'agent.aborted') {
            const payload = event.payload as { intent_id?: string };
            if (payload.intent_id) {
                this.activeIntents.delete(payload.intent_id);
            }
        }
    }

    // ==========================================================================
    // SDK Bridge
    // ==========================================================================

    /**
     * Create hook handlers that bridge SDK events to the Durable Stream.
     * Returns a partial Hooks object to spread into the plugin return.
     */
    createBridgeHooks(): Partial<Hooks> {
        return {
            event: async ({ event }) => {
                await this.handleSdkEvent(event);
            },
        };
    }

    /**
     * Handle an SDK event and project it onto the stream.
     */
    private async handleSdkEvent(event: { type: string; properties?: unknown }): Promise<void> {
        const props = event.properties as Record<string, unknown> | undefined;

        // Map SDK events to our event types
        switch (event.type) {
            case 'session.created': {
                const info = props?.info as Record<string, unknown> | undefined;
                if (info?.id) {
                    await this.append({
                        type: 'lifecycle.session.created',
                        stream_id: info.id as string,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: info,
                    });
                }
                break;
            }

            case 'session.idle': {
                const sessionID = props?.sessionID as string | undefined;
                if (sessionID) {
                    await this.append({
                        type: 'lifecycle.session.idle',
                        stream_id: sessionID,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: {},
                    });
                }
                break;
            }

            case 'session.error': {
                const sessionID = props?.sessionID as string | undefined;
                const error = props?.error;
                if (sessionID) {
                    await this.append({
                        type: 'lifecycle.session.error',
                        stream_id: sessionID,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: { error },
                    });
                }
                break;
            }

            case 'message.part.updated': {
                const part = props?.part as Record<string, unknown> | undefined;
                if (part?.type === 'step-start') {
                    await this.append({
                        type: 'execution.step_start',
                        stream_id: part.sessionID as string,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: part,
                    });
                } else if (part?.type === 'step-finish') {
                    await this.append({
                        type: 'execution.step_finish',
                        stream_id: part.sessionID as string,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: part,
                    });
                } else if (part?.type === 'tool') {
                    const state = (part.state as Record<string, unknown>)?.status;
                    const eventType: EventType = state === 'completed' ? 'execution.tool_finish' : 'execution.tool_start';
                    await this.append({
                        type: eventType,
                        stream_id: part.sessionID as string,
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: part,
                    });
                }
                break;
            }

            case 'file.edited': {
                const file = props?.file as string | undefined;
                if (file) {
                    await this.append({
                        type: 'files.changed',
                        stream_id: this.correlationId, // No session context
                        correlation_id: this.correlationId,
                        actor: 'system',
                        payload: { file },
                    });
                }
                break;
            }
        }
    }

    // ==========================================================================
    // Intent Management
    // ==========================================================================

    /**
     * Register a new intent (workflow registration).
     * Returns the intent ID.
     */
    async createIntent(spec: IntentSpec): Promise<string> {
        const intent: Intent = {
            ...spec,
            id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            status: 'pending',
            created_at: Date.now(),
        };

        await this.append({
            type: 'agent.spawned',
            stream_id: spec.parent_session_id ?? this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: intent,
        });

        return intent.id;
    }

    /**
     * Mark an intent as completed.
     */
    async completeIntent(intentId: string, result: string): Promise<void> {
        await this.append({
            type: 'agent.completed',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: { intent_id: intentId, result },
        });
    }

    /**
     * Mark an intent as failed.
     */
    async failIntent(intentId: string, error: string): Promise<void> {
        await this.append({
            type: 'agent.failed',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: { intent_id: intentId, error },
        });
    }

    // ==========================================================================
    // Checkpoint (HITL)
    // ==========================================================================

    /**
     * Request a checkpoint (human approval).
     */
    async requestCheckpoint(
        streamId: string,
        decisionPoint: string,
        options: CheckpointOption[],
        requestedBy: string
    ): Promise<string> {
        const checkpoint: Checkpoint = {
            id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            decision_point: decisionPoint,
            options,
            requested_by: requestedBy,
            requested_at: Date.now(),
            expires_at: Date.now() + this.config.checkpointTimeoutMs,
        };

        await this.append({
            type: 'checkpoint.requested',
            stream_id: streamId,
            correlation_id: this.correlationId,
            actor: requestedBy,
            payload: checkpoint,
        });

        return checkpoint.id;
    }

    /**
     * Approve a checkpoint.
     */
    async approveCheckpoint(checkpointId: string, approvedBy: string, selectedOption?: string): Promise<boolean> {
        const checkpoint = this.pendingCheckpoints.get(checkpointId);
        if (!checkpoint) return false;

        await this.append({
            type: 'checkpoint.approved',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: approvedBy,
            payload: {
                checkpoint_id: checkpointId,
                approved_by: approvedBy,
                selected_option: selectedOption,
            },
        });

        return true;
    }

    /**
     * Reject a checkpoint.
     */
    async rejectCheckpoint(checkpointId: string, rejectedBy: string, reason?: string): Promise<boolean> {
        const checkpoint = this.pendingCheckpoints.get(checkpointId);
        if (!checkpoint) return false;

        await this.append({
            type: 'checkpoint.rejected',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: rejectedBy,
            payload: {
                checkpoint_id: checkpointId,
                rejected_by: rejectedBy,
                reason,
            },
        });

        return true;
    }

    /**
     * Get all pending checkpoints.
     */
    getPendingCheckpoints(): Checkpoint[] {
        return Array.from(this.pendingCheckpoints.values());
    }

    // ==========================================================================
    // Query
    // ==========================================================================

    /**
     * Query events.
     */
    async query(filter: StreamFilter): Promise<StreamEvent[]> {
        await this.initialize();
        return this.store.query(filter);
    }

    /**
     * Get events for a specific stream.
     */
    async getStreamEvents(streamId: string): Promise<StreamEvent[]> {
        await this.initialize();
        return this.store.readStream(streamId);
    }

    // ==========================================================================
    // Accessors
    // ==========================================================================

    getCorrelationId(): string {
        return this.correlationId;
    }

    getActiveIntents(): Intent[] {
        return Array.from(this.activeIntents.values());
    }

    // ==========================================================================
    // Legacy Helpers (Migration Support)
    // ==========================================================================

    async spawnAgent(
        sessionId: string,
        parentSessionId: string | undefined,
        agent: string,
        prompt: string
    ): Promise<StreamEvent> {
        return this.append({
            type: 'agent.spawned',
            stream_id: parentSessionId || this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: {
                id: sessionId, // Use specific session ID for intent ID if provided
                agent,
                prompt,
                parent_session_id: parentSessionId,
                status: 'running',
                created_at: Date.now(),
            },
            // Legacy metadata
            sessionId: sessionId,
            agent: agent,
        } as any);
    }

    async completeAgent(sessionId: string, agent: string, result: string, duration?: number): Promise<void> {
        await this.append({
            type: 'agent.completed',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: { intent_id: sessionId, result, duration },
            // Legacy metadata
            sessionId,
            agent,
        } as any);
    }

    async failAgent(sessionId: string, agent: string, error: string): Promise<void> {
        await this.append({
            type: 'agent.failed',
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: { intent_id: sessionId, error },
            // Legacy metadata
            sessionId,
            agent,
        } as any);
    }

    async progressTask(taskId: string, message: string, status: string): Promise<void> {
        await this.append({
            type: 'execution.step_finish', // Map to step_finish or custom type?
            stream_id: this.correlationId,
            correlation_id: this.correlationId,
            actor: 'orchestrator',
            payload: { taskId, message, status },
        } as any);
    }

    getContextSnapshot(sessionId: string): any {
        // Reconstruct basic snapshot from in-memory history
        // This is a simplified version of what the old DurableStream did
        return {
            agentName: 'unknown',
            ledgerState: { phase: 'unknown', completedTasks: [] },
            memories: [],
        };
    }
}

// ============================================================================
// Singleton
// ============================================================================

let globalInstance: DurableStream | null = null;

/**
 * Get the global DurableStream instance.
 */
export function getDurableStream(config?: DurableStreamConfig): DurableStream {
    if (!globalInstance) {
        globalInstance = new DurableStream(config);
    }
    return globalInstance;
}

/**
 * Initialize and return the global DurableStream instance.
 */
export async function initializeDurableStream(config?: DurableStreamConfig): Promise<DurableStream> {
    const instance = getDurableStream(config);
    await instance.initialize();
    return instance;
}

/**
 * Shutdown the global instance.
 */
export async function shutdownDurableStream(): Promise<void> {
    if (globalInstance) {
        await globalInstance.shutdown();
        globalInstance = null;
    }
}
