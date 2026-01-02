# ARCHITECTURE & DESIGN PATTERNS (v4.1)

This document outlines the core architectural principles, design patterns, and workflows implemented in the `opencode-agent-addons` plugin.

## 1. DESIGN PHILOSOPHY: GOVERNANCE-FIRST ORCHESTRATION

The system utilizes a **Skill-Based Subagent** architecture coordinated by the **Chief-of-Staff (The Governor)**. The fundamental principle is **Governance-First**: every action must be grounded in **User Directives (The Law)**. When directives are missing, agents must log **Assumptions (The Debt)** or halt for **Strategic Polling**.

### Core Pillars

• **Actor Model Isolation**: Each agent is a stateless worker communicating via structured messages. No shared memory exists between spawns; only the LEDGER and Durable Stream persist state.
• **Event-Sourcing (Durable Stream)**: Every lifecycle event is an immutable log entry. State is a projection of these events, enabling perfect crash recovery and auditability.
• **Physical Resource Management**: v4.1 adds `session.delete()` and `session.abort()` integration to prevent memory leaks in long-running sessions.
• **Dual-Source Learning**: Local session wisdom (LEDGER.md) is combined with cross-session semantic memory (Memory Lane).

## 2. CORE ARCHITECTURE FLOW (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CORE ARCHITECTURE FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Request ────────▶ Chief-of-Staff ────────▶ Context        │
│      │                  (The Governor)           Hydration      │
│      │                        │                      │          │
│      ▼                        ▼                      ▼          │
│  [ Learning ] ◀──────── [ Validation ] ◀──────── [ Governance ] │
│  [ Extraction]          [  & Review  ]          [   Audit    ] │
│      │                        │                      │          │
│      │                        ▼                      ▼          │
│  Memory Lane ◀──────── [ Execution ] ◀──────── [ Planning ]     │
│  (Vector DB)           (Executor/TDD)           (Oracle/Spec)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 3. MODULE DEPENDENCY MAP

| Module                   | Primary Responsibility       | Depends On                                          |
| :----------------------- | :--------------------------- | :-------------------------------------------------- |
| **Orchestrator**         | Governance & Task Delegation | Durable Stream, Memory Lane, Actor Model            |
| **Chief-of-Staff**       | Supervisory Logic & HITL     | Orchestrator, Ledger Tools, Checkpoint System       |
| **Durable Stream**       | Event-Sourced Persistence    | Bun File API (JSONL), Proper-Lockfile, OpenCode SDK |
| **Memory Lane**          | Semantic Memory & Patterns   | SQLite, lm-studio Embeddings, Taxonomy              |
| **Actor Model**          | Stateless Message Processing | Durable Stream (for correlation)                    |
| **Opencode Integration** | Load Skill & SDK Hooks       | Orchestrator, Configuration Loader                  |

## 4. DATA SCHEMAS (v4.1)

### 4.1 Actor State (`src/orchestrator/actor/state.ts`)

```typescript
interface ActorState {
  phase: 'INIT' | 'PLANNING' | 'VALIDATING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  sessionId: string;
  parentSessionId: string;
  rootSessionId: string;
  executionStack: string[]; // Recursion guard
  direction: { goals: string[]; constraints: string[]; decisions: string[] };
  assumptions: TrackedAssumption[];
  subAgents: Record<string, SubAgentState>; // Child session tracking
  eventOffset: number;
  lastUpdated: string;
}
```

### 4.2 LEDGER Models (`src/orchestrator/ledger.ts`)

```typescript
interface Epic {
  id: string; // Format: abc123
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  tasks: Task[];
  progressLog: string[];
}

interface Task {
  id: string; // Format: abc123.1
  title: string;
  agent: string;
  status: TaskStatus;
  sessionId?: string; // Links to Durable Stream session
  yieldReason?: string; // For background HITL
  conflictInfo?: { type: string; resolution: string };
}
```

### 4.3 Memory Lane Schema (`src/memory-lane/taxonomy.ts`)

