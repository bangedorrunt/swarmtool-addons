# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **/sdd HITL gating**: Updated the `/sdd` command contract to be approval-gated (spec + plan) using multi-turn Active Dialogue.

### Changed

- **Removed progress notifications pipeline**: Dropped the `orchestrator/progress` module and the runtime hook that injected `progress.*` events into chat.
- **Session strategy cleanup**: Removed the deadlock-era `intendedMode` field and the unused `canUseInlineMode` helper.
- **Skill metadata alignment**: Updated `session_mode` frontmatter across chief-of-staff and subagent skills to match the intended hybrid inline/child split.

## [6.1.0] - 2026-01-02

### Fixed

- **Inline session mode deadlock**: Restored inline planning agents without deadlocking by deferring inline prompts.
  - Tools return `status: "HANDOFF_INTENT"` instead of calling `session.prompt()` synchronously on the same session.
  - The plugin schedules `session.promptAsync()` from the outer hook loop (`tool.execute.after`) and retries on `session.idle` when sessions are busy.

### Added

- **Prompt buffering**: `PromptBuffer` queues deferred prompts when a session is busy and flushes them on `session.idle` (with bounded retries).
- **Ledger projection**: `LedgerProjector` projects `ledger.learning.extracted` events into `.opencode/LEDGER.md` on safe triggers (debounced + `session.idle`).
- **Durable Stream execution telemetry**: Durable Stream now captures OpenCode SDK `message.updated` and `message.part.updated` deltas/snapshots as `execution.*` events.

### Changed

- **Hybrid session strategy**: Planning agents are `inline` again (interviewer/architect/reviewer/validator/debugger/explore/chief-of-staff); execution agents remain `child` (executor/librarian).
- **History tooling**: `ledger_get_history` now reads from Durable Stream instead of `.opencode/activity.jsonl` (ActivityLogger no longer required for runtime telemetry).
- **Memory Lane embeddings**: Improved LM Studio embeddings reliability by auto-starting the server and loading an embeddings model (and using the API-provided model identifier when available).

### Credits

- **Ralph Loop idea**: The deferred inline prompt design is inspired by the “outer loop drives work” pattern (avoid re-entrant SDK calls; emit intents and flush them from an external loop/event hook).

### Files Changed (Deferred Inline Prompts & Durable Stream Telemetry)

| File | Change |
| --- | --- |
| `src/orchestrator/session-strategy.ts` | Re-enabled inline modes for planning agents |
| `src/orchestrator/tools.ts` | Inline tools now return `HANDOFF_INTENT` (no synchronous `session.prompt()` on same session) |
| `src/index.ts` | `tool.execute.after` schedules `promptAsync`; flushes buffered prompts; triggers ledger projection on `session.idle` |
| `src/orchestrator/prompt-buffer.ts` | **New**: queue + flush + retry for deferred prompts |
| `src/durable-stream/types.ts` | Added `execution.*` telemetry event types |
| `src/durable-stream/orchestrator.ts` | Captures `message.updated` + `message.part.updated` deltas/snapshots into Durable Stream |
| `src/orchestrator/tools/ledger-tools.ts` | `ledger_get_history` queries Durable Stream instead of `activity.jsonl` |
| `src/orchestrator/ledger-projector.ts` | **New**: projects learnings from Durable Stream into `.opencode/LEDGER.md` |
| `src/memory-lane/memory-store.ts` | Improved LM Studio embedding model handling (server start + model load + identifier selection) |
| `src/orchestrator/session-strategy.test.ts` | Updated expectations for restored hybrid session modes |

### Changed

- **Plugin Rename**: Renamed from `swarmtool-addons` to `opencode-addons`
  - Config file: `~/.config/opencode/swarmtool-addons.json` → `~/.config/opencode/opencode-addons.json`
  - Schema directory: `workspace/swarmtool-addons` → `workspace/opencode-addons`
  - Updated all code references and documentation

- **Skill-Based Agent Model Overrides**: Fixed configuration to use hierarchical names
  - Changed from flat names (`architect`) to hierarchical names (`chief-of-staff/architect`)
  - All 8 skill-based agents now properly receive model overrides
  - Updated config file to use correct agent paths

### Fixed

- **Model Override Not Applied**: Skill-based subagents now correctly use models from `opencode-addons.json`
  - Root cause: Config used flat names instead of hierarchical names
  - Solution: Updated all agent paths to `chief-of-staff/<agent-name>` format

### Files Changed

| File                                      | Change                                     |
| ----------------------------------------- | ------------------------------------------ |
| `~/.config/opencode/opencode-addons.json` | Renamed and updated agent names            |
| `schema/opencode-addons.schema.json`      | Renamed schema file, updated $id and title |
| `src/opencode/config/loader.ts`           | Updated getConfigPath()                    |
| `src/opencode/config/README.md`           | Updated documentation paths                |
| `src/opencode/config/types.ts`            | Updated comment                            |
| `src/opencode/config/loader.test.ts`      | Updated test assertion                     |
| `src/opencode/SPEC.md`                    | Updated reference                          |

### Configuration Update Example

**Before (incorrect):**

```json
{
  "models": {
    "architect": { "model": "opencode/minimax-m2.1-free" },
    "executor": { "model": "opencode/minimax-m2.1-free" }
  }
}
```

**After (correct):**

```json
{
  "models": {
    "chief-of-staff/architect": { "model": "opencode/minimax-m2.1-free" },
    "chief-of-staff/executor": { "model": "opencode/minimax-m2.1-free" }
  }
}
```

### Migration Notes

Users should update their config file:

