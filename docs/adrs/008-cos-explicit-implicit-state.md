# 008. Chief-of-Staff: Explicit Directives & Implicit Assumptions State Management

- Status: Proposed
- Date: 2026-01-01
- Deciders: Chief-of-Staff, User
- Consulted: AGENTS.md, LEDGER.md Schema

## Context

The current orchestration system (`Chief-of-Staff v3.0`) manages state primarily through `LEDGER.md`, which tracks:

1. **Epics/Tasks**: Operational progress ("climbing the hill").
2. **Learnings**: A mixed bag of patterns, anti-patterns, decisions, and preferences.

While effective for task execution, this model fails to distinguish between:

- **Explicit Directives (The "Law")**: Decisions explicitly made by the user (e.g., "Use PostgreSQL").
- **Implicit Assumptions (The "Interpretation")**: Judgments made by agents to fill gaps (e.g., "Choosing `zod` for validation because the user didn't specify").

Without this distinction, "Scope Drift" occurs silently. Agents make reasonable assumptions that accumulate over time, potentially leading the project into a state unintended by the user. Additionally, the current `Interviewer` agent operates solely as a gatekeeper (Ask -> Wait -> Act), missing the opportunity to be a strategic partner that polls the user with curated options ("Polling" vs "Open-ended Questioning").

## Decision

We will upgrade the Chief-of-Staff architecture to v4.0 with a "Governance-First" approach, introducing three core mechanisms:

### 1. Split State Management

We will restructure the `LEDGER.md` (or introduce a complementary `.cos/` directory structure) to rigorously separate:

- **Directives (CEO Decisions)**: Explicit commands from the user.
  - _Nature_: Immutable until changed by User.
  - _Source_: Interviewer confirmations, chat inputs.
  - _Action_: Must be obeyed. Violation = Failure.

- **Assumptions (CoS Logs)**: Judgments made by agents.
  - _Nature_: Mutable, pending review.
  - _Source_: Executor defaults, Oracle decompositions.
  - _Action_: Logged for asynchronous review.

### 2. Drift Detection via Self-Review

Sub-agents (Executor/Oracle) will be required to perform a "Assumption Audit" before finalizing their output.

- **Mechanism**: Compare generated solution against `Directives`.
- **Trigger**: Any choice not backed by a Directive is logged as an `Assumption`.

### 3. Inverted Control: Strategic Polling

The `Interviewer` agent will shift from "Clarification" to "Strategic Polling".

- Instead of asking open-ended questions ("What database should we use?"), it will analyze context and present **Polls**:
  - "No Directive found for Database. I propose: A) PostgreSQL (project standard), B) SQLite (simpler), C) Other."
- User selection immediately becomes a `Directive`.

## Technical Implementation

### Schema Changes (`LEDGER.md`)

The `## Learnings` section will be refactored or augmented with a `## Governance` section:

```markdown
## Governance

### Directives (Explicit)

- [x] Tech Stack: Next.js + Tailwind (User, 2024-01-01)
- [x] Auth: Clerk (User, 2024-01-02)

### Assumptions (Pending Review)

- [?] UI Lib: Shadcn/ui (Reason: Compatible with Tailwind)
- [?] Testing: Vitest (Reason: Standard in this repo)
```

### Workflow Integration

1.  **Session Start**: Load `Directives` into context.
2.  **Execution**: Agents check `Directives` before planning.
3.  **Completion**: Agents extract `Assumptions` made during execution and append to Ledger.

## Consequences

### Positive

- **Drift Prevention**: The project state remains anchored to user intent.
- **Reduced Noise**: User only needs to review `Assumptions`, not every line of code.
- **Faster Decisions**: "Polling" reduces cognitive load compared to open-ended explanations.
- **Trust**: User can "open the throttle" (let agents run longer) knowing that assumptions are being tracked, not hidden.

### Negative

- **Complexity**: Ledger parsing logic becomes more complex.
- **Token Usage**: Context size increases slightly to include Governance state.
- **Latency**: Extra step for "Assumption Audit" after task completion.

## Compliance

This ADR adheres to the "Human-in-the-Loop" core philosophy but upgrades the loop from "Micro-management" to "Strategic Oversight".
