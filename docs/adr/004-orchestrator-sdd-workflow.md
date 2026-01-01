# ADR 004: ORCHESTRATOR SDD WORKFLOW IMPROVEMENTS

## Status

Done

## Context

Improvements based on `obra/superpowers` and advanced agentic patterns are needed to increase the reliability, speed, and precision of the Orchestrator SDD (Software Development Design) workflow.

## Decision

We implement several structural improvements to the orchestration process:

STRATEGIC DECOMPOSITION WORKFLOW V3.0

+-------------+     +-------------+     +-------------+
| CONTEXT     | --> | INTERVIEW   | --> | ORACLE      |
| (Hydration) |     | (Discovery) |     | (Decompose) |
+-------------+     +-------------+     +-------------+
                                              |
                                              v
+-------------+     +-------------+     +-------------+
| PLANNER     | <-- | SPEC        | <-- | EPIC        |
| (Blueprint) |     | (Writer)    |     | (Registry)  |
+-------------+     +-------------+     +-------------+
      |
      v
+-------------+
| TASK        |
| (Atomic)    |
+-------------+

### 1. Strategic Decomposition (Oracle-First)

• The **Oracle** agent acts as the primary architect, analyzing the `ledger_snapshot` and accumulated context to generate a high-fidelity execution plan before any code is written.
• **Task Breakdown Strategy**:
• **Refactor SDD Hook System**: Decouple event processing from core orchestration logic to ensure modularity.
• **Context Injection Service**: Implement dynamic hydration of subagent prompts based on the task dependency graph.
• **Resilient Handoff Protocol**: Implement robust artifact tracking and retry-on-failure for cross-agent transfers.

### 2. Phase 0: Context Hydration

• Before starting an Epic, the system performs **Context Hydration**, retrieving relevant patterns, previous decisions, and domain knowledge from **Memory Lane** and **LEDGER learnings**. This ensures agents start with the best possible information.

### 3. Superpowers-Inspired Task Management

• **Bite-sized tasks**: Tasks are scoped to be completed in 2-5 minutes of model execution time, reducing error rates and making progress more granular.
• **Two-stage review**: Separation of **Spec Review** (ensuring requirements are met) from **Code Quality Review** (ensuring implementation standards).
• **Context Isolation**: Each task is executed by a fresh, ephemeral subagent with a pruned context specific only to that task, preventing context rot.

### 4. Resilient Handoff Protocol

• Atomic task handoffs and artifact tracking. Every output is validated against the task specification before being committed to the LEDGER.

### 5. 'War Room' Model

• The LEDGER acts as an immutable state database (event store) for the "War Room," where all coordination events, decisions, and outcomes are recorded durably.

### 6. LEDGER-First Persistence

• **Single Source of Truth**: The `.opencode/LEDGER.md` file must be updated after every task or critical decision. It serves as the durable memory for the "War Room," ensuring that state is preserved across sessions and crashes.
• **Status Updates**: Explicitly record task transitions (Pending -> Running -> Completed/Failed) in the ledger.

WATCH OUT FOR

• **Task Bloating**: Avoid creating tasks that exceed the 5-minute execution threshold to maintain high reliability.
• **Context Drift**: Strict isolation is required to ensure subagents do not hallucinate context from previous unrelated tasks.

RATIONALE

• **Agent Focus**: Maintaining high precision during long Epics requires minimizing the active context; atomic tasks prevent performance degradation.
• **Oracle as Validator**: The Oracle serves as the final quality gate, validating the integrated implementation against the original specification.

## Consequences

### Positive

• **Precision**: Oracle-first planning reduces mid-task course corrections.
• **Resilience**: Context hydration and atomic handoffs minimize data loss and hallucination.
• **Velocity**: Bite-sized tasks allow for faster feedback loops and easier parallelization.
• **Consistency**: The War Room model provides a complete audit trail of the development process.

### Negative

• **Complexity**: Increased coordination logic required to manage hydration and atomic handoffs.
• **Agent Churn**: Spawning fresh subagents for every task increases initialization overhead.

## References

• [Superpowers (GitHub)](https://github.com/obra/superpowers)
• ADR 003: LEDGER-FIRST COORDINATION PATTERN
