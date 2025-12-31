# ADR 009: Durable Subagent Orchestration (Yield/Resume & Upward Instruction)

## Status

Proposed

## Context

Our current multi-agent system supports asynchronous execution via `skill_agent(async: true)`, but it lacks sophisticated coordination patterns required for long-running, interactive workflows.

Specifically:
• Subagents cannot pause their execution to wait for parent or user intervention without losing their local execution context.
• There is no formal protocol for "Upward Instruction" where a child agent can request the parent (Chief of Staff) to perform actions (like prompting the user) while remaining active in the background.
• Resuming a task after a session break or a pause requires a durable way to store and recover the conversation snapshot and internal state.

These gaps prevent us from achieving parity with advanced "Agentic OS" features seen in industry-leading tools like Claude Code.

## References

This design is inspired by advanced agentic coordination patterns observed in modern AI CLI tools (e.g., Claude Code), specifically:
• **X Post by @dexhorthy (Dec 2025)**: Highlights the `resuming...`, `foreground...`, and `subagents...` CLI states.
• **Pattern: Yield/Resume**: Ability for long-running background subagents to pause themselves, return info to parent, and resume with full context.
• **Pattern: Upward Instruction**: Subagents acting as "internal orchestrators" that instruct the parent to perform tasks (e.g., "Ask user a multiple choice question") and then resume once the parent satisfies the request.
• **UI Integration**: Use of `CTRL+B` to background tasks and automatic "wake up" notifications for the parent agent.

## Decision

We will implement a Durable Subagent Orchestration layer built upon `LEDGER.md`, `TaskRegistry`, and a new **Event-Driven Signal Buffer**.

### 1. Extended Task State Machine

We will add a `suspended` state to the Task status enum in the `TaskRegistry`.
• **`suspended`**: The task is alive but waiting for an external event (signal) to resume.

### 2. Context Snapshots via Session References via

Instead of serializing raw conversation history (which is expensive and error-prone), we will use **Session References**.
• The `Task` schema in `LEDGER.md` will store a `session_id`.
• The **OpenCode Session Graph** natively persists the conversation history.
• The "Snapshot" is simply a pointer: `{ session_id: "sess-123", yield_reason: "Ask User", reasoning_summary: "..." }`.

### 3. Yield/Resume Protocol

• **`agent_yield(reason, summary)`**:
  - Captures the current `session_id`.
  - Updates `LEDGER.md` to `suspended` with the provided reason.
  - Returns a system-level `HANDOFF_INTENT` signal (invisible to the LLM context) to notify the orchestrator.

• **`agent_resume(task_id, signal_data)`**:
  - Looks up the `session_id` from the ledger.
  - Calls `client.session.promptAsync()` to inject the behavior signal back into the suspended session.

### 4. Event-Driven Signal Buffering (solving "Parent Busy")

To handle cases where the Parent Agent is busy (e.g., streaming) when a child yields, we introduces a **Signal Buffer**:

• **Signal Queue**: A persistent queue (in Ledger) for `UPWARD_SIGNAL`s.
• **Event Listener**: A plugin hook listens for `session.status` events.
• **Auto-Flush**: When the Parent Session transitions to `idle`, the buffer automatically flushes pending signals using `client.session.promptAsync`.

This ensures "Wake Up" notifications are never lost, even if the parent is mid-thought.

## Workflow Improvements & Examples

### Improvement 1: "Ask User Question" (Simplified Loop)

**Durable Pattern**:

1. **Spawn**: CoS spawns Oracle.
2. **Yield**: Oracle hits ambiguity, calls `agent_yield(reason: "clarify auth")`. System marks task `suspended`.
3. **Signal**: System emits `UPWARD_SIGNAL`.
4. **Buffer/Deliver**:
   - If CoS is `idle`: Signal is delivered immediately.
   - If CoS is `busy`: Signal is queued. Once CoS finishes, system pushes: *"Oracle-123 needs input: clarify auth"*.
5. **Resume**: CoS calls `agent_resume(oracle_id, signal: "OAuth")`.
6. **Continue**: Oracle receives "OAuth" in its existing session constraints and continues.

## Consequences

### Positive

• **Reliability**: Workflows survive crashes/restarts because `session_id` pointers are durable in `LEDGER.md`.
• **Efficiency**: Parent context is not polluted with child history; only the "Yield Reason" is surfaced.
• **Robustness**: The Signal Buffer prevents race conditions where child agents try to interrupt a busy parent.
• **Simplicity**: No need to implement complex state serialization; we leverage the native OpenCode session storage.

### Negative

• **Latency**: Buffering signals means a subagent might wait longer if the parent is extremely chatty.
• **Tool Overhead**: Requires strict implementation of `agent_yield` so agents don't "forget" to yield when stuck.
