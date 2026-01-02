# AGENTS.md

## Module Implementation Guide

### Skill-Based Agent Architecture (v5.0 + v6.0)

This plugin implements a **Skill-Based Subagent** architecture with two major versions:

- **v5.0 - Governance-First Orchestration**: Agent consolidation (16→8), Strategic Polling, Hybrid Sessions
- **v6.0 - File-Based Ledger**: Conductor-inspired file structure for git-friendly history tracking

Domain expertise is packaged into specialized, on-demand workers coordinated by a `chief-of-staff` Governor agent.

```
+-------------------------------------------------------------------+
|                      OpenCode Runtime                              |
|  +---------------------------------------------------------------+|
|  |           Tool & Message Hooks Event Bus                      ||
|  |       (async, decoupled event processing)                     ||
|  +---------------------------------------------------------------+|
|         |                              |                          |
|         V                              V                          |
|  +-----------------+           +----------------------+           |
|  |  Agent Addons   |           |    Chief-of-Staff    |           |
|  |  (This Plugin)  |           |    (Coordinator)     |           |
|  |  +-----------+  |           |  +---------------+   |           |
|  |  |  Tools &  |<-+-----------+  |  8 Subagents  |   |           |
|  |  |   Hooks   |              |  | (v6.0 roster) |   |           |
|  |  +-----------+              |  +---------------+   |           |
|  +-----------------+-----------+----------------------+           |
|                    |                                              |
|    +---------------+---------------------+                        |
|    V               V                     V                        |
| +----------+ +--------------+ +---------------------+             |
| |.opencode/| |Durable Stream| |    Memory Lane      |             |
| |(Files)   | |(Event Source)| |    (Vector DB)      |             |
| +----------+ +--------------+ +---------------------+             |
+-------------------------------------------------------------------+

.OPENCODE/ STRUCTURE (v6.0):
  .opencode/
  +-- LEDGER.md           # Lightweight index (pointers only)
  +-- context/            # Project context
  |   +-- product.md
  |   +-- tech-stack.md
  |   +-- workflow.md
  +-- epics/              # File-based epics
  |   +-- <epic_id>/
  |       +-- spec.md
  |       +-- plan.md
  |       +-- log.md
  |       +-- metadata.json
  +-- learnings/          # Persistent learnings
  |   +-- patterns.md
  |   +-- decisions.md
  |   +-- preferences.md
  +-- archive/            # Archived epics (git-tracked)
      +-- <epic_id>/
```

---

## 1. File-Based Ledger (v6.0)

**v6.0 Changes:**

- Hybrid approach: Lightweight LEDGER.md index + file-based epics
- Git-friendly: Each epic is a separate directory for easy review
- Persistent learnings: Not lost on archive
- Conductor-inspired: spec.md, plan.md, log.md per epic

### Benefits

| Aspect             | v5.0 (Single File)    | v6.0 (File-Based) |
| ------------------ | --------------------- | ----------------- |
| Reviewability      | Single large file     | Git diff per epic |
| History            | Limited archive       | Full git history  |
| Team Collaboration | Single conflict point | Isolated epics    |
| Learnings          | Lost on archive       | Persistent files  |

### Key Files

| File                     | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `LEDGER.md`              | Lightweight index with active epic pointer |
| `context/product.md`     | Project description, users, goals          |
| `context/tech-stack.md`  | Language, frameworks, conventions          |
| `context/workflow.md`    | TDD rules, quality gates, commit strategy  |
| `epics/<id>/spec.md`     | Requirements and acceptance criteria       |
| `epics/<id>/plan.md`     | Implementation plan with tasks             |
| `epics/<id>/log.md`      | Execution log with timestamps              |
| `learnings/patterns.md`  | Successful patterns                        |
| `learnings/decisions.md` | Key decisions                              |

---

## 2. Skill-Based Agent Roster (v5.0)

**v5.0 Changes:**

- Consolidated from 16 agents to 8 agents
- Flat naming convention (use `interviewer` not `chief-of-staff/interviewer`)
- Hybrid session modes (inline for planning, child for execution)
- Progress notifications for user visibility

### Core Orchestrator

- **`chief-of-staff` (The Governor)**
  - **Role**: Technical coordinator and governance engine.
  - **Responsibilities**: Manages the Governance Loop, Strategic Polling, SDD Workflow, and Parallel Orchestration using `LEDGER.md` as the single source of truth.
  - **Access**: Public (The only agent users interact with directly).
  - **Version**: 5.0.0

