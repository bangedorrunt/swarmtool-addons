/**
 * Task Registry - Tracks delegated sub-tasks with LEDGER.md integration
 *
 * Features:
 * - Register tasks with unique IDs
 * - Track status: pending → running → completed/failed/timeout
 * - Detect timed-out and stuck tasks
 * - Sync with LEDGER.md for persistence
 */

import {
    loadLedger,
    saveLedger,
    updateTaskStatus as updateLedgerTaskStatus,
    Ledger,
    Task as LedgerTask,
} from './ledger';

// ============================================================================
// Types
// ============================================================================

export type RegistryTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'blocked';

export interface RegistryTask {
    id: string;                    // Unique task ID (format: epicId.taskNum)
    sessionId: string;             // OpenCode session ID
    agentName: string;             // Target agent
    prompt: string;                // Original prompt
    status: RegistryTaskStatus;
    createdAt: number;             // Timestamp
    startedAt?: number;            // When it started executing
    completedAt?: number;          // When it finished
    result?: string;               // Result text (if completed)
    error?: string;                // Error message (if failed)
    retryCount: number;            // How many times we've retried
    maxRetries: number;            // Max retry attempts
    timeoutMs: number;             // Timeout duration
    parentSessionId?: string;      // Coordinator's session
    ledgerTaskId?: string;         // Link to LEDGER task (if any)
    complexity?: 'low' | 'medium' | 'high'; // For adaptive supervision
    lastHeartbeat?: number;        // Last heartbeat timestamp
}

export interface TaskRegistryOptions {
    ledgerPath?: string;           // Path to LEDGER.md
    syncToLedger?: boolean;        // Whether to sync status to LEDGER
}

// ============================================================================
// Task Registry
// ============================================================================

export class TaskRegistry {
    private tasks: Map<string, RegistryTask> = new Map();
    private ledgerPath?: string;
    private syncToLedger: boolean;

    constructor(options: TaskRegistryOptions = {}) {
        this.ledgerPath = options.ledgerPath;
        this.syncToLedger = options.syncToLedger ?? true;
    }

