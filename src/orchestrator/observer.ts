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
      console.log('[Observer] Already running');
      return;
    }

    this.isRunning = true;
    this.setupEventSubscriptions();
    this.scheduleNextCheck();
    console.log('[Observer] Started task observation');
  }

  /**
   * Setup event subscriptions for durable stream
   */
  private setupEventSubscriptions(): void {
    const durableStream = getDurableStream();

    this.unsubscribeAgentSpawned = durableStream.subscribe('agent.spawned', (event) => {
      if (this.config.verbose) {
        console.log(
          `[Observer] Agent spawned: ${(event.payload as any).agent} in session ${(event.payload as any).id}`
        );
      }
    });

    this.unsubscribeAgentCompleted = durableStream.subscribe('agent.completed', (event) => {
      if (this.config.verbose) {
        console.log(
          `[Observer] Agent completed: ${event.actor} in session ${(event.payload as any).intent_id}`
        );
      }
    });

    this.unsubscribeAgentFailed = durableStream.subscribe('agent.failed', (event) => {
      console.warn(
        `[Observer] Agent failed: ${event.actor} in session ${(event.payload as any).intent_id}`
      );
      if ((event.payload as any).error) {
        console.warn(`[Observer] Error: ${JSON.stringify((event.payload as any).error)}`);
      }
    });
  }

  /**
   * Stop the observation loop
   */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }

    this.unsubscribeAgentSpawned?.();
    this.unsubscribeAgentCompleted?.();
    this.unsubscribeAgentFailed?.();

    this.isRunning = false;
    console.log('[Observer] Stopped task observation');
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
      console.warn(`[Observer] Cannot force retry: Task ${taskId} not found`);
      return false;
    }

    if (task.status !== 'failed' && task.status !== 'timeout') {
      console.warn(`[Observer] Cannot force retry: Task ${taskId} is not in failed state`);
      return false;
    }

    console.log(`[Observer] Forcing retry for task ${taskId}`);
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
      await this.observe();
      this.scheduleNextCheck();
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
      console.log('[Observer] Running observation check...');
    }

    try {
      // 1. Check for timed-out tasks
      const timedOut = this.registry.getTimedOutTasks();
      for (const task of timedOut) {
        console.warn(`[Observer] Task ${task.id} timed out after ${task.timeoutMs}ms`);
        await this.handleTimeout(task);
      }

      // 2. Check for stuck tasks (no heartbeat)
      const stuck = this.registry.getStuckTasks(this.config.stuckThresholdMs);
      for (const task of stuck) {
        console.warn(`[Observer] Task ${task.id} appears stuck`);
        await this.handleStuck(task);
      }

      // 3. Poll running tasks for completion
      const running = this.registry.getTasksByStatus('running');
      for (const task of running) {
        await this.checkTaskStatus(task);
      }

      // 4. Cleanup old completed/failed tasks
      this.registry.cleanup();
    } catch (error) {
      console.error('[Observer] Error during observation:', error);
    }
  }

  /**
   * Handle a timed-out task
   */
  private async handleTimeout(task: RegistryTask): Promise<void> {
    if (task.retryCount < task.maxRetries) {
      // Retry the task
      console.log(
        `[Observer] Retrying task ${task.id} (attempt ${task.retryCount + 1}/${task.maxRetries})`
      );
      await this.retryTask(task);
    } else {
      // Mark as failed and cleanup
      console.error(`[Observer] Task ${task.id} failed after ${task.maxRetries} retries`);
      await this.registry.updateStatus(
        task.id,
        'timeout',
        undefined,
        'Timeout: max retries exceeded'
      );
      this.stats.tasksFailed++;

      // Add as anti-pattern to LEDGER
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
      // Session is idle but we never got the result - try to fetch it
      console.log(`[Observer] Task ${task.id} session is idle, fetching result`);
      await this.fetchTaskResult(task);
      return;
    }

    // Session is running but no heartbeat - CoS Step-in required
    console.warn(`[Observer] CoS Step-in: Task ${task.id} stuck. Pausing epic.`);

    // 1. Mark task as stale
    await this.registry.updateStatus(task.id, 'stale', undefined, 'Task stuck (no heartbeat)');

    // 2. Pause Epic in LEDGER
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
          console.log(`[Observer] Epic paused due to stuck task ${task.id}`);
        }
      } catch (err) {
        console.error('[Observer] Failed to pause epic in LEDGER:', err);
      }
    }

    // 3. Emit human intervention event
    try {
      const stream = getDurableStream();
      await stream.append({
        type: 'checkpoint.requested', // Map legacy human.intervention to checkpoint.requested? Or add custom type
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
      console.error('[Observer] Failed to emit intervention event:', err);
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

      console.log(`[Observer] Task ${task.id} retried with new session ${newSession.data.id}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[Observer] Retry failed for task ${task.id}:`, errorMessage);
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
      console.error(`[Observer] Error checking task ${task.id}:`, err.message);
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
      console.log(`[Observer] Task ${task.id} completed`);

      // Record pattern if successful
      if (result && result.length > 0) {
        await this.recordLearning('pattern', `${task.agentName}: Task completed successfully`);
      }
    } catch (err: any) {
      console.error(`[Observer] Failed to fetch result for task ${task.id}:`, err.message);
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
      console.error('[Observer] Failed to record learning:', error);
    }
  }

  /**
   * Cleanup a session (mark as abandoned)
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    // OpenCode SDK doesn't have session.delete()
    // We just log it for now
    console.log(`[Observer] Marked session ${sessionId} for cleanup`);
    // Future: If SDK adds session.delete(), call it here
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
