/**
 * Checkpoint Tools
 *
 * OpenCode plugin tools for Human-in-the-Loop checkpoint workflows.
 */

import { tool } from '@opencode-ai/plugin';
import { getCheckpointManager, CHECKPOINT_TEMPLATES } from '../checkpoint';

export const checkpoint_request = tool({
  description: 'Request human approval for a critical decision',
  args: {
    decision_point: tool.schema.string(),
    options: tool.schema.array(
      tool.schema.object({
        id: tool.schema.string(),
        label: tool.schema.string(),
        description: tool.schema.string().optional(),
      })
    ),
    timeout_ms: tool.schema.number().optional(),
  },
  async execute(args) {
    const manager = getCheckpointManager();
    await manager.initialize();

    const checkpointId = await manager.requestCheckpoint(
      'default',
      {
        decisionPoint: args.decision_point,
        options: args.options,
        timeoutMs: args.timeout_ms,
      },
      async (result) => {
        console.log(
          `[Checkpoint] ${result.checkpointId}: ${result.approved ? 'Approved' : 'Rejected'}`
        );
      }
    );

    return JSON.stringify({
      checkpoint_id: checkpointId,
      status: 'pending',
      decision_point: args.decision_point,
    });
  },
});

export const checkpoint_approve = tool({
  description: 'Approve a pending checkpoint',
  args: {
    checkpoint_id: tool.schema.string(),
    selected_option: tool.schema.string().optional(),
  },
  async execute(args) {
    const manager = getCheckpointManager();
    await manager.initialize();

    const success = await manager.approveCheckpoint(args.checkpoint_id, args.selected_option);
    return JSON.stringify({ success, checkpoint_id: args.checkpoint_id });
  },
});

export const checkpoint_reject = tool({
  description: 'Reject a pending checkpoint',
  args: {
    checkpoint_id: tool.schema.string(),
    reason: tool.schema.string().optional(),
  },
  async execute(args) {
    const manager = getCheckpointManager();
    await manager.initialize();

    const success = await manager.rejectCheckpoint(args.checkpoint_id, args.reason);
    return JSON.stringify({ success, checkpoint_id: args.checkpoint_id, rejected: true });
  },
});

export const checkpoint_pending = tool({
  description: 'Get all pending checkpoints',
  args: {},
  async execute() {
    const manager = getCheckpointManager();
    await manager.initialize();

    const checkpoints = manager.getPendingCheckpoints();
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

export const checkpoint_templates = tool({
  description: 'Get pre-built checkpoint templates',
  args: {
    template_type: tool.schema.enum([
      'strategy_validation',
      'code_review',
      'dangerous_operation',
      'design_decision',
      'epic_completion',
    ]),
    context: tool.schema.record(tool.schema.string(), tool.schema.any()),
  },
  async execute(args) {
    let template;
    switch (args.template_type) {
      case 'strategy_validation':
        template = CHECKPOINT_TEMPLATES.strategyValidation(args.context.strategies || []);
        break;
      case 'code_review':
        template = CHECKPOINT_TEMPLATES.codeReview(args.context.files || []);
        break;
      case 'dangerous_operation':
        template = CHECKPOINT_TEMPLATES.dangerousOperation(
          args.context.operation,
          args.context.impact
        );
        break;
      case 'design_decision':
        template = CHECKPOINT_TEMPLATES.designDecision(
          args.context.question,
          args.context.options || []
        );
        break;
      case 'epic_completion':
        template = CHECKPOINT_TEMPLATES.epicCompletion(
          args.context.epic_title,
          args.context.tasks_completed,
          args.context.total_tasks
        );
        break;
    }
    return JSON.stringify(template);
  },
});

export const checkpointTools = {
  checkpoint_request: checkpoint_request,
  checkpoint_approve: checkpoint_approve,
  checkpoint_reject: checkpoint_reject,
  checkpoint_pending: checkpoint_pending,
  checkpoint_templates: checkpoint_templates,
} as const;