### Consolidated Agent Roster

| Agent             | Role                          | Session Mode | v5.0 Notes                                    |
| ----------------- | ----------------------------- | ------------ | --------------------------------------------- |
| **`interviewer`** | Clarification + Specification | inline       | Merged: interviewer + spec-writer             |
| **`architect`**   | Decomposition + Planning      | inline       | Merged: oracle + planner                      |
| **`executor`**    | TDD Implementation            | child        | Parallel-safe, file tracking                  |
| **`reviewer`**    | Spec + Quality Review         | inline       | Merged: spec-reviewer + code-quality-reviewer |
| **`validator`**   | Quality Gate                  | inline       | Acceptance criteria verification              |
| **`debugger`**    | Root Cause Analysis           | inline       | 4-phase debugging protocol                    |
| **`explore`**     | Codebase Search               | inline       | Fast file/code search                         |
| **`librarian`**   | External Docs                 | child        | API docs, library research                    |

### Agent Details

- **`interviewer` (Clarification + Specification)**
  - **Merged from**: `interviewer` + `spec-writer`
  - **Role**: Strategic polling, requirements clarification, structured specification output
  - **Session Mode**: inline (user sees dialogue)
  - **Access**: Internal (called by CoS)

- **`architect` (Decomposition + Planning)**
  - **Merged from**: `oracle` + `planner`
  - **Role**: Task decomposition, execution strategy analysis, implementation blueprinting
  - **Session Mode**: inline (user approves plan)
  - **Access**: Internal

- **`executor` (TDD Implementation)**
  - **Role**: TDD-driven code implementation
  - **Session Mode**: child (isolated execution)
  - **Features**: Parallel-safe, file tracking, conflict detection, heartbeat protocol
  - **Access**: Internal

- **`reviewer` (Unified Code Review)**
  - **Merged from**: `spec-reviewer` + `code-quality-reviewer`
  - **Role**: Two-phase review (Phase 1: spec compliance, Phase 2: code quality)
  - **Session Mode**: inline (user sees review results)
  - **Access**: Internal

- **`validator` (Quality Gate)**
  - **Role**: Acceptance criteria verification, directive compliance checking
  - **Session Mode**: inline
  - **Access**: Internal

- **`debugger` (Root Cause Analysis)**
  - **Role**: 4-phase systematic debugging (NO FIX WITHOUT ROOT CAUSE)
  - **Session Mode**: inline
  - **Access**: Internal (can be called by executor)

- **`explore` (Codebase Search)**
  - **Role**: Fast file/code search, "Where is X?" questions
  - **Session Mode**: inline (quick results)
  - **Access**: Internal

- **`librarian` (External Documentation)**
  - **Role**: External API docs, library research, GitHub exploration
  - **Session Mode**: child (may be slow, runs in background)
  - **Access**: Internal

### Deprecated Agents (v5.0)

See `src/orchestrator/chief-of-staff/agents/DEPRECATED.md` for full migration guide.

| Deprecated                | Merged Into            |
| ------------------------- | ---------------------- |
| `spec-writer`             | `interviewer`          |
| `oracle`                  | `architect`            |
| `planner`                 | `architect`            |
| `spec-reviewer`           | `reviewer`             |
| `code-quality-reviewer`   | `reviewer`             |
| `frontend-ui-ux-engineer` | Removed (use executor) |
| `workflow-architect`      | Absorbed by CoS        |
| `context-loader`          | Inline in CoS          |
| `memory-catcher`          | Event-driven hooks     |

---

## 3. Human-in-the-Loop Interaction Patterns (v5.0)

### I. Strategic Polling (Primary)

Instead of open-ended questions, agents generate structured **Polls**:

```
POLL: Database Selection
No Directive found. Based on project context:

(1) Postgres - scalable, pgvector support
(2) SQLite - simple, file-based
(3) Or describe your preference

Reply '1', '2', or your choice.
```

User selection immediately becomes a **Directive** in LEDGER.

### II. Progress Notifications

Real-time status updates via event system:

```typescript
import { emitPhaseStart, emitProgress, emitPhaseComplete } from './progress';

await emitPhaseStart('CLARIFY', 'interviewer', sessionId);
await emitProgress('interviewer', 'Analyzing requirements...', sessionId);
await emitPhaseComplete('CLARIFY', 'interviewer', sessionId, 'success');
```

