/**
 * Ledger Tools - Unified
 *
 * This module provides all LEDGER.md and event-driven ledger tools for agents.
 * Combines direct file operations with event-driven operations.
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
  setActiveDialogue,
  updateActiveDialogue,
  clearActiveDialogue,
  DEFAULT_LEDGER_PATH,
  type Handoff,
} from '../ledger';
import { getEventDrivenLedger } from '../event-driven-ledger';

// ============================================================================
// Event-Driven Ledger Tools
// ============================================================================

export const ledger_emit_event = tool({
  description: 'Emit an event to the event ledger for tracking epic/task operations',
  args: {
    event_type: tool.schema.enum([
      'ledger.epic.created',
      'ledger.epic.started',
      'ledger.epic.completed',
      'ledger.epic.failed',
      'ledger.handoff.created',
      'ledger.task.created',
      'ledger.task.started',
      'ledger.task.completed',
      'ledger.task.failed',
      'ledger.task.yielded',
      'ledger.governance.directive_added',
      'ledger.governance.assumption_added',
      'ledger.learning.extracted',
    ]),
    epic_id: tool.schema.string().optional(),
    epic_title: tool.schema.string().optional(),
    task_id: tool.schema.string().optional(),
    task_title: tool.schema.string().optional(),
    agent: tool.schema.string().optional(),
    result: tool.schema.string().optional(),
    summary: tool.schema.string().optional(),
    error: tool.schema.string().optional(),
  },
  async execute(args) {
    const ledger = getEventDrivenLedger();
    await ledger.initialize();

    const event = await ledger.emit(args.event_type as any, {
      epicId: args.epic_id,
      epicTitle: args.epic_title,
      taskId: args.task_id,
      taskTitle: args.task_title,
      agent: args.agent,
      result: args.result,
      summary: args.summary,
      error: args.error,
    });

    return JSON.stringify({
      success: true,
      event_id: event?.id,
      event_type: args.event_type,
    });
  },
});

export const ledger_get_history = tool({
  description: 'Get the event history and activity logs from the event ledger',
  args: {
    include_activity: tool.schema
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to include recent execution trace events (Durable Stream)'),
  },
  async execute(args) {
    const ledger = getEventDrivenLedger();
    await ledger.initialize();

    const history = ledger.getEventHistory();
    const result: any = {
      count: history.length,
      events: history.slice(-50).map((e: any) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        actor: e.actor,
      })),
    };

    if (args.include_activity) {
      const trace = history
        .filter((e: any) => typeof e.type === 'string' && e.type.startsWith('execution.'))
        .slice(-200)
        .map((e: any) => {
          const payload = e.payload as any;
          if (e.type === 'execution.text_delta' || e.type === 'execution.reasoning_delta') {
            return {
              id: e.id,
              type: e.type,
              timestamp: e.timestamp,
              delta: String(payload?.delta || '').slice(0, 200),
              messageID: payload?.messageID,
            };
          }
          if (e.type === 'execution.text_snapshot' || e.type === 'execution.reasoning_snapshot') {
            return {
              id: e.id,
              type: e.type,
              timestamp: e.timestamp,
              text: String(payload?.text || '').slice(0, 200),
              messageID: payload?.messageID,
            };
          }
          if (e.type === 'execution.agent') {
            return {
              id: e.id,
              type: e.type,
              timestamp: e.timestamp,
              name: payload?.name,
              messageID: payload?.messageID,
            };
          }
          return {
            id: e.id,
            type: e.type,
            timestamp: e.timestamp,
            messageID: payload?.messageID,
          };
        });

      result.activity = trace;
    }

    return JSON.stringify(result);
  },
});

export const ledger_get_intents = tool({
  description: 'Get active intents from the event ledger',
  args: {},
  async execute() {
    const ledger = getEventDrivenLedger();
    await ledger.initialize();

    const intents = ledger.getActiveIntents();
    return JSON.stringify({
      count: intents.length,
      intents: intents.map((i: any) => ({
        id: i.id,
        agent: i.agent,
        status: i.status,
        description: i.description,
      })),
    });
  },
});

export const ledger_get_checkpoints = tool({
  description: 'Get pending checkpoints from the event ledger',
  args: {},
  async execute() {
    const ledger = getEventDrivenLedger();
    await ledger.initialize();

    const checkpoints = ledger.getPendingCheckpoints();
    return JSON.stringify({
      count: checkpoints.length,
      checkpoints: checkpoints.map((c: any) => ({
        id: c.id,
        decision_point: c.decision_point,
        options: c.options,
        requested_at: c.requested_at,
      })),
    });
  },
});

// ============================================================================
// LEDGER.md Direct Operation Tools
// ============================================================================

export function createLedgerTools() {
  return {
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
            activeDialogue: ledger.activeDialogue
              ? {
                  agent: ledger.activeDialogue.agent,
                  command: ledger.activeDialogue.command,
                  turn: ledger.activeDialogue.turn,
                  status: ledger.activeDialogue.status,
                  sessionId: ledger.activeDialogue.sessionId,
                  accumulatedDirection: ledger.activeDialogue.accumulatedDirection,
                  pendingQuestions: ledger.activeDialogue.pendingQuestions,
                  lastPollMessage: ledger.activeDialogue.lastPollMessage,
                  createdAt: ledger.activeDialogue.createdAt,
                  updatedAt: ledger.activeDialogue.updatedAt,
                }
              : null,
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

    ledger_set_active_dialogue: tool({
      description:
        'Start a multi-turn active dialogue (stored in LEDGER.md). Used for /ama and /sdd continuation.',
      args: {
        agent: tool.schema.string().describe('Owning agent (e.g., "chief-of-staff")'),
        command: tool.schema.string().describe('Command to resume (e.g., "/ama", "/sdd")'),
        session_id: tool.schema
          .string()
          .optional()
          .describe('Root session ID to bind continuation to (defaults to current session)'),
        pendingQuestions: tool.schema
          .array(tool.schema.string())
          .optional()
          .describe('Optional initial pending questions'),
        lastPollMessage: tool.schema.string().optional().describe('Optional last poll message'),
      },
      async execute(args, execContext) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);
        const sessionId =
          args.session_id || (execContext as any)?.parentID || (execContext as any)?.sessionID;

        setActiveDialogue(ledger, args.agent, args.command, {
          sessionId,
          pendingQuestions: args.pendingQuestions,
          lastPollMessage: args.lastPollMessage,
        });
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);

        return JSON.stringify(
          {
            success: true,
            activeDialogue: ledger.activeDialogue,
          },
          null,
          2
        );
      },
    }),

    ledger_update_active_dialogue: tool({
      description: 'Update the current active dialogue in LEDGER.md (append-only for direction).',
      args: {
        turn: tool.schema.number().optional().describe('Turn number'),
        status: tool.schema
          .enum(['needs_input', 'needs_approval', 'needs_verification'])
          .optional()
          .describe('Dialogue blocking status'),
        goals: tool.schema.array(tool.schema.string()).optional(),
        constraints: tool.schema.array(tool.schema.string()).optional(),
        preferences: tool.schema.array(tool.schema.string()).optional(),
        decisions: tool.schema.array(tool.schema.string()).optional(),
        pendingQuestions: tool.schema.array(tool.schema.string()).optional(),
        lastPollMessage: tool.schema.string().optional(),
      },
      async execute(args, execContext) {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);

        // If this update is coming from a child session, bind the dialogue to the parent (root)
        // session so user replies can be routed reliably.
        const preferredSessionId =
          (execContext as any)?.parentID || (execContext as any)?.sessionID;
        if (preferredSessionId && ledger.activeDialogue) {
          ledger.activeDialogue.sessionId = preferredSessionId;
        }

        updateActiveDialogue(ledger, {
          turn: args.turn,
          status: args.status as any,
          goals: args.goals,
          constraints: args.constraints,
          preferences: args.preferences,
          decisions: args.decisions,
          pendingQuestions: args.pendingQuestions,
          lastPollMessage: args.lastPollMessage,
        });

        await saveLedger(ledger, DEFAULT_LEDGER_PATH);

        return JSON.stringify(
          {
            success: true,
            activeDialogue: ledger.activeDialogue,
          },
          null,
          2
        );
      },
    }),

    ledger_clear_active_dialogue: tool({
      description: 'Clear the current active dialogue in LEDGER.md (when completed or cancelled).',
      args: {},
      async execute() {
        const ledger = await loadLedger(DEFAULT_LEDGER_PATH);
        clearActiveDialogue(ledger);
        await saveLedger(ledger, DEFAULT_LEDGER_PATH);
        return JSON.stringify({ success: true });
      },
    }),

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

export const ledgerEventTools = {
  ledger_emit_event: ledger_emit_event,
  ledger_get_history: ledger_get_history,
  ledger_get_intents: ledger_get_intents,
  ledger_get_checkpoints: ledger_get_checkpoints,
} as const;

export const ledgerTools = createLedgerTools();
