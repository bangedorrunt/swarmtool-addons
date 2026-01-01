/**
 * Resilient Orchestration Tools
 *
 * New tools for task supervision:
 * - task_status: Check status of delegated tasks
 * - task_aggregate: Aggregate results from multiple tasks
 * - task_heartbeat: Send heartbeat from running task
 * - task_retry: Manually retry a failed task
 */

import { tool } from '@opencode-ai/plugin';
import { getTaskRegistry, RegistryTask, RegistryTaskStatus } from './task-registry';
import { getTaskObserver, startTaskObservation, stopTaskObservation } from './observer';
import { getDurableStream } from '../durable-stream';

// ============================================================================
// Tool Definitions
// ============================================================================

export function createResilienceTools(client: any) {
  const registry = getTaskRegistry();

  return {
    /**
     * Check the status of a delegated task
     */
    task_status: tool({
      description: 'Check the status of a delegated task by ID',
      args: {
        task_id: tool.schema.string().describe('Task ID from skill_agent'),
      },
      async execute(args) {
        const task = registry.getTask(args.task_id);

        if (!task) {
          return JSON.stringify({
            error: 'Task not found',
            task_id: args.task_id,
          });
        }

        const elapsed = Date.now() - task.createdAt;
        const runningFor = task.startedAt ? Date.now() - task.startedAt : 0;

        return JSON.stringify(
          {
            id: task.id,
            status: task.status,
            agent: task.agentName,
            result: task.status === 'completed' ? task.result : undefined,
            error: task.status === 'failed' ? task.error : undefined,
            retryCount: task.retryCount,
            maxRetries: task.maxRetries,
            elapsed_ms: elapsed,
            running_for_ms: runningFor,
            hasResult: !!task.result,
            hasError: !!task.error,
          },
          null,
          2
        );
      },
    }),

    /**
     * Aggregate results from multiple tasks
     */
    task_aggregate: tool({
      description: 'Aggregate results from multiple delegated tasks',
      args: {
        task_ids: tool.schema.array(tool.schema.string()).describe('Array of task IDs'),
        wait_for_completion: tool.schema
          .boolean()
          .optional()
          .default(false)
          .describe('Wait for all tasks to complete (max 30s)'),
      },
      async execute(args) {
        let taskIds = args.task_ids;
        const waitForCompletion = args.wait_for_completion ?? false;

        // Optionally wait for tasks to complete
        if (waitForCompletion) {
          const maxWait = 30000;
          const startTime = Date.now();

          while (Date.now() - startTime < maxWait) {
            const allDone = taskIds.every((id) => {
              const task = registry.getTask(id);
              return task && (task.status === 'completed' || task.status === 'failed');
            });

            if (allDone) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        const results = taskIds.map((id) => {
          const task = registry.getTask(id);
          return {
            id,
            status: task?.status || 'not_found',
            agent: task?.agentName,
            result: task?.result,
            error: task?.error,
            retryCount: task?.retryCount,
          };
        });

        const summary = {
          total: results.length,
          completed: results.filter((r) => r.status === 'completed').length,
          failed: results.filter((r) => r.status === 'failed' || r.status === 'timeout').length,
          running: results.filter((r) => r.status === 'running').length,
          pending: results.filter((r) => r.status === 'pending').length,
          all_done: results.every((r) => r.status === 'completed' || r.status === 'failed'),
          results,
        };

        return JSON.stringify(summary, null, 2);
      },
    }),

    /**
     * Send heartbeat from a running task
     */
    task_heartbeat: tool({
      description:
        'Send heartbeat to indicate task is still alive. Call periodically in long-running tasks.',
      args: {
        task_id: tool.schema.string().describe('Task ID'),
        message: tool.schema.string().describe('Progress message describing current activity'),
        status: tool.schema
          .string()
          .optional()
          .default('running')
          .describe('Current status (running, etc)'),
        progress: tool.schema.number().optional().describe('Progress percentage (0-100)'),
      },
      async execute(args) {
        // 1. Update Registry (keep alive)
        registry.heartbeat(args.task_id);

        // 2. Publish to Durable Stream (progress tracking)
        const durableStream = getDurableStream();
        await durableStream.progressTask(args.task_id, args.message, args.status || 'running');

        return JSON.stringify({
          success: true,
          task_id: args.task_id,
          timestamp: new Date().toISOString(),
          message: args.message,
          next_heartbeat_in_ms: 30000,
        });
      },
    }),

    /**
     * Manually retry a failed task
     */
    task_retry: tool({
      description: 'Manually retry a failed or timed-out task',
      args: {
        task_id: tool.schema.string().describe('Task ID'),
      },
      async execute(args) {
        const task = registry.getTask(args.task_id);

        if (!task) {
          return JSON.stringify({ error: 'Task not found' });
        }

        if (task.status !== 'failed' && task.status !== 'timeout') {
          return JSON.stringify({
            error: `Cannot retry task with status: ${task.status}`,
            hint: 'Only failed or timed-out tasks can be retried',
          });
        }

        try {
          const observer = getTaskObserver(client);

          // Use forceRetry instead of checkNow for explicit retries
          const success = await observer.forceRetry(args.task_id);

          if (!success) {
            return JSON.stringify({
              error: 'Failed to force retry. Task might not be in failed state or not found.',
            });
          }

          return JSON.stringify({
            success: true,
            task_id: args.task_id,
            message: 'Task queued for retry',
            retryCount: task.retryCount + 1,
          });
        } catch (err: any) {
          return JSON.stringify({
            success: false,
            error: err.message,
          });
        }
      },
    }),

    /**
     * Kill/Cancel a running task
     */
    task_kill: tool({
      description: 'Forcefully cancel a running task',
      args: {
        task_id: tool.schema.string().describe('Task ID'),
        reason: tool.schema.string().optional().describe('Reason for cancellation'),
      },
      async execute(args) {
        const task = registry.getTask(args.task_id);

        if (!task) {
          return JSON.stringify({ error: 'Task not found' });
        }

        if (task.status !== 'running' && task.status !== 'pending') {
          return JSON.stringify({
            error: `Cannot kill task in status: ${task.status}`,
            hint: 'Only running or pending tasks can be killed',
          });
        }

        await registry.updateStatus(
          args.task_id,
          'failed',
          undefined,
          `Killed by user/agent: ${args.reason || 'No reason provided'}`
        );

        return JSON.stringify({
          success: true,
          task_id: args.task_id,
          status: 'failed',
          message: 'Task killed successfully',
        });
      },
    }),

    /**
     * Fetch context snapshot for a task (to delegate to new agent)
     */
    task_fetch_context: tool({
      description: 'Get the context snapshot for a task to enable delegation/recovery',
      args: {
        task_id: tool.schema.string().describe('Task ID'),
      },
      async execute(args) {
        const task = registry.getTask(args.task_id);
        if (!task) {
          return JSON.stringify({ error: 'Task not found' });
        }

        const { getDurableStream } = await import('../durable-stream');
        const durableStream = getDurableStream();
        const snapshot = durableStream.getContextSnapshot(task.sessionId);

        if (!snapshot) {
          return JSON.stringify({
            success: false,
            message: 'No snapshot found for this task session',
          });
        }

        // Return a summarized context to avoid blowing up token limits
        // The caller can pass this object to skill_agent's `context` param
        return JSON.stringify(
          {
            success: true,
            task_id: args.task_id,
            context: {
              agentName: snapshot.agentName,
              ledgerPhase: snapshot.ledgerState.phase,
              completedTasks: snapshot.ledgerState.completedTasks,
              memories: snapshot.memories,
              // We don't return the full prompt history here to save tokens
              // The new agent will start fresh but with this context
            },
          },
          null,
          2
        );
      },
    }),

    /**
     * Get observer statistics
     */
    observer_stats: tool({
      description: 'Get task observation statistics',
      args: {},
      async execute() {
        const observer = getTaskObserver(client);
        const stats = observer.getStats();
        const registrySummary = registry.getSummary();

        return JSON.stringify(
          {
            observer: stats,
            registry: registrySummary,
          },
          null,
          2
        );
      },
    }),

    /**
     * Start/stop observer
     */
    observer_control: tool({
      description: 'Start or stop the task observer',
      args: {
        action: tool.schema.enum(['start', 'stop']).describe('Action to perform'),
      },
      async execute(args) {
        if (args.action === 'start') {
          startTaskObservation(client, { verbose: true });
          return JSON.stringify({
            success: true,
            message: 'Task observer started',
          });
        } else {
          stopTaskObservation();
          return JSON.stringify({
            success: true,
            message: 'Task observer stopped',
          });
        }
      },
    }),

    /**
     * List all tasks
     */
    task_list: tool({
      description: 'List all tracked tasks',
      args: {
        status: tool.schema
          .enum(['all', 'pending', 'running', 'completed', 'failed', 'timeout'])
          .optional()
          .default('all')
          .describe('Filter by status'),
        limit: tool.schema.number().optional().default(10).describe('Max tasks to return'),
      },
      async execute(args) {
        const filterStatus = args.status || 'all';
        const limit = args.limit || 10;

        let tasks: RegistryTask[];
        if (filterStatus === 'all') {
          tasks = registry.getAllTasks();
        } else {
          tasks = registry.getTasksByStatus(filterStatus as RegistryTaskStatus);
        }

        // Sort by createdAt desc
        tasks.sort((a, b) => b.createdAt - a.createdAt);

        // Limit
        tasks = tasks.slice(0, limit);

        const summary = registry.getSummary();

        return JSON.stringify(
          {
            summary,
            tasks: tasks.map((t) => ({
              id: t.id,
              agent: t.agentName,
              status: t.status,
              retryCount: t.retryCount,
              elapsed_ms: Date.now() - t.createdAt,
              hasResult: !!t.result,
              hasError: !!t.error,
            })),
          },
          null,
          2
        );
      },
    }),
  };
}

// ============================================================================
// Combined export
// ============================================================================

export const resilienceTools = {
  createResilienceTools,
};
