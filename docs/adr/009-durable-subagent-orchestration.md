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

We will implement a Durable Subagent Orchestration layer built upon `LEDGER.md`, `TaskRegistry`, and `EventLog`.

### 1. Extended Task State Machine

We will add a `suspended` state to the Task status enum.
• **`suspended`**: The task is alive but waiting for an external event (signal) to resume.

### 2. Context Snapshots

The `Task` schema in `TaskRegistry` and `LEDGER.md` will be extended with a `snapshot` field (JSON). This field will store:
• Partial conversation history of the subagent.
• Internal meta-data required to re-hydrate the agent's thinking process.
• The specific reason/query for suspension.

### 3. Yield/Resume Protocol

• **`agent_yield(reason, snapshot)`**: A new internal tool that allows a subagent to persist its state to the LEDGER and return control to the parent.
• **`agent_resume(task_id, signal_data)`**: A tool for the Parent/Orchestrator to wake up a suspended subagent, injecting the `signal_data` back into its context.

### 4. Upward Instruction via EventLog

Subagents will use the `EventLog` to emit "Signal Events" targeted at the Parent Agent.
• **Type**: `UPWARD_SIGNAL`
• **Payload**: `{ action: 'ASK_USER' | 'SPAWN_HELPER' | 'LOG_METRIC', data: any }`
• The Parent Agent (Chief of Staff) will use tool hooks to monitor the `EventLog` and process these signals while the subagent remains in the background or moves to `suspended` state.

## Workflow Improvements & Examples

### Improvement 1: "Ask User Question" (Simplified Loop)

**Current Pattern (`ama.md`)**:

1. CoS spawns Oracle.
2. Oracle returns a specific string "Before I can recommend...".
3. CoS parses the string, switches to Interviewer.
4. CoS runs Interviewer loop manually.
5. CoS re-spawns Oracle with accumulated results. (Context loss: Oracle starts from scratch).

**Durable Pattern**:

1. CoS spawns Oracle.
2. Oracle hits ambiguity, calls `agent_yield(reason: "clarify auth method", snapshot: { ... })`.
3. CoS sees `suspended` status, spawns Interviewer to resolve the _specific reason_.
4. Once resolved, CoS calls `agent_resume(oracle_id, signal: "User chose OAuth")`.
5. **Benefit**: Oracle resumes exactly where it left off, retaining its "thinking" context.

### Improvement 2: SDD (Autonomous Background Executor)

**Current Pattern (`sdd.md`)**:

1. CoS runs SDD phases sequentially.
2. If Executor hits a blocker (e.g., "Which port for the DB?"), it usually fails or waits for CoS.

**Durable Pattern**:

1. CoS spawns Executor for a task.
2. User wants to do something else, presses `CTRL+B`.
3. Executor is moved to background (via `Supervisor`).
4. Executor discovers it needs a port choice, sends `UPWARD_SIGNAL(action: 'ASK_USER', query: 'DB Port?')`.
5. Parent Agent receives "wake up" notification: "Executor-123 needs input".
6. User provides port, Parent forwards to Executor via `agent_resume`.
7. **Benefit**: Multitasking without blocking the main interaction thread.

## Consequences

### Positive

• **Reliability**: Workflows can survive session crashes and network interruptions.
• **Efficiency**: Parent agents are freed from busy-waiting for child results.
• **HITL (Human-In-The-Loop)**: Enables complex scenarios where a background agent can "pop up" to ask a question and then go back to work.
• **Context Optimization**: Reduces parent context by delegating long-running state to child snapshots.

### Negative

• **Complexity**: Managing state snapshots increases the complexity of the `TaskRegistry`.
• **Concurrency**: Risk of race conditions if multiple agents attempt to update the same `LEDGER.md` entries (requires atomic file operations or locking).
• **Storage**: `LEDGER.md` size may grow significantly with large snapshots (requires a cleanup/archiving strategy).
