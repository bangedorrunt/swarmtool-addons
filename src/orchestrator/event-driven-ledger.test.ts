/**
 * Event-Driven Ledger Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import type { StreamEvent, Checkpoint, Intent, ResumeResult } from '../durable-stream/types';
import { EventDrivenLedger, createLedgerEventHandlers } from './event-driven-ledger';
import { DurableStream } from '../durable-stream/orchestrator';

describe('EventDrivenLedger', () => {
  let mockStream: DurableStream;
  let ledger: EventDrivenLedger;

  beforeEach(async () => {
    mockStream = {
      initialize: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue({
        events_replayed: 5,
        pending_checkpoints: [],
        active_intents: [],
        last_event_at: Date.now(),
      } as ResumeResult),
      append: vi.fn().mockImplementation(async (event) => event),
      query: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockReturnValue(() => {}),
      getEventHistory: vi.fn().mockReturnValue([]),
      getActiveIntents: vi.fn().mockReturnValue([]),
      getPendingCheckpoints: vi.fn().mockReturnValue([]),
      getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
    } as unknown as DurableStream;

    ledger = new EventDrivenLedger({
      emitEvents: true,
      enableRecovery: true,
      streamId: 'test-stream',
    });
    (ledger as any).stream = mockStream;
  });

  afterEach(async () => {
    await ledger.shutdown();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize the stream on first call', async () => {
      await ledger.initialize();
      expect(mockStream.initialize).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await ledger.initialize();
      await ledger.initialize();
      expect(mockStream.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit', () => {
    it('should emit event to stream', async () => {
      await ledger.initialize();

      const event = await ledger.emit('ledger.epic.created', {
        epicId: 'abc123',
        epicTitle: 'Test Epic',
      });

      expect(event).toBeDefined();
      expect(mockStream.append).toHaveBeenCalled();
    });

    it('should not emit if emitEvents is disabled', async () => {
      const disabledLedger = new EventDrivenLedger({ emitEvents: false });
      await disabledLedger.initialize();
      (disabledLedger as any).stream = mockStream;

      const event = await disabledLedger.emit('ledger.task.created', {
        taskId: 'abc123.1',
      });

      expect(event).toBeNull();
      expect(mockStream.append).not.toHaveBeenCalled();
    });
  });

  describe('getEventHistory', () => {
    it('should return event history', async () => {
      const mockEvents = [
        { id: '1', type: 'ledger.epic.created' },
        { id: '2', type: 'ledger.task.created' },
      ] as unknown as StreamEvent[];

      mockStream.getEventHistory = vi.fn().mockReturnValue(mockEvents);

      await ledger.initialize();
      const history = ledger.getEventHistory();

      expect(history).toEqual(mockEvents);
    });
  });

  describe('getActiveIntents', () => {
    it('should return active intents from stream', async () => {
      const mockIntents = [{ id: 'intent_1', status: 'running' }] as Intent[];

      mockStream.getActiveIntents = vi.fn().mockReturnValue(mockIntents);

      await ledger.initialize();
      const intents = ledger.getActiveIntents();

      expect(intents).toEqual(mockIntents);
    });
  });

  describe('getPendingCheckpoints', () => {
    it('should return pending checkpoints from stream', async () => {
      const mockCheckpoints = [{ id: 'cp_1', decision_point: 'Decision 1' }] as Checkpoint[];

      mockStream.getPendingCheckpoints = vi.fn().mockReturnValue(mockCheckpoints);

      await ledger.initialize();
      const checkpoints = ledger.getPendingCheckpoints();

      expect(checkpoints).toEqual(mockCheckpoints);
    });
  });
});

describe('createLedgerEventHandlers', () => {
  let mockLedger: EventDrivenLedger;

  beforeEach(() => {
    mockLedger = {
      emit: vi.fn().mockResolvedValue({ id: 'event_123' }),
    } as unknown as EventDrivenLedger;
  });

  describe('onEpicCreated', () => {
    it('should emit epic created event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onEpicCreated({
        id: 'abc123',
        title: 'Test Epic',
        request: 'Build something',
        status: 'pending',
        createdAt: Date.now(),
        tasks: [],
        context: [],
        progressLog: [],
      });

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.epic.created',
        expect.objectContaining({
          epicId: 'abc123',
          epicTitle: 'Test Epic',
        })
      );
    });
  });

  describe('onTaskCreated', () => {
    it('should emit task created event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onTaskCreated(
        {
          id: 'abc123.1',
          title: 'Test Task',
          agent: 'executor',
          status: 'pending',
          outcome: '-',
          dependencies: [],
        },
        { id: 'abc123', title: 'Test Epic' } as any
      );

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.task.created',
        expect.objectContaining({
          epicId: 'abc123',
          taskId: 'abc123.1',
          taskTitle: 'Test Task',
          agent: 'executor',
        })
      );
    });
  });

  describe('onTaskCompleted', () => {
    it('should emit task completed event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onTaskCompleted(
        {
          id: 'abc123.1',
          title: 'Test Task',
          agent: 'executor',
          status: 'completed',
          outcome: 'SUCCEEDED',
          dependencies: [],
          result: 'Task completed successfully',
        },
        { id: 'abc123', title: 'Test Epic' } as any,
        'Task completed successfully'
      );

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.task.completed',
        expect.objectContaining({
          epicId: 'abc123',
          taskId: 'abc123.1',
          result: 'Task completed successfully',
        })
      );
    });
  });

  describe('onTaskFailed', () => {
    it('should emit task failed event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onTaskFailed(
        {
          id: 'abc123.1',
          title: 'Test Task',
          agent: 'executor',
          status: 'failed',
          outcome: 'FAILED',
          dependencies: [],
          error: 'Task failed',
        },
        { id: 'abc123', title: 'Test Epic' } as any,
        'Task failed'
      );

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.task.failed',
        expect.objectContaining({
          epicId: 'abc123',
          taskId: 'abc123.1',
          error: 'Task failed',
        })
      );
    });
  });

  describe('onDirectiveAdded', () => {
    it('should emit directive added event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onDirectiveAdded('Use TypeScript for type safety');

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.governance.directive_added',
        expect.objectContaining({
          directiveContent: 'Use TypeScript for type safety',
        })
      );
    });
  });

  describe('onAssumptionAdded', () => {
    it('should emit assumption added event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onAssumptionAdded(
        'API returns consistent response format',
        'oracle',
        'Based on analysis of 100 API calls'
      );

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.governance.assumption_added',
        expect.objectContaining({
          assumptionContent: 'API returns consistent response format',
          assumptionSource: 'oracle',
          assumptionRationale: 'Based on analysis of 100 API calls',
        })
      );
    });
  });

  describe('onLearningExtracted', () => {
    it('should emit learning extracted event', async () => {
      const handlers = createLedgerEventHandlers(mockLedger);

      await handlers.onLearningExtracted('pattern', 'Use TypeScript generics for type safety');

      expect(mockLedger.emit).toHaveBeenCalledWith(
        'ledger.learning.extracted',
        expect.objectContaining({
          learningType: 'pattern',
          learningContent: 'Use TypeScript generics for type safety',
        })
      );
    });
  });
});
