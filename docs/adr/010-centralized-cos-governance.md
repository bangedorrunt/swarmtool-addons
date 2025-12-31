# 010. Centralizing Governance & Strategic Polling in Chief-of-Staff

- Status: Proposed
- Date: 2026-01-01
- Deciders: Chief-of-Staff, User
- Consulted: ADR-008, SKILL.md Architecture
- Precedes: ADR-008 (Refines implementation details)

## Context

In the v3.0 architecture, responsibilities were distributed:

- **Chief-of-Staff**: Ledger I/O and Agent Dispatcher.
- **Oracle**: Strategic decomposition and architectural judgment.
- **Interviewer**: Clarification loop.

This distribution creates friction for the proposed "CEO/Chief-of-Staff" workflow (v4.0), specifically for:

1.  **Drift Detection**: Checking if an agent's output violates explicit directives requires context that sits between the CoS (Ledger holder) and Oracle (Logic holder).
2.  **Latency**: Spawning an `Interviewer` just to ask a strategic poll adds unnecessary overhead.
3.  **Responsibility**: When "implicit assumptions" drift, it is unclear who owns the failure—the executor who made it, or the CoS who allowed it.

## Decision

We will **centralize governance, state management, and strategic polling** abilities directly into the **Chief-of-Staff (Parent Agent)**.

The CoS will evolve from a "Router" to a "Governor". It will actively manage the boundary between User Directives and Agent Assumptions without delegating this specific judgment to sub-agents.

### Role Redefinition

| Agent              | Old Role (v3.0)    | New Role (v4.0)                                                   |
| ------------------ | ------------------ | ----------------------------------------------------------------- |
| **Chief-of-Staff** | Traffic Controller | **Governor & Strategist** (Holds State, Polls User, Audits Drift) |
| **Oracle**         | Strategic Planner  | **Tactical Architect** (Decomposes tasks based on CoS directives) |
| **Interviewer**    | Gatekeeper         | **Clarification Tool** (Used only for deep, multi-turn ambiguity) |

## Why it's better

1.  **Intelligence Alignment**: The CoS usually runs on the highest-tier model (Gemini Pro/Opus). Drift detection and distinction between "Explicit" vs "Implicit" requires high-reasoning capability, fitting the CoS better than the faster/cheaper sub-agents.
2.  **Reduced Latency**: "Polling" (presenting options A/B/C) can happen in the main orchestration loop. We don't need to spin up a sub-agent context just to ask a choice.
3.  **Single Accountability**: The CoS is solely responsible for ensuring the project doesn't drift. If an assumption is made, the CoS logs it.

## Workflow Differences

### Before (Distributed)

```
User -> CoS -> Spawn Interviewer -> (Chat Loop) -> Ledger Update
       |
       -> Spawn Oracle -> (Decomposition) -> Ledger Update
       |
       -> Spawn Executor -> (Code) -> Validator -> Done
```

_Problem_: Multiple context switches. CoS is passive.

### After (Centralized)

```
User -> CoS (Governance Engine)
       |-- 1. Check Directives (Missing? -> Immediate Poll)
       |-- 2. Define Constraints
       |-- 3. Spawn Oracle (Tactical Plan)
       |-- 4. Spawn Executor (Execute)
       |-- 5. Audit Result (Drift? -> Log Assumption)
       -> User Review
```

## Workflow Diagram (v4.0)

```mermaid
graph TD
    User[User / CEO]
    CoS[Chief-of-Staff / Governor]
    Ledger[(LEDGER.md)]

    User -->|Command| CoS
    CoS -->|Read| Ledger

    subgraph Governance Loop
    CoS -->|Check State| G{Governance Check}
    G -->|Missing Directive| Poll[Present Poll Options]
    Poll -->|User Choice| Ledger
    G -->|Clear| Plan
    end

    subgraph Execution
    Plan -->|Delegate| Oracle[Oracle / Architect]
    Oracle -->|Tasks| Executor[Executor / Builder]
    Executor -->|Result| CoS
    end

    subgraph Audit
    CoS -->|Compare Result vs Directives| Audit{Drift Check}
    Audit -->|Match| Success
    Audit -->|Deviation| Log[Log to Assumptions]
    Log --> Ledger
    end
```

## Human-in-the-Loop Interaction

### Before: The "Gatekeeper"

_User feels blocked._

> **Agent**: "I see you want to build a backend. What database would you like? What auth provider? What framework?"
> **User**: "Just pick something standard."
> **Agent**: "I cannot assume. Please specify."

### After: The "Strategic Partner"

_User feels empowered._

> **CoS**: "To build this backend, I see we have no directives for Database or Auth.
>
> **Strategic Poll:**
>
> 1.  **Stack**: Next.js + Postgres + Clerk (Standard)
> 2.  **Stack**: Remix + SQLite + Custom Auth (Lightweight)
>
> _Reply '1' or '2'._"
>
> **User**: "1"
> **CoS**: "Noted. Directives logged. Spawning Oracle to plan..."

## Compliance

This optimization reduces token usage by avoiding unnecessary sub-agent instantiations for simple governance decisions and aligns with the "High-Agency" philosophy of the OpenCode swarm.
