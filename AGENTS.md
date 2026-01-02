# AGENTS.md

## Module Implementation Guide

### Skill-Based Agent Architecture with Durable Stream (v4.1)

This plugin implements a **Skill-Based Subagent** architecture with **Governance-First Orchestration (v4.1)** enhanced by **Event-Sourced Persistence** via the Durable Stream API. Domain expertise is packaged into specialized, on-demand workers coordinated by a `chief-of-staff` Governor agent.

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenCode Runtime                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Tool & Message Hooks Event Bus                    ││
│  │       (async, decoupled event processing)                   ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                              │                        │
│         ▼                              ▼                        │
│  ┌─────────────────┐           ┌──────────────────────┐         │
│  │  Agent Addons   │           │    Chief-of-Staff    │         │
│  │  (This Plugin)  │           │    (Coordinator)     │         │
│  │  ┌───────────┐  │           │  ┌───────────────┐   │         │
│  │  │  Tools &  │◄─┴───────────┤  │  Subagents    │   │         │
│  │  │   Hooks   │              │  │ (oracle, etc) │   │         │
│  │  └───────────┘              │  └───────────────┘   │         │
│  └─────────────────┬───────────┴──────────────────────┘         │
│                    │                                            │
│    ┌───────────────┼─────────────────────┐                      │
│    ▼               ▼                     ▼                      │
│ ┌──────────┐ ┌──────────────┐ ┌─────────────────────┐          │
│ │LEDGER.md │ │Durable Stream│ │    Memory Lane      │          │
│ │(State)   │ │(Event Source)│ │    (Vector DB)      │          │
│ └──────────┘ └──────────────┘ └─────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘

DURABLE STREAM LAYERS:
  1. Event Log     → Persistent JSONL storage with crash recovery
  2. Checkpoints   → Human-in-the-Loop approval workflows
  3. Intents       → Long-running workflow tracking
  4. Learning      → Auto-extraction of patterns from events (Universal)
