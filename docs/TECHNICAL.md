# Technical Documentation

This document is written for AI agents (Claude, etc.) who need to understand, extend, or fix this codebase. Read this first before making changes.

---

## Quick Reference

### Key Files to Read First

| Priority | File                                       | Purpose                             |
| -------- | ------------------------------------------ | ----------------------------------- |
| 1        | `AGENTS.md`                                | Architecture overview, agent roster |
| 2        | `docs/TECHNICAL.md`                        | This file - implementation details  |
| 3        | `src/orchestrator/file-ledger/index.ts`    | v6.0 core ledger class              |
| 4        | `src/orchestrator/chief-of-staff/SKILL.md` | Main orchestrator behavior          |

### Run Tests

```bash
# All tests
bun test

# Specific module
bun test src/orchestrator/file-ledger/
bun test src/orchestrator/progress.test.ts
bun test src/orchestrator/hitl.test.ts

# Type check
bunx tsc --noEmit
```

### Add a New Agent (Quick Steps)

1. Create `src/orchestrator/chief-of-staff/agents/<name>/SKILL.md`
2. Add to `ACTIVE_AGENTS` in `src/opencode/config/skill-loader.ts`
3. Update `AGENTS.md` roster table

---

## Architecture

```
+------------------------------------------------------------------+
|                        OpenCode Runtime                           |
+------------------------------------------------------------------+
         |                                    |
         V                                    V
+------------------+                 +-------------------+
|  opencode-addons |                 |  Chief-of-Staff   |
|     (Plugin)     |                 |   (Orchestrator)  |
+------------------+                 +-------------------+
         |                                    |
         |  +------------------+              |
         +->|  8 Subagents     |<-------------+
            |  (v5.0 roster)   |
            +------------------+
                     |
    +----------------+----------------+
    |                |                |
    V                V                V
+--------+    +-----------+    +------------+
|.opencode|   |  Durable  |    | Memory     |
| (v6.0)  |   |  Stream   |    | Lane       |
+--------+    +-----------+    +------------+
```

### Module Relationships

```
src/
+-- index.ts                 # Plugin entry point
|
+-- orchestrator/            # CORE: Governance engine
|   +-- file-ledger/         # v6.0 file-based state (NEW)
|   +-- ledger.ts            # v5.0 single-file ledger (DEPRECATED)
|   +-- progress.ts          # User notifications
|   +-- hitl.ts              # Human-in-the-loop utilities
|   +-- session-strategy.ts  # inline/child session modes
|   +-- chief-of-staff/      # Main orchestrator + 8 subagents
|
+-- durable-stream/          # Event-sourced persistence
|   +-- core.ts              # Event log, checkpoints
|   +-- types.ts             # Event type definitions
|
+-- memory-lane/             # Vector DB for learnings
|   +-- memory-store.ts      # Semantic search
|
+-- opencode/                # Runtime integration
    +-- config/skill-loader.ts  # Agent loading
    +-- command/*.md         # Slash commands (/sdd, /ama)
```

### Data Flow

```
User Request
     |
     V
Chief-of-Staff (reads .opencode/LEDGER.md)
     |
     +---> interviewer (CLARIFY) ---> spec.md
     |
     +---> architect (PLAN) ---> plan.md
     |
     +---> executor (EXECUTE) ---> code changes
     |
     +---> reviewer (REVIEW) ---> approval
     |
     V
Archive to .opencode/archive/
Extract learnings to .opencode/learnings/
```

---

## v6.0 Changes (2026-01-02)

### Breaking Change: File-Based Ledger

**Before (v5.0)**: Single `.opencode/LEDGER.md` file containing everything

**After (v6.0)**: Hybrid structure with file-based epics

