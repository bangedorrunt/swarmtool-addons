/**
 * TaskRegistry Unit Tests
 *
 * Tests for task registration, status updates, heartbeat, and LEDGER sync.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskRegistry, getTaskRegistry, resetTaskRegistry } from './task-registry';

// Mock the ledger module
vi.mock('./ledger', () => ({
  loadLedger: vi.fn().mockResolvedValue({ meta: {}, epic: null, learnings: [], archive: [] }),
  saveLedger: vi.fn().mockResolvedValue(undefined),
  updateTaskStatus: vi.fn(),
}));

describe('TaskRegistry', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    resetTaskRegistry();
    registry = new TaskRegistry({ syncToLedger: false });
  });

  afterEach(() => {
    resetTaskRegistry();
  });

  describe('register', () => {
    it('should register a new task with pending status', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      expect(taskId).toBeDefined();
      const task = registry.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('pending');
      expect(task?.agentName).toBe('executor');
      expect(task?.retryCount).toBe(0);
    });

    it('should use ledgerTaskId as task ID if provided', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
        ledgerTaskId: 'epic123.1',
      });

      expect(taskId).toBe('epic123.1');
    });
  });

  describe('updateStatus', () => {
    it('should update task status', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId, 'running');
      expect(registry.getTask(taskId)?.status).toBe('running');

      await registry.updateStatus(taskId, 'completed', 'Task result');
      const task = registry.getTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.result).toBe('Task result');
      expect(task?.completedAt).toBeDefined();
    });

    it('should set startedAt when status changes to running', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId, 'running');
      expect(registry.getTask(taskId)?.startedAt).toBeDefined();
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      const beforeHeartbeat = Date.now();
      registry.heartbeat(taskId);
      const task = registry.getTask(taskId);

      expect(task?.lastHeartbeat).toBeDefined();
      expect(task?.lastHeartbeat).toBeGreaterThanOrEqual(beforeHeartbeat);
    });
  });

  describe('getTimedOutTasks', () => {
    it('should return tasks that exceeded timeout', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 100, // Very short timeout
      });

      await registry.updateStatus(taskId, 'running');

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 150));

      const timedOut = registry.getTimedOutTasks();
      expect(timedOut.length).toBe(1);
      expect(timedOut[0].id).toBe(taskId);
    });

    it('should not return non-running tasks', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 100,
      });

      // Task is still pending, not running
      await new Promise((r) => setTimeout(r, 150));

      const timedOut = registry.getTimedOutTasks();
      expect(timedOut.length).toBe(0);
    });
  });

  describe('getStuckTasks', () => {
    it('should return tasks with stale heartbeats', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId, 'running');

      // Use a very short stuck threshold for testing
      const stuck = registry.getStuckTasks(50);

      // Wait for stuck threshold
      await new Promise((r) => setTimeout(r, 100));

      const stuckAfter = registry.getStuckTasks(50);
      expect(stuckAfter.length).toBe(1);
    });

    it('should not return tasks with recent heartbeats', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId, 'running');
      registry.heartbeat(taskId);

      const stuck = registry.getStuckTasks(1000);
      expect(stuck.length).toBe(0);
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      expect(registry.getTask(taskId)?.retryCount).toBe(0);

      const count1 = registry.incrementRetry(taskId);
      expect(count1).toBe(1);
      expect(registry.getTask(taskId)?.retryCount).toBe(1);

      const count2 = registry.incrementRetry(taskId);
      expect(count2).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should return correct summary statistics', async () => {
      await registry.register({
        sessionId: 's1',
        agentName: 'executor',
        prompt: 'Task 1',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      const taskId2 = await registry.register({
        sessionId: 's2',
        agentName: 'executor',
        prompt: 'Task 2',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId2, 'running');

      const summary = registry.getSummary();
      expect(summary.total).toBe(2);
      expect(summary.pending).toBe(1);
      expect(summary.running).toBe(1);
      expect(summary.completed).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed tasks', async () => {
      const taskId = await registry.register({
        sessionId: 'session-123',
        agentName: 'executor',
        prompt: 'Test task',
        maxRetries: 2,
        timeoutMs: 60000,
      });

      await registry.updateStatus(taskId, 'completed', 'Done');

      // Wait a bit so age > 0
      await new Promise((r) => setTimeout(r, 10));

      // Cleanup with very short max age (0 means any age > 0 is cleaned)
      const cleaned = registry.cleanup(0);
      expect(cleaned).toBe(1);
      expect(registry.getTask(taskId)).toBeUndefined();
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    resetTaskRegistry();
  });

  afterEach(() => {
    resetTaskRegistry();
  });

  it('getTaskRegistry should return singleton instance', () => {
    const registry1 = getTaskRegistry();
    const registry2 = getTaskRegistry();
    expect(registry1).toBe(registry2);
  });

  it('resetTaskRegistry should clear the singleton', () => {
    const registry1 = getTaskRegistry();
    resetTaskRegistry();
    const registry2 = getTaskRegistry();
    expect(registry1).not.toBe(registry2);
  });
});
