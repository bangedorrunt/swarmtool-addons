import { describe, it, expect, beforeEach } from 'vitest';
import { SignalBuffer, type UpwardSignal } from './signal-buffer';

describe('SignalBuffer', () => {
    let buffer: SignalBuffer;

    // We access the private static instance by casting or just calling getInstance()
    // Since it's a singleton, we need to clear it before each test
    beforeEach(() => {
        buffer = SignalBuffer.getInstance();
        buffer.clear();
    });

    it('should enqueue and check signals', async () => {
        const signal: UpwardSignal = {
            id: 'sig-1',
            sourceAgent: 'child-1',
            targetSessionId: 'parent-1',
            createdAt: Date.now(),
            payload: { type: 'ASK_USER', reason: 'Clarify', data: {} }
        };

        expect(buffer.hasSignals('parent-1')).toBe(false);
        await buffer.enqueue(signal);
        expect(buffer.hasSignals('parent-1')).toBe(true);
    });

    it('should flush signals in FIFO order', async () => {
        const sessionId = 'parent-2';

        await buffer.enqueue({
            id: '1', sourceAgent: 'a', targetSessionId: sessionId, createdAt: 100,
            payload: { type: 'ASK_USER', reason: 'first', data: {} }
        });

        await buffer.enqueue({
            id: '2', sourceAgent: 'a', targetSessionId: sessionId, createdAt: 200,
            payload: { type: 'ASK_USER', reason: 'second', data: {} }
        });

        const flushed = buffer.flush(sessionId);
        expect(flushed.length).toBe(2);
        expect(flushed[0].payload.reason).toBe('first');
        expect(flushed[1].payload.reason).toBe('second');

        expect(buffer.hasSignals(sessionId)).toBe(false);
    });

    it('should handle multiple sessions independently', async () => {
        await buffer.enqueue({
            id: '1', sourceAgent: 'a', targetSessionId: 's1', createdAt: 1,
            payload: { type: 'ASK_USER', reason: 's1-msg', data: {} }
        });

        await buffer.enqueue({
            id: '2', sourceAgent: 'b', targetSessionId: 's2', createdAt: 1,
            payload: { type: 'ASK_USER', reason: 's2-msg', data: {} }
        });

        expect(buffer.hasSignals('s1')).toBe(true);
        expect(buffer.hasSignals('s2')).toBe(true);

        const s1Signals = buffer.flush('s1');
        expect(s1Signals.length).toBe(1);
        expect(buffer.hasSignals('s1')).toBe(false);
        expect(buffer.hasSignals('s2')).toBe(true);
    });
});
