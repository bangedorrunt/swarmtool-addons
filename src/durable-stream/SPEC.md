# Durable Stream: Architecture & API Specification (v4.1)

> **Status**: Living Document | **Last Updated**: 2026-01-02

## 1. Architectural Vision

The **Durable Stream** serves as the "hippocampus" (long-term episodic memory) and "brainstem" (autonomic orchestration) for OpenCode agents. It is designed as a **thin, non-invasive layer** on top of the native OpenCode SDK, not a replacement.

### 1.1 Core Capabilities

| Capability              | Description                                                                   |
| :---------------------- | :---------------------------------------------------------------------------- |
| **Event Sourcing**      | Persists all lifecycle events to `.jsonl` for perfect crash recovery.         |
| **Lineage Tracking**    | Maps `stream_id` (Trace ID) across parent-child sessions.                     |
| **HITL Workflows**      | `checkpoint.requested` / `checkpoint.approved` events for human approval.     |
| **Resource Management** | `session.delete()` and `session.abort()` integration for memory optimization. |
| **Execution Telemetry** | Bridges streaming OpenCode message parts into `execution.*` events (text/reasoning/tool/agent). |

---

## 2. SDK Primitives We Leverage

| SDK API                        | Purpose                 | Durable Stream Usage                                 |
| :----------------------------- | :---------------------- | :--------------------------------------------------- |
| `session.create({ parentID })` | Lineage                 | Map to `stream_id` and `causation_id`.               |
| `session.children()`           | List children           | Query lineage tree.                                  |
| `session.abort()`              | **Cancel sub-agent**    | Emit `agent.aborted`; clean up projections.          |
| `session.delete()`             | **Hard delete session** | Emit `lifecycle.session.deleted`; purge from memory. |
| `session.summarize()`          | Native summary          | Use for context compaction.                          |
| `session.diff()`               | Get file changes        | Log `files.changed` event.                           |
| `message.updated`              | Message lifecycle       | Emit low-frequency completion markers.               |
| `message.part.updated`         | Streaming parts/deltas  | Emit `execution.*` telemetry events.                 |

---

## 3. Data Schemas (v4.1)

### 3.1 Event Envelope (`StreamEvent`)

```typescript
interface StreamEvent<T = unknown> {
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
```

### 3.2 Event Types (`EventType`)

```typescript
type EventType =
  // Lifecycle (Maps directly to SDK events)
  | 'lifecycle.session.created'
  | 'lifecycle.session.idle'
  | 'lifecycle.session.compacted'
  | 'lifecycle.session.error'
  | 'lifecycle.session.deleted' // NEW: Physical resource freed
  | 'lifecycle.session.aborted' // NEW: Emergency stop
  // Execution (Bridged from OpenCode message parts)
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
  // Agent
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.aborted'
  | 'agent.handoff'
  | 'agent.yield'
  | 'agent.resumed'
  // HITL
  | 'checkpoint.requested'
  | 'checkpoint.approved'
  | 'checkpoint.rejected'
  // Files
  | 'files.changed'
  | 'files.patched'
  // Learning
  | 'learning.extracted'
  // Ledger
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
  | 'ledger.learning.extracted'
  // Progress (v5.0 - User visibility)
  | 'progress.phase_started'
  | 'progress.phase_completed'
  | 'progress.status_update'
  | 'progress.user_action_needed'
  | 'progress.context_handoff';
```

### 3.3 Intent Model (Workflow Registration)

```typescript
interface IntentSpec {
  description: string; // Human-readable description
  agent: string; // Target agent to execute
  prompt: string; // Prompt for the agent
  parent_session_id?: string;
  timeout_ms?: number;
}

interface Intent extends IntentSpec {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  created_at: number;
  started_at?: number;
  completed_at?: number;
  result?: string;
  error?: string;
}
```

### 3.4 Checkpoint Model (HITL)

```typescript
interface Checkpoint {
  id: string;
  decision_point: string;
  options: Array<{ id: string; label: string; description?: string }>;
  requested_by: string;
  requested_at: number;
  approved_by?: string;
  approved_at?: number;
  selected_option?: string;
  expires_at?: number;
}
```

---

## 4. Physical Resource Management (v4.1)

The Durable Stream now manages the full lifecycle of sessions, including hard delete and emergency abort.

### 4.1 Session Deletion (`session.delete`)

When a task completes or is no longer needed, the system can physically delete the session to free memory:

```typescript
class DurableStream {
  /**
   * Delete a session and emit lifecycle event for audit trail.
   */
  async deleteSession(client: OpencodeClient, sessionId: string, actor: string): Promise<void> {
    // 1. Call SDK to physically delete
    await client.session.delete({ path: { id: sessionId } });

    // 2. Emit event for audit trail and projection cleanup
    await this.append({
      type: 'lifecycle.session.deleted',
      stream_id: sessionId,
      correlation_id: this.correlationId,
      actor,
      payload: { deleted_at: Date.now() },
    });

    // 3. Auto-cleanup: Remove associated Intents/Checkpoints from memory
    this.cleanupProjections(sessionId);
  }
}
```

