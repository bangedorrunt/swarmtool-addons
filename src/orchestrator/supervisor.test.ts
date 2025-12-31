/**
 * TaskSupervisor Unit Tests
 * 
 * Tests for supervision loop, timeout handling, stuck detection, and retry logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { TaskSupervisor, getTaskSupervisor, stopTaskSupervision } from './supervisor';
import { TaskRegistry, resetTaskRegistry } from './task-registry';

// Mock the ledger module
vi.mock('./ledger', () => ({
    loadLedger: vi.fn().mockResolvedValue({ meta: {}, epic: null, learnings: [], archive: [] }),
    saveLedger: vi.fn().mockResolvedValue(undefined),
    updateTaskStatus: vi.fn(),
    addLearning: vi.fn(),
}));

// Mock OpenCode client
const createMockClient = () => ({
    session: {
        create: vi.fn().mockResolvedValue({ data: { id: 'new-session-123' } }),
        prompt: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({ data: {} }),
        messages: vi.fn().mockResolvedValue({
            data: [
                {
                    info: { role: 'assistant', time: { created: Date.now() } },
                    parts: [{ type: 'text', text: 'Task completed successfully' }],
                },
            ],
        }),
    },
});

describe('TaskSupervisor', () => {
    let registry: TaskRegistry;
    let mockClient: ReturnType<typeof createMockClient>;
    let supervisor: TaskSupervisor;

    beforeEach(() => {
        resetTaskRegistry();
        registry = new TaskRegistry({ syncToLedger: false });
        mockClient = createMockClient();
        supervisor = new TaskSupervisor(registry, mockClient as any, {
            baseIntervalMs: 100,
            maxIntervalMs: 200,
            stuckThresholdMs: 50,
            verbose: false,
        });
    });

    afterEach(() => {
        supervisor.stop();
        stopTaskSupervision();
        resetTaskRegistry();
        vi.clearAllMocks();
    });

    describe('start/stop', () => {
        it('should start and stop supervision', () => {
            supervisor.start();
            expect(supervisor.getStats().checksPerformed).toBe(0);

            supervisor.stop();
            // Should not throw when stopped twice
            supervisor.stop();
        });
    });

    describe('checkNow', () => {
        it('should perform a supervision check', async () => {
            await supervisor.checkNow();
            expect(supervisor.getStats().checksPerformed).toBe(1);
        });
    });

    describe('timeout handling', () => {
        it('should detect and retry timed-out tasks', async () => {
            const taskId = await registry.register({
                sessionId: 'session-123',
                agentName: 'executor',
                prompt: 'Test task',
                maxRetries: 2,
                timeoutMs: 50, // Very short timeout
            });

            await registry.updateStatus(taskId, 'running');

            // Wait for timeout
            await new Promise(r => setTimeout(r, 100));

            await supervisor.checkNow();

            // Should have retried
            expect(mockClient.session.create).toHaveBeenCalled();
            expect(supervisor.getStats().tasksRetried).toBe(1);
        });

        it('should mark as failed after max retries', async () => {
            const taskId = await registry.register({
                sessionId: 'session-123',
                agentName: 'executor',
                prompt: 'Test task',
                maxRetries: 0, // No retries
                timeoutMs: 50,
            });

            await registry.updateStatus(taskId, 'running');
            await new Promise(r => setTimeout(r, 100));

            await supervisor.checkNow();

            const task = registry.getTask(taskId);
            expect(task?.status).toBe('timeout');
            expect(supervisor.getStats().tasksFailed).toBe(1);
        });
    });

    describe('stuck task handling', () => {
        it('should detect stuck tasks with stale heartbeats', async () => {
            const taskId = await registry.register({
                sessionId: 'session-123',
                agentName: 'executor',
                prompt: 'Test task',
                maxRetries: 2,
                timeoutMs: 60000, // Long timeout
            });

            await registry.updateStatus(taskId, 'running');

            // Wait for stuck threshold
            await new Promise(r => setTimeout(r, 100));

            // Mock session as idle (task completed but we didn't get the result)
            mockClient.session.status.mockResolvedValue({ data: {} });

            await supervisor.checkNow();

            // Should have tried to fetch result
            expect(mockClient.session.messages).toHaveBeenCalled();
        });
    });

    describe('completion detection', () => {
        it('should fetch result when session is idle', async () => {
            const taskId = await registry.register({
                sessionId: 'session-123',
                agentName: 'executor',
                prompt: 'Test task',
                maxRetries: 2,
                timeoutMs: 60000,
            });

            await registry.updateStatus(taskId, 'running');
            registry.heartbeat(taskId); // Recent heartbeat

            // Mock session as idle
            mockClient.session.status.mockResolvedValue({ data: {} });

            await supervisor.checkNow();

            expect(mockClient.session.messages).toHaveBeenCalled();

            const task = registry.getTask(taskId);
            expect(task?.status).toBe('completed');
            expect(task?.result).toContain('Task completed successfully');
        });
    });

    describe('stats', () => {
        it('should track supervision statistics', async () => {
            await supervisor.checkNow();
            await supervisor.checkNow();

            const stats = supervisor.getStats();
            expect(stats.checksPerformed).toBe(2);
            expect(stats.lastCheck).toBeDefined();
        });
    });
});

describe('Singleton Functions', () => {
    beforeEach(() => {
        stopTaskSupervision();
        resetTaskRegistry();
    });

    afterEach(() => {
        stopTaskSupervision();
        resetTaskRegistry();
    });

    it('getTaskSupervisor should return singleton instance', () => {
        const mockClient = createMockClient();
        const supervisor1 = getTaskSupervisor(mockClient as any);
        const supervisor2 = getTaskSupervisor(mockClient as any);
        expect(supervisor1).toBe(supervisor2);
    });
});