### III. Assumption Audit (Post-Task)

Agents report `assumptions_made` which are logged in LEDGER. Users implicitly endorse by proceeding, or reject to trigger rework.

### IV. Checkpoint System

Built-in checkpoint support for critical decisions:

- `checkpoint_request` - Request human approval
- `checkpoint_approve` - Approve with optional selection
- `checkpoint_reject` - Reject with reason
- `checkpoint_pending` - List pending checkpoints

---

## 4. SDD Workflow (v5.0)

```
PHASE 0: LOAD       → Read LEDGER, check for active Epic
    │
    ▼
PHASE 1: CLARIFY    → interviewer (inline, HITL)
    │                 -> Approved Specification
    ▼
PHASE 2: PLAN       → architect (inline, HITL)
    │                 -> Epic + Tasks + Blueprint
    ▼
PHASE 3: EXECUTE    → executor(s) (child, parallel/seq)
    │                 -> Implementation
    ▼
PHASE 4: REVIEW     → reviewer (inline)
    │                 -> Approved or Needs Changes
    ▼
PHASE 5: COMPLETE   → Archive Epic, Extract Learnings
```

### Session Strategy (Hybrid Mode)

- **inline** agents: interviewer, architect, reviewer, validator, debugger, explore
  - User sees thinking process
  - Good for planning and approval phases

- **child** agents: executor, librarian
  - Isolated execution
  - Context handoff from LEDGER
  - Good for long-running or file-modifying tasks

---

## 5. Module Structure

```
src/
  index.ts                    # Plugin bootstrap
  agent-spawn.ts              # skill_agent tool

  memory-lane/                # Vector DB Module
    index.ts
    memory-store.ts

  durable-stream/             # Event-Sourced Persistence
    core.ts
    orchestrator.ts
    store.ts
    types.ts                  # Includes progress event types (v5.0)

  opencode/                   # Runtime Integration
    index.ts
    loader.ts
    config/
      skill-loader.ts         # Agent loading with v5.0 roster filter

  orchestrator/               # Governance Engine
    index.ts
    ledger.ts                 # Legacy v5.0 ledger (deprecated)
    progress.ts               # Progress notifications (v5.0)
    hitl.ts                   # HITL utilities (v5.0)
    session-strategy.ts       # Hybrid session modes (v5.0)
    learning-extractor.ts
    event-driven-ledger.ts
    checkpoint.ts
    crash-recovery.ts
    file-ledger/              # v6.0 File-Based Ledger
      index.ts                # FileBasedLedger class
      types.ts                # Type definitions
      templates.ts            # Markdown templates
      tools.ts                # File-based tools
    tools/
      ledger-tools.ts
      checkpoint-tools.ts
    hooks/
      opencode-session-learning.ts
    chief-of-staff/
      SKILL.md                # Governor v5.0
      agents/
        interviewer/          # v5.0 (merged: interviewer + spec-writer)
        architect/            # v5.0 (merged: oracle + planner)
        executor/             # v5.0
        reviewer/             # v5.0 (merged: reviewers)
        validator/            # v5.0
        debugger/             # v5.0
        explore/              # v5.0
        librarian/            # v5.0
        DEPRECATED.md         # Migration guide for removed agents
```

---

## 6. Tools Reference

### Ledger Tools

| Tool                    | Description                              |
| ----------------------- | ---------------------------------------- |
| `ledger_status`         | Get current LEDGER.md status             |
| `ledger_create_epic`    | Create a new epic in LEDGER.md           |
| `ledger_create_task`    | Create a task within the current epic    |
| `ledger_update_task`    | Update task status                       |
| `ledger_add_learning`   | Add a learning entry to LEDGER.md        |
| `ledger_get_learnings`  | Get recent learnings from LEDGER.md      |
| `ledger_add_context`    | Add context to current epic              |
| `ledger_create_handoff` | Create handoff section for session break |
| `ledger_archive_epic`   | Archive the current epic                 |

### Agent Tools

| Tool                | Description                          |
| ------------------- | ------------------------------------ |
| `skill_agent`       | Spawn a single agent (sync or async) |
| `skill_spawn_batch` | Spawn multiple agents in parallel    |
| `skill_gather`      | Gather results from async agents     |
| `agent_yield`       | Pause execution and return to parent |
| `agent_resume`      | Resume a yielded agent with data     |

