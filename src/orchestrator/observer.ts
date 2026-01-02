/**
 * Task Observer - Background watchdog for task health
 *
 * Features:
 * - Periodic observation loop
 * - Adaptive intervals based on task complexity
 * - Timeout detection with auto-retry
 * - Stuck task detection via heartbeat
 * - Session cleanup
 * - LEDGER.md sync on task state changes
 */

import { TaskRegistry, RegistryTask, getTaskRegistry } from './task-registry';
import { loadLedger, saveLedger, addLearning } from './ledger';
import { getDurableStream } from '../durable-stream';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('observer');

// ============================================================================
// Types
// ============================================================================

export interface ObserverConfig {
  /** Base check interval (default: 30s for low, scales up for high complexity) */
  baseIntervalMs: number;
  /** Max interval for high complexity tasks */
  maxIntervalMs: number;
  /** Threshold for detecting stuck tasks */
  stuckThresholdMs: number;
  /** Path to LEDGER.md */
  ledgerPath?: string;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface ObserverStats {
  checksPerformed: number;
  tasksRetried: number;
  tasksCompleted: number;
  tasksFailed: number;
  lastCheck?: number;
}

import type { PluginInput } from '@opencode-ai/plugin';

type OpenCodeClient = PluginInput['client'];

// ============================================================================
// Task Observer
// ============================================================================

export class TaskObserver {
  private registry: TaskRegistry;
  private client: OpenCodeClient;
  private config: ObserverConfig;
  private intervalId?: ReturnType<typeof setInterval>;
  private stats: ObserverStats;
  private isRunning: boolean = false;
  private unsubscribeAgentSpawned?: () => void;
  private unsubscribeAgentCompleted?: () => void;
  private unsubscribeAgentFailed?: () => void;

  constructor(
    registry: TaskRegistry,
    client: OpenCodeClient,
    config: Partial<ObserverConfig> = {}
  ) {
    this.registry = registry;
    this.client = client;
    this.config = {
      baseIntervalMs: config.baseIntervalMs ?? 30000, // 30s
      maxIntervalMs: config.maxIntervalMs ?? 120000, // 2min
      stuckThresholdMs: config.stuckThresholdMs ?? 30000, // 30s
      ledgerPath: config.ledgerPath,
      verbose: config.verbose ?? false,
    };
    this.stats = {
      checksPerformed: 0,
      tasksRetried: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    };
  }

  /**
   * Start the observation loop
   */
  start(): void {
    if (this.isRunning) {
      log.info('Already running');
      return;
    }

    this.isRunning = true;
    this.setupEventSubscriptions();
    this.scheduleNextCheck();
    log.info('Started task observation');
  }

  /**
   * Setup event subscriptions for durable stream
   */
  private setupEventSubscriptions(): void {
    const durableStream = getDurableStream();

    this.unsubscribeAgentSpawned = durableStream.subscribe('agent.spawned', (event) => {
      if (this.config.verbose) {
        log.info(
          { agent: (event.payload as any).agent, sessionId: (event.payload as any).id },
          'Agent spawned'
        );
      }
    });

    this.unsubscribeAgentCompleted = durableStream.subscribe('agent.completed', (event) => {
      if (this.config.verbose) {
        log.info(
          { agent: event.actor, sessionId: (event.payload as any).intent_id },
          'Agent completed'
        );
      }
    });

    this.unsubscribeAgentFailed = durableStream.subscribe('agent.failed', (event) => {
      log.warn(
        {
          agent: event.actor,
          sessionId: (event.payload as any).intent_id,
          error: (event.payload as any).error,
        },
        'Agent failed'
      );
    });
  }

  /**
   * Stop the observation loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }

    this.unsubscribeAgentSpawned?.();
    this.unsubscribeAgentCompleted?.();
    this.unsubscribeAgentFailed?.();

    this.unsubscribeAgentSpawned = undefined;
    this.unsubscribeAgentCompleted = undefined;
    this.unsubscribeAgentFailed = undefined;

    this.isRunning = false;
    log.info('Stopped task observation');
  }

  /**
   * Get observation statistics
   */
  getStats(): ObserverStats {
    return { ...this.stats };
  }

  /**
   * Manually trigger a observation check
   */
  async checkNow(): Promise<void> {
    await this.observe();
  }

  /**
   * Force retry a specific task (used by task_retry tool)
   */
  async forceRetry(taskId: string): Promise<boolean> {
    const task = this.registry.getTask(taskId);
    if (!task) {
      log.warn({ taskId }, 'Cannot force retry: Task not found');
      return false;
    }

    if (task.status !== 'failed' && task.status !== 'timeout') {
      log.warn({ taskId, status: task.status }, 'Cannot force retry: Task is not in failed state');
      return false;
    }

    log.info({ taskId }, 'Forcing retry for task');
    await this.retryTask(task);
    return true;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Schedule next observation check with adaptive interval
   */
  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    const interval = this.calculateAdaptiveInterval();

    this.intervalId = setTimeout(async () => {
      try {
        await this.observe();
      } catch (err) {
        log.error({ err }, 'Error during observation check');
      } finally {
        // Always reschedule if still running, even if there was an error
        this.scheduleNextCheck();
      }
    }, interval);
  }