```

---

## 2. Skill-Based Agent Roster

The following agents are implemented as specialized skills within the system.

### Core Orchestrator

- **`chief-of-staff` (The Governor)**
  - **Role**: Technical coordinator and governance engine.
  - **Responsibilities**: Manages the Governance Loop (State Check -> Delegation -> Audit), Strategic Polling, and Parallel Orchestration using `LEDGER.md` as the single source of truth.
  - **Access**: Public (The only agent users interact with directly).

### Strategic & Planning Agents

- **`chief-of-staff/oracle` (Tactical Architect)**
  - **Role**: Technical advisor for task decomposition.
  - **Responsibilities**: Analyzes requests, breaks them down into Epics/Tasks (max 3), determines **Execution Strategy** (Parallel/Sequential), and handles re-decomposition on conflict.
  - **Access**: Internal (called by CoS).
  - **Special**: Can yield `CONFLICT_REDECOMPOSE` signals.

- **`chief-of-staff/planner` (Strategic Architect)**
  - **Role**: Implementation blueprinter.
  - **Responsibilities**: Creates detailed, file-level implementation plans for LEDGER tasks. Reports `assumptions_made` for governance tracking.
  - **Access**: Internal.

- **`chief-of-staff/workflow-architect` (Meta-Designer)**
  - **Role**: Workflow and system designer.
  - **Responsibilities**: Designs new agent workflows and patterns that integrate with the LEDGER.md infrastructure.
  - **Access**: Internal.

- **`chief-of-staff/interviewer` (Strategist)**
  - **Role**: Deep ambiguity resolver (Fallback).
  - **Responsibilities**: Used only when Strategic Polling fails. Conducts multi-turn dialogue to clarify deep ambiguity.
  - **Access**: Internal.

### Execution & Specialized Workers

- **`chief-of-staff/executor` (The Builder)**
  - **Role**: TDD-driven code implementer.
  - **Responsibilities**: Implements tasks using Red/Green/Refactor. **Parallel-Safe**: Tracks `files_modified` and detects collision/race conditions.
  - **Access**: Internal.

- **`chief-of-staff/context-loader` (The Librarian)**
  - **Role**: Context hydration utility.
  - **Responsibilities**: Retrieves and synthesizes relevant context (files, memory lane patterns, ledger history) for a task _before_ execution starts.
  - **Access**: Internal.

- **`chief-of-staff/debugger` (The Mechanic)**
  - **Role**: Systematic root cause analyst.
  - **Responsibilities**: Enforces "No Fix Without Root Cause". Uses 4-phase debugging protocol to isolate issues before patching.
  - **Access**: Internal.

### Quality & Review Agents

- **`chief-of-staff/spec-writer` (The Scribe)**
  - **Role**: Requirements extractor.
  - **Responsibilities**: Creates structured specifications (Functional/Non-Functional requirements, MoSCoW priorities) from user requests.
  - **Access**: Internal.

- **`chief-of-staff/spec-reviewer` (Gatekeeper Stage 1)**
  - **Role**: Compliance auditor.
  - **Responsibilities**: Verifies that implementation matches the spec _exactly_ (nothing missing, nothing extra) before code quality review.
  - **Access**: Internal.

- **`chief-of-staff/code-quality-reviewer` (Gatekeeper Stage 2)**
  - **Role**: Code standard auditor.
  - **Responsibilities**: Reviews code for maintainability, security, and best practices _after_ spec compliance is proven.
  - **Access**: Internal.

- **`chief-of-staff/validator` (The QA)**
  - **Role**: Acceptance criteria verifier.
  - **Responsibilities**: validaties that the work meets the definition of done. Checks `directive_compliance` and reports `assumptions_made`.
  - **Access**: Internal.

---

## 3. Human-in-the-Loop Interaction Patterns

### I. Strategic Polling (Primary)

Instead of asking open-ended questions like "What DB?", the `chief-of-staff` generates a structured **Poll** (e.g., "A: Postgres, B: SQLite") and yields to the user. User selection immediately becomes a **Directive**.

### II. Assumption Audit (Post-Task)

Agents report `assumptions_made` (e.g., "Assumed JWT for auth"). These are logged in the **Governance** section of `LEDGER.md`. Users implicitly endorse these by proceeding, or can explicitly reject them to trigger rework.

### III. Checkpoint System

The Durable Stream provides built-in checkpoint support for critical decisions:

- **Strategy Validation**: Choose between implementation approaches
- **Code Review Approval**: Approve proposed changes before execution
- **Dangerous Operations**: Confirm destructive actions
- **Design Decisions**: Ratify architectural choices
- **Epic Completion**: Archive completed work

Tools available:

- `checkpoint_request` - Request human approval
- `checkpoint_approve` - Approve with optional selection
- `checkpoint_reject` - Reject with reason
- `checkpoint_pending` - List pending checkpoints
- `checkpoint_templates` - Get pre-built templates

---

## 4. Universal Self-Learning (v4.1)

The system now implements a **Universal Learning Hook** that works for both native OpenCode agents (Code, Ask) and custom subagents.

### Mechanism

1.  **Injection (Start)**: First user message triggers a semantic search in Memory Lane. Relevant past corrections and decisions are injected into the agent's system prompt.
2.  **Tracking (Work)**: The system monitors file modifications across all tools and automatically updates `LEDGER.md` progress logs.
3.  **Extraction (End)**: When a session goes idle (2s delay) or is deleted, the `LearningExtractor` analyzes the transcript for:
    - **Corrections**: "No, use Vitest not Jest"
    - **Decisions**: "We'll use SQLite for this prototype"
    - **Success Patterns**: "That works perfectly"
    - **Anti-patterns**: "Error: database connection failed"

### Durable Stream Integration

Extracted learnings are persisted in Memory Lane and emitted as `ledger.learning.extracted` events to the Durable Stream for auditability.

---

## 5. Module Structure

```
src/
  index.ts                    # Plugin bootstrap (Removal of swarm triggers)
  agent-spawn.ts              # skill_agent tool
  event-log.ts                # Logging

  memory-lane/                # Vector DB Module
    index.ts
    memory-store.ts

  durable-stream/             # Event-Sourced Persistence (v4.1)
    core.ts                   # Pure functions for event manipulation
    orchestrator.ts           # Class facade for developers
    store.ts                  # JSONL storage implementation
    types.ts                  # Event type definitions

  opencode/                   # Runtime Integration
    index.ts
    loader.ts
    skill/                    # Built-in definitions

  orchestrator/               # Governance Engine
    index.ts
    ledger.ts                 # State Management
    learning-extractor.ts     # Universal pattern extraction (v4.1)
    event-driven-ledger.ts    # Event emission for ledger ops (v4.1)
    checkpoint.ts             # Human-in-the-Loop workflows (v4.1)
    crash-recovery.ts         # State reconstruction (v4.1)
    tools/
      ledger-tools.ts         # Unified LEDGER tools (direct + event-driven) ⭐ MERGED
      checkpoint-tools.ts     # Checkpoint tool definitions
    hooks/
      opencode-session-learning.ts # Universal hook implementation
    chief-of-staff/           # Agent Definitions (`SKILL.md`)
      agents/
        oracle/
        executor/
        ...
