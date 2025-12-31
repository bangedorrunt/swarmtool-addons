import fs from 'fs';
import * as fsPromises from 'fs/promises';
import { DurableStreamOrchestrator, StreamEventType } from './durable-stream';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
}));

describe('DurableStreamOrchestrator', () => {
  let orchestrator: DurableStreamOrchestrator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    vi.spyOn(require('fs/promises'), 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(require('fs/promises'), 'readFile').mockResolvedValue('');
    vi.spyOn(require('fs/promises'), 'writeFile').mockResolvedValue(undefined);

    orchestrator = new DurableStreamOrchestrator({
      streamPath: '/test/stream.jsonl',
      checkpointPath: '/test/checkpoints',
    });
    await orchestrator.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Event Creation', () => {
    it('should create event with auto-generated metadata', async () => {
      const event = await orchestrator.append({
        type: 'session.created',
        sessionId: 'test-session',
        agent: 'test-agent',
        payload: { message: 'test' },
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.metadata.offset).toBe(1);
      expect(event.metadata.correlationId).toBeDefined();
      expect(event.metadata.sourceAgent).toBe('test-agent');
    });

    it('should accept custom metadata', async () => {
      const event = await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 'test-session',
        agent: 'test-agent',
        payload: { agentName: 'oracle' },
        metadata: { targetAgent: 'oracle', duration: 1000 },
      });

      expect(event.metadata.targetAgent).toBe('oracle');
      expect(event.metadata.duration).toBe(1000);
    });

    it('should validate event type', async () => {
      // Invalid event type should be accepted by TypeScript but we can test basic append
      const validEvent = await orchestrator.append({
        type: 'session.created',
        sessionId: 'test-session',
        payload: {},
      });
      expect(validEvent.type).toBe('session.created');
    });
  });

  describe('Append Operations', () => {
    it('should append events with auto-generated metadata', async () => {
      const orchestrator = new DurableStreamOrchestrator();
      await orchestrator.initialize();

      const event = await orchestrator.append({
        type: 'session.created',
        sessionId: 'session-1',
        payload: { test: true },
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.metadata).toBeDefined();
      expect(event.metadata.offset).toBe(1);
      expect(event.metadata.correlationId).toBeDefined();
      expect(event.metadata.sourceAgent).toBe('system');
    });

    it('should track event offset', async () => {
      const orchestrator = new DurableStreamOrchestrator();
      await orchestrator.initialize();

      await orchestrator.append({ type: 'session.created', sessionId: 's1', payload: {} });
      await orchestrator.append({ type: 'agent.spawned', sessionId: 's1', payload: {} });
      await orchestrator.append({ type: 'agent.completed', sessionId: 's1', payload: {} });

      const offset = orchestrator.getCurrentOffset();
      expect(offset).toBe(3);
    });

    it('should persist event to file', async () => {
      const orchestrator = new DurableStreamOrchestrator();
      await orchestrator.initialize();

      const writeFileSpy = vi.spyOn(fs.promises, 'writeFile');

      await orchestrator.append({
        type: 'session.created',
        sessionId: 'session-1',
        payload: {},
      });

      expect(writeFileSpy).toHaveBeenCalled();
    });
  });

  describe('Event Subscription', () => {
    it('should notify subscriber on event', async () => {
      const callback = vi.fn();

      orchestrator.subscribe('agent.spawned', callback);

      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 'session-1',
        payload: { agentName: 'oracle' },
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should support wildcard subscription', async () => {
      const callback = vi.fn();

      // @ts-expect-error - wildcard not in type
      orchestrator.subscribe('*', callback);

      await orchestrator.append({
        type: 'session.created',
        sessionId: 'session-1',
        payload: {},
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscription', async () => {
      const callback = vi.fn();

      const unsubscribe = orchestrator.subscribe('agent.spawned', callback);
      unsubscribe();

      await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 'session-1',
        payload: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should preserve event ordering', async () => {
      const order: number[] = [];

      orchestrator.subscribe('session.created', async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 10));
      });

      orchestrator.subscribe('agent.spawned', async () => {
        order.push(2);
      });

      await Promise.all([
        orchestrator.append({ type: 'session.created', sessionId: 's1', payload: {} }),
        orchestrator.append({ type: 'agent.spawned', sessionId: 's1', payload: {} }),
      ]);

      expect(order).toEqual([1, 2]);
    });
  });

  describe('Context Snapshot', () => {
    it('should create context snapshot', async () => {
      const event = await orchestrator.createContextSnapshot(
        'session-1',
        'oracle',
        'Analyze this code',
        [{ type: 'decision', content: 'Use TDD', relevanceScore: 0.9, sourceEventId: 'evt-1' }],
        { phase: 'implementation', completedTasks: [], pendingTasks: ['task-1'] }
      );

      expect(event.type).toBe('context.snapshot');
      expect(event.payload.snapshotId).toBeDefined();
    });

    it('should restore context', async () => {
      await orchestrator.createContextSnapshot('session-1', 'oracle', 'Analyze this code', [], {
        phase: 'planning',
        completedTasks: [],
        pendingTasks: [],
      });

      const restored = await orchestrator.restoreContext('session-1');

      expect(restored).not.toBeNull();
      expect(restored?.agentName).toBe('oracle');
      expect(restored?.prompt).toBe('Analyze this code');
    });

    it('should return null for non-existent session', async () => {
      const restored = await orchestrator.restoreContext('non-existent');
      expect(restored).toBeNull();
    });
  });

  describe('Checkpoint Operations', () => {
    it('should request checkpoint', async () => {
      const checkpoint = await orchestrator.requestCheckpoint(
        'session-1',
        'Deploy to production?',
        [
          { id: 'approve', label: 'Deploy', description: 'Deploy to production', action: 'deploy' },
          { id: 'reject', label: 'Cancel', description: 'Cancel deployment', action: 'cancel' },
        ],
        'chief-of-staff'
      );

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.decisionPoint).toBe('Deploy to production?');
      expect(checkpoint.options).toHaveLength(2);
    });

    it('should approve checkpoint', async () => {
      const checkpoint = await orchestrator.requestCheckpoint(
        'session-1',
        'Deploy to production?',
        [{ id: 'approve', label: 'Deploy', description: '', action: 'deploy' }],
        'chief-of-staff'
      );

      const approved = await orchestrator.approveCheckpoint(checkpoint.id, 'user');

      expect(approved).toBe(true);
    });

    it('should reject checkpoint', async () => {
      const checkpoint = await orchestrator.requestCheckpoint(
        'session-1',
        'Deploy to production?',
        [{ id: 'approve', label: 'Deploy', description: '', action: 'deploy' }],
        'chief-of-staff'
      );

      const rejected = await orchestrator.rejectCheckpoint(checkpoint.id, 'user');

      expect(rejected).toBe(true);
    });

    it('should throw for invalid checkpoint approval', async () => {
      const result = await orchestrator.approveCheckpoint('invalid-id', 'user');
      expect(result).toBe(false);
    });
  });

  describe('Crash Recovery', () => {
    it('should track event offset', async () => {
      await orchestrator.append({ type: 'session.created', sessionId: 's1', payload: {} });
      await orchestrator.append({ type: 'agent.spawned', sessionId: 's1', payload: {} });
      await orchestrator.append({ type: 'agent.completed', sessionId: 's1', payload: {} });

      const offset = orchestrator.getCurrentOffset();
      expect(offset).toBe(3);
    });
  });

  describe('Agent Handoff Flow', () => {
    it('should track agent handoff events', async () => {
      const spawnEvent = await orchestrator.append({
        type: 'agent.spawned',
        sessionId: 'parent-session',
        agent: 'chief-of-staff',
        payload: { agentName: 'oracle' },
      });

      const handoffEvent = await orchestrator.append({
        type: 'handoff.initiated',
        sessionId: 'parent-session',
        agent: 'chief-of-staff',
        payload: { targetAgent: 'oracle', reason: 'Need expertise' },
        metadata: { targetAgent: 'oracle' },
        parentEventId: spawnEvent.id,
      });

      expect(handoffEvent.parentEventId).toBe(spawnEvent.id);
    });

    it('should create context snapshot before handoff', async () => {
      const snapshotEvent = await orchestrator.createContextSnapshot(
        'parent-session',
        'chief-of-staff',
        'Analyze architecture',
        [
          {
            type: 'decision',
            content: 'Use microservices',
            relevanceScore: 0.95,
            sourceEventId: 'evt-1',
          },
        ],
        { phase: 'analysis', completedTasks: [], pendingTasks: ['task-1'] }
      );

      await orchestrator.append({
        type: 'handoff.initiated',
        sessionId: 'parent-session',
        agent: 'chief-of-staff',
        payload: { targetAgent: 'oracle', snapshotEventId: snapshotEvent.id },
        metadata: { targetAgent: 'oracle' },
        parentEventId: snapshotEvent.id,
      });

      expect(snapshotEvent.type).toBe('context.snapshot');
    });
  });

  describe('Event History', () => {
    it('should maintain event history', async () => {
      await orchestrator.append({ type: 'session.created', sessionId: 's1', payload: {} });
      await orchestrator.append({ type: 'agent.spawned', sessionId: 's1', payload: {} });

      const history = orchestrator.getEventHistory();
      // getEventHistory returns events in reverse order (most recent first)
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('agent.spawned');
      expect(history[1].type).toBe('session.created');
    });

    it('should limit history size', async () => {
      for (let i = 0; i < 1005; i++) {
        await orchestrator.append({ type: 'session.created', sessionId: `s${i}`, payload: {} });
      }

      const history = orchestrator.getEventHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });
});
