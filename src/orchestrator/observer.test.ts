/**
 * TaskObserver Unit Tests
 *
 * Tests for observation loop, timeout handling, stuck detection, and retry logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { TaskObserver, getTaskObserver, stopTaskObservation } from './observer';
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

describe('TaskObserver', () => {
  let registry: TaskRegistry;
  let mockClient: ReturnType<typeof createMockClient>;
  let observer: TaskObserver;

  beforeEach(() => {
    resetTaskRegistry();
    registry = new TaskRegistry({ syncToLedger: false });
    mockClient = createMockClient();
    observer = new TaskObserver(registry, mockClient as any, {
      baseIntervalMs: 100,
      maxIntervalMs: 200,
      stuckThresholdMs: 50,
      verbose: false,
    });
  });

  afterEach(() => {
    observer.stop();
    stopTaskObservation();
    resetTaskRegistry();
    vi.clearAllMocks();
  });

  describe('start/stop', () => {
    it('should start and stop observation', () => {
      observer.start();
      expect(observer.getStats().checksPerformed).toBe(0);

      observer.stop();
      // Should not throw when stopped twice
      observer.stop();
    });
  });

  describe('checkNow', () => {
    it('should perform a observation check', async () => {
      await observer.checkNow();
      expect(observer.getStats().checksPerformed).toBe(1);
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
      await new Promise((r) => setTimeout(r, 100));

      await observer.checkNow();

      // Should have retried
      expect(mockClient.session.create).toHaveBeenCalled();
      expect(observer.getStats().tasksRetried).toBe(1);
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
      await new Promise((r) => setTimeout(r, 100));

      await observer.checkNow();

      const task = registry.getTask(taskId);
      expect(task?.status).toBe('timeout');
      expect(observer.getStats().tasksFailed).toBe(1);
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
      await new Promise((r) => setTimeout(r, 100));

      // Mock session as idle (task completed but we didn't get the result)
      mockClient.session.status.mockResolvedValue({ data: {} });

      await observer.checkNow();

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

      await observer.checkNow();

      expect(mockClient.session.messages).toHaveBeenCalled();

      const task = registry.getTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.result).toContain('Task completed successfully');
    });
  });

  describe('stats', () => {
    it('should track observation statistics', async () => {
      await observer.checkNow();
      await observer.checkNow();

      const stats = observer.getStats();
      expect(stats.checksPerformed).toBe(2);
      expect(stats.lastCheck).toBeDefined();
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    stopTaskObservation();
    resetTaskRegistry();
  });

  afterEach(() => {
    stopTaskObservation();
    resetTaskRegistry();
  });

  it('getTaskObserver should return singleton instance', () => {
    const mockClient = createMockClient();
    const observer1 = getTaskObserver(mockClient as any);
    const observer2 = getTaskObserver(mockClient as any);
    expect(observer1).toBe(observer2);
  });
});
