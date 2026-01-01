import { evalite } from 'evalite';
import { TaskRegistry, RegistryTaskStatus } from '../orchestrator/task-registry';

/**
 * Agent Lifecycle Evaluation
 *
 * Simulates:
 * 1. Spawning agents (Registering in TaskRegistry)
 * 2. Monitoring heartbeats and timeouts
 * 3. Handling retries for failed tasks
 */

evalite('Agent Lifecycle: Spawning & Status', {
  data: () => [
    {
      input: {
        agent: 'executor',
        prompt: 'Task 1',
        timeoutMs: 1000,
      },
      expectedStatus: 'pending',
    },
  ],
  task: async (input: any) => {
    const registry = new TaskRegistry({ syncToLedger: false });
    const taskId = await registry.register({
      sessionId: 'sess_123',
      agentName: input.agent,
      prompt: input.prompt,
      maxRetries: 2,
      timeoutMs: input.timeoutMs,
    });

    const task = registry.getTask(taskId);
    return { taskId, status: task?.status };
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      return result.status === ctx?.expectedStatus ? 1 : 0;
    },
  ],
});

evalite('Agent Lifecycle: Timeouts & Stuck Detection', {
  data: () => [
    {
      input: {
        name: 'Detect timed out task',
        taskSetup: {
          status: 'running' as RegistryTaskStatus,
          startedAt: Date.now() - 5000, // 5s ago
          timeoutMs: 2000, // 2s timeout
        },
        expectedTimeout: true,
      },
    },
    {
      input: {
        name: 'Detect stuck task (no heartbeat)',
        taskSetup: {
          status: 'running' as RegistryTaskStatus,
          lastHeartbeat: Date.now() - 40000, // 40s ago
          timeoutMs: 60000,
        },
        expectedStuck: true,
      },
    },
  ],
  task: async (input: any) => {
    const registry = new TaskRegistry({ syncToLedger: false });
    const taskId = await registry.register({
      sessionId: 'sess_123',
      agentName: 'executor',
      prompt: 'test',
      maxRetries: 2,
      timeoutMs: input.taskSetup.timeoutMs,
    });

    const task = registry.getTask(taskId)!;
    // Force set internal fields for testing
    if (input.taskSetup.startedAt) task.startedAt = input.taskSetup.startedAt;
    if (input.taskSetup.status) task.status = input.taskSetup.status;
    if (input.taskSetup.lastHeartbeat) task.lastHeartbeat = input.taskSetup.lastHeartbeat;

    const timedOut = registry.getTimedOutTasks().some((t) => t.id === taskId);
    const stuck = registry.getStuckTasks(30000).some((t) => t.id === taskId);

    return { timedOut, stuck };
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      if (ctx?.input?.expectedTimeout !== undefined) {
        return result.timedOut === ctx.input.expectedTimeout ? 1 : 0;
      }
      if (ctx?.input?.expectedStuck !== undefined) {
        return result.stuck === ctx.input.expectedStuck ? 1 : 0;
      }
      return 1;
    },
  ],
});

evalite('Agent Lifecycle: Retries', {
  data: () => [
    {
      input: {
        name: 'Retry on failure',
        initialRetryCount: 0,
        maxRetries: 2,
        status: 'failed' as RegistryTaskStatus,
        expectedCanRetry: true,
      },
    },
    {
      input: {
        name: 'Exhausted retries',
        initialRetryCount: 2,
        maxRetries: 2,
        status: 'failed' as RegistryTaskStatus,
        expectedCanRetry: false,
      },
    },
  ],
  task: async (input: any) => {
    const registry = new TaskRegistry({ syncToLedger: false });
    const taskId = await registry.register({
      sessionId: 'sess_123',
      agentName: 'executor',
      prompt: 'test',
      maxRetries: input.maxRetries,
      timeoutMs: 60000,
    });

    const task = registry.getTask(taskId)!;
    task.status = input.status;
    task.retryCount = input.initialRetryCount;

    const canRetry = registry.getRetriableTasks().some((t) => t.id === taskId);
    return { canRetry };
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      return result.canRetry === ctx?.input?.expectedCanRetry ? 1 : 0;
    },
  ],
});