  /**
   * Calculate adaptive interval based on running task complexity
   */
  private calculateAdaptiveInterval(): number {
    const runningTasks = this.registry.getTasksByStatus('running');

    if (runningTasks.length === 0) {
      return this.config.maxIntervalMs; // No tasks, check less frequently
    }

    // Find highest complexity
    const hasHighComplexity = runningTasks.some((t) => t.complexity === 'high');
    const hasMediumComplexity = runningTasks.some((t) => t.complexity === 'medium');

    if (hasHighComplexity) {
      return this.config.maxIntervalMs; // 2 min for complex tasks
    } else if (hasMediumComplexity) {
      return (this.config.baseIntervalMs + this.config.maxIntervalMs) / 2; // 1 min
    } else {
      return this.config.baseIntervalMs; // 30s for simple tasks
    }
  }

  /**
   * Main observation loop
   */
  private async observe(): Promise<void> {
    this.stats.checksPerformed++;
    this.stats.lastCheck = Date.now();

    if (this.config.verbose) {
      log.info('Running observation check...');
    }

    try {
      const timedOut = this.registry.getTimedOutTasks();
      for (const task of timedOut) {
        log.warn({ taskId: task.id, timeoutMs: task.timeoutMs }, 'Task timed out');
        await this.handleTimeout(task);
      }

      const stuck = this.registry.getStuckTasks(this.config.stuckThresholdMs);
      for (const task of stuck) {
        log.warn({ taskId: task.id }, 'Task appears stuck');
        await this.handleStuck(task);
      }

      // 3. Poll running tasks for completion
      const running = this.registry.getTasksByStatus('running');
      for (const task of running) {
        await this.checkTaskStatus(task);
      }

      this.registry.cleanup();
    } catch (err) {
      log.error({ err }, 'Error during observation');
    }
  }

  /**
   * Handle a timed-out task
   */
  private async handleTimeout(task: RegistryTask): Promise<void> {
    if (task.retryCount < task.maxRetries) {
      log.info(
        { taskId: task.id, attempt: task.retryCount + 1, maxRetries: task.maxRetries },
        'Retrying task'
      );
      await this.retryTask(task);
    } else {
      log.error({ taskId: task.id, maxRetries: task.maxRetries }, 'Task failed after max retries');
      await this.registry.updateStatus(
        task.id,
        'timeout',
        undefined,
        'Timeout: max retries exceeded'
      );
      this.stats.tasksFailed++;

      await this.recordLearning(
        'antiPattern',
        `Task "${task.agentName}" timed out after ${task.maxRetries} retries`
      );

      await this.cleanupSession(task.sessionId);
    }
  }

  /**
   * Handle a stuck task
   */
  private async handleStuck(task: RegistryTask): Promise<void> {
    // First, check if the session is actually still running
    const isIdle = await this.isSessionIdle(task.sessionId);

    if (isIdle) {
      log.info({ taskId: task.id }, 'Task session is idle, fetching result');
      await this.fetchTaskResult(task);
      return;
    }

    log.warn({ taskId: task.id }, 'CoS Step-in: Task stuck. Pausing epic.');

    await this.registry.updateStatus(task.id, 'stale', undefined, 'Task stuck (no heartbeat)');

    if (this.config.ledgerPath) {
      try {
        const ledger = await loadLedger(this.config.ledgerPath);
        if (ledger.epic) {
          ledger.epic.status = 'paused';
          ledger.meta.status = 'paused';
          ledger.epic.progressLog.push(
            `[${new Date().toISOString()}] CoS Intervention: Task ${task.id} timed out (no heartbeat). Pausing epic.`
          );
          await saveLedger(ledger, this.config.ledgerPath);
          log.info({ taskId: task.id }, 'Epic paused due to stuck task');
        }
      } catch (err) {
        log.error({ err }, 'Failed to pause epic in LEDGER');
      }
    }

    try {
      const stream = getDurableStream();
      await stream.append({
        type: 'checkpoint.requested',
        stream_id: task.sessionId,
        correlation_id: stream.getCorrelationId(),
        actor: 'observer',
        payload: {
          taskId: task.id,
          reason: 'heartbeat_timeout',
          message: `Task ${task.id} (${task.agentName}) has stopped sending heartbeats. Epic paused for intervention.`,
        },
        metadata: { sourceAgent: 'observer' },
      });
    } catch (err) {
      log.error({ err }, 'Failed to emit intervention event');
    }
  }

