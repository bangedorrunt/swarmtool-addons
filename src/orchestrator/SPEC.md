# Orchestrator Module: Technical Specification (v4.1)

The Orchestrator module is the governance engine and lifecycle manager of the system. It implements a **Governance-First** architecture with **Event-Sourced Persistence**, enabling seamless collaboration between native OpenCode agents and custom subagents.

## 1. Core Architecture: Governance-First (v4.1)

v4.1 extends the governance model with universal lifecycle hooks and durable state management.

### I. State Taxonomy

| State Type      | Location            | Mutability  | Source       | Enforcement               |
| :-------------- | :------------------ | :---------- | :----------- | :------------------------ |
| **Directives**  | LEDGER → Governance | Immutable   | User / Polls | **Must Obey** (The Law)   |
| **Assumptions** | LEDGER → Governance | Mutable     | Agents       | **Must Audit** (The Debt) |
| **Progress**    | LEDGER → Epic       | Append-only | All Agents   | **Auto-tracked**          |

### II. The 3-Phase Governance Loop

Every major workflow follows this cycle:

1.  **PHASE 1: STATE CHECK**
    - Load Directives from LEDGER.
    - Check if critical Directives are missing for the request.
    - If missing: Trigger **Strategic Poll** (A/B/C options).

2.  **PHASE 2: DELEGATION**
    - Dispatch agents (Oracle, Execution, or Native).
    - **Constraint**: Pass Directives as hard constraints.
    - **Auto-Track**: Hook `tool.execute.after` to log file changes to LEDGER.

3.  **PHASE 3: AUDIT & LEARN**
    - Merge new Assumptions into LEDGER.
    - Trigger `LearningExtractor` on session idle/exit.
    - Emit `ledger.learning.extracted` to Durable Stream.

## 2. Universal Self-Learning System

The orchestrator implements a pervasive learning layer that works across all agent types.

### I. Mechanism: The Learning Hook

- **Injection**: On `message.created` (first user message), keywords are extracted and Memory Lane is queried. Relevant past insights are injected into the system prompt.
- **Extraction**: On `session.idle` (2s delay) or `session.deleted`, the `LearningExtractor` analyzes the transcript.
- **Refinement**: Uses `SUCCESS_PATTERNS` and `FAILURE_PATTERNS` to classify insights into corrections, decisions, and anti-patterns.

### II. Dual-Source Wisdom

- **LEDGER.md**: Short-term, project-specific context (Current Epic).
- **Memory Lane**: Long-term, cross-project semantic knowledge (Vector DB).

## 3. Autonomous Project Tracking

Any agent (including native agents like `Code`) that modifies files is automatically tracked.

- **Trigger**: `tool.execute.after` hook detects result payloads containing file paths.
- **Action**: Emits `ledger.task.completed` event with the modified file list.
- **Sync**: The `TaskRegistry` updates the `Progress Log` in `LEDGER.md` in real-time.

## 4. Subagent Roster (v4.1)

| Agent Name         | Role                   | Access   |
| :----------------- | :--------------------- | :------- |
| **Chief-of-Staff** | **Governor**           | Public   |
| **Oracle**         | **Tactical Architect** | Internal |
| **Executor**       | **Builder (TDD)**      | Internal |
| **Planner**        | **Blueprinter**        | Internal |
| **Interviewer**    | **Clarifier**          | Internal |
| **Memory-Catcher** | **Deep Extractor**     | Internal |
| **Debugger**       | **Root Cause Analyst** | Internal |

## 5. Resilience & Durability

### I. Durable Stream (Event Sourcing)

- All significant lifecycle and governance actions are recorded as JSONL events in `.opencode/durable_stream.jsonl`.
- **Crash Recovery**: `TaskRegistry.loadFromLedger()` reconstructs active state on startup.

### II. Checkpoint System

- Critical decisions (e.g., strategy selection) create durable checkpoints.
- These require user approval via `checkpoint_approve` and are resilient to session restarts.

## 6. Access Control

- **Middleware**: Intercepts all subagent spawns.
- **Whitelist**: Only `chief-of-staff` can spawn protected agents (Oracle, Executor, etc.).
- **Fallback**: Native agents (Ask, Code) are always accessible but operate under auto-tracking governance.

---

_Architecture Version: 4.1.0 (Event-Sourced Governance)_
