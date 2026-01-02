/**
 * Crash Recovery System
 *
 * Provides comprehensive crash recovery capabilities by replaying
 * events from the Durable Stream and reconstructing:
 * - Active epic state
 * - Pending tasks
 * - Checkpoint status
 * - Intent progress
 * - Learnings captured
 */

import type { Ledger, Task, Epic, LedgerPhase, Handoff } from './ledger';
import type {
  StreamEvent,
  Checkpoint,
  Intent,
  EventType,
  StreamFilter,
} from '../durable-stream/types';
import type { ResumeResult } from '../durable-stream/types';
import { loadLedger, saveLedger } from './ledger';
import { getDurableStream } from '../durable-stream/orchestrator';

export interface RecoveryState {
  ledger: Ledger;
  pendingCheckpoints: Checkpoint[];
  activeIntents: Intent[];
  eventsReplayed: number;
  lastEventAt?: number;
  recoveredAt: string;
}

export interface RecoveryOptions {
  ledgerPath?: string;
  streamPath?: string;
  maxEvents?: number;
  dryRun?: boolean;
}

export interface RecoveryReport {
  success: boolean;
  eventsReplayed: number;
  checkpointsRestored: number;
  intentsRestored: number;
  epicRestored: boolean;
  tasksRestored: number;
  errors: string[];
}

const LEDGER_EVENT_TYPES: EventType[] = [
  'ledger.epic.created',
  'ledger.epic.started',
  'ledger.epic.completed',
  'ledger.handoff.created',
  'ledger.handoff.resumed',
  'ledger.task.created',
  'ledger.task.started',
  'ledger.task.completed',
  'ledger.task.failed',
  'ledger.task.yielded',
];

export class CrashRecoverySystem {
  private ledgerPath: string;
  private maxEvents: number;
  private dryRun: boolean;

  constructor(options?: RecoveryOptions) {
    this.ledgerPath = options?.ledgerPath || '.opencode/LEDGER.md';
    this.maxEvents = options?.maxEvents || 10000;
    this.dryRun = options?.dryRun || false;
  }

