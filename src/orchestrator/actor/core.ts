/**
 * Actor Core - Message Processing and State Transitions
 *
 * Implements the Actor Model pattern:
 * - Pure reducer function for state transitions
 * - Message processing with event logging
 * - LEDGER.md synchronization
 */

import { ActorState, ActorPhase, saveActorState, TrackedAssumption, SubAgentState } from './state';
import { ActorMessage } from './messages';
import { appendEvent } from '../../event-log';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Pure reducer - processes message and returns new state
 *
 * This is a pure function with no side effects.
 * State persistence and event logging happen in processMessage.
 */
export function receive(state: ActorState, message: ActorMessage): ActorState {
  const now = new Date().toISOString();

  switch (message.type) {
    case 'phase.change':
      return {
        ...state,
        phase: message.payload.to as ActorPhase,
        lastUpdated: now,
      };

    case 'assumption.track': {
      const newAssumption: TrackedAssumption = {
        worker: message.payload.worker,
        assumed: message.payload.assumed,
        confidence: message.payload.confidence,
        verified: false,
        timestamp: now,
      };
      return {
        ...state,
        assumptions: [...state.assumptions, newAssumption],
        lastUpdated: now,
      };
    }

    case 'assumption.verify': {
      const updatedAssumptions = state.assumptions.map((a) => {
        if (a.assumed === message.payload.assumed) {
          return { ...a, verified: message.payload.verified };
        }
        return a;
      });
      return {
        ...state,
        assumptions: updatedAssumptions,
        lastUpdated: now,
      };
    }

    case 'subagent.spawn': {
      const newSubAgent: SubAgentState = {
        sessionId: message.payload.sessionId,
        status: 'spawned',
        agent: message.payload.agent,
        spawnedAt: now,
      };
      return {
        ...state,
        subAgents: {
          ...state.subAgents,
          [message.payload.sessionId]: newSubAgent,
        },
        lastUpdated: now,
      };
    }

    case 'subagent.complete': {
      const agent = state.subAgents[message.payload.sessionId];
      if (!agent) return state;

      return {
        ...state,
        subAgents: {
          ...state.subAgents,
          [message.payload.sessionId]: {
            ...agent,
            status: 'completed',
            result: message.payload.result,
            completedAt: now,
          },
        },
        lastUpdated: now,
      };
    }

    case 'subagent.failed': {
      const agent = state.subAgents[message.payload.sessionId];
      if (!agent) return state;

      return {
        ...state,
        subAgents: {
          ...state.subAgents,
          [message.payload.sessionId]: {
            ...agent,
            status: 'failed',
            error: message.payload.error,
            completedAt: now,
          },
        },
        lastUpdated: now,
      };
    }

    case 'direction.update': {
      return {
        ...state,
        direction: {
          goals: message.payload.goals ?? state.direction?.goals ?? [],
          constraints: message.payload.constraints ?? state.direction?.constraints ?? [],
          decisions: message.payload.decisions ?? state.direction?.decisions ?? [],
        },
        lastUpdated: now,
      };
    }

    case 'task.update': {
      return {
        ...state,
        currentTask: message.payload.status === 'completed' ? undefined : message.payload.task,
        lastUpdated: now,
      };
    }

    case 'agent.yield': {
      const agent = state.subAgents[message.payload.sessionId];
      if (!agent) return state;

      return {
        ...state,
        subAgents: {
          ...state.subAgents,
          [message.payload.sessionId]: {
            ...agent,
            status: 'suspended',
          },
        },
        lastUpdated: now,
      };
    }

    case 'agent.resume': {
      const agent = state.subAgents[message.payload.sessionId];
      if (!agent) return state;

      return {
        ...state,
        subAgents: {
          ...state.subAgents,
          [message.payload.sessionId]: {
            ...agent,
            status: 'running',
          },
        },
        lastUpdated: now,
      };
    }

    case 'user.request':
    case 'user.approval':
      // These messages don't change state directly, but are logged for audit
      return { ...state, lastUpdated: now };

    default:
      return state;
  }
}

/**
 * Process a message with full side effects
 *
 * 1. Append to durable event stream
 * 2. Apply pure reducer
 * 3. Persist state to file
 * 4. Update LEDGER.md
 */
export async function processMessage(
  state: ActorState,
  message: ActorMessage,
  projectPath: string = process.cwd()
): Promise<ActorState> {
  // 1. Append to durable event stream
  const event = await appendEvent(projectPath, {
    type: `actor.${message.type}`,
    agent: 'chief-of-staff',
    session_id: state.sessionId,
    ...message.payload,
  });

  // 2. Apply pure reducer
  const newState = receive(state, message);
  newState.eventOffset = event.offset;

  // 3. Persist state to file
  await saveActorState(newState, projectPath);

  // 4. Update LEDGER.md on significant transitions
  if (shouldUpdateLedger(message)) {
    await updateLedger(newState, projectPath);
  }

  return newState;
}

