/**
 * File-Based Ledger Tools (v6.0)
 *
 * Tools for file-based orchestration state management.
 * Uses hybrid approach: LEDGER.md index + file-based epics.
 */

import { tool } from '@opencode-ai/plugin';
import { getFileLedger } from '../file-ledger';
import type { LearningType, Phase } from '../file-ledger/types';

/**
 * Create all file-based ledger tools
 */
export function createFileLedgerTools() {
  const ledger = getFileLedger();

  return {
    // STATUS & INIT

    ledger_status: tool({
      description:
        'Get current orchestration status (v6.0 file-based). Shows active epic, phase, and learnings.',
      args: {},
      async execute() {
        const status = await ledger.getStatus();

        if (!status.initialized) {
          return JSON.stringify({
            initialized: false,
            message: 'OpenCode not initialized. Run ledger_init first.',
            hint: 'Use ledger_init to set up .opencode/ directory structure.',
          });
        }

        return JSON.stringify(
          {
            initialized: true,
            phase: status.phase,
            activeEpic: status.activeEpic
              ? {
                  id: status.activeEpic.id,
                  title: status.activeEpic.title,
                  status: status.activeEpic.status,
                  progress: `${status.activeEpic.tasksSummary.completed}/${status.activeEpic.tasksSummary.total}`,
                }
              : null,
            hasHandoff: status.hasHandoff,
            recentLearnings: status.recentLearnings,
          },
          null,
          2
        );
      },
    }),

    ledger_init: tool({
      description:
        'Initialize .opencode/ directory structure. Creates context, epics, and learnings folders.',
      args: {},
      async execute() {
        const isInit = await ledger.isInitialized();

        if (isInit) {
          return JSON.stringify({
            success: true,
            message: 'Already initialized.',
            path: '.opencode/',
          });
        }

        await ledger.initialize();

        return JSON.stringify({
          success: true,
          message: 'Initialized .opencode/ directory structure.',
          created: [
            '.opencode/LEDGER.md',
            '.opencode/context/product.md',
            '.opencode/context/tech-stack.md',
            '.opencode/context/workflow.md',
            '.opencode/learnings/patterns.md',
            '.opencode/learnings/decisions.md',
            '.opencode/learnings/preferences.md',
          ],
          hint: 'Edit context files to customize for your project.',
        });
      },
    }),

    // EPIC OPERATIONS

    ledger_create_epic: tool({
      description:
        'Create a new epic (feature/bug/chore). Creates spec.md, plan.md, and log.md files.',
      args: {
        title: tool.schema.string().describe('Epic title (e.g., "Add user authentication")'),
        request: tool.schema.string().describe('Original user request or description'),
      },
      async execute(args) {
        try {
          const epicId = await ledger.createEpic(args.title, args.request);

          return JSON.stringify({
            success: true,
            epicId,
            message: `Created epic: ${epicId}`,
            files: [
              `.opencode/epics/${epicId}/spec.md`,
              `.opencode/epics/${epicId}/plan.md`,
              `.opencode/epics/${epicId}/log.md`,
              `.opencode/epics/${epicId}/metadata.json`,
            ],
            nextStep: 'Edit spec.md to define requirements, then use ledger_approve_spec.',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
    }),

    ledger_get_epic: tool({
      description: 'Get active epic details including spec, plan, and progress.',
      args: {},
      async execute() {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({
            hasActiveEpic: false,
            message: 'No active epic. Use ledger_create_epic to start one.',
          });
        }

        const spec = await ledger.readSpec(epic.id);
        const plan = await ledger.readPlan(epic.id);

        return JSON.stringify(
          {
            hasActiveEpic: true,
            epic: {
              id: epic.id,
              title: epic.title,
              type: epic.type,
              status: epic.status,
              progress: `${epic.tasksSummary.completed}/${epic.tasksSummary.total}`,
            },
            specPreview: spec.slice(0, 500) + (spec.length > 500 ? '...' : ''),
            planPreview: plan.slice(0, 500) + (plan.length > 500 ? '...' : ''),
            files: {
              spec: `.opencode/epics/${epic.id}/spec.md`,
              plan: `.opencode/epics/${epic.id}/plan.md`,
              log: `.opencode/epics/${epic.id}/log.md`,
            },
          },
          null,
          2
        );
      },
    }),

    ledger_update_epic_status: tool({
      description: 'Update epic status (draft, planning, in_progress, review, completed, failed).',
      args: {
        status: tool.schema
          .enum(['draft', 'planning', 'in_progress', 'review', 'completed', 'failed', 'paused'])
          .describe('New epic status'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({
            success: false,
            error: 'No active epic.',
          });
        }

        await ledger.updateEpicStatus(epic.id, args.status as any);

        return JSON.stringify({
          success: true,
          epicId: epic.id,
          status: args.status,
          message: `Epic status updated to: ${args.status}`,
        });
      },
    }),

    ledger_archive_epic: tool({
      description: 'Archive the current epic. Moves to .opencode/archive/ and clears active epic.',
      args: {
        outcome: tool.schema
          .enum(['SUCCEEDED', 'PARTIAL', 'FAILED'])
          .optional()
          .describe('Epic outcome (auto-detected if not provided)'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({
            success: false,
            error: 'No active epic to archive.',
          });
        }

        const epicId = epic.id;
        const title = epic.title;

        await ledger.archiveEpic(args.outcome as any);

        return JSON.stringify({
          success: true,
          epicId,
          title,
          outcome: args.outcome || 'auto-detected',
          archivedTo: `.opencode/archive/${epicId}/`,
          message: 'Epic archived. Ready for new epic.',
        });
      },
    }),

    // SPEC & PLAN

    ledger_read_spec: tool({
      description: 'Read the current epic specification (spec.md).',
      args: {},
      async execute() {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        const content = await ledger.readSpec(epic.id);
        return content;
      },
    }),

    ledger_write_spec: tool({
      description: 'Write/update the epic specification (spec.md).',
      args: {
        content: tool.schema.string().describe('Full spec.md content'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        await ledger.writeSpec(epic.id, args.content);

        return JSON.stringify({
          success: true,
          epicId: epic.id,
          message: 'Specification updated.',
          file: `.opencode/epics/${epic.id}/spec.md`,
        });
      },
    }),

    ledger_read_plan: tool({
      description: 'Read the current epic implementation plan (plan.md).',
      args: {},
      async execute() {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        const content = await ledger.readPlan(epic.id);
        return content;
      },
    }),

    ledger_write_plan: tool({
      description: 'Write/update the epic implementation plan (plan.md).',
      args: {
        content: tool.schema.string().describe('Full plan.md content'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        await ledger.writePlan(epic.id, args.content);

        return JSON.stringify({
          success: true,
          epicId: epic.id,
          message: 'Plan updated.',
          file: `.opencode/epics/${epic.id}/plan.md`,
        });
      },
    }),

    // TASK OPERATIONS

    ledger_update_task: tool({
      description: 'Mark a task as completed or failed in plan.md.',
      args: {
        task_id: tool.schema.string().describe('Task ID (e.g., 1.1, 2.3)'),
        status: tool.schema.enum(['completed', 'failed']).describe('Task completion status'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        await ledger.updateTaskInPlan(epic.id, args.task_id, args.status as any);

        // Refresh epic to get updated summary
        const updated = await ledger.getActiveEpic();

        return JSON.stringify({
          success: true,
          taskId: args.task_id,
          status: args.status,
          progress: updated
            ? `${updated.tasksSummary.completed}/${updated.tasksSummary.total}`
            : 'unknown',
        });
      },
    }),

    // LOG OPERATIONS

    ledger_append_log: tool({
      description: 'Append an entry to the epic execution log.',
      args: {
        agent: tool.schema.string().describe('Agent name'),
        phase: tool.schema
          .enum(['CLARIFY', 'PLAN', 'EXECUTE', 'REVIEW', 'COMPLETE'])
          .describe('Current phase'),
        action: tool.schema.string().describe('Action description'),
        details: tool.schema.string().optional().describe('Additional details'),
      },
      async execute(args) {
        const epic = await ledger.getActiveEpic();

        if (!epic) {
          return JSON.stringify({ error: 'No active epic.' });
        }

        await ledger.appendLog(epic.id, {
          timestamp: new Date().toISOString(),
          agent: args.agent,
          phase: args.phase as Phase,
          action: args.action,
          details: args.details,
        });

        return JSON.stringify({
          success: true,
          message: `Log entry added: ${args.action}`,
        });
      },
    }),

    // LEARNINGS

    ledger_add_learning: tool({
      description: 'Add a learning (pattern, decision, preference) to persistent storage.',
      args: {
        type: tool.schema
          .enum(['pattern', 'antiPattern', 'decision', 'preference'])
          .describe('Type of learning'),
        content: tool.schema.string().describe('Learning content'),
        source: tool.schema.string().optional().describe('Source (epic ID or agent)'),
      },
      async execute(args) {
        await ledger.addLearning(args.type as LearningType, args.content, args.source);

        return JSON.stringify({
          success: true,
          type: args.type,
          message: `Added ${args.type}: ${args.content.slice(0, 50)}...`,
          file: `.opencode/learnings/${args.type === 'decision' ? 'decisions' : args.type === 'preference' ? 'preferences' : 'patterns'}.md`,
        });
      },
    }),

    ledger_get_learnings: tool({
      description: 'Get learnings of a specific type.',
      args: {
        type: tool.schema
          .enum(['pattern', 'antiPattern', 'decision', 'preference'])
          .describe('Type of learning to retrieve'),
      },
      async execute(args) {
        const learnings = await ledger.readLearnings(args.type as LearningType);

        return JSON.stringify({
          type: args.type,
          count: learnings.length,
          learnings: learnings.slice(0, 20),
        });
      },
    }),

    // CONTEXT

    ledger_read_context: tool({
      description: 'Read a context file (product, tech-stack, or workflow).',
      args: {
        type: tool.schema.enum(['product', 'tech-stack', 'workflow']).describe('Context file type'),
      },
      async execute(args) {
        const content = await ledger.readContext(args.type as any);
        return content;
      },
    }),

    ledger_write_context: tool({
      description: 'Update a context file.',
      args: {
        type: tool.schema.enum(['product', 'tech-stack', 'workflow']).describe('Context file type'),
        content: tool.schema.string().describe('Full file content'),
      },
      async execute(args) {
        await ledger.writeContext(args.type as any, args.content);

        return JSON.stringify({
          success: true,
          message: `Updated context: ${args.type}`,
          file: `.opencode/context/${args.type}.md`,
        });
      },
    }),

    // HANDOFF

    ledger_create_handoff: tool({
      description: 'Create a handoff for session break. Saves state for resume.',
      args: {
        reason: tool.schema
          .enum(['context_limit', 'user_exit', 'session_break'])
          .describe('Reason for handoff'),
        resume_command: tool.schema.string().describe('Command to resume work'),
        summary: tool.schema.string().describe('Brief summary of current state'),
      },
      async execute(args) {
        await ledger.createHandoff(args.reason as any, args.resume_command, args.summary);

        return JSON.stringify({
          success: true,
          message: 'Handoff created. Safe to end session.',
          resumeCommand: args.resume_command,
          hint: 'Use /sdd to resume where you left off.',
        });
      },
    }),

    ledger_clear_handoff: tool({
      description: 'Clear handoff after resuming work.',
      args: {},
      async execute() {
        await ledger.clearHandoff();

        return JSON.stringify({
          success: true,
          message: 'Handoff cleared.',
        });
      },
    }),
  };
}

export const fileLedgerTools = createFileLedgerTools();
