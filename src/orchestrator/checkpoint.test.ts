/**
 * Checkpoint System Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Checkpoint } from '../durable-stream/types';
import { CheckpointManager, CHECKPOINT_TEMPLATES, createCheckpointWorkflow } from './checkpoint';
import { DurableStream } from '../durable-stream/orchestrator';

describe('CheckpointManager', () => {
  let mockStream: DurableStream;
  let manager: CheckpointManager;

  beforeEach(async () => {
    mockStream = {
      initialize: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
      getPendingCheckpoints: vi.fn().mockReturnValue([]),
      requestCheckpoint: vi.fn().mockResolvedValue('cp_123'),
      approveCheckpoint: vi.fn().mockResolvedValue(true),
      rejectCheckpoint: vi.fn().mockResolvedValue(true),
    } as unknown as DurableStream;

    manager = new CheckpointManager();
    (manager as any).stream = mockStream;
  });

  afterEach(async () => {
    await manager.shutdown();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize the stream', async () => {
      await manager.initialize();
      expect(mockStream.initialize).toHaveBeenCalled();
    });
  });

  describe('requestCheckpoint', () => {
    it('should request a checkpoint from the stream', async () => {
      await manager.initialize();

      const handler = vi.fn();
      const checkpointId = await manager.requestCheckpoint(
        'stream-1',
        {
          decisionPoint: 'Approve this change?',
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
        handler
      );

      expect(checkpointId).toBe('cp_123');
      expect(mockStream.requestCheckpoint).toHaveBeenCalledWith(
        'stream-1',
        'Approve this change?',
        expect.arrayContaining([
          expect.objectContaining({ id: 'yes' }),
          expect.objectContaining({ id: 'no' }),
        ]),
        'user'
      );
    });

    it('should timeout checkpoint if timeoutMs is provided', async () => {
      vi.useFakeTimers();
      await manager.initialize();

      const handler = vi.fn();
      await manager.requestCheckpoint(
        'stream-1',
        {
          decisionPoint: 'Quick decision needed',
          options: [{ id: 'yes', label: 'Yes' }],
          timeoutMs: 1000,
        },
        handler
      );

      vi.advanceTimersByTime(1000);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointId: 'cp_123',
          approved: false,
          rejectedReason: 'timeout',
        })
      );

      vi.useRealTimers();
    });
  });

  describe('approveCheckpoint', () => {
    it('should approve a checkpoint', async () => {
      await manager.initialize();

      const result = await manager.approveCheckpoint('cp_123', 'yes');

      expect(result).toBe(true);
      expect(mockStream.approveCheckpoint).toHaveBeenCalledWith('cp_123', 'user', 'yes');
    });
  });

  describe('rejectCheckpoint', () => {
    it('should reject a checkpoint with reason', async () => {
      await manager.initialize();

      const result = await manager.rejectCheckpoint('cp_123', 'Not ready yet');

      expect(result).toBe(true);
      expect(mockStream.rejectCheckpoint).toHaveBeenCalledWith('cp_123', 'user', 'Not ready yet');
    });
  });

  describe('getPendingCheckpoints', () => {
    it('should return pending checkpoints from stream', async () => {
      const mockCheckpoints = [
        { id: 'cp_1', decision_point: 'Decision 1' },
        { id: 'cp_2', decision_point: 'Decision 2' },
      ] as Checkpoint[];

      mockStream.getPendingCheckpoints = vi.fn().mockReturnValue(mockCheckpoints);

      await manager.initialize();
      const checkpoints = manager.getPendingCheckpoints();

      expect(checkpoints).toEqual(mockCheckpoints);
    });
  });
});

describe('CHECKPOINT_TEMPLATES', () => {
  describe('strategyValidation', () => {
    it('should create a strategy validation checkpoint', () => {
      const strategies = ['Strategy A', 'Strategy B', 'Strategy C'];
      const checkpoint = CHECKPOINT_TEMPLATES.strategyValidation(strategies);

      expect(checkpoint.decisionPoint).toBe('Select implementation strategy');
      expect(checkpoint.options).toHaveLength(3);
      expect(checkpoint.options[0].id).toBe('strategy_0');
      expect(checkpoint.options[1].id).toBe('strategy_1');
    });
  });

  describe('codeReview', () => {
    it('should create a code review checkpoint', () => {
      const files = ['src/index.ts', 'src/utils.ts'];
      const checkpoint = CHECKPOINT_TEMPLATES.codeReview(files);

      expect(checkpoint.decisionPoint).toBe('Review proposed changes');
      expect(checkpoint.options).toHaveLength(3);
      expect(checkpoint.options[0].label).toBe('Approve & Proceed');
    });
  });

  describe('dangerousOperation', () => {
    it('should create a dangerous operation checkpoint', () => {
      const checkpoint = CHECKPOINT_TEMPLATES.dangerousOperation(
        'Delete all files',
        'This will permanently remove all data'
      );

      expect(checkpoint.decisionPoint).toContain('Delete all files');
      expect(checkpoint.description).toContain('This will permanently remove all data');
      expect(checkpoint.options).toHaveLength(2);
    });
  });

  describe('designDecision', () => {
    it('should create a design decision checkpoint', () => {
      const options = ['Use REST API', 'Use GraphQL', 'Use gRPC'];
      const checkpoint = CHECKPOINT_TEMPLATES.designDecision('Which API style to use?', options);

      expect(checkpoint.decisionPoint).toBe('Which API style to use?');
      expect(checkpoint.options).toHaveLength(3);
    });
  });

  describe('epicCompletion', () => {
    it('should create an epic completion checkpoint', () => {
      const checkpoint = CHECKPOINT_TEMPLATES.epicCompletion('Build Auth System', 2, 3);

      expect(checkpoint.decisionPoint).toBe('Complete epic: Build Auth System');
      expect(checkpoint.description).toBe('2/3 tasks completed. Ready to archive?');
      expect(checkpoint.options).toHaveLength(3);
    });
  });
});

describe('createCheckpointWorkflow', () => {
  it('should create a workflow that handles checkpoint results', async () => {
    const mockRequestCheckpoint = vi.fn().mockResolvedValue('cp_123');
    const mockManager = {
      requestCheckpoint: mockRequestCheckpoint,
    } as unknown as CheckpointManager;

    const onApproved = vi.fn();
    const onRejected = vi.fn();

    createCheckpointWorkflow(
      mockManager,
      'stream-1',
      {
        decisionPoint: 'Test decision',
        options: [{ id: 'yes', label: 'Yes' }],
      },
      onApproved,
      onRejected
    );

    expect(mockRequestCheckpoint).toHaveBeenCalledWith(
      'stream-1',
      expect.objectContaining({ decisionPoint: 'Test decision' }),
      expect.any(Function)
    );

    const handler = mockRequestCheckpoint.mock.calls[0][2] as any;
    await handler({
      checkpointId: 'cp_123',
      approved: true,
      selectedOption: 'yes',
      timestamp: Date.now(),
    });

    expect(onApproved).toHaveBeenCalledWith('yes');
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('should call onRejected when checkpoint is rejected', async () => {
    const mockRequestCheckpoint = vi.fn().mockResolvedValue('cp_123');
    const mockManager = {
      requestCheckpoint: mockRequestCheckpoint,
    } as unknown as CheckpointManager;

    const onApproved = vi.fn();
    const onRejected = vi.fn();

    createCheckpointWorkflow(
      mockManager,
      'stream-1',
      {
        decisionPoint: 'Test decision',
        options: [{ id: 'yes', label: 'Yes' }],
      },
      onApproved,
      onRejected
    );

    const handler = mockRequestCheckpoint.mock.calls[0][2] as any;
    await handler({
      checkpointId: 'cp_123',
      approved: false,
      rejectedReason: 'Not ready',
      timestamp: Date.now(),
    });

    expect(onRejected).toHaveBeenCalledWith('Not ready');
    expect(onApproved).not.toHaveBeenCalled();
  });
});
