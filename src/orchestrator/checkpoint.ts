/**
 * Checkpoint System - Human-in-the-Loop (HITL) Decision Points
 *
 * This module provides capabilities to pause workflows and request
 * human approval for critical decisions:
 * - Strategy validation before execution
 * - Code review approval
 * - Dangerous operation confirmation
 * - Design decision ratification
 */

import { getDurableStream, DurableStream } from '../durable-stream/orchestrator';
import type { Checkpoint, CheckpointOption } from '../durable-stream/types';

export interface CheckpointDefinition {
  id?: string;
  decisionPoint: string;
  description?: string;
  options: CheckpointOption[];
  timeoutMs?: number;
}

export interface CheckpointResult {
  checkpointId: string;
  approved: boolean;
  selectedOption?: string;
  approvedBy?: string;
  rejectedReason?: string;
  timestamp: number;
}

export type CheckpointHandler = (result: CheckpointResult) => Promise<void> | void;

export class CheckpointManager {
  private stream: DurableStream;
  private pendingHandlers: Map<string, CheckpointHandler> = new Map();
  private subscriptions: Map<string, () => void> = new Map();
  private initialized = false;

  constructor() {
    this.stream = getDurableStream();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.stream.initialize();
    this.initialized = true;
    this.subscribeToCheckpointEvents();
  }

  private subscribeToCheckpointEvents(): void {
    const unsubApproved = this.stream.subscribe('checkpoint.approved', async (event) => {
      const payload = event.payload as {
        checkpoint_id: string;
        approved_by?: string;
        selected_option?: string;
      };
      const handler = this.pendingHandlers.get(payload.checkpoint_id);
      if (handler) {
        await handler({
          checkpointId: payload.checkpoint_id,
          approved: true,
          selectedOption: payload.selected_option,
          approvedBy: payload.approved_by,
          timestamp: Date.now(),
        });
        this.cleanup(payload.checkpoint_id);
      }
    });

    const unsubRejected = this.stream.subscribe('checkpoint.rejected', async (event) => {
      const payload = event.payload as {
        checkpoint_id: string;
        rejected_by?: string;
        reason?: string;
      };
      const handler = this.pendingHandlers.get(payload.checkpoint_id);
      if (handler) {
        await handler({
          checkpointId: payload.checkpoint_id,
          approved: false,
          rejectedReason: payload.reason,
          approvedBy: payload.rejected_by,
          timestamp: Date.now(),
        });
        this.cleanup(payload.checkpoint_id);
      }
    });

    this.subscriptions.set('approved', unsubApproved);
    this.subscriptions.set('rejected', unsubRejected);
  }

  private cleanup(checkpointId: string): void {
    const unsub = this.subscriptions.get(checkpointId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(checkpointId);
    }
    this.pendingHandlers.delete(checkpointId);
  }

  async requestCheckpoint(
    streamId: string,
    definition: CheckpointDefinition,
    handler: CheckpointHandler
  ): Promise<string> {
    await this.initialize();

    const checkpointId = await this.stream.requestCheckpoint(
      streamId,
      definition.decisionPoint,
      definition.options,
      'user'
    );

    this.pendingHandlers.set(checkpointId, handler);

    if (definition.timeoutMs) {
      setTimeout(() => {
        const pendingHandler = this.pendingHandlers.get(checkpointId);
        if (pendingHandler) {
          pendingHandler({
            checkpointId,
            approved: false,
            rejectedReason: 'timeout',
            timestamp: Date.now(),
          });
          this.cleanup(checkpointId);
        }
      }, definition.timeoutMs);
    }

    return checkpointId;
  }

  async approveCheckpoint(checkpointId: string, selectedOption?: string): Promise<boolean> {
    await this.initialize();
    return this.stream.approveCheckpoint(checkpointId, 'user', selectedOption);
  }

  async rejectCheckpoint(checkpointId: string, reason?: string): Promise<boolean> {
    await this.initialize();
    return this.stream.rejectCheckpoint(checkpointId, 'user', reason);
  }

  getPendingCheckpoints(): Checkpoint[] {
    return this.stream.getPendingCheckpoints();
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
    this.pendingHandlers.clear();
    this.initialized = false;
  }
}

let globalCheckpointManager: CheckpointManager | null = null;

export function getCheckpointManager(): CheckpointManager {
  if (!globalCheckpointManager) {
    globalCheckpointManager = new CheckpointManager();
  }
  return globalCheckpointManager;
}

export async function initializeCheckpointManager(): Promise<CheckpointManager> {
  const manager = getCheckpointManager();
  await manager.initialize();
  return manager;
}

export async function shutdownCheckpointManager(): Promise<void> {
  if (globalCheckpointManager) {
    await globalCheckpointManager.shutdown();
    globalCheckpointManager = null;
  }
}

export const CHECKPOINT_TEMPLATES = {
  strategyValidation: (strategies: string[]): CheckpointDefinition => ({
    decisionPoint: 'Select implementation strategy',
    description: 'Multiple approaches available. Choose the best path forward.',
    options: strategies.map((s, i) => ({
      id: `strategy_${i}`,
      label: s.split('\n')[0].substring(0, 50),
      description: s,
    })),
  }),

  codeReview: (files: string[]): CheckpointDefinition => ({
    decisionPoint: 'Review proposed changes',
    description: 'The following files will be modified:',
    options: [
      { id: 'approve', label: 'Approve & Proceed', description: 'Proceed with implementation' },
      {
        id: 'request_changes',
        label: 'Request Changes',
        description: 'Specify what needs to be modified',
      },
      { id: 'reject', label: 'Reject', description: 'Cancel this task' },
    ],
  }),

  dangerousOperation: (operation: string, impact: string): CheckpointDefinition => ({
    decisionPoint: `Confirm dangerous operation: ${operation}`,
    description: `This operation will: ${impact}`,
    options: [
      { id: 'confirm', label: 'Confirm', description: 'I understand the risks, proceed' },
      { id: 'cancel', label: 'Cancel', description: 'Abort this operation' },
    ],
  }),

  designDecision: (question: string, options: string[]): CheckpointDefinition => ({
    decisionPoint: question,
    description: 'Please select the preferred approach:',
    options: options.map((o, i) => ({
      id: `option_${i}`,
      label: o,
      description: o,
    })),
  }),

  epicCompletion: (
    epicTitle: string,
    tasksCompleted: number,
    totalTasks: number
  ): CheckpointDefinition => ({
    decisionPoint: `Complete epic: ${epicTitle}`,
    description: `${tasksCompleted}/${totalTasks} tasks completed. Ready to archive?`,
    options: [
      { id: 'complete', label: 'Complete & Archive', description: 'Archive as SUCCEEDED' },
      { id: 'partial', label: 'Partial Completion', description: 'Archive as PARTIAL' },
      { id: 'cancel', label: 'Cancel', description: 'Keep epic active' },
    ],
  }),
};

export function createCheckpointWorkflow(
  manager: CheckpointManager,
  streamId: string,
  checkpointDef: CheckpointDefinition,
  onApproved: (option: string) => Promise<void>,
  onRejected: (reason?: string) => Promise<void>
): Promise<void> {
  return new Promise((resolve) => {
    manager.requestCheckpoint(streamId, checkpointDef, async (result) => {
      if (result.approved && result.selectedOption) {
        await onApproved(result.selectedOption);
      } else {
        await onRejected(result.rejectedReason);
      }
      resolve();
    });
  });
}