```
.opencode/
+-- LEDGER.md           # Lightweight index (pointers only)
+-- context/
|   +-- product.md      # Project description
|   +-- tech-stack.md   # Language, frameworks
|   +-- workflow.md     # TDD rules, quality gates
+-- epics/
|   +-- <epic_id>/
|       +-- spec.md         # Requirements
|       +-- plan.md         # Implementation plan
|       +-- log.md          # Execution log
|       +-- metadata.json   # Status, timestamps
+-- learnings/
|   +-- patterns.md     # What works
|   +-- decisions.md    # Key choices
|   +-- preferences.md  # User preferences
+-- archive/
    +-- <epic_id>/      # Completed epics (git history)
```

### Why This Change

| Problem with v5.0            | Solution in v6.0          |
| ---------------------------- | ------------------------- |
| Single file = hard to review | Each epic is a directory  |
| Git history unclear          | Full git history per epic |
| Learnings lost on archive    | Persistent in learnings/  |
| Team conflicts on one file   | Isolated epic directories |

### Agent Consolidation (16 -> 8)

| v6.0 Agent  | Merged From                           | Role                          |
| ----------- | ------------------------------------- | ----------------------------- |
| interviewer | interviewer + spec-writer             | Clarification + Specification |
| architect   | oracle + planner                      | Decomposition + Planning      |
| reviewer    | spec-reviewer + code-quality-reviewer | Two-phase review              |
| executor    | (unchanged)                           | TDD implementation            |
| validator   | (unchanged)                           | Quality gate                  |
| debugger    | (unchanged)                           | Root cause analysis           |
| explore     | (unchanged)                           | Codebase search               |
| librarian   | (unchanged)                           | External docs                 |

### New Modules Added

| Module                | Purpose                           | Tests    |
| --------------------- | --------------------------------- | -------- |
| `file-ledger/`        | v6.0 file-based state             | 22 tests |
| `progress.ts`         | User notifications                | 11 tests |
| `hitl.ts`             | Poll formatting, response parsing | 24 tests |
| `session-strategy.ts` | inline/child session modes        | yes      |

---

## Module Reference

### file-ledger/ (v6.0 Core)

**Location**: `src/orchestrator/file-ledger/`

**Files**:

- `types.ts` - Type definitions (LedgerIndex, EpicMetadata, etc.)
- `templates.ts` - Markdown templates for all files
- `index.ts` - FileBasedLedger class (main logic)
- `tools.ts` - Tools for agents to use

**Key Class**: `FileBasedLedger`

```typescript
const ledger = getFileLedger();

// Initialize
await ledger.initialize(); // Creates .opencode/ structure

// Epic lifecycle
const epicId = await ledger.createEpic('Title', 'Request');
await ledger.writeSpec(epicId, content);
await ledger.writePlan(epicId, content);
await ledger.updateTaskInPlan(epicId, '1.1', 'completed');
await ledger.archiveEpic('SUCCEEDED');

// Learnings (persistent)
await ledger.addLearning('pattern', 'Use bcrypt for passwords');
await ledger.addLearning('decision', 'Chose PostgreSQL');

// Status
const status = await ledger.getStatus();
```

### progress.ts

**Purpose**: Emit progress events for user visibility

**Key Functions**:

```typescript
await emitProgress(agent, phase, message, { percent: 50 });
await emitPhaseStart(agent, phase, description);
await emitPhaseComplete(agent, phase, result);
await emitUserActionNeeded(agent, action, message);
```

**Phase Icons**: Each phase has an emoji icon for UI display (see `getPhaseIcon`)

### hitl.ts

**Purpose**: Human-in-the-loop utilities

**Key Functions**:

```typescript
// Format a poll with numbered options
const pollText = formatPoll({
  title: 'Database Selection',
  options: [
    { id: 'postgres', label: 'PostgreSQL' },
    { id: 'sqlite', label: 'SQLite' },
  ],
  allowFreeText: true,
});

// Parse user response
const response = parseUserResponse('1', options);
// { type: 'option', option_id: 'postgres', value: 'PostgreSQL' }

// Request confirmation
const approved = await requestConfirmation(sessionId, 'Approve Spec?', summary);
```

