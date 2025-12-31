# ADR 006: GEMINI CONDUCTOR INTEGRATION ANALYSIS

## Status

Pending

## Context

We evaluated [Gemini Conductor](https://github.com/gemini-cli-extensions/conductor), a "Context-Driven Development" tool that structures agent workflows using persistent markdown files (`context.md`, `workflow.md`, `plan.md`) and a "Plan-Implementation" lifecycle (`newTrack` -> `implement`).

Our current system (ADR 004) already implements an "Oracle-First" (Planning) and "Ledger-First" (Persistence) architecture. We need to decide if integrating Conductor adds value or introduces redundancy.

## Analysis

### Gemini Conductor Workflow

*   **Philosophy**: "Context is King". Moves context out of chat into files.
*   **Components**:
    *   **Context Files**: Explicitly defined Tech Stack, Design System, Workflow Preferences.
    *   **Lifecycle**: `setup` -> `newTrack` (Spec/Plan) -> `implement` (Agent Loop).
    *   **Tooling**: CLI extension for managing these files.

### Current Implementation (ADR 003/004)

*   **Philosophy**: "Ledger-First" and "Oracle-First".
*   **Components**:
    *   **Context**: "Context Hydration" from Memory Lane (Vector DB + Recent History).
    *   **Lifecycle**: `Context Hydration` -> `Oracle` (Spec/Plan) -> `Planner` -> `Executor` -> `Ledger`.
    *   **Tooling**: `chief-of-staff` agent + `skill_agent` tool.

### Comparison

*   **Overlap**: Both systems heavily rely on "Plan before Build" and persistent markdown state.
*   **Conductor Advantage**: Explicit, human-readable definitions of "Project Context" (Tech Stack, Preferences) that are often implicit in our system.
*   **Current System Advantage**: Much more granular control (Atomic Tasks, specialized subagents like `spec-reviewer`, `debugger`), and "Memory Lane" for dynamic long-term memory (learning from past mistakes), which Conductor lacks (Conductor is mostly static context).

## Decision

We will **NOT** integrate `gemini-cli-extensions/conductor` directly as a dependency. Our `Chief-of-Staff` orchestration is more robust, supporting complex multi-agent flows, resilient handoffs, and dynamic context hydration which Conductor does not provide out concepts for.

However, we **WILL ADOPT** the **Explicit Project Context** pattern from Conductor to enhance our "Context Hydration" phase.

### Implementation Actions

1.  **Configure Project Context**
    *   **Create File**: `.opencode/PROJECT_CONTEXT.md`
    *   **Purpose**: Serve as the single source of truth for static project context.
    *   **Content Definition**:
        *   **Tech Stack**: Bun, TypeScript, SQLite.
        *   **Design System**: CLI UX patterns, color outputs.
        *   **Workflow Preferences**: TDD, ADR requirements, Conventional Commits.

2.  **Update Orchestrator (Context Loader)**
    *   **Target**: `src/orchestrator/chief-of-staff/agents/context-loader/SKILL.md`
    *   **Logic Change**:
        *   Add instruction to *always* read `.opencode/PROJECT_CONTEXT.md` during hydration.
        *   Ensure the "Project Context" section is explicitly included in the final context block passed to the Executor.

## Consequences

### Positive

*   **Consistency**: Agents will stop "guessing" the tech stack or style.
*   **Onboarding**: New developers (and agents) have a clear "Read Me First" for project rules.
*   **No Bloat**: Avoids adding a redundant CLI wrapper layer.

### Negative

*   **Maintenance**: Requires humans to keep `PROJECT_CONTEXT.md` up to date (standard documentation tax).

## References

*   [Gemini Conductor (GitHub)](https://github.com/gemini-cli-extensions/conductor)
*   ADR 004: ORCHESTRATOR SDD WORKFLOW IMPROVEMENTS
