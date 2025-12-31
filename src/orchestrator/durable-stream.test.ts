import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import {
  DurableStreamOrchestrator,
  StreamEventType,
  HumanCheckpoint,
  CheckpointOption,
} from './durable-stream';
import { mkdtempSync, rmdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DurableStreamOrchestrator', () => {
  let orchestrator: DurableStreamOrchestrator;
  let testDir: string;
  let streamPath: string;
  let checkpointPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'durable-stream-test-'));
    streamPath = join(testDir, 'stream.jsonl');
    checkpointPath = join(testDir, 'checkpoints');
    mkdirSync(checkpointPath, { recursive: true });

    orchestrator = new DurableStreamOrchestrator({
      streamPath,
      checkpointPath,
      maxStreamSizeMb: 1,
      maxCheckpoints: 10,
      checkpointTimeoutMs: 60000,
      enableContextPreservation: true,
      enableHumanInLoop: true,
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      try {
        rmdirSync(testDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('append', () => {
    it('should append events to the stream', async () => {
      const event = await orchestrator.append({
        type: 'session.created',
        sessionId: 'test-session-1',
        agent: 'test-agent',
        payload: { test: true },
      });

      expect(event.id).toBeDefined();
      expect(event.type).toBe('session.created');
      expect(event.sessionId).toBe('test-session-1');
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.metadata.offset).toBe(1);
    });

    it('should increment offset for each event', async () => {
      await orchestrator.append({
        type: 'session.created',
        sessionId: 's1',
        agent: 'a',
        payload: {},
      });
      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 's2',
        agent: 'a',
        payload: {},
      });
      await orchestrator.append({
        type: 'agent.completed',
        sessionId: 's3',
        agent: 'a',
        payload: {},
      });

      expect(orchestrator.getCurrentOffset()).toBe(3);
    });

    it('should generate unique event IDs', async () => {
      const event1 = await orchestrator.append({
        type: 'session.created',
        sessionId: 's1',
        agent: 'a',
        payload: {},
      });
      const event2 = await orchestrator.append({
        type: 'session.created',
        sessionId: 's2',
        agent: 'a',
        payload: {},
      });

      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers when events are appended', async () => {
      const callback = vi.fn();
      const unsubscribe = orchestrator.subscribe('agent.spawned', callback);

      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 's1',
        agent: 'test-agent',
        payload: {},
      });
      await orchestrator.append({
        type: 'agent.completed',
        sessionId: 's2',
        agent: 'test-agent',
        payload: {},
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].type).toBe('agent.spawned');

      unsubscribe();
      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 's3',
        agent: 'test-agent',
        payload: {},
      });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkpoint', () => {
    it('should create and approve checkpoints', async () => {
      const options: CheckpointOption[] = [
        {
          id: 'opt1',
          label: 'Continue',
          description: 'Continue with current plan',
          action: 'continue',
        },
        { id: 'opt2', label: 'Stop', description: 'Stop execution', action: 'stop' },
      ];

      const checkpoint = await orchestrator.requestCheckpoint(
        'session-1',
        'Should we continue?',
        options,
        'test-agent'
      );

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.decisionPoint).toBe('Should we continue?');
      expect(checkpoint.options).toHaveLength(2);
      expect(checkpoint.requestedBy).toBe('test-agent');

      const pending = orchestrator.getPendingCheckpoints();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(checkpoint.id);

      const approved = await orchestrator.approveCheckpoint(checkpoint.id, 'human', 'opt1');
      expect(approved).toBe(true);

      expect(orchestrator.getPendingCheckpoints()).toHaveLength(0);
    });

    it('should reject checkpoints', async () => {
      const options: CheckpointOption[] = [
        { id: 'opt1', label: 'Yes', description: 'Yes', action: 'yes' },
      ];

      const checkpoint = await orchestrator.requestCheckpoint(
        'session-1',
        'Continue?',
        options,
        'agent'
      );

      const rejected = await orchestrator.rejectCheckpoint(checkpoint.id, 'human', 'Not needed');
      expect(rejected).toBe(true);
      expect(orchestrator.getPendingCheckpoints()).toHaveLength(0);
    });
  });

  describe('context snapshot', () => {
    it('should create and restore context snapshots', async () => {
      const memories = [
        { type: 'pattern' as const, content: 'Use TDD', relevanceScore: 0.9, sourceEventId: 'e1' },
      ];
      const ledgerState = {
        phase: 'implementation',
        completedTasks: ['task1'],
        pendingTasks: ['task2'],
      };

      await orchestrator.createContextSnapshot(
        'session-1',
        'test-agent',
        'Implement feature X',
        memories,
        ledgerState
      );

      const restored = await orchestrator.restoreContext('session-1');
      expect(restored).not.toBeNull();
      expect(restored?.agentName).toBe('test-agent');
      expect(restored?.prompt).toBe('Implement feature X');
      expect(restored?.memories).toHaveLength(1);
      expect(restored?.ledgerState.phase).toBe('implementation');
    });

    it('should return null for non-existent session', async () => {
      const restored = await orchestrator.restoreContext('non-existent');
      expect(restored).toBeNull();
    });
  });

  describe('getEventHistory', () => {
    it('should return events filtered by type', async () => {
      await orchestrator.append({
        type: 'session.created',
        sessionId: 's1',
        agent: 'a',
        payload: {},
      });
      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 's2',
        agent: 'a',
        payload: {},
      });
      await orchestrator.append({
        type: 'session.created',
        sessionId: 's3',
        agent: 'a',
        payload: {},
      });
      await orchestrator.append({
        type: 'agent.completed',
        sessionId: 's4',
        agent: 'a',
        payload: {},
      });

      const createdEvents = orchestrator.getEventHistory('session.created');
      expect(createdEvents).toHaveLength(2);
      expect(createdEvents.every((e) => e.type === 'session.created')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await orchestrator.append({
          type: 'session.created',
          sessionId: `s${i}`,
          agent: 'a',
          payload: {},
        });
      }

      const events = orchestrator.getEventHistory('session.created', 5);
      expect(events).toHaveLength(5);
    });
  });

  describe('spawnAgent/completeAgent/failAgent', () => {
    it('should use helper methods', async () => {
      const spawnEvent = await orchestrator.spawnAgent(
        'child-1',
        'parent-1',
        'executor',
        'Do task'
      );
      expect(spawnEvent.type).toBe('agent.spawned');
      expect(spawnEvent.agent).toBe('executor');

      const completeEvent = await orchestrator.completeAgent(
        'child-1',
        'executor',
        'Task done',
        1000
      );
      expect(completeEvent.type).toBe('agent.completed');
      expect(completeEvent.metadata.duration).toBe(1000);

      const failEvent = await orchestrator.failAgent('child-2', 'debugger', 'Error occurred');
      expect(failEvent.type).toBe('agent.failed');
    });
  });

  describe('extractLearning', () => {
    it('should extract learnings', async () => {
      const event = await orchestrator.extractLearning(
        'session-1',
        'test-agent',
        'pattern',
        'Use TDD for new features'
      );
      expect(event.type).toBe('learning.extracted');
      expect(event.payload.learningType).toBe('pattern');
    });
  });
});
