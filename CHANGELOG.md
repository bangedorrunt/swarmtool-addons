# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.1.0] - 2026-01-02

### Summary

Multi-Turn Dialogue Support for Natural Human-in-the-Loop Interactions. Enables ROOT-level continuation of DIALOGUE mode agents via LEDGER.activeDialogue persistence.

### Added

- **Active Dialogue Tracking**: New `ActiveDialogue` interface in `ledger.ts`
  - `setActiveDialogue()` - Start tracking multi-turn interaction
  - `updateActiveDialogue()` - Accumulate context across turns
  - `getActiveDialogue()` - Read current dialogue state
  - `clearActiveDialogue()` - Clear when complete

- **Multi-Turn Dialogue Tools**: New tools for agents
  - `ledger_set_active_dialogue` - Start active dialogue
  - `ledger_update_active_dialogue` - Update with user responses
  - `ledger_clear_active_dialogue` - Clear when completed
  - `ledger_get_active_dialogue` - Get current state

- **AMA Command (v5.1)**: Complete rewrite of `src/opencode/command/ama.md`
  - Check for existing active dialogue before starting
  - Continue from LEDGER state on user response
  - Natural multi-turn polling flow

- **SDD Command (v5.1)**: Complete rewrite of `src/opencode/command/sdd.md`
  - Multi-turn CLARIFY phase (spec approval)
  - Multi-turn PLAN phase (plan approval)
  - Clear dialogue before EXECUTE phase

### Changed

- **Chief-of-Staff SKILL.md (v5.1.0)**: Major update for multi-turn support
  - Added resume-from-LEDGER logic for CLARIFY phase
  - Added resume-from-LEDGER logic for PLAN phase
  - New multi-turn flow diagram showing ROOT-level continuation
  - Added `ledger_set_active_dialogue`, `ledger_update_active_dialogue`, `ledger_clear_active_dialogue` to tool_access

- **Interviewer SKILL.md (v5.1.0)**: Updated for multi-turn dialogue
  - Added tool access for active dialogue functions
  - v5.1.0 version bump

- **AGENTS.md**: Added Section 7: Multi-Turn Dialogue (v5.1)
  - Full documentation of ROOT-level continuation pattern
  - LEDGER Active Dialogue structure
  - Dialogue State Protocol
  - Status transitions diagram

### Technical Details

**Multi-Turn Flow**:

```
TURN 1: User starts /ama or /sdd
  ├─ ROOT checks LEDGER.activeDialogue (null)
  ├─ ROOT calls skill_agent(chief-of-staff)
  ├─ Agent returns: dialogue_state.status = 'needs_input'
  └─ ROOT saves to LEDGER.activeDialogue, displays poll

TURN 2: User responds
  ├─ ROOT checks LEDGER.activeDialogue (exists!)
  ├─ ROOT calls skill_agent with continuation context
  ├─ Agent processes response, logs decisions
  └─ If approved: dialogue_state.status = 'approved'
```

