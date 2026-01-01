/**
 * Event-Driven Ledger Tools
 *
 * OpenCode plugin tools for event-driven ledger operations.
 */

import { tool } from '@opencode-ai/plugin';
import { getEventDrivenLedger } from '../event-driven-ledger';

export const ledger_emit_event = tool({
  description: 'Emit an event to the event ledger for tracking epic/task operations',
  args: {
    event_type: tool.schema.enum([
      'ledger.epic.created',
      'ledger.epic.started',
      'ledger.epic.completed',
      'ledger.epic.failed',
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
  description: 'Get the event history from the event ledger',
  args: {},
  async execute() {
    const ledger = getEventDrivenLedger();
    await ledger.initialize();

    const history = ledger.getEventHistory();
    return JSON.stringify({
      count: history.length,
      events: history.slice(-50).map((e: any) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        actor: e.actor,
      })),
    });
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

export const ledgerEventTools = {
  ledger_emit_event: ledger_emit_event,
  ledger_get_history: ledger_get_history,
  ledger_get_intents: ledger_get_intents,
  ledger_get_checkpoints: ledger_get_checkpoints,
} as const;