```typescript
interface MemoryLaneMetadata {
  memory_type: 'correction' | 'decision' | 'pattern' | 'antiPattern';
  confidence_score: number; // 0-100
  decay_factor: number; // 0-1 (temporal decay)
  entity_slugs: string[];
  feedback_score: number; // Helpful/Harmful signal
  valid_from?: string;
  valid_until?: string;
}
```

### 4.4 Durable Stream Events (`src/durable-stream/types.ts`)

```typescript
type EventType =
  | 'lifecycle.session.created'
  | 'lifecycle.session.idle'
  | 'lifecycle.session.deleted' // NEW: Physical cleanup
  | 'lifecycle.session.aborted' // NEW: Emergency stop
  | 'agent.spawned'
  | 'agent.completed'
  | 'checkpoint.requested';
```

## 5. PHYSICAL RESOURCE MANAGEMENT (v4.1)

The system now manages session lifecycle to prevent memory leaks:

### 5.1 Resource Lifecycle

1. **Spawn**: Create session, register with Durable Stream.
2. **Execute**: Agent runs, logging events.
3. **Complete/Abort**: Emit lifecycle event, extract learnings.
4. **Delete**: Call `session.delete()` to free server memory.
5. **Cleanup**: Remove from TaskRegistry and in-memory projections.

### 5.2 Recursive Abort

When aborting a parent agent, all child sessions are terminated:

```
actor_abort(parent)
  └─▶ For each subSessionId in executionStack (reverse order)
        └─▶ durableStream.abortSession(subSessionId)
  └─▶ durableStream.abortSession(parent)
  └─▶ Update ActorState to FAILED
```

### 5.3 Auto-Cleanup Triggers

| Trigger                    | Action                                        |
| :------------------------- | :-------------------------------------------- |
| Task timeout (max retries) | Mark failed, emit event, delete session       |
| Stuck task (no heartbeat)  | Mark stale, pause epic, request intervention  |
| Session idle > threshold   | Extract learnings, archive, optionally delete |

## 6. SYSTEM PIPELINE (REQUEST TO COMPLETION)

1. **Context Hydration & Discovery**: Read `LEDGER.md`, query `Memory Lane`.
2. **Governance Audit**: Check Directives, trigger Strategic Polling if missing.
3. **Strategic Decomposition**: `Oracle` creates Epic with Tasks.
4. **Supervised Execution**: `Executor` implements with TDD, emits events.
5. **Multi-Stage Validation**: Spec Review → Code Quality Review.
6. **Resource Cleanup**: `Memory-Catcher` extracts learnings, `TaskObserver` deletes sessions.

## 7. DIRECTORY STRUCTURE

```
src/
  orchestrator/          # Governance Engine
    actor/               # Actor Model State
    chief-of-staff/      # Agent Definitions
    tools/               # Tools (skill_agent, actor_*, etc.)
  durable-stream/        # Event Sourcing Layer
  memory-lane/           # Vector DB for Semantic Memory
  opencode/              # SDK Integration & Config
```

## 8. PROJECT SPECS & DOCUMENTATION

• **[ROADMAP.md](ROADMAP.md)**: Vision and planned enhancements.
• **[Orchestrator Spec](src/orchestrator/SPEC.md)**: Technical details of coordination and supervision.
• **[Memory Lane Spec](src/memory-lane/SPEC.md)**: Semantic storage and learning extraction.
• **[Durable Stream Spec](src/durable-stream/SPEC.md)**: Event sourcing and persistence details.

## 9. GAPS & ASSUMPTIONS (REVIEW REQUIRED)

• **Tool Consolidation**: Merge redundant ledger tool definitions between `src/orchestrator/ledger-tools.ts` and `src/orchestrator/tools/ledger-tools.ts`.
• **Concurrency Specification**: Document multi-process file locking via `proper-lockfile`.
• **Conflict Resolution**: Expand documentation on `Oracle` re-decomposition triggers.
• **UI Asset Protocol**: Define placeholder strategy for the `frontend-ui-ux-engineer`.
• **Event Schema Versioning**: Define migration strategies for long-term event logs.

---

_Last Updated: 2026-01-02_