1. Rename `~/.config/opencode/swarmtool-addons.json` to `~/.config/opencode/opencode-addons.json`
2. Update all agent names from flat to hierarchical format (e.g., `architect` → `chief-of-staff/architect`)
3. Restart OpenCode to apply changes

- **Structured Logging with Pino** (`src/utils/logger.ts`)
  - Created new logging module with module-scoped loggers
  - Added `createModuleLogger('ModuleName')` for consistent logging
  - Implemented structured JSON output with metadata
  - Supports log levels: info, warn, error, debug

- **Code Quality Review Documentation**
  - Comprehensive review of 609 source files (~97k lines)
  - Identified critical, high, and medium priority issues
  - Added 25 recommendations for improvements

### Changed

- **Replaced 100+ console statements** across 25 files
  - `src/orchestrator/ledger.ts` (20 statements)
  - `src/orchestrator/observer.ts` (24 statements)
  - `src/orchestrator/file-ledger/index.ts` (14 statements)
  - `src/memory-lane/memory-store.ts` (5 statements)
  - And 21 more files...

### Fixed

- **Security Issue**: Removed database path from logs (`src/memory-lane/memory-store.ts`)
- **Console Cleanup**: Removed all `console.log`, `console.error`, `console.warn` from source files
- **Linting**: Pass with no errors after logging refactor

### Technical Details

**Logger Module** (`src/utils/logger.ts`):

```typescript
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('Ledger');
log.info({ key: value }, 'Message');
log.error({ error }, 'Error message');
```

**Files Updated**:

| Module                | Files  | Statements Replaced |
| --------------------- | ------ | ------------------- |
| Orchestrator          | 8      | ~70                 |
| OpenCode Config       | 3      | ~10                 |
| Memory/Durable Stream | 2      | ~7                  |
| Hooks                 | 2      | ~10                 |
| Tools                 | 5      | ~15                 |
| **Total**             | **25** | **100+**            |

### Version Update

| Component       | Old Version | New Version                |
| --------------- | ----------- | -------------------------- |
| opencode-addons | 5.1.1       | 5.2.0                      |
| TECHNICAL.md    | 5.1.0       | 7.0.0 (Structured Logging) |

### Breaking Changes

- **None**: This is a backward-compatible enhancement. Logging changes have no impact on public APIs.

### Migration Notes

No migration required. All changes are internal implementation details.

### Fixed

- **Multi-turn dialogue continuation reliability**
  - Treat empty `## Active Dialogue` sections as `null` (prevents ghost dialogues)
  - Route replies only when `agent` + `command` are present, and auto-adopt session on mismatch
  - Bind `ledger_set_active_dialogue` / `ledger_update_active_dialogue` to the parent/root session by default

## [5.1.1] - 2026-01-02

### Summary

Memory Management Fixes for Long-Running Sessions. Addresses unbounded memory growth in event history, caches, and timer references.

### Fixed

- **Event History Unbounded Growth** (`src/durable-stream/orchestrator.ts`)
  - Added `maxEventHistory = 100000` limit
  - Oldest events are removed when limit reached
  - Estimated memory: 100-200 MB

- **Event Cache Unbounded Growth** (`src/durable-stream/store.ts`)
  - Added `maxCacheSize = 50000` limit
  - Oldest cache entries removed when limit reached
  - Estimated memory: 50-100 MB

- **Pending Captures Timer Leak** (`src/orchestrator/hooks/opencode-session-learning.ts`)
  - Added cleanup handler for `plugin.shutdown` and `session.end` events
  - All pending timers cleared on shutdown
  - Session state maps cleared on shutdown

- **Observer Recursive Loop Protection** (`src/orchestrator/observer.ts`)
  - Added try-catch in `scheduleNextCheck()` to prevent loop interruption
  - Added `isRunning` guard before stop() to prevent double cleanup
  - Unsubscribe functions set to undefined after cleanup

### Added

- **Graceful Shutdown** (`src/orchestrator/index.ts`)
  - New `shutdownAll()` function for comprehensive cleanup
  - Shuts down in order: TaskObserver → TaskRegistry → CheckpointManager → LearningExtractor → EventDrivenLedger → DurableStream → MemoryLaneStore

- **Memory Documentation** (`docs/MEMORY.md`)
  - Memory limits and estimates
  - Cleanup mechanisms
  - Configuration options
  - Troubleshooting guide

### Technical Details

**Memory Limits** (for 1GB memory systems):

| Component     | Limit          | Estimated Memory |
| ------------- | -------------- | ---------------- |
| Event History | 100,000 events | 100-200 MB       |
| Event Cache   | 50,000 events  | 50-100 MB        |

**Graceful Shutdown Order**:

```
shutdownAll()
  1. stopTaskObservation() - Task Observer
  2. resetTaskRegistry() - Task Registry
  3. shutdownCheckpointManager() - Checkpoint Manager
  4. shutdownLearningExtractor() - Learning Extractor
  5. shutdownEventDrivenLedger() - Event-Driven Ledger
  6. shutdownDurableStream() - Durable Stream
  7. resetMemoryLaneStore() - Memory Lane Store
```

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

| Version | Date       | Codename                     | Highlights                                 |
| ------- | ---------- | ---------------------------- | ------------------------------------------ |
| 5.1.1   | 2026-01-02 | Memory Management            | Fixed unbounded event history/cache growth |
| 6.0.0   | 2026-01-02 | File-Based Ledger            | Conductor-inspired, git-friendly epics     |
| 5.0.0   | 2026-01-02 | Governance-First             | Agent consolidation (16→8), HITL, polling  |
| 4.1.0   | 2025-12-XX | Physical Resource Management | Parallel execution, conflict detection     |
| 4.0.0   | 2025-12-XX | Skill-Based Architecture     | Subagent system, CoS orchestrator          |
