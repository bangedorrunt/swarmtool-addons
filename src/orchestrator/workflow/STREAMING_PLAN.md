# STREAMING_PLAN.md - Durable Progress Streaming Implementation (COMPLETED)

## Summary

Implement a high-fidelity progress streaming system that persists to LEDGER.md, allowing users to track real-time agent operations even across session restarts.

## Implementation Details

### Task: dps001.1 - Core Durable Stream Manager

- **File to create**: `src/orchestrator/durable-stream.ts`
- **Purpose**: Manage the state of streaming updates and persistence to LEDGER.
- **Steps**:
  1. Define `StreamMessage` and `StreamState` interfaces.
  2. Implement `DurableStreamManager` class.
  3. Add methods for `push`, `flush`, and `recovery`.
  4. Ensure lock-safe writes to LEDGER.md.

### Task: dps001.2 - Orchestrator Hook Integration

- **Files to modify**:
  - `src/orchestrator/actor/core.ts`
  - `src/orchestrator/ledger.ts`
- **Purpose**: Connect the streaming manager to the orchestrator lifecycle and extend LEDGER schema.
- **Steps**:
  1. Update `Ledger` interface to include `streaming_log`.
  2. Add hooks in `OrchestratorCore` to emit stream events during task execution.
  3. Implement automatic flush on significant events (task start/completion).

### Task: dps001.3 - UI/UX Progress Feedback

- **Files to modify**:
  - `src/orchestrator/chief-of-staff/agents/executor/SKILL.md`
- **Purpose**: Ensure agents provide formatted streaming updates that the manager can capture.
- **Steps**:
  1. Update Executor skill to follow the streaming protocol.
  2. Add validation in Validator to check for streaming output consistency.
  3. Final end-to-end integration test with a dummy task.

## Risks

- **LEDGER Bloat**: Excessive streaming might make LEDGER.md too large.
  - _Mitigation_: Implementation should rotate or truncate logs after tasks complete.
- **Concurrency**: Multiple agents writing to LEDGER.
  - _Mitigation_: Use the existing `proper-lockfile` mechanism in `ledger.ts`.

## Effort

- Total: Medium (8-12h)
- dps001.1: 4h
- dps001.2: 4h
- dps001.3: 2h