```

---

## 5. New Tools (v4.1)

### Unified Ledger Tools (v4.1.1)

| Tool                    | Description                              |
| ----------------------- | ---------------------------------------- |
| `ledger_status`         | Get current LEDGER.md status             |
| `ledger_create_epic`    | Create a new epic in LEDGER.md           |
| `ledger_create_task`    | Create a task within the current epic    |
| `ledger_update_task`    | Update task status                       |
| `ledger_add_learning`   | Add a learning entry to LEDGER.md        |
| `ledger_get_learnings`  | Get recent learnings from LEDGER.md      |
| `ledger_add_context`    | Add context to current epic              |
| `ledger_create_handoff` | Create handoff section for session break |
| `ledger_archive_epic`   | Archive the current epic                 |

### Event-Driven Ledger Tools

| Tool                     | Description                             |
| ------------------------ | --------------------------------------- |
| `ledger_emit_event`      | Emit events for epic/task operations    |
| `ledger_get_history`     | Query event history from durable stream |
| `ledger_get_intents`     | List active workflow intents            |
| `ledger_get_checkpoints` | List pending human approvals            |

### Checkpoint Tools (Human-in-the-Loop)

| Tool                   | Description                          |
| ---------------------- | ------------------------------------ |
| `checkpoint_request`   | Request human approval for decisions |
| `checkpoint_approve`   | Approve a pending checkpoint         |
| `checkpoint_reject`    | Reject with optional reason          |
| `checkpoint_pending`   | List all pending checkpoints         |
| `checkpoint_templates` | Get pre-built approval templates     |

### Learning & Recovery Tools

| Tool                | Description                       |
| ------------------- | --------------------------------- |
| `extract_learnings` | Auto-extract patterns from events |
| `recovery_status`   | Check recovery state              |
| `recovery_perform`  | Trigger crash recovery            |

---

## 6. Leveraging the Durable Stream API (v4.1)

### Event Types

The Durable Stream supports the following event categories:

**Lifecycle Events**

- `lifecycle.session.created` - New session started
- `lifecycle.session.idle` - Session became idle
- `lifecycle.session.compacted` - Session context compacted
- `lifecycle.session.error` - Session error occurred
- `lifecycle.session.deleted` - Session physically deleted (NEW: Resource cleanup)
- `lifecycle.session.aborted` - Session emergency stopped (NEW: Resource cleanup)

**Execution Events**

- `execution.step_start` - Step execution started
- `execution.step_finish` - Step execution completed
- `execution.tool_start` - Tool execution started
- `execution.tool_finish` - Tool execution completed

**Agent Events**

- `agent.spawned` - Agent task started
- `agent.completed` - Agent task completed successfully
- `agent.failed` - Agent task failed
- `agent.aborted` - Agent task was aborted
- `agent.handoff` - Task handed off to another agent

**Ledger Events (v4.1)**

- `ledger.epic.created/started/completed/failed` - Epic lifecycle
- `ledger.handoff.created/resumed` - Handoff lifecycle (v4.2) ⭐ NEW
- `ledger.task.created/started/completed/failed/yielded` - Task lifecycle
- `ledger.governance.directive_added` - New directive created
- `ledger.governance.assumption_added` - New assumption recorded
- `ledger.learning.extracted` - Learning was extracted

### Using the Event-Driven Ledger

```typescript
import {
  getEventDrivenLedger,
  createLedgerEventHandlers,
} from './orchestrator/event-driven-ledger';