**LEDGER Active Dialogue Structure**:

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
```

### Breaking Changes

- **None**: This is a backward-compatible enhancement. Existing commands continue to work.

## [6.0.0] - 2026-01-02

### Summary

File-Based Ledger with Conductor-inspired structure for git-friendly history tracking.

### Added

- **File-Based Ledger**: New hybrid structure with `.opencode/` directory
  - `LEDGER.md` as lightweight index (pointers only)
  - `context/` for project context (product.md, tech-stack.md, workflow.md)
  - `epics/<id>/` for file-based epics (spec.md, plan.md, log.md, metadata.json)
  - `learnings/` for persistent learnings (patterns.md, decisions.md, preferences.md)
  - `archive/` for completed epics with full git history

- **New Module**: `src/orchestrator/file-ledger/`
  - `types.ts` - Type definitions for file-based structure
  - `templates.ts` - Markdown templates for spec, plan, log
  - `index.ts` - FileBasedLedger class (22 tests)
  - `tools.ts` - New ledger tools for file-based operations

- **New Documentation**:
  - `docs/TECHNICAL.md` - Technical documentation for AI agents
  - `CHANGELOG.md` - This file

### Changed

- **Epic Structure**: Each epic is now a directory with separate files
  - `spec.md` - Requirements and acceptance criteria
  - `plan.md` - Implementation plan with tasks
  - `log.md` - Execution log with timestamps
  - `metadata.json` - Epic metadata (id, title, status, timestamps)

- **Learnings Persistence**: Learnings are no longer lost on archive
  - Stored in `.opencode/learnings/` directory
  - Separate files: patterns.md, decisions.md, preferences.md

### Deprecated

- **Old Ledger**: `src/orchestrator/ledger.ts` is deprecated
  - Use `src/orchestrator/file-ledger/` instead
  - Migration: Run `ledger_init` to create new structure

### Breaking Changes

- **File Structure**: `.opencode/` directory structure changed completely
  - Old: Single `LEDGER.md` file with all content
  - New: File-based structure with separate directories for context, epics, learnings

- **Tool Names**: New file-based ledger tools
  - Old: `ledgerTools` from `ledger-tools.ts`
  - New: `fileLedgerTools` from `file-ledger/tools.ts`

---

## [5.0.0] - 2026-01-02

### Summary

Governance-First Orchestration with Agent Consolidation, Strategic Polling, and Hybrid Session Strategy.

### Added

- **Progress Notifications**: Real-time status updates during agent orchestration
  - `src/orchestrator/progress.ts` - Phase start/complete events
  - Users see what agents are doing in real-time

- **HITL Utilities**: Human-in-the-loop interaction patterns
  - `src/orchestrator/hitl.ts` - Poll formatting, response parsing
  - Strategic Polling with numbered options + free text
  - Faster user decisions, structured responses

- **Session Strategy**: Hybrid session modes for agents
  - `src/orchestrator/session-strategy.ts` - inline/child session selection
  - `inline` for planning agents (user sees thinking process)
  - `child` for execution agents (isolated, parallel-safe)

- **New Agents**:
  - `architect` - Merged from oracle + planner (decomposition + planning)
  - `reviewer` - Merged from spec-reviewer + code-quality-reviewer (two-phase review)

- **New Documentation**:
  - `docs/WORKFLOW-GUIDE.md` - User-facing workflow guide
  - `agents/DEPRECATED.md` - Migration guide for removed agents

- **New Tests**: 35 tests for v5.0 modules
  - `hitl.test.ts` - 24 tests
  - `progress.test.ts` - 11 tests

### Changed

- **Agent Consolidation**: Reduced from 16 agents to 8 agents

  | New Agent     | Merged From                           | Session Mode |
  | ------------- | ------------------------------------- | ------------ |
  | `interviewer` | interviewer + spec-writer             | inline       |
  | `architect`   | oracle + planner                      | inline       |
  | `executor`    | unchanged                             | child        |
  | `reviewer`    | spec-reviewer + code-quality-reviewer | inline       |
  | `validator`   | unchanged                             | inline       |
  | `debugger`    | unchanged                             | inline       |
  | `explore`     | unchanged                             | inline       |
  | `librarian`   | unchanged                             | child        |

- **SDD Workflow**: Conductor-inspired 6-phase pattern

  ```
  LOAD -> CLARIFY -> PLAN -> EXECUTE -> REVIEW -> COMPLETE
  ```

  - Each phase has mandatory user checkpoint
  - CLARIFY: interviewer (spec output)
  - PLAN: architect (task decomposition)
  - EXECUTE: executor(s) (parallel/sequential)
  - REVIEW: reviewer (spec + quality)

- **Strategic Polling**: Replaces open-ended questions

  ```
  POLL: Database Selection
  (1) Postgres - scalable, pgvector support
  (2) SQLite - simple, file-based
  (3) Or describe your preference
  ```

  User selection becomes a Directive in LEDGER

- **Chief-of-Staff SKILL.md**: Complete rewrite for v5.0
  - Governance Loop integration
  - Parallel orchestration support
  - Progress notification hooks

### Deprecated

- **Removed Agents** (see `agents/DEPRECATED.md` for migration):
  - `spec-writer` -> merged into `interviewer`
  - `oracle` -> merged into `architect`
  - `planner` -> merged into `architect`
  - `spec-reviewer` -> merged into `reviewer`
  - `code-quality-reviewer` -> merged into `reviewer`
  - `frontend-ui-ux-engineer` -> use `executor`
  - `workflow-architect` -> absorbed by CoS
  - `context-loader` -> inline in CoS
  - `memory-catcher` -> event-driven hooks

### Breaking Changes

- **Agent Names**: Some agents renamed/merged
  - Update any code referencing old agent names
  - Use `skill_list` to see current roster

- **Session Modes**: Agents now have explicit session modes
  - `inline` agents: User sees dialogue
  - `child` agents: Isolated execution

---

## [4.1.0] - 2025-12-XX

### Added

- Governance-First Orchestration foundation
- LEDGER.md single source of truth
- Durable Stream event-sourced persistence
- Checkpoint system for human approval
- 16-agent roster with specialized roles

### Changed

- Skill-based subagent architecture
- Chief-of-Staff as main orchestrator

---

## [4.0.0] - 2025-12-XX

### Added

- Parallel execution tracking
- File conflict detection
- Heartbeat protocol for long-running tasks

### Fixed

- Observer cleanup race condition
- Task registry memory leaks

---

## Migration Guide

### v4.x -> v5.0 (Agent Consolidation)

#### Step 1: Update Agent References

| Old Agent                 | New Agent     | Notes                        |
| ------------------------- | ------------- | ---------------------------- |
| `spec-writer`             | `interviewer` | Merged                       |
| `oracle`                  | `architect`   | Merged                       |
| `planner`                 | `architect`   | Merged                       |
| `spec-reviewer`           | `reviewer`    | Merged                       |
| `code-quality-reviewer`   | `reviewer`    | Merged                       |
| `frontend-ui-ux-engineer` | `executor`    | Use executor with UI context |
| `workflow-architect`      | N/A           | Absorbed by CoS              |
| `context-loader`          | N/A           | Inline in CoS                |
| `memory-catcher`          | N/A           | Event-driven hooks           |

#### Step 2: Update Session Strategy

```typescript
// Old: All agents were child sessions
await skill_agent({ agent_name: 'planner', ... });

