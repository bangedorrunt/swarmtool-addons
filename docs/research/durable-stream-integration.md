# Durable Stream & OpenCode SDK Integration Analysis

## Executive Summary

The **Durable Stream** pattern represents a paradigm shift from **state-based** orchestration (polling, volatile memory) to **event-sourced** orchestration (append-only logs, replayable state). By leveraging OpenCode SDK's native hooks, the Durable Stream can serve as the "Black Box Recorder" and "State Engine" for agentic workflows, providing resilience, observability, and advanced Human-in-the-Loop (HITL) capabilities that the native SDK does not yet offer.

This analysis details how to bridge the `@opencode-ai/sdk` hooks into a `DurableStreamOrchestrator` and how this pattern benefits the broader OpenCode ecosystem.

---

## 1. The Core Synergies

| OpenCode SDK Capability           | Durable Stream Enhancement                                                                                                                                                                     |
| :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recursive Session Graph**       | **Lineage Tracking**: Durable Stream can flatten the recursive graph into a linear, queryable history (`trace_id`), making it easier to debug deep agent hierarchies.                          |
| **Plugin Hooks (`.event()`)**     | **Event Sourcing**: Instead of just reacting to events, `DurableStream` persists them (`.jsonl`), enabling crash recovery and "Time Travel" debugging.                                         |
| **Session State (`idle`/`busy`)** | **Context Snapshots**: When a session goes `idle`, Durable Stream can snapshot the context (memory/ledger), ensuring that if the session is killed, work can resume exactly where it left off. |
| **Tool Execution**                | **Orchestration**: `tool.execute.after` becomes the trigger for "Side Effects" (updating the Ledger, triggering Checkpoints) without modifying the agent's internal logic.                     |

---

## 2. Integration Architecture

The goal is to wire OpenCode's ephemeral events into the Durable Stream's persistent log.

### 2.1 The Bridge Component

A new `DurableStreamBridge` should be instantiated in `src/index.ts`. It subscribes to global OpenCode events and maps them to `StreamEventType`.

```typescript
// Conceptual Implementation in src/index.ts
const stream = getDurableStreamOrchestrator();

return {
  event: async ({ event }) => {
    // 1. Session Lifecycle
    if (event.type === 'session.created') {
      await stream.append({
        type: 'session.created',
        sessionId: event.data.id,
        payload: { parentId: event.data.parentId },
      });
    }

    // 2. Tool Execution (The Action Log)
    if (event.type === 'tool.execute.after') {
      await stream.append({
        type: 'agent.action',
        sessionId: event.data.sessionID,
        payload: {
          tool: event.data.toolName,
          result: event.data.result,
        },
      });
    }

    // 3. Error Recovery
    if (event.type === 'session.error') {
      await stream.append({
        type: 'agent.failed',
        payload: { error: event.data.error },
      });
      // Trigger auto-recovery workflow?
    }
  },
};
```

### 2.2 Replaces "Polling" with "Event-Driven"

Currently, `durable-stream.ts` mentions "Event-Driven Coordination: Use OpenCode's native event system instead of polling".

- **Old Way**: `skill_agent` calls a sub-agent and `await`s (polling loop).
- **Durable Way**:
  1.  `skill_agent` calls `client.session.promptAsync()` (fire and forget).
  2.  `DurableStream` records `handoff.initiated`.
  3.  OpenCode processes the sub-agent.
  4.  When sub-agent finishes, `session.idle` hooks fires.
  5.  `DurableStream` records `agent.completed`.
  6.  The Bridge sees this event and notifies the _Parent_ session (via `client.session.prompt()`) that the result is ready.

This unblocks the runtime and allows for **Asynchronous, Long-Running Agents**.

---

## 3. Benefits for Other OpenCode Developers

If this pattern were published as a library (`@swarmtool/durable-stream`), other developers could gain:

### 3.1 "Resievability" (Resilience + Observability)

- **Crash Proofing**: If the IDE reloads or the process dies, the `.jsonl` file remains. On startup, `DurableStream.initialize()` replays the history, restoring the in-memory state of valid checkpoints.
- **Audit Trails**: For enterprise use cases, having a permanent log of _every_ decision an agent made (and which human approved it) is critical.

### 3.2 Human-in-the-Loop acting as a "Pause Button"

OpenCode native SDK does not have a "Pause and Wait for Approval" state.

- **The Pattern**:
  1.  Agent calls `request_approval` tool.
  2.  `DurableStream` logs `checkpoint.requested` and sets state to "Waiting".
  3.  The _Automation_ stops.
  4.  User approves via UI (which calls `approve_checkpoint`).
  5.  `DurableStream` emits `checkpoint.approved`.
  6.  The Bridge picks this up and "pokes" the agent to resume.

### 3.3 "Context Teleportation"

Developers struggle with context (files, memory, instructions) getting lost between sub-agents.

- `DurableStream` implements `createContextSnapshot`.
- **Externalization**: Large snapshots are saved to `.opencode/snapshots/{id}.json` to avoid bloating the event log.
- When spawning a new agent, instead of passing a massive prompt, pass a `contextId` or `snapshotPath`.
- The new agent uses a tool `restore_context` (or `task_fetch_context`) to hydrate its state from the snapshot.

### 3.4 Active Recovery Tools

High-level agents (Chief-of-Staff) can now actively manage their workforce:

- **`task_kill`**: Forcefully stop a stuck or zombie agent.
- **`task_fetch_context`**: Retrieve the brain (snapshot) of a dead agent to pass to a new one.
- **`task_retry`**: Manually trigger a retry, bypassing the Observer's schedule.

---

## 4. Proposed Roadmap for Swarmtool-Addons

1.  **Wire the Bridge**: Modify `src/index.ts` to forward `event` hook data into `globalOrchestrator`.
2.  **Refactor `skill_agent`**: Make it "Durable Aware". If `async: true`, it should register the handoff in the stream.
3.  **Implement Resume**: In `src/index.ts`, add a startup check. `stream.initialize()` -> if pending checkpoints found, notify the user "Resuming previous session...".
4.  **TaskObserver**: Implement a passive background monitor (renamed from Supervisor) to handle timeouts and heartbeats without blocking the main thread.

## 5. Conclusion

Durable Stream is the "missing link" for building robust, long-running agentic workflows on OpenCode. By treating the SDK as the "Physical Layer" (execution) and Durable Stream as the "Data Link Layer" (state & reliability), we create a system that is both powerful and safe.
