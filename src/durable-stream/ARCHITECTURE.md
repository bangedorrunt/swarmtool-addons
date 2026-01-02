# Durable Stream Architecture (v4.1)

**Status**: v4.1 (Event-Sourced Persistence)
**Pattern**: Functional Core, Imperative Shell (Façade)

## 🏗️ High-Level Design

The Durable Stream module is the "source of truth" for agent orchestration. It implements an **Event Sourcing** model where the system state is derived from an append-only log of immutable events.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DURABLE STREAM DATA FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ OpenCode SDK ] ──▶ [ SDK Bridge ] ──▶ [ DurableStream ]      │
│     (Hooks/Events)        (Parsing)         (Facade)            │
│                                                │                │
│                                                ▼                │
│  [ API/State ] ◀─── [ Projections ] ◀─── [ JSONL Store ]        │
│    (Checkpoints)     (In-Memory)        (Append-Only)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🧩 Components

### 1. Functional Core (`core.ts`)

• **Pure Functions**: Logic without side effects for event validation and transformation.
• **Responsibilities**:
• Event creation and deterministic ID generation.
• Lineage tree construction for tracing agent parents/children.
• Checkpoint extraction from the event stream.

### 2. Storage Layer (`store.ts`)

• **Implementation**: `JsonlStore`.
• **Mechanism**: Append-only persistence to `.jsonl` files.
• **Concurrency**: Uses `proper-lockfile` to ensure atomic writes across multiple plugin processes.

### 3. Orchestrator Façade (`orchestrator.ts`)

• **Role**: The stateful shell managing the Store lifecycle and real-time projections.
• **Projections**:
• **Pending Checkpoints**: Map of active human-in-the-loop approvals.
• **Active Intents**: Tracking of long-running workflow goals.

## 🛡️ Resilience & Recovery

• **Crash Recovery**: On startup, the system replays the entire JSONL log to reconstruct the active state (pending checkpoints, active tasks).
• **Auditability**: Every tool call and agent spawn is preserved, providing a permanent audit trail of the Governance Loop.