  /**
   * Retry a failed/stuck task
   */
  private async retryTask(task: RegistryTask): Promise<void> {
    const retryCount = this.registry.incrementRetry(task.id);
    this.stats.tasksRetried++;

    try {
      // Create new session for retry
      const newSession = await this.client.session.create({
        body: {
          parentID: task.parentSessionId,
          title: `Retry ${retryCount}: ${task.agentName}`,
        },
      });

      if (newSession.error || !newSession.data) {
        const errorMsg =
          newSession.error && typeof newSession.error === 'object' && 'message' in newSession.error
            ? (newSession.error as { message: string }).message
            : 'Failed to create session';
        throw new Error(errorMsg);
      }

      // Update registry with new session
      this.registry.updateSessionId(task.id, newSession.data.id);

      // Trigger the prompt
      await this.client.session.prompt({
        path: { id: newSession.data.id },
        body: {
          agent: task.agentName,
          parts: [{ type: 'text', text: task.prompt }],
        },
      });

      log.info({ taskId: task.id, sessionId: newSession.data.id }, 'Task retried with new session');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ taskId: task.id, error: errorMessage }, 'Retry failed for task');
      await this.registry.updateStatus(
        task.id,
        'failed',
        undefined,
        `Retry failed: ${errorMessage}`
      );
      this.stats.tasksFailed++;
    }
  }

  /**
   * Check if a session is idle
   */
  private async isSessionIdle(sessionId: string): Promise<boolean> {
    try {
      const statusResult = await this.client.session.status();
      const sessionStatus = statusResult.data?.[sessionId];
      return !sessionStatus || sessionStatus.type === 'idle';
    } catch {
      return true; // Assume idle on error
    }
  }

  /**
   * Check the status of a running task
   */
  private async checkTaskStatus(task: RegistryTask): Promise<void> {
    try {
      const isIdle = await this.isSessionIdle(task.sessionId);

      if (isIdle) {
        await this.fetchTaskResult(task);
      }
    } catch (err: any) {
      log.error({ taskId: task.id, error: err.message }, 'Error checking task');
    }
  }

  /**
   * Fetch the result of a completed task
   */
  private async fetchTaskResult(task: RegistryTask): Promise<void> {
    try {
      const messages = await this.client.session.messages({
        path: { id: task.sessionId },
      });

      const lastMsg = messages.data
        ?.filter((m) => m.info?.role === 'assistant')
        .sort((a, b) => (b.info?.time?.created || 0) - (a.info?.time?.created || 0))[0];

      const result =
        lastMsg?.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n') || 'No response';

      await this.registry.updateStatus(task.id, 'completed', result);
      this.stats.tasksCompleted++;
      log.info({ taskId: task.id }, 'Task completed');

      // Record pattern if successful
      if (result && result.length > 0) {
        await this.recordLearning('pattern', `${task.agentName}: Task completed successfully`);
      }

      // Cleanup session after successful completion (v4.1 Physical Resource Management)
      await this.cleanupSession(task.sessionId);
    } catch (err: any) {
      log.error({ taskId: task.id, error: err.message }, 'Failed to fetch result for task');
      await this.registry.updateStatus(
        task.id,
        'failed',
        undefined,
        `Failed to fetch result: ${err.message}`
      );
      this.stats.tasksFailed++;
    }
  }

  /**
   * Record a learning to LEDGER
   */
  private async recordLearning(type: 'pattern' | 'antiPattern', content: string): Promise<void> {
    if (!this.config.ledgerPath) return;

    try {
      const ledger = await loadLedger(this.config.ledgerPath);
      addLearning(ledger, type, `[Observer] ${content}`);
      await saveLedger(ledger, this.config.ledgerPath);
    } catch (error) {
      log.error({ error }, 'Failed to record learning');
    }
  }

  /**
   * Cleanup a session (mark as abandoned and physically delete)
   * Only deletes if session is not actively running (idle, completed, or already deleted)
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    try {
      // Check session status before attempting deletion (v4.1 Safety Check)
      const statusResult = await this.client.session.status();
      const sessionStatus = statusResult.data?.[sessionId];

      if (sessionStatus?.type === 'busy') {
        log.warn({ sessionId }, 'Session is still active (busy), cannot cleanup');
        return;
      }

      if (!sessionStatus) {
        log.info({ sessionId }, 'Session not in status (already deleted), skipping');
        return;
      }

      await this.client.session.delete({ path: { id: sessionId } });
      log.info({ sessionId }, 'Physically deleted session');
    } catch (error) {
      log.error({ sessionId, error }, 'Failed to delete session');
      log.info({ sessionId }, 'Marked session for cleanup (soft delete)');
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalObserver: TaskObserver | null = null;

export function getTaskObserver(
  client: OpenCodeClient,
  config?: Partial<ObserverConfig>
): TaskObserver {
  if (!globalObserver) {
    const registry = getTaskRegistry({
      ledgerPath: config?.ledgerPath,
      syncToLedger: true,
    });
    globalObserver = new TaskObserver(registry, client, config);
  }
  return globalObserver;
}

export function startTaskObservation(
  client: OpenCodeClient,
  config?: Partial<ObserverConfig>
): TaskObserver {
  const observer = getTaskObserver(client, config);
  observer.start();
  return observer;
}

export function stopTaskObservation(): void {
  if (globalObserver) {
    globalObserver.stop();
    globalObserver = null;
  }
}