/**
 * Determine if a message should trigger a ledger update
 */
function shouldUpdateLedger(message: ActorMessage): boolean {
  const significantTypes = [
    'phase.change',
    'subagent.complete',
    'subagent.failed',
    'direction.update',
    'user.approval',
  ];
  return significantTypes.includes(message.type);
}

/**
 * Update LEDGER.md with current actor state
 */
async function updateLedger(state: ActorState, projectPath: string): Promise<void> {
  const ledgerPath = join(projectPath, '.opencode', 'LEDGER.md');

  // Ensure directory exists
  await mkdir(dirname(ledgerPath), { recursive: true });

  // Build ledger content
  const content = buildLedgerContent(state);

  await writeFile(ledgerPath, content);
}

/**
 * Build human-readable LEDGER.md content
 */
function buildLedgerContent(state: ActorState): string {
  const sections: string[] = [];

  sections.push('# LEDGER');
  sections.push('');
  sections.push('## Meta');
  sections.push('');
  sections.push(`session_id: ${state.sessionId}`);
  sections.push(`parent_id: ${state.parentSessionId}`);
  sections.push(`root_id: ${state.rootSessionId}`);
  sections.push(`status: ${state.phase}`);
  sections.push(`last_updated: ${state.lastUpdated}`);
  sections.push('');

  sections.push('---');
  sections.push('');

  // Phase
  sections.push('## Current Phase');
  sections.push(`**${state.phase}**`);
  sections.push('');

  // Direction
  if ((state.direction?.goals?.length ?? 0) > 0) {
    sections.push('## Goals');
    for (const goal of state.direction.goals) {
      sections.push(`- ${goal}`);
    }
    sections.push('');
  }

  if ((state.direction?.constraints?.length ?? 0) > 0) {
    sections.push('## Constraints');
    for (const constraint of state.direction.constraints) {
      sections.push(`- ${constraint}`);
    }
    sections.push('');
  }

  // Current Task
  if (state.currentTask) {
    sections.push('## Current Task');
    sections.push(state.currentTask);
    sections.push('');
  }

  // Sub-Agents
  const activeAgents = Object.values(state.subAgents).filter(
    (a) => a.status === 'spawned' || a.status === 'running'
  );
  if (activeAgents.length > 0) {
    sections.push('## Active Sub-Agents');
    for (const agent of activeAgents) {
      sections.push(`- **${agent.agent}** (${agent.status}) - Session: ${agent.sessionId}`);
    }
    sections.push('');
  }

  // Assumptions
  const unverified = state.assumptions.filter((a) => !a.verified);
  if (unverified.length > 0) {
    sections.push('## Unverified Assumptions');
    for (const a of unverified) {
      sections.push(`- ${a.assumed} (confidence: ${a.confidence}) - by ${a.worker}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Resume actor state from event stream
 *
 * Replays events from a given offset to reconstruct state
 */
export async function resumeFromOffset(
  initialState: ActorState,
  fromOffset: number,
  projectPath: string = process.cwd()
): Promise<ActorState> {
  // Import here to avoid circular dependency
  const { readEvents } = await import('../../event-log');

  const events = await readEvents(projectPath, { fromOffset });

  let state = initialState;
  for (const event of events) {
    // Convert durable event back to actor message
    const message = eventToMessage(event);
    if (message) {
      state = receive(state, message);
      state.eventOffset = event.offset;
    }
  }

  return state;
}

/**
 * Convert a durable event to an actor message
 */
function eventToMessage(event: any): ActorMessage | null {
  const type = event.type?.replace('actor.', '');

  switch (type) {
    case 'phase.change':
      return { type, payload: { from: event.from, to: event.to } };
    case 'assumption.track':
      return {
        type,
        payload: { assumed: event.assumed, confidence: event.confidence, worker: event.worker },
      };
    case 'subagent.spawn':
      return {
        type,
        payload: { agent: event.agent, sessionId: event.session_id, prompt: event.prompt },
      };
    case 'subagent.complete':
      return {
        type,
        payload: { sessionId: event.session_id, agent: event.agent, result: event.result },
      };
    case 'subagent.failed':
      return {
        type,
        payload: { sessionId: event.session_id, agent: event.agent, error: event.error },
      };
    case 'agent.yield':
      return {
        type,
        payload: {
          agent: event.agent,
          sessionId: event.session_id,
          reason: event.reason,
          snapshot: event.snapshot,
        },
      };
    case 'agent.resume':
      return {
        type,
        payload: { agent: event.agent, sessionId: event.session_id, signalData: event.signal_data },
      };
    default:
      return null;
  }
}
