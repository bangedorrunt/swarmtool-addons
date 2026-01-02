/**
 * Event-Driven Ledger Integration
 *
 * This module bridges LEDGER.md operations with the Durable Stream API,
 * providing:
 * - Automatic event emission for all ledger operations
 * - Crash recovery by replaying ledger events
 * - Event-driven state synchronization
 * - Lineage tracking for task dependencies
 */

import type { Ledger, Epic, Task } from './ledger';
import type { StreamEvent, Checkpoint, Intent, StreamFilter } from '../durable-stream/types';
import { getDurableStream, DurableStream } from '../durable-stream/orchestrator';
import {
  createEvent,
  extractPendingCheckpoints,
  extractActiveIntents,
  buildLineageTree,
  getDescendants,
} from '../durable-stream/core';

export interface LedgerEventConfig {
  /** Enable automatic event emission for ledger operations */
  emitEvents?: boolean;
  /** Enable crash recovery from durable stream */
  enableRecovery?: boolean;
  /** Custom stream ID for this ledger session */
  streamId?: string;
}

const DEFAULT_CONFIG: Required<LedgerEventConfig> = {
  emitEvents: true,
  enableRecovery: true,
  streamId: 'ledger-events',
};

export type LedgerEventType =
  | 'ledger.epic.created'
  | 'ledger.epic.started'
  | 'ledger.epic.completed'
  | 'ledger.epic.failed'
  | 'ledger.epic.archived'
  | 'ledger.handoff.created'
  | 'ledger.handoff.resumed'
  | 'ledger.task.created'
  | 'ledger.task.started'
  | 'ledger.task.completed'
  | 'ledger.task.failed'
  | 'ledger.task.yielded'
  | 'ledger.governance.directive_added'
  | 'ledger.governance.assumption_added'
  | 'ledger.learning.extracted';

export interface LedgerEventPayload {
  epicId?: string;
  epicTitle?: string;
  taskId?: string;
  taskTitle?: string;
  agent?: string;
  result?: string;
  summary?: string;
  error?: string;
  directiveContent?: string;
  assumptionContent?: string;
  assumptionSource?: string;
  assumptionRationale?: string;
  learningType?: string;
  learningContent?: string;
  handoffReason?: string;
  handoffCommand?: string;
  handoffFilesModified?: string[];
  handoffWhatsDone?: string[];
  handoffWhatsNext?: string[];
  handoffKeyContext?: string[];
}

export class EventDrivenLedger {
  private config: Required<LedgerEventConfig>;
  private stream: DurableStream;
  private initialized = false;
  private eventHistory: StreamEvent[] = [];
  private lineageTree: Map<string, string[]> = new Map();

  constructor(config?: LedgerEventConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stream = getDurableStream();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.stream.initialize();
    this.initialized = true;

    if (this.config.enableRecovery) {
      await this.recoverState();
    }
  }

  private async recoverState(): Promise<void> {
    const result = await this.stream.resume();
    this.eventHistory = this.stream.getEventHistory();
    this.lineageTree = buildLineageTree(this.eventHistory);

    console.log(
      `[EventLedger] Recovered ${result.events_replayed} events, ${result.pending_checkpoints.length} pending checkpoints, ${result.active_intents.length} active intents`
    );
  }

  async emit<T>(
    type: LedgerEventType,
    payload: LedgerEventPayload,
    causationId?: string
  ): Promise<StreamEvent<T> | null> {
    if (!this.config.emitEvents) return null;

    await this.initialize();

    const event = await this.stream.append({
      type: type as any,
      stream_id: this.config.streamId,
      correlation_id: this.stream.getCorrelationId(),
      actor: 'ledger',
      payload,
      causation_id: causationId,
    });

    this.eventHistory.push(event);
    this.updateLineage(event.id, causationId);

    return event as unknown as StreamEvent<T>;
  }

  private updateLineage(eventId: string, causationId?: string): void {
    if (causationId) {
      const children = this.lineageTree.get(causationId) || [];
      children.push(eventId);
      this.lineageTree.set(causationId, children);
    }
  }

  getEventHistory(): StreamEvent[] {
    return this.eventHistory;
  }

  getLineageTree(): Map<string, string[]> {
    return this.lineageTree;
  }

  getDescendants(eventId: string): string[] {
    return getDescendants(this.lineageTree, eventId);
  }

  async queryEvents(filter: StreamFilter): Promise<StreamEvent[]> {
    await this.initialize();
    return this.stream.query(filter);
  }