### Checkpoint Tools

| Tool                 | Description                          |
| -------------------- | ------------------------------------ |
| `checkpoint_request` | Request human approval for decisions |
| `checkpoint_approve` | Approve a pending checkpoint         |
| `checkpoint_reject`  | Reject with optional reason          |
| `checkpoint_pending` | List all pending checkpoints         |

### Active Dialogue Tools (v5.1)

For multi-turn Human-in-the-Loop interactions:

| Tool                            | Description                               |
| ------------------------------- | ----------------------------------------- |
| `ledger_set_active_dialogue`    | Start tracking an active dialogue         |
| `ledger_update_active_dialogue` | Update dialogue state with user responses |
| `ledger_clear_active_dialogue`  | Clear dialogue when completed             |
| `ledger_get_active_dialogue`    | Get current active dialogue state         |

### Logging Utilities (v7.0)

Structured logging using Pino for better debugging and observability:

```typescript
import { createModuleLogger, logInfo, logWarn, logError, logDebug } from '../utils/logger';

// Create module-specific logger
const log = createModuleLogger('ModuleName');

// Structured logging with data
log.info({ key: value }, 'Message');
log.warn({ path }, 'Warning message');
log.error({ error }, 'Error message');
log.debug({ detail }, 'Debug information');

// Convenience functions
logInfo('Information message');
logWarn('Warning message', { context });
logError('Error occurred', error);
logDebug('Debug detail', { data });
```

**Benefits**:

- JSON-structured output for easy parsing
- Module-scoped loggers for filtering
- Metadata attached to all log entries
- Test mode auto-silencing

---

## 7. Multi-Turn Dialogue (v5.1)

### Overview

v5.1 introduces **ROOT-level multi-turn dialogue** for natural Human-in-the-Loop interactions. Instead of complex session management, dialogue state is persisted in LEDGER, enabling the ROOT agent to continue conversations across turns.

### Flow

```
TURN 1: User starts command (/ama or /sdd)
  ├─ ROOT checks LEDGER.activeDialogue (null)
  ├─ ROOT calls skill_agent(chief-of-staff)
  ├─ chief-of-staff calls interviewer/architect
  ├─ Agent returns: dialogue_state.status = 'needs_input'
  └─ ROOT saves to LEDGER.activeDialogue, displays poll

TURN 2: User responds
  ├─ ROOT checks LEDGER.activeDialogue (exists!)
  ├─ ROOT calls skill_agent with continuation context
  ├─ Agent processes response, logs decisions
  ├─ If more questions: dialogue_state.status = 'needs_input'
  └─ If approved: dialogue_state.status = 'approved'
```

### LEDGER Active Dialogue Structure

```markdown
## Active Dialogue

agent: chief-of-staff
command: /sdd
turn: 2
status: needs_input

### Goals

- User Authentication System

### Decisions

- Database: PostgreSQL
- Auth: JWT with RS256

### Pending Questions

- Plan approval needed
```

### Dialogue State Protocol

Agents return `dialogue_state` in their response:

```json
{
  "dialogue_state": {
    "status": "needs_input | needs_approval | approved",
    "turn": 1,
    "message_to_user": "Human-readable poll or summary",
    "pending_questions": ["Question 1?"],
    "accumulated_direction": {
      "goals": [],
      "constraints": [],
      "decisions": []
    }
  },
  "output": { ... }
}
```

### Status Transitions

```
needs_input ──► User answers ──► needs_input (more questions)
                             ──► needs_approval (clarifications complete)

needs_approval ──► User approves ──► approved
                ──► User rejects  ──► needs_input

approved ──► Continue to next phase or complete
```

### Implementation

1. **Command files** (ama.md, sdd.md) check for active dialogue first
2. **Chief-of-Staff** reads accumulated direction from LEDGER
3. **interviewer/architect** generate polls and track decisions
4. **ROOT agent** handles continuation naturally via session

## Project Context

- **Type**: ES Module for OpenCode
- **Target**: Bun runtime
- **Purpose**: Skill-based multi-agent orchestration with durable state
- **Version**: 5.1.0 (Multi-Turn Dialogue Support)

---

_Last Updated: 2026-01-02_
