# Orchestrator Module: Technical Specification (v4.0)

The Orchestrator module is the governance engine of the skill-based subagent system. It implements a **Governance-First** architecture where the **Chief-of-Staff** acts as a Governor, managing the boundary between User Directives (The Law) and Agent Assumptions (The Debt).

## 1. Core Architecture: Governance-First

v4.0 pivots from "Task-Driven Routing" to "Governance-First Orchestration".

### I. State Taxonomy

| State Type | Location | Mutability | Source | Enforcement |
|Types|Types|Types|Types|Types|
| **Directives** | LEDGER → Governance | Immutable | User / Polls | **Must Obey** (The Law) |
| **Assumptions** | LEDGER → Governance | Mutable | Agents | **Must Audit** (The Debt) |

### II. The 3-Phase Governance Loop

Every major workflow follows this cycle:

1.  **PHASE 1: STATE CHECK**
    - Load Directives from LEDGER.
    - Check if critical Directives are missing for the request.
    - If missing: Trigger **Strategic Poll** (User fills the gap).
    - If present: Proceed.

2.  **PHASE 2: DELEGATION**
    - Dispatch sub-agents (Oracle, Execution).
    - **Constraint**: Pass Directives as hard constraints.
    - **Capture**: Collect `assumptions_made` and `learnings` from results.

3.  **PHASE 3: AUDIT**
    - Merge new Assumptions into LEDGER.
    - Report completion to user with an "Assumption Audit" request.

## 2. Skill-Based Subagent Roster

The system uses specialized workers coordinated by the Chief-of-Staff.

| Agent Name | Role | v4.0 Capability | Access |
| :--- | :--- | :--- | :--- |
| **Chief-of-Staff** | **Governor** | Governance Loop, Strategic Polling, Drift Detection | Public |
| **Oracle** | **Tactical Architect** | Parallel Execution Strategy, Conflict Re-decomposition | Internal |
| **Executor** | **Builder** | Parallel-Safe Execution, File Tracking, TDD | Internal |
| **Interviewer** | **Strategist** | (Fallback) Deep ambiguity resolution via dialogue | Internal |
| **Context-Loader** | **Librarian** | Hydrates context from Memory Lane + LEDGER | Internal |
| **Planner** | **Blueprinter** | Detailed implementation planning | Internal |
| **Validator** | **QA** | Verification | Internal |
| **Spec-Writer** | **Scribe** | Creates/Updates Specifications | Internal |
| **Spec-Reviewer** | **Gatekeeper** | Verifies logic against spec | Internal |
| **Code-Reviewer** | **Gatekeeper** | Verifies code quality/standards | Internal |
| **Debugger** | **Mechanic** | Systematic debugging on failure | Internal |
| **Workflow-Arch** | **Meta-Designer** | Designs new workflows/agents | Internal |

## 3. Human-in-the-Loop Patterns

### I. Strategic Polling (Primary)

Replaces open-ended questioning for missing Directives.
- **Trigger**: Chief-of-Staff detects missing Directive (e.g., "No DB selected").
- **Mechanism**: Yields `HANDOFF_INTENT` with structured options (A/B/C).
- **User Action**: Selects option.
- **Result**: Immediate conversion to Directive.

### II. Assumption Audit (Post-Task)

Replaces silent drift.
- **Trigger**: Task completion.
- **Mechanism**: User reviews `## Assumptions` section in LEDGER.
- **User Action**: Endorse (Implicit) or Reject (Explicit).
- **Result**: Rejection triggers rework.

### III. Dialogue (Fallback)

Used only for deep ambiguity where Polling fails.
- **Agent**: `interviewer`.
- **Mechanism**: Multi-turn conversation.

## 4. Execution Patterns

### I. Parallel Execution (Map-Reduce)
- **Engine**: Oracle returns `execution_strategy: "parallel"`.
- **Action**: Chief-of-Staff uses `skill_spawn_batch`.
- **Safety**: Executors track `files_modified`.
- **Conflict**: If file collision detected, CoS triggers Oracle `CONFLICT_REDECOMPOSE`.

### II. Yield & Resume (Upward Instruction)
- **Mechanism**: Sub-agents return `status: "HANDOFF_INTENT"`.
- **Use Case**: "I need an API key" or "Ask user preference".
- **Flow**: CoS catches Yield -> Executes Instruction -> Resumes Sub-agent.

## 5. Resilience & Durability

### I. LEDGER as Single Source of Truth
- State is NOT in memory; it is in `.opencode/LEDGER.md`.
- **Crash Recovery**: On startup, CoS reads LEDGER to resume active Epic.

### II. Heartbeats & Observation
- **TaskRegistry**: Tracks running tasks.
- **Watchdog**: Kills/Retries tasks with stale heartbeats (>30s).

## 6. Access Control

- **Public**: `chief-of-staff`
- **Protected**: All others (Reply "Access Denied" if called directly).
- **Enforcement**: Middleware checks `agent_name` against whitelist.

---
_Architecture Version: 4.0.0 (Governance-First)_
