# Implementation Plan: Skill-Based Subagent Feature (Sisyphus v2 Evolution)

## Overview

This plan documents the evolution of the orchestrator module into **Sisyphus v2**, a high-fidelity orchestration system that merges the background lifecycle of **oh-my-opencode (OMO)** with the "Continuity Ledger" pattern from **Continuous Claude v2 (CCv2)**.

**Status:** Phases 1-4 Complete ✅ | Phase 6: Sisyphus v2 Evolution (Active) 🚧

The system leverages the **Hybrid Delegator Pattern** to spawn skill-defined subagents that operate as independent **Actors** on a durable coordination bus.

---

## 1. System Design: The Durable Actor Pattern

Sisyphus v2 is designed as a **non-invasive sidecar** that bridges the OpenCode SDK with advanced orchestration patterns. It treats the context window as a volatile cache and the file system + durable streams as the source of truth.

### 1.1 Architectural Visualization: Durable Stream

The Durable Stream is the immutable backbone. It is a log-structured record of every decision and state transition.

```text
DURABLE STREAM (PGLite / SQL Event Log)
+-----------------------------------------------------------------------+
|                           EVENT_LOG TABLE                             |
+-----------------------------------------------------------------------+
| Offset: 0 | Offset: 1 | Offset: 2 | Offset: 3 |       ...             |
+-----------+-----------+-----------+-----------+-----------------------+
| TASK_INIT | PLAN_INIT | FILE_EDIT | TEST_PASS | [Next Write Head] ->  |
+-----------+-----------+-----------+-----------+-----------------------+
      │           │               │           │               │
      └───────────┴───────┬───────┴───────────┴───────────────┘
                          ▼
              MATERIALIZED VIEW (Ledger)
       [ Current Status: IMPLEMENTING | Phase: 3/4 ]
       [ SISYPHUS_LEDGER.md is the human-readable Projection ]
```

### 1.2 Architectural Visualization: Actor Model

Agents are independent Actors that communicate exclusively via the Durable Stream.

```text
      [Sisyphus Kernel]               [Executor Actor (Sub-agent)]
            │                                     │
            │ 1. skill_agent(executor)            │
            ├────────────────────────────────────>│
            │                                     │ 2. swarmmail_init()
            │ 3. swarmmail_send(task_payload)     │
            ├────────────────────────────────────>│
            │                                     │ 4. processInbox()
            │                                     │ (Reads from stream)
            │                                     │
            │           5. STATUS_UPDATE          │
            │<────────────────────────────────────┤
            │      (Appended to Durable Log)      │
```

---

## 2. Technical Implementation Patterns (TypeScript)

### 2.1 The Durable Stream Primitive

This pattern ensures that state transitions are immutable and re-hydratable.

```typescript
// src/orchestrator/sisyphus/stream.ts
export interface SisyphusEvent<T = any> {
  offset: number;
  type: string;
  payload: T;
  timestamp: number;
}

export class DurableSisyphusStream {
  // In production, this wraps the PGLite 'events' table
  async append<T>(type: string, payload: T): Promise<number> {
    const offset = await db.insert('events').values({ type, payload });
    return offset;
  }

  async readFrom(offset: number): Promise<SisyphusEvent[]> {
    return db.select().from('events').where(gt('offset', offset)).orderBy('offset');
  }
}
```

### 2.2 The Sisyphus Actor Base

Every specialized sub-agent (Planner, Validator, Executor) follows this protocol.

```typescript
// src/orchestrator/sisyphus/actor.ts
export abstract class SisyphusActor {
  private cursor: number = 0;

  constructor(protected agentName: string) {}

  /**
   * Boot sequence: Join the bus and catch up on history
   */
  async boot() {
    await swarmmail_init(this.agentName);
    await this.processInbox();
  }

  /**
   * The Continuity Loop: Consumes durable messages
   */
  async processInbox() {
    const messages = await swarmmail_inbox({ from_offset: this.cursor });
    for (const msg of messages) {
      await this.onMessage(msg);
      this.cursor = msg.offset + 1; // Checkpoint the radio
    }
  }

  abstract onMessage(msg: any): Promise<void>;
}
```

---

## 3. Real-World Examples

### Example 1: Refactoring a Database Adapter (Resilience Test)

**Task**: "Migrate `src/db/adapter.ts` from PGLite to LibSQL."

1.  **The Launcher**: Kernel calls `skill_agent({ agent_name: 'planner' })`.
2.  **The Plan**: Planner Actor creates `SISYPHUS_LEDGER.md`. It retrieves a past memory via `memory-lane_find` about LibSQL WAL safety.
3.  **The Crash**: Mid-refactor, the system loses power/process.
4.  **The Recovery**: Upon restart, the Executor Actor calls `boot()`. It re-reads the Durable Stream, sees `TEST_PASS` at offset 12, and resumes work on the _next_ file in the plan without re-running Phase 1 or 2.

### Example 2: Security Implementation (Validation Gate)

**Task**: "Add OIDC login flow."

1.  **Planner**: Proposes using library `X`.
2.  **Validator**: Queries `memory-lane` and finds that library `X` has a vulnerability recorded in a previous session.
3.  **Handoff**: Validator sends a durable `REJECTION` message to the Planner Actor via SwarmMail.
4.  **Pivot**: Planner receives the message, corrects the strategy, and updates the Ledger. The Kernel (Coordinator) only sees the finalized, safe plan.

---

## 4. Detailed Walkthrough: Using Sisyphus v2

1.  **Initialize**: Run `Use skill sisyphus to [task]`.
2.  **The Bootstrap**: Sisyphus immediately calls `swarmmail_init` (The Radio) and `memory-lane_find` (The Wisdom).
3.  **The Ledger**: Look for `.sisyphus/SISYPHUS_LEDGER.md`. This is your live dashboard (The Materialized View).
4.  **The Launcher**: Sisyphus will use `skill_agent` to spawn sub-agents. You will see background tasks appearing in your TUI (if using OMO).
5.  **The Wipe (Recovery)**: If context is full, Sisyphus will say: _"I am clearing context to maintain signal. Please resume me after `/clear`."_
6.  **The Finalize**: Sisyphus closes the epic by running a final `ubs scan` and storing the session learnings in `memory-lane_store`.

---

## 5. Summary of Leverage

| Module             | Leverage Point       | Benefit                                     |
| :----------------- | :------------------- | :------------------------------------------ |
| **oh-my-opencode** | Background Lifecycle | Non-blocking execution & TUI status         |
| **CCv2**           | Continuity Ledger    | Context wipe resilience (Hard Reset)        |
| **Swarm-Tools**    | Durable Stream       | Auditability & Cross-session re-hydration   |
| **Memory Lane**    | Entity Wisdom        | Anchors sub-agents in project-specific lore |

This architecture ensures that Sisyphus v2 is the most resilient and scalable orchestration system in the OpenCode environment.
