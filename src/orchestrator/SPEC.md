# Orchestrator Module: Technical Specification (v4.1)

The Orchestrator module is the governance engine and lifecycle manager of the system. It implements a **Governance-First** architecture with **Event-Sourced Persistence** and **Physical Resource Management**.

## 1. Core Architecture: Governance-First (v4.1)

v4.1 extends the governance model with universal lifecycle hooks and the **Actor Model** for subagent isolation.

### I. Governance Loop (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOVERNANCE LOOP (3-PHASE)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: STATE CHECK                                           │
│  └─▶ Read LEDGER.md ──▶ Detect Missing Directives ──▶ Poll User │
│                                                                 │
│  PHASE 2: DELEGATION                                            │
│  └─▶ Spawn Actor ──▶ Pass Directives ──▶ Auto-Track Changes     │
│                                                                 │
│  PHASE 3: AUDIT & LEARN                                         │
│  └─▶ Merge Assumptions ──▶ Extract Patterns ──▶ Update Ledger   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### II. State Taxonomy

| State Type      | Location            | Mutability | Enforcement               |
| :-------------- | :------------------ | :--------- | :------------------------ |
| **Directives**  | LEDGER → Governance | Immutable  | **The Law**: Must Obey    |
| **Assumptions** | LEDGER → Governance | Mutable    | **The Debt**: Must Audit  |
| **Learnings**   | Memory Lane         | Cumulative | **Wisdom**: Cross-session |

---

## 2. Actor Model Data Schemas (v4.1)

### 2.1 Complete Actor State (`ActorState`)

```typescript
interface ActorState {
  /** Current workflow phase */
  phase: ActorPhase;

  /** OpenCode session ID for this actor */
  sessionId: string;

  /** Parent session ID (Required in SDK V2 for trace propagation) */
  parentSessionId: string;

  /** Root session ID of the user request */
  rootSessionId: string;

  /** Ancestor chain of session IDs to prevent recursion */
  executionStack: string[];

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

type ActorPhase = 'INIT' | 'PLANNING' | 'VALIDATING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
```

### 2.2 Sub-Agent State (`SubAgentState`)

```typescript
interface SubAgentState {
  sessionId: string;
  status: 'spawned' | 'running' | 'completed' | 'failed' | 'suspended';
  agent: string;
  spawnedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}
```

### 2.3 Explicit Direction (`ExplicitDirection`)

```typescript
interface ExplicitDirection {
  goals: string[];
  constraints: string[];
  decisions: string[];
}
```

### 2.4 Tracked Assumption (`TrackedAssumption`)

```typescript
interface TrackedAssumption {
  worker: string;
  assumed: string;
  confidence: number;
  verified: boolean;
  timestamp: string;
}
```

---

## 3. LEDGER.md Data Schemas (v4.1)

### 3.1 Task Status

```typescript
type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'suspended'
  | 'stale';
```

### 3.2 Epic Structure

```typescript
interface Epic {
  id: string; // Format: abc123
  title: string;
  request: string;
  status: EpicStatus;
  createdAt: number;
  completedAt?: number;
  tasks: Task[];
  context: string[];
  progressLog: string[];
}

type EpicStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
```

### 3.3 Task Structure

```typescript
interface Task {
  id: string; // Format: abc123.1
  title: string;
  agent: string;
  status: TaskStatus;
  outcome: TaskOutcome;
  dependencies: string[];
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  sessionId?: string; // Durable Subagent Reference
  yieldReason?: string;
  yieldSummary?: string;
  affectsFiles?: string[];
  filesModified?: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
  conflictInfo?: {
    type: 'file_collision' | 'import_conflict' | 'state_conflict' | 'resource_lock';
    conflictingTaskId?: string;
    conflictingFiles?: string[];
    resolution?: 'retried' | 'redecomposed' | 'sequential';
  };
}

type TaskOutcome = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | '-';
```

---

## 4. Background HITL & Handoff Protocol (v4.1)

The orchestrator supports long-running background subagents that can autonomously pause and resume execution.

### I. The "Pop-Up" Pattern