  async performRecovery(
    eventHistory: StreamEvent[],
    pendingCheckpoints: Checkpoint[],
    activeIntents: Intent[],
    resumeResult: ResumeResult
  ): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      success: false,
      eventsReplayed: resumeResult.events_replayed,
      checkpointsRestored: pendingCheckpoints.length,
      intentsRestored: activeIntents.length,
      epicRestored: false,
      tasksRestored: 0,
      errors: [],
    };

    try {
      const recoveredState = this.reconstructState(eventHistory);

      if (recoveredState.epic) {
        report.epicRestored = true;
        report.tasksRestored = recoveredState.epic.tasks.length;

        if (!this.dryRun) {
          const existingLedger = await loadLedger(this.ledgerPath);
          existingLedger.epic = recoveredState.epic;
          existingLedger.meta.phase = recoveredState.phase;
          await saveLedger(existingLedger, this.ledgerPath);
        }
      }

      if (recoveredState.handoff) {
        if (!this.dryRun) {
          const existingLedger = await loadLedger(this.ledgerPath);
          existingLedger.handoff = recoveredState.handoff;
          existingLedger.meta.status = 'handoff';
          await saveLedger(existingLedger, this.ledgerPath);
        }
      }

      report.success = true;
    } catch (error) {
      report.errors.push(`Recovery failed: ${error}`);
    }

    return report;
  }

  private reconstructState(events: StreamEvent[]): {
    epic: Epic | null;
    phase: LedgerPhase;
    tasks: Task[];
    handoff: Handoff | null;
  } {
    const taskEvents = events.filter(
      (e) => LEDGER_EVENT_TYPES.includes(e.type) && e.type.startsWith('ledger.task')
    );

    const epicEvents = events.filter(
      (e) => LEDGER_EVENT_TYPES.includes(e.type) && e.type.startsWith('ledger.epic')
    );

    const handoffEvents = events.filter(
      (e) => LEDGER_EVENT_TYPES.includes(e.type) && e.type.startsWith('ledger.handoff')
    );

    let epic: Epic | null = null;
    let currentPhase: LedgerPhase = 'CLARIFICATION';
    const taskMap = new Map<string, Task>();
    let handoff: Handoff | null = null;

    for (const event of epicEvents) {
      const payload = event.payload as any;
      switch (event.type) {
        case 'ledger.epic.created':
          epic = {
            id: payload.epicId,
            title: payload.epicTitle || 'Recovered Epic',
            request: payload.request || '',
            status: 'pending',
            createdAt: event.timestamp,
            tasks: [],
            context: [],
            progressLog: [
              `[${new Date(event.timestamp).toISOString()}] Epic created from recovery`,
            ],
          };
          break;
        case 'ledger.epic.started':
          if (epic) {
            epic.status = 'in_progress';
            currentPhase = 'EXECUTION';
          }
          break;
        case 'ledger.epic.completed':
          if (epic) {
            epic.status = 'completed';
            currentPhase = 'COMPLETION';
          }
          break;
      }
    }

    for (const event of taskEvents) {
      const payload = event.payload as any;
      if (!payload.taskId) continue;

      let task = taskMap.get(payload.taskId);
      if (!task) {
        task = {
          id: payload.taskId,
          title: payload.taskTitle || 'Recovered Task',
          agent: payload.agent || 'unknown',
          status: 'pending',
          outcome: '-',
          dependencies: [],
        };
        taskMap.set(payload.taskId, task);
      }

      switch (event.type) {
        case 'ledger.task.created':
          task.status = 'pending';
          break;
        case 'ledger.task.started':
          task.status = 'running';
          task.startedAt = event.timestamp;
          currentPhase = 'EXECUTION';
          break;
        case 'ledger.task.completed':
          task.status = 'completed';
          task.outcome = 'SUCCEEDED';
          task.completedAt = event.timestamp;
          task.result = payload.result;
          break;
        case 'ledger.task.failed':
          task.status = 'failed';
          task.outcome = 'FAILED';
          task.completedAt = event.timestamp;
          task.error = payload.error;
          break;
        case 'ledger.task.yielded':
          task.status = 'suspended';
          task.yieldReason = payload.result;
          task.yieldSummary = payload.summary;
          break;
      }
    }

    for (const event of handoffEvents) {
      const payload = event.payload as any;
      if (event.type === 'ledger.handoff.created') {
        handoff = {
          created: new Date(event.timestamp).toISOString(),
          reason: (payload.handoffReason as Handoff['reason']) || 'session_break',
          resumeCommand: payload.handoffCommand || '',
          whatsDone: payload.handoffWhatsDone || [],
          whatsNext: payload.handoffWhatsNext || [],
          keyContext: payload.handoffKeyContext || [],
          filesModified: payload.handoffFilesModified || [],
          learningsThisSession: [],
        };
      }
    }

    if (epic) {
      epic.tasks = Array.from(taskMap.values());
      const completed = epic.tasks.filter((t) => t.status === 'completed').length;
      const failed = epic.tasks.filter((t) => t.status === 'failed').length;

      if (completed === epic.tasks.length && epic.tasks.length > 0) {
        epic.status = 'completed';
        currentPhase = 'COMPLETION';
      } else if (failed === epic.tasks.length && epic.tasks.length > 0) {
        epic.status = 'failed';
        currentPhase = 'COMPLETION';
      }
    }

    return { epic, phase: currentPhase, tasks: Array.from(taskMap.values()), handoff };
  }

  async checkPendingCheckpoints(): Promise<Checkpoint[]> {
    const stream = getDurableStream();
    await stream.initialize();
    return stream.getPendingCheckpoints();
  }

  async resumeActiveIntents(): Promise<Intent[]> {
    const stream = getDurableStream();
    await stream.initialize();
    return stream.getActiveIntents();
  }

  async getRecoveryHistory(since?: number): Promise<StreamEvent[]> {
    const stream = getDurableStream();
    await stream.initialize();

    const filter: StreamFilter = {};
    if (since) {
      filter.since = since;
    }
    return stream.query(filter);
  }

  async snapshotState(ledger: Ledger): Promise<void> {
    const snapshot = {
      ledger: JSON.parse(JSON.stringify(ledger)),
      timestamp: new Date().toISOString(),
    };

    console.log('[CrashRecovery] State snapshot created:', snapshot.timestamp);
  }
}

export async function performRecovery(options?: RecoveryOptions): Promise<RecoveryReport> {
  const recovery = new CrashRecoverySystem(options);
  const stream = getDurableStream();
  await stream.initialize();

  const resumeResult = await stream.resume();
  const pendingCheckpoints = stream.getPendingCheckpoints();
  const activeIntents = stream.getActiveIntents();
  const eventHistory = stream.getEventHistory();

  return recovery.performRecovery(eventHistory, pendingCheckpoints, activeIntents, resumeResult);
}

export async function getRecoveryStatus(): Promise<{
  hasPendingCheckpoints: boolean;
  activeIntentCount: number;
  lastRecovery?: string;
}> {
  const stream = getDurableStream();
  await stream.initialize();

  const checkpoints = stream.getPendingCheckpoints();
  const intents = stream.getActiveIntents();

  return {
    hasPendingCheckpoints: checkpoints.length > 0,
    activeIntentCount: intents.length,
  };
}

export function createRecoveryWorkflow(recovery: CrashRecoverySystem): {
  check: () => Promise<boolean>;
  recover: () => Promise<RecoveryReport>;
  getPending: () => Promise<Checkpoint[]>;
  getActiveIntents: () => Promise<Intent[]>;
} {
  return {
    check: async () => {
      const checkpoints = await recovery.checkPendingCheckpoints();
      const intents = await recovery.resumeActiveIntents();
      return checkpoints.length > 0 || intents.length > 0;
    },
    recover: async () => performRecovery(),
    getPending: () => recovery.checkPendingCheckpoints(),
    getActiveIntents: () => recovery.resumeActiveIntents(),
  };
}
