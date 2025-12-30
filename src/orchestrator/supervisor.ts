/**
 * Task Supervisor - Background watchdog for task health
 *
 * Features:
 * - Periodic supervision loop
 * - Adaptive intervals based on task complexity
 * - Timeout detection with auto-retry
 * - Stuck task detection via heartbeat
 * - Session cleanup
 * - LEDGER.md sync on task state changes
 */

import { TaskRegistry, RegistryTask, getTaskRegistry } from './task-registry';
import {
    loadLedger,
    saveLedger,
    updateTaskStatus as updateLedgerTaskStatus,
    addLearning,
    Ledger,
} from './ledger';

// ============================================================================
// Types
// ============================================================================

export interface SupervisorConfig {
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

export interface SupervisorStats {
    checksPerformed: number;
    tasksRetried: number;
    tasksCompleted: number;
    tasksFailed: number;
    lastCheck?: number;
}

type OpenCodeClient = {
    session: {
        create: (opts: { body: { parentID?: string; title: string } }) => Promise<{
            error?: { message?: string };
            data?: { id: string };
        }>;
        prompt: (opts: {
            path: { id: string };
            body: { agent: string; parts: Array<{ type: string; text: string }> };
        }) => Promise<void>;
        status: () => Promise<{
            data?: Record<string, { type: string }>;
        }>;
        messages: (opts: { path: { id: string } }) => Promise<{
            data?: Array<{
                info?: { role?: string; time?: { created?: number } };
                parts?: Array<{ type: string; text: string }>;
            }>;
        }>;
    };
};

// ============================================================================
// Task Supervisor
// ============================================================================

export class TaskSupervisor {
    private registry: TaskRegistry;
    private client: OpenCodeClient;
    private config: SupervisorConfig;
    private intervalId?: ReturnType<typeof setInterval>;
    private stats: SupervisorStats;
    private isRunning: boolean = false;

    constructor(
        registry: TaskRegistry,
        client: OpenCodeClient,
        config: Partial<SupervisorConfig> = {}
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
     * Start the supervision loop
     */
    start(): void {
        if (this.isRunning) {
            console.log('[Supervisor] Already running');
            return;
        }

        this.isRunning = true;
        this.scheduleNextCheck();
        console.log('[Supervisor] Started task supervision');
    }

    /**
     * Stop the supervision loop
     */
    stop(): void {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = undefined;
        }
        this.isRunning = false;
        console.log('[Supervisor] Stopped task supervision');
    }

    /**
     * Get supervision statistics
     */
    getStats(): SupervisorStats {
        return { ...this.stats };
    }

    /**
     * Manually trigger a supervision check
     */
    async checkNow(): Promise<void> {
        await this.supervise();
    }

    // ============================================================================
    // Private Methods
    // ============================================================================