const ledger = getEventDrivenLedger();
await ledger.initialize();

const handlers = createLedgerEventHandlers(ledger);

// Emit events for ledger operations
await handlers.onEpicCreated({
  id: 'abc123',
  title: 'Build Auth System',
  request: 'Implement JWT authentication',
  status: 'pending',
  createdAt: Date.now(),
  tasks: [],
  context: [],
  progressLog: [],
});

await handlers.onTaskCreated(
  {
    id: 'abc123.1',
    title: 'Implement JWT',
    agent: 'executor',
    status: 'pending',
    outcome: '-',
    dependencies: [],
  },
  { id: 'abc123', title: 'Build Auth System' } as any
);
```

### Using Checkpoints

```typescript
import { getCheckpointManager, CHECKPOINT_TEMPLATES } from './orchestrator/checkpoint';

const manager = getCheckpointManager();
await manager.initialize();

// Get a pre-built template
const template = CHECKPOINT_TEMPLATES.strategyValidation([
  'Use JWT with RS256',
  'Use OAuth 2.0',
  'Use session-based auth',
]);

// Request approval
const checkpointId = await manager.requestCheckpoint('stream-id', template, (result) => {
  if (result.approved) {
    console.log(`Selected: ${result.selectedOption}`);
  }
});
```

### Crash Recovery

```typescript
import { performRecovery, getRecoveryStatus } from './orchestrator/crash-recovery';

// Check if recovery is needed
const status = await getRecoveryStatus();
if (status.hasPendingCheckpoints || status.activeIntentCount > 0) {
  const report = await performRecovery();
  console.log(`Recovered ${report.eventsReplayed} events`);
}
```

### Physical Resource Management (v4.1)

The system now supports explicit session cleanup to prevent memory leaks:

```typescript
import { getDurableStream } from './durable-stream';

const stream = getDurableStream();

// Delete a completed session (frees server memory)
await stream.deleteSession(client, sessionId, 'executor');

// Abort a running session (emergency stop)
await stream.abortSession(client, sessionId, 'actor_abort', 'User requested cancellation');
```

#### Resource Lifecycle Flow

```
[SPAWNED] → [RUNNING] → [COMPLETED/ABORTED] → [DELETED] → [Memory Freed]
                                  │
                                  ├──→ Extract learnings to Memory Lane
                                  ├──→ Emit lifecycle event
                                  ├──→ Call session.delete()
                                  └──→ Remove from TaskRegistry
```

#### Recursive Abort Pattern

When aborting a parent agent, all child sessions are terminated:

```typescript
async function recursiveAbort(sessionId: string, actor: string) {
  const state = await loadActorState();

  // Abort children first (reverse order)
  const subSessionIds = Object.keys(state.subAgents);
  for (const subId of subSessionIds.reverse()) {
    await stream.abortSession(client, subId, actor, 'Recursive abort');
  }

  // Abort parent
  await stream.abortSession(client, sessionId, actor, 'Recursive abort');

  // Update state
  await saveActorState({ ...state, phase: 'FAILED' });
}
```

---

## Project Context

- **Type**: ES Module for OpenCode
- **Target**: Bun runtime
- **Purpose**: Skill-based multi-agent orchestration with durable state
- **Version**: 4.1 (Event-Sourced Persistence)

---

_Last Updated: 2026-01-02_
