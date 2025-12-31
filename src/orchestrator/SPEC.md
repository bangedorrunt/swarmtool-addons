# Orchestrator Module: Technical Specification

The Orchestrator module is the engine of the skill-based subagent system. It manages agent lifecycles, supervises background tasks, and ensures state continuity through the `LEDGER.md`.

## 1. Actor Execution Patterns

The orchestrator implements three primary communication patterns between the Coordinator and the Specialist Actor.

### I. Communication Modes Summary

| Mode              | async value | Visibility          | Result      | Use Case                                     |
| :---------------- | :---------- | :------------------ | :---------- | :------------------------------------------- |
| Async (Handoff)   | true        | User sees sub-agent | No result   | Interviewer, Spec-Writer, Planner (dialogue) |
| Sync (Background) | false       | Hidden from user    | Text result | Oracle, Executor, Validator                  |

#### When to Use Async (Handoff)

• Interviewer: User needs to answer questions
• Spec-Writer: User needs to approve specification
• Planner: User needs to approve implementation plan
• Any agent operating in DIALOGUE mode

#### When to Use Sync (Background)

• Oracle: Strategic decomposition (no user input needed)
• Executor: Code implementation (supervised by TaskRegistry)
• Validator: Quality checks (automated)
• Any task where parent needs the result to continue

### II. Sequential (Durable Stream)

Used for background delegation where the Coordinator needs the result to proceed.

- `async: false` in `skill_agent`.
- Spawns a new isolated session.
- Polls for `idle` status before retrieving the last assistant message.

### II. Parallel (Interactive Handoff)

Used when the Specialist needs to interact directly with the user.

- `async: true` in `skill_agent`.
- Returns a `HANDOFF_INTENT` metadata.
- Intercepted by the `tool.execute.after` hook.
- Triggers a `promptAsync` after a 800ms settlement delay.

### III. Map-Reduce (Parallel Fan-out)

Used for executing multiple independent tasks simultaneously.

- **Tools**: `skill_spawn_batch` and `skill_gather`.
- **Workflow**:
  1. `spawn_batch` registers multiple tasks in the `TaskRegistry`.
  2. Observer monitors all sessions in parallel.
  3. `skill_gather` aggregates results into a structured array once all tasks reach `idle`.

## 2. Task Observation & Resilience

### I. Task Registry

Maintains an in-memory map of all delegated tasks:

- `taskId`: Linked to `LEDGER.md` (e.g., `abc123.1`).
- `sessionId`: The isolated session ID.
- `heartbeat`: Last activity timestamp for stuck detection.
- `retryCount`: Tracks attempts (max 2).

### II. Task States & Observer Actions

| State       | Description             | Observer Action              |
| ----------- | ----------------------- | ---------------------------- |
| `pending`   | Registered, not started | None                         |
| `running`   | Actively executing      | Check for timeout/stuck      |
| `completed` | Finished successfully   | Fetch result & update LEDGER |
| `failed`    | Error occurred          | Log anti-pattern & Retry     |
| `timeout`   | Exceeded `timeout_ms`   | Kill session & Retry         |
| `blocked`   | Waiting for user input  | Alert Coordinator            |

### III. Observer Loop

A background watchdog that runs every 30s-120s (adaptive interval):

1. **Adaptive Interval**: Checks more frequently for high-complexity tasks.
2. **Auto-Retry**: Creates a **new session** for retries to ensure a clean context.
3. **Silent Sync**: Automatically updates `LEDGER.md` tasks upon state changes.

### IV. Recovery Tools

High-level agents (Chief-of-Staff) have explicit tools to handle deadlocks:

- **`task_kill`**: Forcefully mark a stuck task as failed (stopping the clock).
- **`task_fetch_context`**: Retrieve the full context snapshot (including memory and file state) from a failed task to pass to a replacement agent.
- **`task_retry`**: Manually trigger a retry for a failed task (bypassing the Observer's schedule).

## 3. Durable Messaging (SwarmMail)

Agents can coordinate without direct parent-child blocking via the **SwarmMail** bus.

- **Pattern**: `swarmmail_send()` --> `Inbox` --> `swarmmail_inbox()`.
- **Use Case**: Long-running tasks where the coordinator might clear its context before the worker finishes.

## 3.5 LEDGER.md Persistence & Crash Recovery

All task state is persisted to `.opencode/LEDGER.md` for resilience.

### State Synchronization

```typescript
// On task update
await updateTaskStatus(ledger, taskId, 'completed', result);
await saveLedger(ledger); // Persists to .opencode/LEDGER.md

// On session start
const ledger = await loadLedger();
const tasks = await TaskRegistry.loadFromLedger(); // Restore running tasks
```

### Crash Recovery Workflow

```
┌───────────────────────────────────────────────────────────┐
│                   SESSION START                            │
├───────────────────────────────────────────────────────────┤
│ 1. Load .opencode/LEDGER.md                               │
│ 2. Check for active Epic                                   │
│    ├─ YES → Resume:                                        │
│    │   • pending tasks → re-queue in TaskRegistry         │
│    │   • running tasks → mark stuck, schedule retry       │
│    │   • completed tasks → aggregate for summary          │
│    └─ NO → Start fresh epic                               │
│ 3. Check for Handoff                                       │
│    └─ YES → Display "Resuming: {what's next}"             │
│ 4. Query LEDGER + Memory Lane for learnings               │
└───────────────────────────────────────────────────────────┘
```

### Error Handling: User Rejection Flows

| Agent           | Rejection Response   | Next Action                            |
| --------------- | -------------------- | -------------------------------------- |
| **Interviewer** | User rejects summary | Loop back to `needs_input`, re-gather  |
| **Spec-Writer** | User rejects spec    | Revise specification, re-prompt        |
| **Planner**     | User rejects plan    | Return to Oracle with feedback         |
| **All**         | User says "cancel"   | Archive epic as CANCELLED, clear state |

## 4. Interaction Patterns (Human-in-the-Loop)

These patterns define how agents interact with mandatory approval checkpoints.

### I. Pattern 1: Ask User Question Workflow (Interviewer-Led)

Use Case: Ambiguous requests requiring clarification.

```
 USER        CHIEF-OF-STAFF    INTERVIEWER    ORACLE        PLANNER
  | "Build OAuth" |              |              |              |
  |-------------->| Analyze      |              |              |
  |               | skill_agent  |              |              |
  |               |------------->| Check Memory |              |
  |               |              |<------------>|              |
  |               |              | HANDOFF      |              |
  | "Google/JWT"  |<-------------| "Clarify..." |              |
  |-------------->|              |              |              |
  |               |              | Accumulate   |              |
  | "Yes, go"     |<-------------| "Summary..." |              |
  |-------------->|              | approved     |              |
  |               | status: approved            |              |
  |               | consult Oracle              |              |
  |               |---------------------------->|              |
  |               |                             | Decompose    |
  |               | skill_agent (async: true)   |<-------------|
  |               |------------------------------------------->|
  |               |                             | HANDOFF      |
  | "Execute"     |<-------------------------------------------|
  |-------------->|                             | approved     |
```

### II. Pattern 2: SDD Workflow

Use Case: Formal specification and phased execution.

```
 USER    CHIEF    INTERVIEWER    SPEC WRITER    ORACLE    PLANNER    EXECUTOR
  | Req   |          |              |              |         |          |
  |------>| Phase 1: Clarification  |              |         |          |
  |       |--------->| needs_input  |              |         |          |
  | Ans   |<---------|              |              |         |          |
  |------>| approved |              |              |         |          |
  |       | Phase 2: Specification  |              |         |          |
  |       |------------------------>| needs_appr   |         |          |
  | Appr  |<------------------------|              |         |          |
  |------>| approved                |              |         |          |
  |       | Phase 3: Strategy (Sync)|              |         |          |
  |       |--------------------------------------->| Tasks   |          |
  |       | Phase 4: Planning (Async)              |<--------|          |
  |       |------------------------------------------------->| needs_appr|
  | Appr  |<-------------------------------------------------|          |
  |------>| approved                                         |          |
  |       | Phase 5: Supervised Execution                    |          |
  |       |------------------------------------------------------------>|
```

## 5. Implementation Logic

### I. Chief-of-Staff TaskRegistry Integration

```typescript
async function orchestrateWithSupervision(plan: OracleStrategy) {
  const taskIds: string[] = [];
  for (const phase of plan.phases) {
    if (phase.mode === 'parallel') {
      const phaseTaskIds = await Promise.all(
        phase.tasks.map((task) =>
          skill_agent({
            agent_name: 'executor',
            prompt: task.description,
            async: false,
            max_retries: 3,
            timeout_ms: 180000,
          })
        )
      );
      taskIds.push(...phaseTaskIds);
    } else {
      for (const task of plan.tasks) {
        const taskId = await skill_agent({
          agent_name: 'executor',
          prompt: task.description,
          async: false,
          max_retries: 3,
        });
        taskIds.push(taskId);
      }
    }
  }
  return await task_aggregate({ task_ids: taskIds });
}
```

### II. TaskObserver Background Monitoring

• Interval: Adaptive polling (every 10-30s).
• Timeout Detection: Kills sessions and retries up to max_retries.
• Stuck Detection: Restarts tasks with no progress for 30s.
• State Sync: Updates session status and fetches results upon completion.

## 6. Access Control Policy

To ensure coordination integrity, sub-agents are protected:

- **Protected List**: `executor`, `planner`, `validator`, `oracle`, `librarian`, `interviewer`, `spec-reviewer`, `code-quality-reviewer`, `debugger`.
- **Rule**: They only respond to `chief-of-staff` or the user.
- **Error**: `ACCESS_DENIED` with a suggestion to use the coordinator.

---

_Architecture Version: 3.1.0 (Map-Reduce Enabled)_