    /**
     * Schedule next supervision check with adaptive interval
     */
    private scheduleNextCheck(): void {
        if (!this.isRunning) return;

        const interval = this.calculateAdaptiveInterval();

        this.intervalId = setTimeout(async () => {
            await this.supervise();
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
     * Main supervision loop
     */
    private async supervise(): Promise<void> {
        this.stats.checksPerformed++;
        this.stats.lastCheck = Date.now();

        if (this.config.verbose) {
            console.log('[Supervisor] Running supervision check...');
        }

        try {
            // 1. Check for timed-out tasks
            const timedOut = this.registry.getTimedOutTasks();
            for (const task of timedOut) {
                console.warn(`[Supervisor] Task ${task.id} timed out after ${task.timeoutMs}ms`);
                await this.handleTimeout(task);
            }

            // 2. Check for stuck tasks (no heartbeat)
            const stuck = this.registry.getStuckTasks(this.config.stuckThresholdMs);
            for (const task of stuck) {
                console.warn(`[Supervisor] Task ${task.id} appears stuck`);
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
            console.error('[Supervisor] Error during supervision:', error);
        }
    }

    /**
     * Handle a timed-out task
     */
    private async handleTimeout(task: RegistryTask): Promise<void> {
        if (task.retryCount < task.maxRetries) {
            // Retry the task
            console.log(
                `[Supervisor] Retrying task ${task.id} (attempt ${task.retryCount + 1}/${task.maxRetries})`
            );
            await this.retryTask(task);
        } else {
            // Mark as failed and cleanup
            console.error(`[Supervisor] Task ${task.id} failed after ${task.maxRetries} retries`);
            await this.registry.updateStatus(task.id, 'timeout', undefined, 'Timeout: max retries exceeded');
            this.stats.tasksFailed++;

            // Add as anti-pattern to LEDGER
            await this.recordLearning('antiPattern', `Task "${task.agentName}" timed out after ${task.maxRetries} retries`);

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
            console.log(`[Supervisor] Task ${task.id} session is idle, fetching result`);
            await this.fetchTaskResult(task);
            return;
        }

        // Session is running but no heartbeat - truly stuck
        console.log(`[Supervisor] Killing stuck session ${task.sessionId}`);
        await this.cleanupSession(task.sessionId);

        if (task.retryCount < task.maxRetries) {
            await this.retryTask(task);
        } else {
            await this.registry.updateStatus(task.id, 'failed', undefined, 'Task stuck, max retries exceeded');
            this.stats.tasksFailed++;
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
                throw new Error(newSession.error?.message || 'Failed to create session');
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

            console.log(`[Supervisor] Task ${task.id} retried with new session ${newSession.data.id}`);
        } catch (err: any) {
            console.error(`[Supervisor] Retry failed for task ${task.id}:`, err.message);
            await this.registry.updateStatus(task.id, 'failed', undefined, `Retry failed: ${err.message}`);
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
            console.error(`[Supervisor] Error checking task ${task.id}:`, err.message);
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
                lastMsg?.parts?.filter((p) => p.type === 'text').map((p) => p.text).join('\n') ||
                'No response';

            await this.registry.updateStatus(task.id, 'completed', result);
            this.stats.tasksCompleted++;
            console.log(`[Supervisor] Task ${task.id} completed`);

            // Record pattern if successful
            if (result && result.length > 0) {
                await this.recordLearning('pattern', `${task.agentName}: Task completed successfully`);
            }
        } catch (err: any) {
            console.error(`[Supervisor] Failed to fetch result for task ${task.id}:`, err.message);
            await this.registry.updateStatus(task.id, 'failed', undefined, `Failed to fetch result: ${err.message}`);
            this.stats.tasksFailed++;
        }
    }

    /**
     * Record a learning to LEDGER
     */
    private async recordLearning(
        type: 'pattern' | 'antiPattern',
        content: string
    ): Promise<void> {
        if (!this.config.ledgerPath) return;

        try {
            const ledger = await loadLedger(this.config.ledgerPath);
            addLearning(ledger, type, `[Supervisor] ${content}`);
            await saveLedger(ledger, this.config.ledgerPath);
        } catch (error) {
            console.error('[Supervisor] Failed to record learning:', error);
        }
    }

    /**
     * Cleanup a session (mark as abandoned)
     */
    private async cleanupSession(sessionId: string): Promise<void> {
        // OpenCode SDK doesn't have session.delete()
        // We just log it for now
        console.log(`[Supervisor] Marked session ${sessionId} for cleanup`);
        // Future: If SDK adds session.delete(), call it here
    }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalSupervisor: TaskSupervisor | null = null;

export function getTaskSupervisor(
    client: OpenCodeClient,
    config?: Partial<SupervisorConfig>
): TaskSupervisor {
    if (!globalSupervisor) {
        const registry = getTaskRegistry({
            ledgerPath: config?.ledgerPath,
            syncToLedger: true,
        });
        globalSupervisor = new TaskSupervisor(registry, client, config);
    }
    return globalSupervisor;
}

export function startTaskSupervision(
    client: OpenCodeClient,
    config?: Partial<SupervisorConfig>
): TaskSupervisor {
    const supervisor = getTaskSupervisor(client, config);
    supervisor.start();
    return supervisor;
}

export function stopTaskSupervision(): void {
    if (globalSupervisor) {
        globalSupervisor.stop();
        globalSupervisor = null;
    }
}
