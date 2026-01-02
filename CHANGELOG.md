# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0] - 2026-01-02

### Added

- **File-Based Ledger (v6.0)**: New hybrid structure with `.opencode/` directory
  - `LEDGER.md` as lightweight index (pointers only)
  - `context/` for project context (product.md, tech-stack.md, workflow.md)
  - `epics/<id>/` for file-based epics (spec.md, plan.md, log.md, metadata.json)
  - `learnings/` for persistent learnings (patterns.md, decisions.md, preferences.md)
  - `archive/` for completed epics with full git history

- **New Modules**:
  - `src/orchestrator/file-ledger/` - v6.0 file-based state management
  - `src/orchestrator/progress.ts` - Progress notification system
  - `src/orchestrator/hitl.ts` - Human-in-the-loop utilities
  - `src/orchestrator/session-strategy.ts` - Hybrid session modes (inline/child)

- **New Agents**:
  - `architect` - Merged from oracle + planner
  - `reviewer` - Merged from spec-reviewer + code-quality-reviewer

- **New Documentation**:
  - `docs/TECHNICAL.md` - Technical documentation for AI agents
  - `docs/WORKFLOW-GUIDE.md` - User-facing workflow guide
  - `CHANGELOG.md` - This file

- **New Tests**: 57 new tests
  - `file-ledger/index.test.ts` - 22 tests
  - `hitl.test.ts` - 24 tests
  - `progress.test.ts` - 11 tests

### Changed

- **Agent Consolidation**: Reduced from 16 agents to 8 agents
  - `interviewer` now includes spec-writer functionality
  - `architect` replaces oracle and planner
  - `reviewer` replaces spec-reviewer and code-quality-reviewer

- **Session Strategy**: Hybrid session modes
  - `inline` for planning agents (interviewer, architect, reviewer, validator, debugger, explore)
  - `child` for execution agents (executor, librarian)

- **SDD Workflow**: Conductor-inspired pattern
  - Context -> Spec -> Plan -> Execute -> Review -> Complete
  - Each phase has mandatory user checkpoint

- **Strategic Polling**: Numbered options + free text
  - Replaces open-ended questions with structured polls
  - Faster user decisions, structured responses

### Deprecated

- **v5.0 Ledger**: `src/orchestrator/ledger.ts` is deprecated
  - Use `src/orchestrator/file-ledger/` instead
  - Migration: Run `ledger_init` to create new structure

- **Removed Agents**:
  - `spec-writer` -> merged into `interviewer`
  - `oracle` -> merged into `architect`
  - `planner` -> merged into `architect`
  - `spec-reviewer` -> merged into `reviewer`
  - `code-quality-reviewer` -> merged into `reviewer`
  - `frontend-ui-ux-engineer` -> use `executor`
  - `workflow-architect` -> absorbed by CoS
  - `context-loader` -> inline in CoS
  - `memory-catcher` -> event-driven hooks

### Fixed

- Progress notifications now visible to users during agent orchestration
- HITL polling uses numbered options for faster user decisions

### Breaking Changes

- **File Structure**: `.opencode/` directory structure changed completely
  - Old: Single `LEDGER.md` file with all content
  - New: File-based structure with separate directories for context, epics, learnings

- **Agent Names**: Some agents renamed/merged
  - Update any code referencing old agent names

- **Tool Names**: New file-based ledger tools
  - Old: `ledgerTools` from `ledger-tools.ts`
  - New: `fileLedgerTools` from `file-ledger/tools.ts`

---

## [5.0.0] - 2025-12-XX

### Added

- Governance-First Orchestration
- LEDGER.md single source of truth
- Durable Stream event-sourced persistence
- Checkpoint system for human approval
- 16-agent roster with specialized roles

### Changed

- Skill-based subagent architecture
- Chief-of-Staff as main orchestrator

---

## [4.1.0] - 2025-XX-XX

### Added

- Parallel execution tracking
- File conflict detection
- Heartbeat protocol for long-running tasks

### Fixed

- Observer cleanup race condition
- Task registry memory leaks

---

## Migration Guide: v5.0 -> v6.0

### Step 1: Initialize New Structure

```bash
# The agent will create .opencode/ structure
/sdd init
```

Or programmatically:

```typescript
import { getFileLedger } from './orchestrator/file-ledger';
await getFileLedger().initialize();
```

### Step 2: Migrate Existing LEDGER.md

If you have an existing LEDGER.md:

1. Copy learnings to `.opencode/learnings/`
2. Active epic can be recreated with new structure
3. Archive can be migrated manually if needed

### Step 3: Update Agent References

| Old Agent               | New Agent     |
| ----------------------- | ------------- |
| `spec-writer`           | `interviewer` |
| `oracle`                | `architect`   |
| `planner`               | `architect`   |
| `spec-reviewer`         | `reviewer`    |
| `code-quality-reviewer` | `reviewer`    |

### Step 4: Update Tool Imports

```typescript
// Old
import { ledgerTools } from './orchestrator/tools/ledger-tools';

// New
import { fileLedgerTools } from './orchestrator/file-ledger/tools';
```

---

## Version History

| Version | Date       | Highlights                             |
| ------- | ---------- | -------------------------------------- |
| 6.0.0   | 2026-01-02 | File-based ledger, agent consolidation |
| 5.0.0   | 2025-12-XX | Governance-first, LEDGER.md            |
| 4.1.0   | 2025-XX-XX | Parallel execution, conflict detection |
