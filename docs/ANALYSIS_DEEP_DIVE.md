# Deep Dive Analysis: Swarm Tools Architecture & Implementation

## 1. Executive Summary

Swarm Tools is a sophisticated local-first, multi-agent orchestration framework. Its core philosophy builds upon **Event Sourcing** and the **Actor Model** to create resilient, state-aware agent swarms.

Uniquely, it features a **Learning System** that treats "software engineering process knowledge" as a decaying asset, constantly revalidating heuristics against actual execution outcomes.

The architecture is split into:
*   **The Brain:** `opencode-swarm-plugin` (Learning, Planning, Decomposition)
*   **The Nervous System:** `swarm-mail` (Messaging, Event Store, Durable Primitives)

---

## 2. The Learning System: Mathematical Confidence & Pattern Maturity

The Learning System is not an LLM fine-tuner. It is a **heuristic optimization engine** that scores the "Process" of writing code.

### 2.1 Mathematical Model: Confidence Decay
Software engineering patterns have a "Half-Life". A strategy effective for React 16 might be an anti-pattern in React 18.

**Concept:**
*   **Decay Function:** $V_{current} = V_{raw} \times 0.5^{(\frac{age}{half\_life})}$
*   **Default Half-Life:** 90 days.
*   **Mechanism:** Every time a pattern is successfully used, its decay timer resets. If unused, its influence fades to zero.

**Implementation (`packages/opencode-swarm-plugin/src/learning.ts`):**
```typescript
export function calculateDecayedValue(
  timestamp: string,
  now: Date = new Date(),
  halfLifeDays: number = 90,
): number {
  const ageDays = Math.max(0, (nowTime - eventTime) / (24 * 60 * 60 * 1000));
  return Math.pow(0.5, ageDays / halfLifeDays);
}
```

### 2.2 Outcome Scoring (Implicit Feedback)
Agents don't get explicit "thumbs up". The system infers quality from execution signals.

**Scoring Heuristic:**
$$Score = (0.4 \times Success) + (0.2 \times Duration) + (0.2 \times Errors) + (0.2 \times Retries) $$

*   **Duration:** Fast (<5m) = 1.0, Slow (>30m) = 0.2.
*   **Errors:** 0 errors = 1.0, >2 errors = 0.2.
*   **Retries:** 0 retries = 1.0, >1 retry = 0.3.

### 2.3 Pattern Maturity Cycle
The documentation describes a lifecycle that the code implements via weight thresholds:
1.  **Candidate:** New pattern (0.5x weight).
2.  **Established:** >3 uses, >60% success (1.0x weight).
3.  **Proven:** >10 uses, >80% success (1.5x weight).
4.  **Deprecated:** >60% failure rate (0.0x weight).

### 2.4 The 3-Strike Rule (Architecture Detection)
Distinguishes between "bugs" (retryable) and "architectural flaws" (fatal).
*   **State Machine:** Tracks consecutive failures on a single Cell.
*   **Limit:** 3 strikes.
*   **Action:** Triggers `getArchitecturePrompt()` which forces the Coordinator to pause and consider refactoring rather than retrying.

---

## 3. Swarm Mail: The Nervous System

Swarm Mail is a **Local-First Implementation of the Durable Streams Protocol**. It replaces external message queues (Kafka/Redis) with an embedded PGLite database using Event Sourcing.

### 3.1 Architecture Diagram (Mermaid)

```mermaid
graph TD
    subgraph Agents [Actor Model]
        A1[Agent A]
        A2[Agent B]
    end

    subgraph Primitives [Durable Primitives]
        Mail[DurableMailbox]
        Lock[DurableLock]
        Def[DurableDeferred]
        Cur[DurableCursor]
    end

    subgraph Store [Event Store (PGLite)]
        Log[(Event Log)]
        View[(Projections)]
    end

    A1 -->|Send Message| Mail
    Mail -->|Append event| Log
    Log -->|Trigger Update| View
    View -->|Read Inbox| Mail
    Mail -->|Deliver| A2

    A1 -->|Acquire Lock| Lock
    Lock -->|CAS Operation| View
    Lock -->|Reserve Event| Log
```

### 3.2 Durable Primitives (Implementation vs Protocol)

The system implements the **Durable Streams Protocol** concepts directly on top of SQL.

#### A. DurableMailbox (The Actor)
*   **Concept:** An addressable, persistent inbox.
*   **Protocol Mapping:** Maps to a Stream ID `mailbox/{agent_name}`.
*   **Implementation:** `message_sent` events + `messages` projection.
*   **Features:**
    *   **Envelopes:** Metadata (`id`, `from`, `to`, `importance`) wraps payload.
    *   **Checkpointing:** Uses `DurableCursor` to track `last_read_sequence`.

#### B. DurableLock (Resource Safety)
*   **Concept:** Distributed Mutual Exclusion.
*   **Mechanism:** Optimistic Concurrency Control (CAS).
*   **Implementation:** 
    *   **Acquire:** Checks `projections.ts:checkConflicts`.
    *   **Persistence:** `file_reserved` event.
    *   **Auto-Expiry:** `expires_at` field enforces TTL (Lease pattern).

#### C. DurableDeferred (Async Coordination)
*   **Concept:** A "Promise" that lives in the database.
*   **Usage:** The "Ask Pattern" (RPC). Agent A sends a message with `replyTo: deferred://123`. Agent A *awaits* `deferred:123`. Agent B processes and *writes* to `deferred:123`.
*   **Implementation:** A `deferred` table with polling/notification logic.

### 3.3 Event Sourcing & Synchronous Projections
Unlike eventual consistency in distributed systems, Swarm Mail uses **Synchronous Projections** to guarantee consistency for agents.

**The Write Path (`store.ts`):**
1.  **Append:** `INSERT INTO events ...`
2.  **Project:** `updateMaterializedViews(event)` (Immediately executed)
3.  **Return:** Success.

**Why?**
*   **Read-Your-Own-Writes:** Crucial for AI agents. If an agent locks a file, it must *immediately* see that lock to proceed.
*   **Simplicity:** No background workers or race conditions to manage in a local-first environment.

---

## 4. Gap Analysis: Documentation vs Codebase

| Feature |
| :--- | 
| **Durable Primitives** | Describes `DurableMailbox`, `DurableLock` as classes. | Implemented as functional wrappers in `store.ts` and `projections.ts`. | **Functionally Equivalent**, but structurally different (Functional vs OOP). |
| **Event Sourcing** | "Append-only log". | Uses `events` table + side-effect `updateMaterializedViews`. | **Synchronous Variant**. Safer for local-first, less scalable for distributed. |
| **Protocol** | References HTTP Durable Streams Protocol. | Implements the *semantics* of the protocol over SQL, not HTTP. | **SQL-Native implementation** of the protocol. |
| **Confidence Decay** | "90-day half-life". | Hardcoded `DEFAULT_LEARNING_CONFIG` in `learning.ts`. | **Exact Match**. |
| **Planner** | Socratic Planner. | `swarm_plan_interactive` tool. | **Exact Match**. |

--- 

## 5. Key Design Patterns Identified

1.  **Local-First Actor Model:** Agents are isolated processes sharing a database file, emulating network actors via DB polling/events.
2.  **Application-Level Locking:** File locks are advisory logic checks (`minimatch` on reserved paths) rather than OS-level file locks.
3.  **Heuristic Feedback Loop:** The system creates a closed loop where execution metrics directly influence future prompt construction (via anti-pattern injection).
4.  **Schema-First (Zod):** Strict runtime validation of all events and tool inputs ensures the system is resilient to LLM hallucinations.