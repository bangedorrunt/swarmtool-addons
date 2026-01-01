# Durable Stream: Architecture & API Specification (v2)

> **Status**: Living Document | **Last Reviewed**: 2026-01-01

## 1. Architectural Vision

The **Durable Stream** serves as the "hippocampus" (long-term episodic memory) and "brainstem" (autonomic orchestration) for OpenCode agents. It is designed as a **thin, non-invasive layer** on top of the native OpenCode SDK, not a replacement.

### 1.1 The Problem (`Gap Analysis`)

The native OpenCode SDK provides excellent **real-time, event-driven primitives**. However, it lacks:
| Gap | Native SDK State | Durable Stream Solution |
| :--- | :--- | :--- |
| **State Amnesia** | Process state is ephemeral. | Persist events to `.jsonl`. Replay on startup. |
| **HITL Workflow** | No native "pause and wait for approval". | `checkpoint.requested` / `checkpoint.approved` events. |
| **Multi-session Lineage** | `session.children` exists but querying is limited. | Unified `stream_id` (Trace ID) across all sub-sessions. |

### 1.2 Design Principles

1.  **Leverage, Don't Replace**: The SDK's `session.todo`, `session.diff`, `StepPart` are native. The Durable Stream *observes* them, not replicates.
2.  **Event Sourcing**: The log is the single source of truth. State is derived.
3.  **Pluggable Storage**: Start with `jsonl`, graduate to SQLite or libSQL.

---

## 2. SDK Primitives We Leverage

The latest `@opencode-ai/sdk` has powerful, underutilized primitives. Our Durable Stream strategy is to **observe and extend them**, not bypass them.

### 2.1 Session Management
| SDK API | Purpose | Durable Stream Usage |
| :--- | :--- | :--- |
| `session.create({ parentID })` | Lineage | Map to `stream_id` (Trace) and `causation_id` (Parent). |
| `session.children()` | List child sessions | Query children; map to our "Span" concept. |
| `session.abort()` | Cancel sub-agent | Emit `agent.aborted` event upon interception. |
| `session.summarize()` | Native summary | Use for context compaction before handoff. |
| `session.diff()` | Get file changes | Log `files.changed` event with delta payload. |
| `session.todo()` | Native task list | **Critical**: Replace our custom task tracking with this! |

### 2.2 Message Parts (Granular Steps)
The SDK exposes `StepStartPart` and `StepFinishPart` within message parts. This is the **native "execution step" primitive**.
| Part Type | Payload | Durable Stream Event Mapping |
| :--- | :--- | :--- |
| `step-start` | `{ snapshot? }` | `execution.step_start` |
| `step-finish` | `{ reason, cost, tokens }` | `execution.step_finish` |
| `tool` | `{ state: ToolState }` | `execution.tool_use` |
| `compaction` | `{ auto }` | `lifecycle.compacted` |
| `patch` | `{ hash, files }` | `files.patched` |

### 2.3 Plugin Hooks
The `@opencode-ai/plugin` Hooks interface is our primary ingestion point.
| Hook | Trigger | Durable Stream Action |
| :--- | :--- | :--- |
| `event` (global) | All SDK events | **The Bridge**: Forward relevant events to `IStreamStore.append()`. |
| `chat.message` | New user message | Log `user.input` for learning/replay. |
| `tool.execute.after` | Tool completes | Log `execution.tool_result`. |
| `permission.ask` | Permission requested | Log `checkpoint.requested` (HITL). |

---

## 3. Core API Design (Revised)

### 3.1 The Event Envelope (`StreamEvent`)

```typescript
type EventType =
  // Lifecycle (Maps to SDK events)
  | 'lifecycle.session.created'
  | 'lifecycle.session.idle'
  | 'lifecycle.session.compacted'
  // Execution (Maps to SDK StepPart / ToolPart)
  | 'execution.step_start'
  | 'execution.step_finish'
  | 'execution.tool_use'
  // Agent (Our orchestration layer)
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.aborted'
  | 'agent.handoff'
  // HITL (Human-in-the-Loop)
  | 'checkpoint.requested'
  | 'checkpoint.approved'
  | 'checkpoint.rejected'
  // Files
  | 'files.changed'
  | 'files.patched';

interface StreamEvent<T = unknown> {
  id: string;             // ULID
  type: EventType;
  stream_id: string;      // Root SessionID = Trace ID
  causation_id?: string;  // Parent Event ID
  correlation_id: string; // Workflow Run ID
  actor: string;          // "user" | agent name
  timestamp: number;
  payload: T;
  metadata?: Record<string, unknown>;
}
```

### 3.2 The Orchestrator API (`DurableStream`)

```typescript
class DurableStream {
  // Called at plugin startup. Wires SDK hooks to the stream.
  observe(client: OpencodeClient, hooks: Hooks): void;

  // Create an Intent (survives crashes)
  async createIntent(spec: IntentSpec): Promise<string>;

  // Request HITL approval
  async requestCheckpoint(decision: string, options: CheckpointOption[]): Promise<string>;

  // Resume state from disk (on plugin restart)
  async resume(): Promise<ResumeResult>;

  // Query the stream (for debugging, analytics)
  async query(filter: StreamFilter): Promise<StreamEvent[]>;
}
```

---

## 3. Integration with OpenCode SDK

The magic happens in how we interpret SDK primitives.

### 3.1 "The Session is the Stream"
We map OpenCode `SessionID` to Durable Stream `StreamID`.
*   **Root Session** = **Trace ID**.
*   **Child Session** = **Span ID**.

### 3.2 Bridging Hooks
We use the `@opencode-ai/plugin` hooks to automatically capture state changes.

| OpenCode Hook | Durable Stream Event | Purpose |
| :--- | :--- | :--- |
| `session.created` | `lifecycle.session.created` | Initialize lineage tracking |
| `tool.execute.after` | `execution.step` | Record actions/outcomes (Audit Log) |
| `chat.message` (User) | `human.input` | Capture human feedback (Learning) |

### 3.3 The "Phantom" Session
To handle long-running async tasks without blocking the UI, we utilize **Phantom Sessions**.
*   The Orchestrator creates a session *without* attaching it to the current UI thread.
*   It operates in the background, logging to Durable Stream.
*   When it needs user input, it uses `notify_user` to "phone home" to the main session.

---

## 4. Future Proofing

### 4.1 Time Travel Debugging
By having a deterministic log of `execution.step`, we can build a UI that lets users "replay" the agent's thought process, step-by-step, to understand *why* it made a mistake.

### 4.2 Collaborative Agents
Since the State is decoupled from the Process, multiple agents (running in different processes/machines) could theoretically share the same Durable Stream (using a networked backend like Redis/Postgres in v2) to coordinate without direct communication.

### 4.3 Auto-Correction (Self-Healing)
We can run a background "Gardener" agent that reads the Stream API:
*   `stream.query({ type: 'agent.error' })`
*   If error rate > threshold -> Trigger 'chief-of-staff/debugger'.
This enables autonomous loop correction.

---

## 5. Refactor Roadmap

1.  **Formalize `src/durable-stream`**: Implement the strict types and Store abstraction.
2.  **Implement the Bridge**: Wire `src/index.ts` to push into `IStreamStore`.
3.  **Migrate Tools**: Update `agent_spawn` to use `DurableStream.registerIntent`.
