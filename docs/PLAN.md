# Swarm Tools Codebase Analysis

## 1. Executive Summary

Swarm Tools is a sophisticated multi-agent orchestration framework designed for AI coding tasks. It leverages a local-first, event-sourced architecture to coordinate multiple agents ("Workers") under a "Coordinator" to decompose and execute complex software engineering tasks in parallel.

**Key Differentiator:** The system focuses on **state durability** (surviving context window exhaustion), **adaptive learning** (improving decomposition strategies based on outcomes), and **behavioral guidance** (Memory Lane) to ensure agents adhere to historical decisions and corrections.

## 2. Architecture Overview

### 2.1 Monorepo Structure (Turborepo + Bun)
*   **`packages/swarm-mail`**: The nervous system.
    *   **Core:** Event Sourcing engine backed by **PGLite** (embedded Postgres).
    *   **Communication:** "Swarm Mail" implements an Actor Model for agent-to-agent messaging.
    *   **Coordination:** Handles file reservations (locks) and "Hive" work item tracking.
    *   **Tech:** Drizzle ORM, Effect-TS (for durable primitives), PGLite.
*   **`packages/opencode-swarm-plugin`**: The brain.
    *   **Orchestration:** Manages the lifecycle of the swarm (Init -> Plan -> Decompose -> Execute -> Verify).
    *   **Learning:** Implements "Confidence Decay" and "Outcome Signals" to optimize performance.
    *   **Memory Lane (Sidecar Plugin):** An isolated extension in `src/memory-lane/` that provides high-integrity persistent memory, entity-aware search, and intent-based context injection.
    *   **Skills:** A pluggable system for injecting capabilities (e.g., `cli-builder`, `testing-patterns`).
*   **`apps/web`**: Documentation and landing page (Next.js).

### 2.2 The "Hive" Metaphor
*   **Hive:** The central repository of work items.
*   **Cells:** Atomic units of work (tasks/subtasks).
*   **Swarm:** The collection of agents working on the Hive.
*   **Swarm Mail:** The communication medium (waggle dance).

## 3. Key Features & Implementation

### 3.1 Multi-Agent Orchestration
*   **Coordinator Agent:** The entry point. Analyses the request, queries memory, and decides on a strategy.
*   **Socratic Planner:** Implemented via `swarm_plan_interactive`, focusing on questioning, alternatives, and recommendations before decomposition.
*   **Decomposition:** Generates a "CellTree" (JSON) validated for file and instruction conflicts.

 ### 3.2 Learning System                                                                      
*   **Outcome Signals:** Automatically tracks duration, error counts, and retries for every  subtask.                                                                                    
*   **Scoring:** implicit feedback logic (`learning.ts`) scores decompositions.
*   **Confidence Decay:** Learned patterns (e.g., "Feature-based works best for React components") fade over 90 days unless revalidated
*   **3-Strike Rule:** Detects architectural flaws. If a task fails 3 times, it triggers an architectural review rather than a 4th retry.

### 3.3 Memory Lane (High-Integrity Persistence)
*   **Taxonomy:** Categorizes context into `corrections`, `decisions`, and `commitments`.
*   **Hybrid Dual-Search:** Combines strict entity filtering (regex and path-based) with semantic vector ranking.
*   **Intent Boosting:** Automatically boosts similarity scores (+15%) based on query keywords (e.g., "mistake" boosts corrections).
*   **Adaptive Feedback:** Persists helpfulness scores in JSONB metadata to re-rank future context.
*   **Auto-Injection:** Leverages OpenCode hooks to inject relevant behavioral history during session compaction.

### 3.4 Robustness & Verification
*   **Verification Gate:** Mandatory `swarm_complete` check (UBS Scan, Typecheck, Tests).
*   **Event Sourcing:** Full audit trail and state recovery via PGLite immutable log.
*   **3-Strike Rule:** Detects architectural stalls and forces human review after 3 consecutive failures.

## 4. Design Patterns

*   **Plugin-First Sidecar Architecture:** Extensions like Memory Lane reside in isolated directories, using composition to wrap core adapters without modifying upstream persistence logic.
*   **Event Sourcing & Synchronous Projections:** Read-your-own-writes consistency for agent coordination in a local-first environment.
*   **Actor Model:** Asynchronous agent communication via durable mailboxes.
*   **Reversible Compaction:** Principles identified for replacing lossy summarization with `stash` and `expand` tools to preserve precision.
*   **Command Pattern:** Skills and Tools are encapsulated commands.                         
*   **Socratic Planner:** A specific interaction pattern for planning (Question -> Alternative -> Recommendation)
*   **Repository Pattern:** `HiveAdapter` abstracts the storage logic for work items.


## 5. Anti-Patterns & Gaps

*   **Hierarchical Action Space:** The system currently exposes a large flat toolset to the Coordinator, increasing context confusion.
*   **Context Precision:** Standard session compaction is still lossy; transition to fully reversible compaction is pending.
*   **"Future" Debt:** Some primitives in `swarm-mail.ts` remain as functional wrappers rather than full Effect-TS class implementations.
*   **Testing Surface:** Concurrency issues with PGLite WAL locking in high-parallelism swarms require further hardening.

## 6. Recommendations & Roadmap

1.  **Refactor Action Space:** Curate a "Coordinator-Only" toolset to reduce context pollution and improve reasoning focus.
2.  **Solidify Primitives:** Complete the transition to Effect-TS `Durable*` primitives for improved type safety and error propagation.
3.  **Implement Reversible Stashing:** Create `swarm_context_stash` to move large blobs from the prompt to PGLite, leaving only unique references.
4.  **Harden WAL Safety:** Improve leader election and locking for PGLite to support highly concurrent agent swarms without corruption.