### session-strategy.ts

**Purpose**: Determine session mode for each agent

**Session Modes**:

- `inline`: User sees agent thinking (interviewer, architect, reviewer)
- `child`: Isolated execution (executor, librarian)

```typescript
const mode = getSessionMode('executor'); // 'child'
const mode = getSessionMode('architect'); // 'inline'
```

### chief-of-staff/

**Location**: `src/orchestrator/chief-of-staff/`

**SKILL.md**: Main orchestrator instructions (read this to understand workflow)

**Agents**: Each in `agents/<name>/SKILL.md`

---

## Extending the System

### Adding a New Agent

1. **Create SKILL.md**:

```bash
mkdir -p src/orchestrator/chief-of-staff/agents/myagent
```

```markdown
# src/orchestrator/chief-of-staff/agents/myagent/SKILL.md

---

name: myagent
version: 1.0.0

---

## Role

[What this agent does]

## Instructions

[How the agent should behave]

## Tools Available

[List tools the agent can use]

## Output Format

[Expected output structure]
```

2. **Register in skill-loader.ts**:

```typescript
// src/opencode/config/skill-loader.ts
const ACTIVE_AGENTS = [
  // ... existing agents
  'myagent', // Add here
];
```

3. **Update AGENTS.md** roster table

4. **Add session mode** (if needed):

```typescript
// src/orchestrator/session-strategy.ts
const AGENT_SESSION_MODES: Record<string, SessionMode> = {
  // ... existing
  myagent: 'inline', // or 'child'
};
```

### Adding a New Tool

1. **Create tool function**:

```typescript
// src/orchestrator/tools/my-tools.ts
import { tool } from '@opencode-ai/plugin';

export const my_tool = tool({
  description: 'What this tool does',
  args: {
    param1: tool.schema.string().describe('Parameter description'),
  },
  async execute(args) {
    // Implementation
    return JSON.stringify({ success: true });
  },
});
```

2. **Export in index.ts**:

```typescript
// src/orchestrator/index.ts
export * from './tools/my-tools';
```

3. **Register in plugin** (if needed):

```typescript
// src/index.ts
import { my_tool } from './orchestrator';
// Add to tool registration
```

### Adding a New Learning Type

1. **Update types.ts**:

```typescript
// src/orchestrator/file-ledger/types.ts
export type LearningType = 'pattern' | 'antiPattern' | 'decision' | 'preference' | 'mytype';
```

2. **Update templates.ts** (add template if new file needed)

3. **Update index.ts** `addLearning` method

### Modifying Ledger Structure

**CAUTION**: Changes to file structure are breaking changes.

1. Update `types.ts` with new types
2. Update `templates.ts` with new templates
3. Update `index.ts` FileBasedLedger class
4. Update tests
5. Document in CHANGELOG.md

---

## Known Issues & Technical Debt

### Test Failures (Pre-existing)

| File                   | Issue                                                                | Priority |
| ---------------------- | -------------------------------------------------------------------- | -------- |
| `ledger.test.ts`       | `updateTaskStatus` tests failing - function doesn't mutate correctly | Medium   |
| `ledger-hooks.test.ts` | Uses `vi.mock` (vitest) but we use bun:test                          | Low      |
| `src/evals/*.ts`       | TypeScript errors in eval files                                      | Low      |

### Technical Debt

| Item                        | Description                                                       | Effort |
| --------------------------- | ----------------------------------------------------------------- | ------ |
| Migrate v5.0 ledger to v6.0 | `ledger.ts` should be deprecated, tools should use `file-ledger/` | High   |
| Unify tool exports          | `ledgerTools` vs `fileLedgerTools` - should be one                | Medium |
| Remove deprecated agents    | Files still exist in `agents/` for removed agents                 | Low    |

### Improvement Opportunities