1. **Spawn**: A subagent is spawned as a `background_task` (async).
2. **Yield**: When the subagent encounters ambiguity, it calls `agent_yield` and returns a `HANDOFF_INTENT`.
3. **Upward Instruction**: The parent (Chief-of-Staff) receives the handoff metadata and executes the requested action (e.g., `checkpoint_request` for a poll).
4. **Resume**: After the human response is captured, the parent calls `agent_resume` to wake the subagent, which continues from its exact state.

### II. Resilient Orchestration

Because all lifecycle events are mirrored in the **Durable Stream**, the orchestrator can:

- **Pause during crashes**: If the system restarts while a subagent is yielded, the event log ensures the session is resumed once the human responds.
- **Maintain Lineage**: Tracks parent-child instructions to ensure the correct "proxy" executes the HITL request.

---

## 5. Physical Resource Management (v4.1)

v4.1 introduces hard resource cleanup to prevent memory leaks in long-running sessions.

### I. Resource Lifecycle States

```
┌─────────────────────────────────────────────────────────────────┐
│                  RESOURCE LIFECYCLE STATES                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [SPAWNED] ──▶ [RUNNING] ──▶ [COMPLETED] ──▶ [DELETED]         │
│       │              │             │              │             │
│       │              │             │              ▼             │
│       │              │             │       [Freed Memory]       │
│       │              │             │                           │
│       │              │             ▼                           │
│       │              │       [RUNNING] ──▶ [ABORTED]           │
│       │              │             │              │             │
│       │              │             │              ▼             │
│       │              │             │       [Freed Memory]       │
│       │              │             │                           │
│       │              ▼             ▼                           │
│       └──────▶ [STALE/IDLE] ───────▶ [AUTO-CLEANUP]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### II. Recursive Abort Algorithm

When `actor_abort` is called, the system performs cascading cancellation:

```typescript
async function recursiveAbort(sessionId: string, actor: string) {
  // 1. Get ActorState to find all sub-agents
  const state = await loadActorState();

  // 2. Abort in reverse order (children first)
  const subSessionIds = Object.keys(state.subAgents);
  for (const subId of subSessionIds.reverse()) {
    await durableStream.abortSession(client, subId, actor, 'Recursive abort');
  }

  // 3. Abort the parent session
  await durableStream.abortSession(client, sessionId, actor, 'Recursive abort');

  // 4. Update ActorState to FAILED
  await saveActorState({ ...state, phase: 'FAILED' });
}
```

### III. Auto-Cleanup Strategy

The `TaskObserver` automatically cleans up stale sessions:

| Condition                         | Action                                                      |
| :-------------------------------- | :---------------------------------------------------------- |
| Task timed out (max retries)      | Mark as `timeout`, emit `agent.failed`, then delete session |
| Task stuck (no heartbeat > 30s)   | Mark as `stale`, pause epic, request human intervention     |
| Session orphaned (parent deleted) | Auto-delete child session                                   |

### IV. Memory Optimization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 MEMORY OPTIMIZATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Task Observer detects:                                         │
│  • completed / failed / timeout                                 │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  1. Emit lifecycle event (agent.completed)           │       │
│  │  2. Update LEDGER.md progress log                    │       │
│  │  3. Extract learnings to Memory Lane                 │       │
│  │  4. Call session.delete() (physical cleanup)         │       │
│  │  5. Remove from TaskRegistry (memory cleanup)        │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                                                       │
│         ▼                                                       │
│  [Session freed from both Server RAM + Plugin Memory]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Subagent Roster (v4.1)

| Agent Name         | Role                                          | Access   |
| :----------------- | :-------------------------------------------- | :------- |
| **Chief-of-Staff** | **Governor**: Technical coordinator & Auditor | Public   |
| **Oracle**         | **Tactical Architect**: Task decomposition    | Internal |
| **Executor**       | **Builder**: TDD implementation               | Internal |
| **Planner**        | **Blueprinter**: File-level planning          | Internal |
| **Memory-Catcher** | **Learner**: Insight extraction               | Internal |
| **Debugger**       | **Mechanic**: Root cause analysis             | Internal |

---

## 7. Universal Self-Learning System

- **Injection**: Injects relevant past insights from Memory Lane at session start.
- **Extraction**: Uses `LearningExtractor` on session idle to analyze transcripts.
- **Tracking**: Every file modification by any agent is logged to `LEDGER.md`.

---

_Module Version: 4.1.0_
