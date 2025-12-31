# Durable Stream: Architecture & API Specification

## 1. Architectural Vision

The **Durable Stream** serves as the "hippocampus" (long-term episodic memory) and "brainstem" (autonomic orchestration) for OpenCode agents.

### The Problem (`Gap Analysis`)
The native OpenCode SDK is designed for **synchronous, ephemeral, request-response** interactions.
*   **State Amnesia**: If the host process (IDE/Server) restarts, all in-progress orchestration loops are lost.
*   **Opaque Lineage**: Debugging a multi-agent swarm requires grepping through transient logs.
*   **Rigid Orchestration**: "Fire-and-forget" is easy, but "Fire, Wait for Signal, Resume" is hard.

### The Solution (`Durable Stream`)
We implement an **Event Sourced** architecture where:
1.  **Truth is the Log**: The current state of any agent swarm is derived exclusively by replaying the event log.
2.  **Async by Default**: All significant actions are asynchronous message passing, bridging the gap between "Tool Calls" (synchronous) and "Workflows" (asynchronous).
3.  **Projection-Based State**: We project linear event streams into "State Snapshots" for fast access.

---

## 2. Core API Design

The module `src/durable-stream` exposes a singleton `Orchestrator` that wraps the file-system stream.

### 2.1 The Event Envelope (`StreamEvent`)

We standardize on a rigorous event envelope to ensure forward compatibility.

```typescript
type EventType = 
  | 'lifecycle.session.created'    // Native OpenCode map
  | 'lifecycle.session.ended'
  | 'agent.spawned'                // Orchestrator intent
  | 'agent.handoff'                // Control flow
  | 'agent.correction'             // Learning signal
  | 'execution.step'               // Granular thought
  | 'workflow.checkpoint';         // HITL

interface StreamEvent<T = unknown> {
  id: string;             // ULID (Timestamp + Random) for sortability
  type: EventType;
  stream_id: string;      // Usually the root SessionID (Trace ID)
  causation_id: string;   // The event that caused this one (Parent ID)
  correlation_id: string; // The specific workflow invocation flow
  actor: string;          // "chief-of-staff/oracle" or "user"
  timestamp: number;
  payload: T;
  metadata?: Record<string, unknown>;
}
```

### 2.2 The Store API (`IStreamStore`)

Abstracting the storage allows us to move from `jsonl` (v1) to `sqlite` (v2) seamlessly.

```typescript
interface IStreamStore {
  // Append a new event to the durable log
  append(event: StreamEvent): Promise<void>;
  
  // Replay events for a specific stream (Trace)
  // Used to hydrate state after crash
  readStream(streamId: string, fromOffset?: number): AsyncIterable<StreamEvent>;
  
  // Query across streams (e.g. "Find all errors today")
  query(filter: StreamFilter): Promise<StreamEvent[]>;
}
```

### 2.3 The Orchestrator API (`DurableStream`)

This is the public developer-facing API.

```typescript
class DurableStream {
  /**
   * Observe: Listens to OpenCode native events and projects them onto the Stream.
   * "The Bridge"
   */
  observe(client: OpencodeClient): void;

  /**
   * Intent: Register a high-level intent that survives crashes.
   * e.g., "I want to refactor this file, call me back when done."
   */
  async registerIntent(intent: Intent): Promise<string> {
    // 1. Log 'intent.created'
    // 2. Return intent_id
  }

  /**
   * Resume: Rebuilds the in-memory orchestration state from disk.
   * Call this on plugin startup.
   */
  async resume(): Promise<void> {
    // 1. Read all 'active' streams
    // 2. Reconstruct pending Promises/Callbacks
    // 3. Emit 'resume' signal to agents
  }
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