| Area                | Suggestion                                  |
| ------------------- | ------------------------------------------- |
| Context loading     | Auto-read context files on session start    |
| Epic templates      | Allow custom templates per project          |
| Parallel execution  | Better conflict detection in file-ledger    |
| Learning extraction | Auto-extract learnings from completed tasks |

---

## Design Decisions

### Why Hybrid File Structure (v6.0)?

**Decision**: Use LEDGER.md as lightweight index + file-based epics

**Alternatives Considered**:

1. Single LEDGER.md (v5.0) - Too hard to review
2. Pure file-based (Conductor-style) - Too many files to load
3. Database storage - Loses git history benefits

**Rationale**: Hybrid gives git-friendly history while keeping quick access via index.

### Why 8 Agents Instead of 16?

**Decision**: Consolidate agents with overlapping responsibilities

**Alternatives Considered**:

1. Keep all 16 - Too much context, harder to coordinate
2. Reduce to 4-5 - Lose specialization benefits

**Rationale**: 8 agents balances specialization vs coordination overhead.

### Why Conductor-Inspired Pattern?

**Decision**: Adopt spec.md, plan.md, log.md structure from Conductor

**Rationale**:

- Proven pattern (1000+ stars)
- Clear separation of concerns
- Each file has single responsibility
- Easy to review in PRs

### Why Strategic Polling over Open Questions?

**Decision**: Use numbered options + free text instead of open-ended questions

**Rationale**:

- Faster user decisions
- Structured responses for parsing
- Still allows free text for edge cases
- Reduces back-and-forth

---

## Conventions

### Naming

- Agent names: lowercase, single word (`executor`, not `code-executor`)
- Tool names: snake_case (`ledger_status`, not `ledgerStatus`)
- File names: kebab-case for directories, camelCase for TS files

### Commit Messages

Follow conventional commits:

```
feat(scope): description
fix(scope): description
refactor(scope): description

# Breaking changes
feat(scope)!: description

BREAKING CHANGE: explanation
```

### Test Files

- Co-locate with source: `foo.ts` -> `foo.test.ts`
- Use bun:test, not vitest
- Group with `describe`, use clear `it` descriptions

---

## Debugging Tips

### Agent Not Loading

1. Check `ACTIVE_AGENTS` in `skill-loader.ts`
2. Verify SKILL.md exists and has correct frontmatter
3. Check for syntax errors in SKILL.md

### Ledger Not Persisting

1. Check `.opencode/` directory exists
2. Verify write permissions
3. Check for lock file issues (uses `proper-lockfile`)

### Tests Failing

1. Run single test: `bun test path/to/file.test.ts`
2. Check for mock issues (bun:test vs vitest syntax)
3. Verify test isolation (each test should clean up)

### Type Errors

1. Run `bunx tsc --noEmit`
2. Check import paths (use `node:crypto` not `crypto`)
3. Verify `@opencode-ai/plugin` types are available

---

## Session Handoff Template

When ending a session, create handoff in LEDGER.md:

```markdown
## Handoff

**Reason**: context_limit
**Resume**: `/sdd continue <task>`
**Summary**: Completed X, working on Y, next step is Z
```

Or use tool:

```typescript
await ledger.createHandoff('session_break', '/sdd continue auth', 'Summary here');
```

---

## Related Documentation

| Document                                               | Purpose                    |
| ------------------------------------------------------ | -------------------------- |
| `AGENTS.md`                                            | Architecture, agent roster |
| `docs/WORKFLOW-GUIDE.md`                               | User-facing workflow guide |
| `CHANGELOG.md`                                         | Version history            |
| `src/orchestrator/chief-of-staff/SKILL.md`             | Orchestrator behavior      |
| `src/orchestrator/chief-of-staff/agents/DEPRECATED.md` | Migration guide            |

---

_Last Updated: 2026-01-02_
_Version: 6.0.0_