### 4.2 Session Abort (`session.abort`)

For emergency stops or recursive cancellation:

```typescript
class DurableStream {
  /**
   * Abort a running session and emit lifecycle event.
   */
  async abortSession(
    client: OpencodeClient,
    sessionId: string,
    actor: string,
    reason?: string
  ): Promise<void> {
    // 1. Call SDK to abort execution
    await client.session.abort({ path: { id: sessionId } });

    // 2. Emit event for audit trail
    await this.append({
      type: 'lifecycle.session.aborted',
      stream_id: sessionId,
      correlation_id: this.correlationId,
      actor,
      payload: { reason, aborted_at: Date.now() },
    });

    // 3. Update associated Intent status
    this.updateIntentStatus(sessionId, 'aborted');
  }
}
```

### 4.3 Recursive Cleanup Algorithm

When aborting a parent agent, all child sessions must be cleaned up:

```
┌─────────────────────────────────────────────────────────────────┐
│              RECURSIVE ABORT FLOWCHART                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [actor_abort called]                                           │
│         │                                                       │
│         ▼                                                       │
│  [Get ActorState.subAgents]                                     │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  For each subSessionId in executionStack (reverse):  │       │
│  │  1. Call stream.abortSession(subSessionId)           │       │
│  │  2. Remove from activeIntents Map                    │       │
│  │  3. Delete from SDK (optional)                       │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                                                       │
│         ▼                                                       │
│  [Update ActorState to FAILED phase]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration with OpenCode SDK

### 5.1 Event Bridging

| SDK Event | Durable Stream Event | Notes |
| :-- | :-- | :-- |
| `session.created` | `lifecycle.session.created` | Initialize lineage |
| `session.idle` | `lifecycle.session.idle` | Safe trigger for low-frequency projections |
| `session.compacted` | `lifecycle.session.compacted` | Context compaction marker |
| `session.error` | `lifecycle.session.error` | Error tracking |
| `message.updated` | `execution.message.updated` | Persisted mainly for completion markers; can auto-complete intents when `messageID` matches an intent id |
| `message.part.updated` (step-start/step-finish) | `execution.step_start` / `execution.step_finish` | Step lifecycle |
| `message.part.updated` (tool) | `execution.tool_start` / `execution.tool_finish` | Derived from `part.state.status` |
| `message.part.updated` (agent) | `execution.agent` | Agent identity + model metadata |
| `message.part.updated` (text) | `execution.text_delta` / `execution.text_snapshot` | Deltas streamed via `delta`; final snapshot emitted when part has `time.end` |
| `message.part.updated` (reasoning) | `execution.reasoning_delta` / `execution.reasoning_snapshot` | Same delta/snapshot split as text |
| `message.part.updated` (snapshot) | `execution.snapshot` | Full message snapshot |
| `message.part.updated` (retry) | `execution.retry` | Retry markers |
| `message.part.updated` (patch) | `files.patched` | Patch parts are treated as file patch events |
| `file.edited` | `files.changed` | Coarse-grained file change marker |
| `checkpoint.requested` | `checkpoint.requested` | Human approval workflow (emitted by orchestration) |

**Intent correlation**: When prompting a session, pass a stable `messageID` (typically the Durable Stream intent id). OpenCode then emits `message.updated` for that `messageID`, allowing Durable Stream to mark the intent completed/failed without polling.

### 5.2 The "Phantom" Session

For long-running background tasks:

1. **Spawn**: Create session with `parentID` but don't attach to UI.
2. **Operate**: Execute in background, logging to Durable Stream.
3. **Signal**: Use `agent_yield` + `checkpoint_request` to "phone home" to parent.
4. **Resume**: Parent calls `agent_resume` to continue background task.

---

## 6. Query API

### 6.1 StreamFilter

```typescript
interface StreamFilter {
  stream_id?: string;
  type?: EventType | EventType[];
  actor?: string;
  since?: number;
  until?: number;
  limit?: number;
}
```

### 6.2 Usage Examples

```typescript
// Get all events for a session
const events = await stream.getStreamEvents('sess_abc123');

// Query all aborted agents
const aborted = await stream.query({
  type: ['lifecycle.session.aborted', 'agent.aborted'],
});

// Get pending checkpoints
const checkpoints = stream.getPendingCheckpoints();
```

---

## 7. Future Roadmap

- **Distributed Stream**: Support networked backends (Redis/Postgres) for multi-agent coordination.
- **Time Travel Debugging**: Replay execution steps for error investigation.
- **Auto-Correction Gardener**: Background agent that reads error patterns and triggers debugger.

---

_Module Version: 4.1.0_
