/**
 * LEDGER Tools for skill_agent
 *
 * Tools that expose LEDGER.md functionality to agents:
 * - ledger_status: Get current LEDGER state
 * - ledger_create_epic: Create a new epic
 * - ledger_create_task: Create a task within epic
 * - ledger_update_task: Update task status
 * - ledger_add_learning: Add a learning entry
 * - ledger_get_learnings: Get recent learnings
 */

import { tool } from '@opencode-ai/plugin';
import {
  loadLedger,
  saveLedger,
  createEpic,
  createTask,
  updateTaskStatus,
  addLearning,
  addContext,
  createHandoff,
  archiveEpic,
  getProgress,
  getReadyTasks,
  surfaceLearnings,
  DEFAULT_LEDGER_PATH,
} from './ledger';

// ============================================================================
// Tool Definitions
// ============================================================================

export function createLedgerTools() {
  return {
    /**
     * Get current LEDGER status
     */
    ledger_status: tool({
      description:
        'Get current LEDGER.md status including active epic, progress, and recent learnings',
      args: {},
      async execute() {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        const progress = getProgress(ledger);
        const readyTasks = getReadyTasks(ledger);
        const recentLearnings = surfaceLearnings(ledger);

        return JSON.stringify(
          {
            meta: {
              sessionId: ledger.meta.sessionId,
              status: ledger.meta.status,
              phase: ledger.meta.phase,
              tasksCompleted: ledger.meta.tasksCompleted,
              currentTask: ledger.meta.currentTask,
            },
            epic: ledger.epic
              ? {
                  id: ledger.epic.id,
                  title: ledger.epic.title,
                  status: ledger.epic.status,
                  tasks: ledger.epic.tasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    outcome: t.outcome,
                  })),
                }
              : null,
            progress: {
              total: progress.total,
              completed: progress.completed,
              failed: progress.failed,
              running: progress.running,
              percentComplete: progress.percentComplete,
            },
            readyTasks: readyTasks.map((t) => t.id),
            hasHandoff: !!ledger.handoff,
            learningsCount: {
              patterns: recentLearnings.patterns.length,
              antiPatterns: recentLearnings.antiPatterns.length,
              decisions: recentLearnings.decisions.length,
            },
            archiveCount: ledger.archive.length,
          },
          null,
          2
        );
      },
    }),

    /**
     * Create a new epic
     */
    ledger_create_epic: tool({
      description: 'Create a new epic in LEDGER.md. Only ONE epic can be active at a time.',
      args: {
        title: tool.schema.string().describe('Epic title'),
        request: tool.schema.string().describe('Original user request'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        try {
          const epicId = createEpic(ledger, args.title, args.request);
          await saveLedger(ledger, DEFAULT_LEDGER_PATH);

          return JSON.stringify({
            success: true,
            epicId,
            message: `Created epic: ${epicId} - ${args.title}`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
    }),

    /**
     * Create a task within the current epic
     */
    ledger_create_task: tool({
      description: 'Create a task within the current epic. Max 3 tasks per epic.',
      args: {
        title: tool.schema.string().describe('Task title'),
        agent: tool.schema
          .string()
          .describe('Agent to execute this task (e.g., executor, validator)'),
        dependencies: tool.schema
          .array(tool.schema.string())
          .optional()
          .describe('Task IDs that must complete first'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        try {
          const taskId = createTask(ledger, args.title, args.agent, {
            dependencies: args.dependencies,
          });
          await saveLedger(ledger, DEFAULT_LEDGER_PATH);

          return JSON.stringify({
            success: true,
            taskId,
            message: `Created task: ${taskId} - ${args.title}`,
            tasksCount: ledger.epic?.tasks.length || 0,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
    }),

    /**
     * Update task status
     */
    ledger_update_task: tool({
      description: 'Update the status of a task in the current epic',
      args: {
        task_id: tool.schema.string().describe('Task ID (e.g., abc123.1)'),
        status: tool.schema
          .enum(['pending', 'running', 'completed', 'failed', 'timeout'])
          .describe('New task status'),
        result: tool.schema.string().optional().describe('Task result (for completed tasks)'),
        error: tool.schema.string().optional().describe('Error message (for failed tasks)'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        try {
          updateTaskStatus(ledger, args.task_id, args.status as any, args.result, args.error);
          await saveLedger(ledger, DEFAULT_LEDGER_PATH);

          const progress = getProgress(ledger);

          return JSON.stringify({
            success: true,
            taskId: args.task_id,
            status: args.status,
            progress: `${progress.completed}/${progress.total}`,
            epicStatus: ledger.epic?.status,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
    }),

    /**
     * Add a learning entry
     */
    ledger_add_learning: tool({
      description: 'Add a learning entry to LEDGER.md',
      args: {
        type: tool.schema
          .enum(['pattern', 'antiPattern', 'decision', 'preference'])
          .describe('Type of learning'),
        content: tool.schema.string().describe('Learning content'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        addLearning(ledger, args.type as any, args.content);
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);

        return JSON.stringify({
          success: true,
          type: args.type,
          message: `Added ${args.type}: ${args.content}`,
        });
      },
    }),

    /**
     * Get recent learnings
     */
    ledger_get_learnings: tool({
      description: 'Get recent learnings from LEDGER.md',
      args: {
        max_age_hours: tool.schema
          .number()
          .optional()
          .default(48)
          .describe('Maximum age of learnings in hours'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        const maxAgeMs = (args.max_age_hours || 48) * 60 * 60 * 1000;
        const learnings = surfaceLearnings(ledger, maxAgeMs);

        return JSON.stringify(
          {
            patterns: learnings.patterns,
            antiPatterns: learnings.antiPatterns,
            decisions: learnings.decisions,
            total:
              learnings.patterns.length +
              learnings.antiPatterns.length +
              learnings.decisions.length,
          },
          null,
          2
        );
      },
    }),

    /**
     * Add context to current epic
     */
    ledger_add_context: tool({
      description: 'Add context (key decision or information) to the current epic',
      args: {
        context: tool.schema.string().describe('Context to add'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        try {
          addContext(ledger, args.context);
          await saveLedger(ledger, DEFAULT_LEDGER_PATH);

          return JSON.stringify({
            success: true,
            message: `Added context: ${args.context}`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
    }),

    /**
     * Create handoff for session break
     */
    ledger_create_handoff: tool({
      description: 'Create a handoff section in LEDGER.md for session break',
      args: {
        reason: tool.schema
          .enum(['context_limit', 'user_exit', 'session_break'])
          .describe('Reason for handoff'),
        resume_command: tool.schema.string().describe('Command to resume work'),
        files_modified: tool.schema
          .array(tool.schema.string())
          .optional()
          .describe('Files modified in this session'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        createHandoff(ledger, args.reason as any, args.resume_command, {
          filesModified: args.files_modified,
        });
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);

        return JSON.stringify({
          success: true,
          message: `Handoff created. Safe to /clear.`,
          resumeCommand: args.resume_command,
        });
      },
    }),

    /**
     * Archive current epic
     */
    ledger_archive_epic: tool({
      description: 'Archive the current epic with an outcome',
      args: {
        outcome: tool.schema
          .enum(['SUCCEEDED', 'PARTIAL', 'FAILED'])
          .optional()
          .describe('Epic outcome (auto-detected if not provided)'),
      },
      async execute(args) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        if (!ledger.epic) {
          return JSON.stringify({
            success: false,
            error: 'No active epic to archive',
          });
        }

        const epicId = ledger.epic.id;
        const epicTitle = ledger.epic.title;

        archiveEpic(ledger, args.outcome as any);
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);

        return JSON.stringify({
          success: true,
          epicId,
          epicTitle,
          outcome: args.outcome || 'auto-detected',
          archiveCount: ledger.archive.length,
        });
      },
    }),
  };
}

// ============================================================================
// Export
// ============================================================================

export const ledgerTools = createLedgerTools();
