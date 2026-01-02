/**
 * Progress Emitter (v5.0)
 *
 * Provides user-visible progress updates during agent orchestration.
 * Solves the "thiếu thông báo" issue by emitting structured events
 * that can be displayed to users in real-time.
 *
 * Usage:
 *   await emitProgress('architect', 'PLANNING', 'Analyzing task dependencies...');
 *   await emitProgress('executor', 'IMPLEMENTING', 'Writing tests...', { percent: 30 });
 */

import { getDurableStream } from '../durable-stream';
import type {
  ActionRequired,
  ProgressPayload,
  ContextHandoffPayload,
} from '../durable-stream/types';

// Progress phases for each agent type
export const AGENT_PHASES = {
  'chief-of-staff': ['INIT', 'ROUTING', 'DELEGATING', 'GATHERING', 'COMPLETING'],
  interviewer: ['ANALYZING', 'CLARIFYING', 'SUMMARIZING', 'AWAITING_APPROVAL'],
  architect: ['ANALYZING', 'DECOMPOSING', 'PLANNING', 'AWAITING_APPROVAL'],
  executor: ['PREPARING', 'TESTING', 'IMPLEMENTING', 'REFACTORING', 'COMPLETING'],
  reviewer: ['STAGE1_SPEC', 'STAGE2_QUALITY', 'SUMMARIZING'],
  validator: ['CHECKING', 'VERIFYING', 'REPORTING'],
  debugger: ['GATHERING', 'HYPOTHESIZING', 'TESTING', 'DIAGNOSING'],
  explore: ['SEARCHING', 'ANALYZING', 'SYNTHESIZING'],
  librarian: ['RESEARCHING', 'FETCHING', 'SUMMARIZING'],
} as const;

export type AgentName = keyof typeof AGENT_PHASES;

/**
 * Emit a progress event for user visibility.
 * Events are stored in Durable Stream and can be displayed in UI.
 */
export async function emitProgress(
  agent: string,
  phase: string,
  message: string,
  options?: {
    percent?: number;
    actionRequired?: ActionRequired;
    sessionId?: string;
    taskId?: string;
  }
): Promise<void> {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return;

  const payload: ProgressPayload = {
    agent,
    phase,
    message,
    progress_percent: options?.percent,
    action_required: options?.actionRequired,
    session_id: options?.sessionId,
    task_id: options?.taskId,
  };

  await stream.emit('progress.status_update', payload);
}

/**
 * Emit phase start event.
 */
export async function emitPhaseStart(
  agent: string,
  phase: string,
  description: string,
  sessionId?: string
): Promise<void> {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return;

  await stream.emit('progress.phase_started', {
    agent,
    phase,
    message: description,
    session_id: sessionId,
  });
}

/**
 * Emit phase completion event.
 */
export async function emitPhaseComplete(
  agent: string,
  phase: string,
  result?: string,
  sessionId?: string
): Promise<void> {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return;

  await stream.emit('progress.phase_completed', {
    agent,
    phase,
    message: result || `${phase} completed`,
    progress_percent: 100,
    session_id: sessionId,
  });
}

/**
 * Emit user action needed event (for HITL).
 */
export async function emitUserActionNeeded(
  agent: string,
  action: ActionRequired,
  message: string,
  sessionId?: string
): Promise<void> {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return;

  await stream.emit('progress.user_action_needed', {
    agent,
    phase: 'WAITING_FOR_USER',
    message,
    action_required: action,
    session_id: sessionId,
  });
}

/**
 * Emit context handoff event when passing context between agents.
 */
export async function emitContextHandoff(
  fromAgent: string,
  fromSession: string,
  toAgent: string,
  context: ContextHandoffPayload['context'],
  toSession?: string
): Promise<void> {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return;

  const payload: ContextHandoffPayload = {
    from_agent: fromAgent,
    from_session: fromSession,
    to_agent: toAgent,
    to_session: toSession,
    context,
  };

  await stream.emit('progress.context_handoff', payload);
}

/**
 * Format a user-friendly status line for display.
 */
export function formatStatusLine(payload: ProgressPayload): string {
  const icon = getPhaseIcon(payload.phase);
  const percent = payload.progress_percent ? ` (${payload.progress_percent}%)` : '';
  return `${icon} **${payload.agent}**: ${payload.message}${percent}`;
}

/**
 * Get icon for phase (for UI display).
 */
function getPhaseIcon(phase: string): string {
  const icons: Record<string, string> = {
    // General
    INIT: '🚀',
    ANALYZING: '🔍',
    PLANNING: '📋',
    IMPLEMENTING: '⚡',
    COMPLETING: '✅',
    WAITING_FOR_USER: '⏸️',
    // Specific
    CLARIFYING: '💬',
    DECOMPOSING: '🧩',
    TESTING: '🧪',
    REFACTORING: '🔧',
    STAGE1_SPEC: '📝',
    STAGE2_QUALITY: '✨',
    SEARCHING: '🔎',
    RESEARCHING: '📚',
    DIAGNOSING: '🩺',
  };
  return icons[phase] || '▶️';
}

/**
 * Subscribe to progress events for a session.
 * Returns unsubscribe function.
 */
export function subscribeToProgress(
  sessionId: string,
  callback: (payload: ProgressPayload) => void
): () => void {
  const stream = getDurableStream();
  if (!stream.isInitialized()) return () => {};

  const handler = (event: { payload: unknown }) => {
    const payload = event.payload as ProgressPayload;
    if (!sessionId || payload.session_id === sessionId) {
      callback(payload);
    }
  };

  const unsub1 = stream.subscribe('progress.status_update', handler);
  const unsub2 = stream.subscribe('progress.phase_started', handler);
  const unsub3 = stream.subscribe('progress.phase_completed', handler);
  const unsub4 = stream.subscribe('progress.user_action_needed', handler);

  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
  };
}