  getActiveIntents(): Intent[] {
    return this.stream.getActiveIntents();
  }

  getPendingCheckpoints(): Checkpoint[] {
    return this.stream.getPendingCheckpoints();
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.eventHistory = [];
    this.lineageTree.clear();
  }
}

let globalInstance: EventDrivenLedger | null = null;

export function getEventDrivenLedger(config?: LedgerEventConfig): EventDrivenLedger {
  if (!globalInstance) {
    globalInstance = new EventDrivenLedger(config);
  }
  return globalInstance;
}

export async function initializeEventDrivenLedger(
  config?: LedgerEventConfig
): Promise<EventDrivenLedger> {
  const instance = getEventDrivenLedger(config);
  await instance.initialize();
  return instance;
}

export async function shutdownEventDrivenLedger(): Promise<void> {
  if (globalInstance) {
    await globalInstance.shutdown();
    globalInstance = null;
  }
}

export function createLedgerEventHandlers(ledger: EventDrivenLedger) {
  return {
    onEpicCreated: (epic: Epic) =>
      ledger.emit('ledger.epic.created', {
        epicId: epic.id,
        epicTitle: epic.title,
      }),

    onEpicStarted: (epic: Epic) =>
      ledger.emit('ledger.epic.started', {
        epicId: epic.id,
        epicTitle: epic.title,
      }),

    onEpicCompleted: (epic: Epic, result: string) =>
      ledger.emit('ledger.epic.completed', {
        epicId: epic.id,
        epicTitle: epic.title,
        result,
      }),

    onEpicFailed: (epic: Epic, error: string) =>
      ledger.emit('ledger.epic.failed', {
        epicId: epic.id,
        epicTitle: epic.title,
        error,
      }),

    onEpicArchived: (epicId: string, outcome: string) =>
      ledger.emit('ledger.epic.archived', {
        epicId,
        result: outcome,
      }),

    onHandoffCreated: (
      epicId: string,
      reason: string,
      command: string,
      filesModified: string[],
      whatsDone: string[],
      whatsNext: string[],
      keyContext: string[]
    ) =>
      ledger.emit('ledger.handoff.created', {
        epicId,
        handoffReason: reason,
        handoffCommand: command,
        handoffFilesModified: filesModified,
        handoffWhatsDone: whatsDone,
        handoffWhatsNext: whatsNext,
        handoffKeyContext: keyContext,
      }),

    onHandoffResumed: (epicId: string) =>
      ledger.emit('ledger.handoff.resumed', {
        epicId,
      }),

    onTaskCreated: (task: Task, epic: Epic) =>
      ledger.emit('ledger.task.created', {
        epicId: epic.id,
        epicTitle: epic.title,
        taskId: task.id,
        taskTitle: task.title,
        agent: task.agent,
      }),

    onTaskStarted: (task: Task, epic: Epic) =>
      ledger.emit('ledger.task.started', {
        epicId: epic.id,
        epicTitle: epic.title,
        taskId: task.id,
        taskTitle: task.title,
        agent: task.agent,
      }),

    onTaskCompleted: (task: Task, epic: Epic, result: string) =>
      ledger.emit('ledger.task.completed', {
        epicId: epic.id,
        epicTitle: epic.title,
        taskId: task.id,
        taskTitle: task.title,
        agent: task.agent,
        result,
      }),

    onTaskFailed: (task: Task, epic: Epic, error: string) =>
      ledger.emit('ledger.task.failed', {
        epicId: epic.id,
        epicTitle: epic.title,
        taskId: task.id,
        taskTitle: task.title,
        agent: task.agent,
        error,
      }),

    onTaskYielded: (task: Task, epic: Epic, reason: string, summary?: string) =>
      ledger.emit('ledger.task.yielded', {
        epicId: epic.id,
        epicTitle: epic.title,
        taskId: task.id,
        taskTitle: task.title,
        agent: task.agent,
        result: reason,
        summary,
      }),

    onDirectiveAdded: (content: string) =>
      ledger.emit('ledger.governance.directive_added', {
        directiveContent: content,
      }),

    onAssumptionAdded: (content: string, source: string, rationale: string) =>
      ledger.emit('ledger.governance.assumption_added', {
        assumptionContent: content,
        assumptionSource: source,
        assumptionRationale: rationale,
      }),

    onLearningExtracted: (type: string, content: string) =>
      ledger.emit('ledger.learning.extracted', {
        learningType: type,
        learningContent: content,
      }),
  };
}