// New: Use appropriate session mode
// inline agents: interviewer, architect, reviewer, validator, debugger, explore
// child agents: executor, librarian
```

#### Step 3: Use Strategic Polling

```typescript
// Old: Open-ended questions
'What database do you want to use?';

// New: Numbered options
import { formatPoll } from './orchestrator/hitl';
formatPoll('Database Selection', [
  { id: '1', label: 'Postgres', description: 'scalable, pgvector' },
  { id: '2', label: 'SQLite', description: 'simple, file-based' },
]);
```

---

### v5.0 -> v6.0 (File-Based Ledger)

#### Step 1: Initialize New Structure

```bash
# The agent will create .opencode/ structure
/sdd init
```

Or programmatically:

```typescript
import { getFileLedger } from './orchestrator/file-ledger';
await getFileLedger().initialize();
```

#### Step 2: Migrate Existing LEDGER.md

If you have an existing LEDGER.md:

1. Copy learnings to `.opencode/learnings/`
2. Active epic can be recreated with new structure
3. Archive can be migrated manually if needed

#### Step 3: Update Tool Imports

```typescript
// Old (v5.0)
import { ledgerTools } from './orchestrator/tools/ledger-tools';

// New (v6.0)
import { fileLedgerTools } from './orchestrator/file-ledger/tools';
```

#### Step 4: Update Epic Workflow

```typescript
// Old: Single file operations
await ledger.createEpic('Title', 'Request');
await ledger.addTask('Task 1');

// New: File-based operations
const epicId = await fileLedger.createEpic('Title', 'Request');
await fileLedger.writeSpec(epicId, specContent);
await fileLedger.writePlan(epicId, planContent);
await fileLedger.appendLog(epicId, 'Started implementation');
```

---

## Version History

| Version | Date       | Codename                     | Highlights                                |
| ------- | ---------- | ---------------------------- | ----------------------------------------- |
| 6.0.0   | 2026-01-02 | File-Based Ledger            | Conductor-inspired, git-friendly epics    |
| 5.0.0   | 2026-01-02 | Governance-First             | Agent consolidation (16→8), HITL, polling |
| 4.1.0   | 2025-12-XX | Physical Resource Management | Parallel execution, conflict detection    |
| 4.0.0   | 2025-12-XX | Skill-Based Architecture     | Subagent system, CoS orchestrator         |
