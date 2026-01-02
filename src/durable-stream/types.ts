/**
 * Durable Stream Types
 *
 * Core type definitions for the event-sourced orchestration layer.
 * These types define the contract between the functional core and class façade.
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * All possible event types in the Durable Stream.
 * Organized by category for clarity.
 */
export type EventType =
  // Lifecycle (Maps directly to SDK events)
  | 'lifecycle.session.created'
  | 'lifecycle.session.idle'
  | 'lifecycle.session.compacted'
  | 'lifecycle.session.error'
  | 'lifecycle.session.deleted'
  | 'lifecycle.session.aborted'
  // Execution (Maps to SDK StepPart / ToolPart)
  | 'execution.message.updated'
  | 'execution.step_start'
  | 'execution.step_finish'
  | 'execution.tool_start'
  | 'execution.tool_finish'
  | 'execution.agent'
  | 'execution.text_delta'
  | 'execution.text_snapshot'
  | 'execution.reasoning_delta'
  | 'execution.reasoning_snapshot'
  | 'execution.snapshot'
  | 'execution.retry'
  // Agent (Our orchestration layer)
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.aborted'
  | 'agent.handoff'
  | 'agent.yield'
  | 'agent.resumed'
  // HITL (Human-in-the-Loop)
  | 'checkpoint.requested'
  | 'checkpoint.approved'
  | 'checkpoint.rejected'
  // Files
  | 'files.changed'
  | 'files.patched'
  // Learning
  | 'learning.extracted'
  // Ledger Events
  | 'ledger.epic.created'
  | 'ledger.epic.started'
  | 'ledger.epic.completed'
  | 'ledger.epic.failed'
  | 'ledger.epic.archived'
  | 'ledger.handoff.created'
  | 'ledger.handoff.resumed'
  | 'ledger.task.created'
  | 'ledger.task.started'
  | 'ledger.task.completed'
  | 'ledger.task.failed'
  | 'ledger.task.yielded'
  | 'ledger.governance.directive_added'
  | 'ledger.governance.assumption_added'
  | 'ledger.learning.extracted';

/**
 * The canonical event envelope.
 * All events in the Durable Stream conform to this shape.
 */
export interface StreamEvent<T = unknown> {
  /** ULID - Sortable unique identifier */
  id: string;
  /** Event type from the EventType union */
  type: EventType;
  /** Root Session ID - acts as Trace ID */
  stream_id: string;
  /** Parent Event ID - for causation tracking */
  causation_id?: string;
  /** Workflow Run ID - groups related events */
  correlation_id: string;
  /** Actor: "user" or agent name (e.g., "chief-of-staff/oracle") */
  actor: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Event-specific payload */
  payload: T;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new event (before id/timestamp are generated).
 */
export type StreamEventInput<T = unknown> = Omit<StreamEvent<T>, 'id' | 'timestamp'> & {
  timestamp?: number;
};

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Filter criteria for querying events.
 */
export interface StreamFilter {
  stream_id?: string;
  type?: EventType | EventType[];
  actor?: string;
  since?: number;
  until?: number;
  limit?: number;
}

/**
 * Abstract storage interface.
 * Implementations: JsonlStore (v1), SqliteStore (future).
 */
export interface IStreamStore {
  /** Append an event to the log */
  append(event: StreamEvent): Promise<void>;

  /** Read all events for a specific stream (for replay) */
  readStream(streamId: string, fromOffset?: number): Promise<StreamEvent[]>;

  /** Query events across streams */
  query(filter: StreamFilter): Promise<StreamEvent[]>;

  /** Get the current offset (event count) */
  getOffset(): Promise<number>;

  /** Close the store (cleanup) */
  close(): Promise<void>;
}

// ============================================================================
// Checkpoint (HITL)
// ============================================================================

export interface CheckpointOption {
  id: string;
  label: string;
  description?: string;
}

export interface Checkpoint {
  id: string;
  decision_point: string;
  options: CheckpointOption[];
  requested_by: string;
  requested_at: number;
  approved_by?: string;
  approved_at?: number;
  selected_option?: string;
  expires_at?: number;
}

// ============================================================================
// Intent (Workflow Registration)
// ============================================================================

export interface IntentSpec {
  /** Human-readable description of the intent */
  description: string;
  /** Target agent to execute the intent */
  agent: string;
  /** Prompt for the agent */
  prompt: string;
  /** Parent session (if any) */
  parent_session_id?: string;
  /** Timeout in milliseconds */
  timeout_ms?: number;
}

export interface Intent extends IntentSpec {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  created_at: number;
  started_at?: number;
  completed_at?: number;
  result?: string;
  error?: string;
}

// ============================================================================
// Resume Result
// ============================================================================

export interface ResumeResult {
  /** Number of events replayed */
  events_replayed: number;
  /** Pending checkpoints found */
  pending_checkpoints: Checkpoint[];
  /** Active intents found */
  active_intents: Intent[];
  /** Last event timestamp */
  last_event_at?: number;
}

// ============================================================================
// Resource Management (v4.1)
// ============================================================================

export interface SessionDeletedPayload {
  deleted_at: number;
  reason?: string;
  actor: string;
}

export interface SessionAbortedPayload {
  aborted_at: number;
  reason?: string;
  actor: string;
}

export interface OpenCodeClient {
  session: {
    delete(options: { path: { id: string } }): Promise<{ error?: unknown }>;
    abort(options: { path: { id: string } }): Promise<{ error?: unknown }>;
  };
}
