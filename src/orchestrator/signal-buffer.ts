/**
 * Signal Buffer - Event-Driven Upward Instruction Queue
 *
 * This module implements the "Parent Busy" resolution strategy from ADR 009.
 * It manages a persistent queue of "Upward Signals" (requests from subagents)
 * and flushes them to the Parent Agent when the session becomes IDLE.
 */

import type { Ledger } from './ledger';
import { loadLedger, saveLedger } from './ledger';

export interface UpwardSignal {
    id: string;
    sourceAgent: string;
    targetSessionId: string;
    payload: {
        type: 'ASK_USER' | 'SPAWN_HELPER' | 'LOG_METRIC';
        data: any;
        reason: string;
    };
    createdAt: number;
}

export class SignalBuffer {
    private static instance: SignalBuffer;
    private buffer: Map<string, UpwardSignal[]> = new Map(); // targetSessionId -> Signals[]

    private constructor() { }

    public static getInstance(): SignalBuffer {
        if (!SignalBuffer.instance) {
            SignalBuffer.instance = new SignalBuffer();
        }
        return SignalBuffer.instance;
    }

    /**
     * Enqueue a signal for a busy parent
     */
    public async enqueue(signal: UpwardSignal): Promise<void> {
        const queue = this.buffer.get(signal.targetSessionId) || [];
        queue.push(signal);
        this.buffer.set(signal.targetSessionId, queue);

        // In a production implementation, we would persist this to a file or DB here.
        // For now, we rely on in-memoryMap + Ledger 'suspended' state as the source of truth if we crash.
        // (The agent will simply re-yield if it wakes up and sees no result).
        console.log(`[SignalBuffer] Enqueued signal from ${signal.sourceAgent} for ${signal.targetSessionId}`);
    }

    /**
     * Check if a session has pending signals
     */
    public hasSignals(sessionId: string): boolean {
        const queue = this.buffer.get(sessionId);
        return !!queue && queue.length > 0;
    }

    /**
     * Flush all signals for a specific session (FIFO)
     */
    public flush(sessionId: string): UpwardSignal[] {
        const queue = this.buffer.get(sessionId) || [];
        this.buffer.delete(sessionId);
        if (queue.length > 0) {
            console.log(`[SignalBuffer] Flushed ${queue.length} signals for ${sessionId}`);
        }
        return queue;
    }

    /**
     * Clear buffer (useful for testing)
     */
    public clear(): void {
        this.buffer.clear();
    }
}