    /**
     * Register a new task
     */
    async register(task: Omit<RegistryTask, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<string> {
        // Generate ID based on LEDGER task ID or random
        const id = task.ledgerTaskId || `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

        const registryTask: RegistryTask = {
            ...task,
            id,
            status: 'pending',
            createdAt: Date.now(),
            retryCount: 0,
        };

        this.tasks.set(id, registryTask);
        console.log(`[TaskRegistry] Registered task: ${id} → ${task.agentName}`);

        return id;
    }

    /**
     * Update task status (with optional LEDGER sync)
     */
    async updateStatus(
        taskId: string,
        status: RegistryTaskStatus,
        result?: string,
        error?: string
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            console.warn(`[TaskRegistry] Task not found: ${taskId}`);
            return;
        }

        const previousStatus = task.status;
        task.status = status;

        if (result) task.result = result;
        if (error) task.error = error;

        if (status === 'running' && !task.startedAt) {
            task.startedAt = Date.now();
        }

        if (status === 'completed' || status === 'failed' || status === 'timeout') {
            task.completedAt = Date.now();
        }

        console.log(`[TaskRegistry] Task ${taskId}: ${previousStatus} → ${status}`);

        // Sync to LEDGER if enabled and task is linked
        if (this.syncToLedger && task.ledgerTaskId && this.ledgerPath) {
            await this.syncTaskToLedger(task);
        }
    }

    /**
     * Record heartbeat from a running task
     */
    heartbeat(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.lastHeartbeat = Date.now();
        }
    }

    /**
     * Increment retry count
     */
    incrementRetry(taskId: string): number {
        const task = this.tasks.get(taskId);
        if (!task) return 0;

        task.retryCount++;
        return task.retryCount;
    }

    /**
     * Update session ID (for retries with new session)
     */
    updateSessionId(taskId: string, newSessionId: string): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.sessionId = newSessionId;
            task.startedAt = Date.now();
            task.status = 'running';
        }
    }

    /**
     * Get a task by ID
     */
    getTask(taskId: string): RegistryTask | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * Get all tasks with a specific status
     */
    getTasksByStatus(status: RegistryTaskStatus): RegistryTask[] {
        return Array.from(this.tasks.values()).filter((t) => t.status === status);
    }

    /**
     * Get all tasks
     */
    getAllTasks(): RegistryTask[] {
        return Array.from(this.tasks.values());
    }

    /**
     * Get tasks that have exceeded their timeout
     */
    getTimedOutTasks(): RegistryTask[] {
        const now = Date.now();
        return Array.from(this.tasks.values()).filter((task) => {
            if (task.status !== 'running') return false;
            const elapsed = now - (task.startedAt || task.createdAt);
            return elapsed > task.timeoutMs;
        });
    }

    /**
     * Get tasks that appear stuck (no heartbeat in X seconds)
     */
    getStuckTasks(stuckThresholdMs: number = 30000): RegistryTask[] {
        const now = Date.now();
        return Array.from(this.tasks.values()).filter((task) => {
            if (task.status !== 'running') return false;

            // Use heartbeat if available, otherwise startedAt
            const lastActivity = task.lastHeartbeat || task.startedAt || task.createdAt;
            return now - lastActivity > stuckThresholdMs;
        });
    }

    /**
     * Get tasks that can be retried
     */
    getRetriableTasks(): RegistryTask[] {
        return Array.from(this.tasks.values()).filter((task) => {
            const isFailedOrTimeout = task.status === 'failed' || task.status === 'timeout';
            return isFailedOrTimeout && task.retryCount < task.maxRetries;
        });
    }

    /**
     * Clean up completed/failed tasks older than threshold
     */
    cleanup(maxAgeMs: number = 3600000): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, task] of this.tasks) {
            if (task.status === 'completed' || task.status === 'failed') {
                const age = now - (task.completedAt || task.createdAt);
                if (age > maxAgeMs) {
                    this.tasks.delete(id);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            console.log(`[TaskRegistry] Cleaned up ${cleaned} old tasks`);
        }

        return cleaned;
    }

    /**
     * Get summary statistics
     */
    getSummary(): {
        total: number;
        pending: number;
        running: number;
        completed: number;
        failed: number;
        timeout: number;
    } {
        const tasks = this.getAllTasks();
        return {
            total: tasks.length,
            pending: tasks.filter((t) => t.status === 'pending').length,
            running: tasks.filter((t) => t.status === 'running').length,
            completed: tasks.filter((t) => t.status === 'completed').length,
            failed: tasks.filter((t) => t.status === 'failed').length,
            timeout: tasks.filter((t) => t.status === 'timeout').length,
        };
    }

    /**
     * Sync task status to LEDGER.md
     */
    private async syncTaskToLedger(task: RegistryTask): Promise<void> {
        if (!task.ledgerTaskId || !this.ledgerPath) return;

        try {
            const ledger = await loadLedger(this.ledgerPath);

            // Map registry status to ledger status
            const ledgerStatus = this.mapToLedgerStatus(task.status);

            updateLedgerTaskStatus(ledger, task.ledgerTaskId, ledgerStatus, task.result, task.error);

            await saveLedger(ledger, this.ledgerPath);
            console.log(`[TaskRegistry] Synced task ${task.id} to LEDGER`);
        } catch (error) {
            console.error(`[TaskRegistry] Failed to sync to LEDGER:`, error);
        }
    }

    /**
     * Map registry status to ledger status
     */
    private mapToLedgerStatus(
        status: RegistryTaskStatus
    ): 'pending' | 'running' | 'completed' | 'failed' | 'timeout' {
        switch (status) {
            case 'blocked':
                return 'running'; // Blocked is still considered "running" in LEDGER
            default:
                return status as 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
        }
    }

    /**
     * Load tasks from LEDGER.md (for crash recovery)
     */
    async loadFromLedger(): Promise<number> {
        if (!this.ledgerPath) return 0;

        try {
            const ledger = await loadLedger(this.ledgerPath);

            if (!ledger.epic) return 0;

            let loaded = 0;
            for (const ledgerTask of ledger.epic.tasks) {
                // Skip completed/failed tasks
                if (ledgerTask.status === 'completed' || ledgerTask.status === 'failed') {
                    continue;
                }

                // Check if already in registry
                if (this.tasks.has(ledgerTask.id)) {
                    continue;
                }

                // Create registry task from ledger task
                const registryTask: RegistryTask = {
                    id: ledgerTask.id,
                    sessionId: '', // Will be set when task starts
                    agentName: ledgerTask.agent,
                    prompt: ledgerTask.title,
                    status: ledgerTask.status as RegistryTaskStatus,
                    createdAt: Date.now(),
                    retryCount: 0,
                    maxRetries: 2,
                    timeoutMs: 60000,
                    ledgerTaskId: ledgerTask.id,
                };

                this.tasks.set(ledgerTask.id, registryTask);
                loaded++;
            }

            if (loaded > 0) {
                console.log(`[TaskRegistry] Loaded ${loaded} tasks from LEDGER`);
            }

            return loaded;
        } catch (error) {
            console.error(`[TaskRegistry] Failed to load from LEDGER:`, error);
            return 0;
        }
    }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalRegistry: TaskRegistry | null = null;

export function getTaskRegistry(options?: TaskRegistryOptions): TaskRegistry {
    if (!globalRegistry) {
        globalRegistry = new TaskRegistry(options);
    }
    return globalRegistry;
}

export function resetTaskRegistry(): void {
    globalRegistry = null;
}
