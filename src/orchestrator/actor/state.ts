/**
 * Actor State Management
 *
 * Defines the ActorState interface and provides file-based persistence
 * for cross-session continuity.
 *
 * State is persisted to: .opencode/actor-state.json
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Assumption tracked by the orchestrator
 */
export interface TrackedAssumption {
  worker: string;
  assumed: string;
  confidence: number;
  verified: boolean;
  timestamp: string;
}

/**
 * Sub-agent spawn state
 */
export interface SubAgentState {
  sessionId: string;
  status: 'spawned' | 'running' | 'completed' | 'failed' | 'suspended';
  agent: string;
  spawnedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

/**
 * Direction explicitly given by user
 */
export interface ExplicitDirection {
  goals: string[];
  constraints: string[];
  decisions: string[];
}

/**
 * Actor phase states
 */
export type ActorPhase = 'INIT' | 'PLANNING' | 'VALIDATING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

/**
 * Complete Actor State
 *
 * This is the single source of truth for the Chief-of-Staff orchestrator.
 * It encapsulates all coordination state and enables resumption after context wipes.
 */
export interface ActorState {
  /** Current workflow phase */
  phase: ActorPhase;

  /** OpenCode session ID for this actor */
  sessionId: string;

  /** Parent session ID if this is a child actor */
  parentSessionId?: string;

  /** Explicit direction from user */
  direction: ExplicitDirection;

  /** Assumptions made during orchestration */
  assumptions: TrackedAssumption[];

  /** Active sub-agents */
  subAgents: Record<string, SubAgentState>;

  /** Current offset in the event stream for resumption */
  eventOffset: number;

  /** Last update timestamp */
  lastUpdated: string;

  /** Optional: Current task being worked on */
  currentTask?: string;

  /** Optional: Error message if phase is FAILED */
  error?: string;
}

/**
 * Default initial state
 */
export function createInitialState(
  sessionId: string,
  direction?: Partial<ExplicitDirection>
): ActorState {
  return {
    phase: 'INIT',
    sessionId,
    direction: {
      goals: direction?.goals || [],
      constraints: direction?.constraints || [],
      decisions: direction?.decisions || [],
    },
    assumptions: [],
    subAgents: {},
    eventOffset: 0,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get the actor state file path
 */
function getStatePath(projectPath: string = process.cwd()): string {
  return join(projectPath, '.opencode', 'actor-state.json');
}

/**
 * Load actor state from file
 *
 * Returns null if no state file exists (fresh start)
 */
export async function loadActorState(
  projectPath: string = process.cwd()
): Promise<ActorState | null> {
  const statePath = getStatePath(projectPath);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as ActorState;
  } catch {
    return null;
  }
}

/**
 * Save actor state to file
 *
 * Creates .opencode directory if it doesn't exist
 */
export async function saveActorState(
  state: ActorState,
  projectPath: string = process.cwd()
): Promise<void> {
  const statePath = getStatePath(projectPath);

  // Ensure directory exists
  await mkdir(dirname(statePath), { recursive: true });

  // Update timestamp
  state.lastUpdated = new Date().toISOString();

  // Write state
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * Clear actor state (for fresh start)
 */
export async function clearActorState(projectPath: string = process.cwd()): Promise<void> {
  const statePath = getStatePath(projectPath);

  if (existsSync(statePath)) {
    await writeFile(statePath, '{}');
  }
}

/**
 * Check if actor state exists
 */
export function hasActorState(projectPath: string = process.cwd()): boolean {
  return existsSync(getStatePath(projectPath));
}
