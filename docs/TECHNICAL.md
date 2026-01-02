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

## v5.0 Changes - Governance-First Orchestration (2026-01-02)

### Breaking Change: Agent Consolidation (16 → 8)

**Before (v4.x)**: 16 specialized agents with narrow responsibilities

**After (v5.0)**: 8 consolidated agents with broader, well-defined roles

| v5.0 Agent  | Merged From                           | Session Mode | Role                          |
| ----------- | ------------------------------------- | ------------ | ----------------------------- |
| interviewer | interviewer + spec-writer             | inline       | Clarification + Specification |
| architect   | oracle + planner                      | inline       | Decomposition + Planning      |
| reviewer    | spec-reviewer + code-quality-reviewer | inline       | Two-phase review              |
| executor    | (unchanged)                           | child        | TDD implementation            |
| validator   | (unchanged)                           | inline       | Quality gate                  |
| debugger    | (unchanged)                           | inline       | Root cause analysis           |
| explore     | (unchanged)                           | inline       | Codebase search               |
| librarian   | (unchanged)                           | child        | External docs                 |

### Why This Change

| Problem with 16 Agents       | Solution in v5.0             |
| ---------------------------- | ---------------------------- |
| Too much context overhead    | 8 agents = less coordination |
| Overlapping responsibilities | Clear role boundaries        |
| Complex orchestration        | Simpler workflow phases      |
| Slow spawning                | Fewer agents to initialize   |

### New Modules Added (v5.0)

| Module                | Purpose                           | Tests    |
| --------------------- | --------------------------------- | -------- |
| `hitl.ts`             | Poll formatting, response parsing | 24 tests |
| `session-strategy.ts` | inline/child session modes        | yes      |

### hitl.ts

**Purpose**: Human-in-the-loop utilities with Strategic Polling

**Key Functions**:

```typescript
import { formatPoll, parseUserResponse, requestConfirmation } from './hitl';

// Format a poll with numbered options
const pollText = formatPoll({
  title: 'Database Selection',
  context: 'No directive found for database choice.',
  options: [
    { id: 'postgres', label: 'PostgreSQL', description: 'Scalable, pgvector support' },
    { id: 'sqlite', label: 'SQLite', description: 'Simple, file-based' },
  ],
  allowFreeText: true,
});

// Output:
// POLL: Database Selection
// No directive found for database choice.
//
// (1) PostgreSQL - Scalable, pgvector support
// (2) SQLite - Simple, file-based
// (3) Or describe your preference
//
// Reply with number or your choice.

// Parse user response
const response = parseUserResponse('1', options);
// { type: 'option', option_id: 'postgres', value: 'PostgreSQL' }

const response = parseUserResponse('MongoDB', options);
// { type: 'freetext', value: 'MongoDB' }

// Request confirmation
const approved = await requestConfirmation(sessionId, 'Approve Spec?', specSummary);
```

### session-strategy.ts

**Purpose**: Determine session mode for each agent

**Session Modes**:

- `inline`: User sees agent thinking (interviewer, architect, reviewer, validator, debugger, explore)
- `child`: Isolated execution, parallel-safe (executor, librarian)

```typescript
import { getSessionMode, getAgentConfig } from './session-strategy';

const mode = getSessionMode('executor'); // 'child'
const mode = getSessionMode('architect'); // 'inline'

// Get full config
const config = getAgentConfig('executor');
// { mode: 'child', timeout_ms: 600000, max_retries: 2 }
```

#### Deferred Inline Prompts (Deadlock Avoidance)

Inline agents run in the **parent session** for visibility, but tools must **never** call `session.prompt()` synchronously on the *same* session (can deadlock). Instead:

1. The tool returns `status: "HANDOFF_INTENT"` (with Durable Stream intent/message IDs for correlation)
2. The plugin schedules `session.promptAsync()` from the outer hook loop (`tool.execute.after`)
3. If the session is busy, prompts are queued in `PromptBuffer` and flushed on `session.idle` (bounded retries)

**Credit**: Inspired by the **Ralph Loop** idea—drive re-entrant work from an outer loop/event hook rather than making nested SDK calls.

### Strategic Polling Pattern

**Before (v4.x)**: Open-ended questions

```
What database would you like to use?
```

**After (v5.0)**: Numbered options with context

```
POLL: Database Selection
Based on your project requirements (API backend, need for vector search):

(1) PostgreSQL - Scalable, pgvector support
(2) SQLite - Simple, file-based
(3) Or describe your preference

Reply '1', '2', or your choice.
```

**Benefits**:

- Faster user decisions (just type "1")
- Structured responses for parsing
- Context provided for informed choice
- Free text still allowed for edge cases

### SDD Workflow (v5.0)

```
PHASE 0: LOAD       → Read LEDGER, check for active Epic
    │
    ▼
PHASE 1: CLARIFY    → interviewer (inline, HITL)
    │                 Output: Approved Specification
    ▼
PHASE 2: PLAN       → architect (inline, HITL)
    │                 Output: Epic + Tasks + Blueprint
    ▼
PHASE 3: EXECUTE    → executor(s) (child, parallel/seq)
    │                 Output: Implementation
    ▼
PHASE 4: REVIEW     → reviewer (inline)
    │                 Output: Approved or Needs Changes
    ▼
PHASE 5: COMPLETE   → Archive Epic, Extract Learnings
```

### vNext Changes - Deferred Inline Prompts & Durable Stream Telemetry (2026-01-02)

- **Hybrid sessions restored**: Planning agents run `inline` again (visible to users) while execution agents remain `child`.
- **Deadlock fix**: Inline prompts are now **deferred** via `HANDOFF_INTENT` + `tool.execute.after` (no re-entrant `session.prompt()` calls).
- **Busy-session resilience**: Deferred prompts are buffered in `PromptBuffer` and flushed on `session.idle` (bounded retries).
- **Durable Stream as runtime source-of-truth**: Execution traces (agent/text/reasoning deltas + snapshots) are persisted as `execution.*` events.
- **Ledger as projection**: `LedgerProjector` projects `ledger.learning.extracted` into `.opencode/LEDGER.md` on safe triggers.
- **ActivityLogger de-emphasized**: Runtime history tooling (`ledger_get_history`) reads from Durable Stream instead of `.opencode/activity.jsonl`.
- **Memory Lane embeddings**: Improved LM Studio embeddings reliability by auto-starting the server and loading an embeddings model (using the API-provided model identifier when available).

**Credit**: The deferred inline prompt design follows the **Ralph Loop** idea (outer loop drives work; avoid nested SDK calls).

---

## v6.0 Changes - File-Based Ledger (2026-01-02)

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

### New Module: file-ledger/ (v6.0 Core)

**Location**: `src/orchestrator/file-ledger/`

**Files**:

- `types.ts` - Type definitions (LedgerIndex, EpicMetadata, etc.)
- `templates.ts` - Markdown templates for all files
- `index.ts` - FileBasedLedger class (main logic)
- `tools.ts` - Tools for agents to use

**Key Class**: `FileBasedLedger`

```typescript
import { getFileLedger } from './orchestrator/file-ledger';

const ledger = getFileLedger();

// Initialize
await ledger.initialize(); // Creates .opencode/ structure

// Epic lifecycle
const epicId = await ledger.createEpic('Title', 'Request');
await ledger.writeSpec(epicId, content);
await ledger.writePlan(epicId, content);
await ledger.appendLog(epicId, 'Started task 1.1');
await ledger.updateTaskInPlan(epicId, '1.1', 'completed');
await ledger.archiveEpic('SUCCEEDED');

// Learnings (persistent - not lost on archive)
await ledger.addLearning('pattern', 'Use bcrypt for passwords');
await ledger.addLearning('decision', 'Chose PostgreSQL for scalability');
await ledger.addLearning('preference', 'User prefers tabs over spaces');

// Status
const status = await ledger.getStatus();
// { initialized: true, hasActiveEpic: true, activeEpicId: 'epic_abc123', ... }
```

### Conductor-Inspired Pattern

**Decision**: Adopt spec.md, plan.md, log.md structure from Conductor

**Rationale**:

- Proven pattern (1000+ stars on GitHub)
- Clear separation of concerns
- Each file has single responsibility
- Easy to review in PRs
- Git diff shows exactly what changed

---

## v5.1 Changes - Multi-Turn Dialogue (2026-01-02)

### Summary

Enables **natural multi-turn Human-in-the-Loop interactions** via ROOT-level continuation. Dialogue state is persisted in LEDGER, allowing agents to continue conversations across turns without complex session management.

### Before vs After

**Before (v5.0)**: One-shot polls, no continuation

```
User: /ama How should I structure my API?
Bot: POLL: API Architecture... (options)
User: 2
Bot: [Ends - no way to continue]
```

**After (v5.1)**: Natural multi-turn dialogue

```
User: /ama How should I structure my API?
Bot: POLL: API Architecture... (options)
User: 2
Bot: Great choice! POLL: Data Layer... (next question)
User: Drizzle
Bot: Specification confirmed!
```

### New Components

#### Active Dialogue Tracking (ledger.ts)

**New Interface**:

```typescript
export interface ActiveDialogue {
  agent: string; // 'interviewer', 'architect'
  command: string; // '/ama', '/sdd'
  turn: number; // Current turn
  status: 'needs_input' | 'needs_approval' | 'approved';
  sessionId?: string;
  accumulatedDirection: {
    goals: string[];
    constraints: string[];
    preferences: string[];
    decisions: string[];
  };
  pendingQuestions?: string[];
  lastPollMessage?: string;
}
```

**New Functions**:

```typescript
// Start tracking a dialogue
setActiveDialogue(ledger, agent, command, options?);

// Update with user response
updateActiveDialogue(ledger, {
  turn: 2,
  status: 'needs_input',
  decisions: ['Database: PostgreSQL'],
  pendingQuestions: ['Next question?']
});

// Get current state
getActiveDialogue(ledger); // Returns ActiveDialogue | null

// Clear when done
clearActiveDialogue(ledger);
```

#### New Tools

| Tool                            | Description                         |
| ------------------------------- | ----------------------------------- |
| `ledger_set_active_dialogue`    | Start tracking an active dialogue   |
| `ledger_update_active_dialogue` | Update dialogue with user responses |
| `ledger_clear_active_dialogue`  | Clear when completed                |
| `ledger_get_active_dialogue`    | Get current state                   |

### Multi-Turn Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MULTI-TURN DIALOGUE v5.1                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TURN 1: User starts command                                 │
│      ├─ ROOT checks LEDGER.activeDialogue (null)            │
│      ├─ ROOT calls skill_agent(chief-of-staff)              │
│      ├─ Agent generates poll                                 │
│      ├─ Returns: dialogue_state.status = 'needs_input'      │
│      └─ ROOT saves to LEDGER.activeDialogue                 │
│                                                              │
│  TURN 2: User responds                                       │
│      ├─ ROOT checks LEDGER.activeDialogue (exists!)         │
│      ├─ ROOT calls skill_agent with continuation context    │
│      ├─ Agent processes response, logs decisions            │
│      ├─ If more questions: returns 'needs_input'            │
│      └─ If approved: returns 'approved'                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Updated Commands

#### AMA Command (v5.1)

**Flow**:

1. Check LEDGER for existing active dialogue
2. If none: Start new, call Chief-of-Staff
3. If exists: Continue from accumulated context
4. Display poll, wait for user response

```typescript
// Step 1: Check for active dialogue
const ledger = await ledger_status({});
if (ledger.activeDialogue && ledger.activeDialogue.command === '/ama') {
  goto Continue;
}

// Step 2: Start new
await ledger_set_active_dialogue({ agent: 'chief-of-staff', command: '/ama' });

// Step 3: Handle result
if (result.dialogue_state.status === 'needs_input') {
  await ledger_update_active_dialogue({
    turn: result.dialogue_state.turn,
    decisions: result.dialogue_state.accumulated_direction?.decisions,
  });
}
```

#### SDD Command (v5.1)

**Multi-turn phases**:

- CLARIFY: Poll for specification approval (multi-turn)
- PLAN: Poll for plan approval (multi-turn)
- EXECUTE: No HITL (clear dialogue)
- REVIEW: Automated
- COMPLETE: Clear dialogue

### LEDGER Structure

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

### Benefits

| Before (v5.0)    | After (v5.1)          |
| ---------------- | --------------------- |
| One poll only    | Unlimited polls       |
| Abrupt end       | Natural continuation  |
| Lost context     | Persisted in LEDGER   |
| User must repeat | Accumulated direction |

### Updated Agents

#### Chief-of-Staff SKILL.md (v5.1.0)

- Added multi-turn flow diagram
- Added resume-from-LEDGER logic for CLARIFY
- Added resume-from-LEDGER logic for PLAN
- New tool access: `ledger_set_active_dialogue`, `ledger_update_active_dialogue`, `ledger_clear_active_dialogue`

#### Interviewer SKILL.md (v5.1.0)

- Added tool access for active dialogue functions
- Continues to return `dialogue_state` for ROOT agent parsing

---

## Module Reference

### file-ledger/ (v6.0 Core)

**Location**: `src/orchestrator/file-ledger/`

**Files**:

- `types.ts` - Type definitions (LedgerIndex, EpicMetadata, etc.)
- `templates.ts` - Markdown templates for all files
- `index.ts` - FileBasedLedger class (main logic, 22 tests)
- `tools.ts` - Tools for agents to use

See v6.0 Changes section above for API examples.

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

## v7.0 Changes - Structured Logging with Pino (2026-01-02)

### Summary

Replaced all `console.log`, `console.error`, and `console.warn` statements with structured logging using [Pino](https://getpino.io/). This enables better log filtering, structured output, and improved debugging capabilities.

### New Module: utils/logger.ts

**Location**: `src/utils/logger.ts`

**Features**:

- Pino-based structured JSON logging
- Module-scoped loggers with `createModuleLogger('ModuleName')`
- Log levels: info, warn, error, debug
- Test mode detection (silences logs during tests)
- Consistent formatting with timestamp and service name

**Usage**:

```typescript
import { createModuleLogger, logInfo, logWarn, logError, logDebug } from '../utils/logger';

// Create module-specific logger
const log = createModuleLogger('Ledger');

// Structured logging with data
log.info({ epicId, title }, 'Created epic');
log.warn({ path }, 'File not found');
log.error({ error }, 'Failed to save');

// Convenience functions
logInfo('Message');
logWarn('Warning message');
logError('Error message', error);
logDebug('Debug info', { key: value });
```

### Files Updated

| Category          | Files Updated                                              | Console Statements Replaced |
| ----------------- | ---------------------------------------------------------- | --------------------------- |
| Core Orchestrator | `ledger.ts`, `observer.ts`, `index.ts`, `task-registry.ts` | ~60                         |
| File Ledger       | `file-ledger/index.ts`                                     | 14                          |
| Hooks             | `ledger-hooks.ts`, `opencode-session-learning.ts`          | ~15                         |
| Memory & Stream   | `memory-store.ts`, `durable-stream/orchestrator.ts`        | ~7                          |
| Config & Utils    | `skill-loader.ts`, `loader.ts`, `activity-log.ts`          | ~15                         |
| **Total**         | **25 files**                                               | **100+**                    |

### Benefits

| Before                                            | After                                  |
| ------------------------------------------------- | -------------------------------------- |
| `console.log('[Ledger] Created epic: ' + epicId)` | `log.info({ epicId }, 'Created epic')` |
| Plain text output                                 | Structured JSON with metadata          |
| No log levels                                     | info/warn/error/debug levels           |
| Hard to filter                                    | Easy filtering by level/module         |
| Secrets in logs                                   | Removed sensitive data exposure        |

### Log Output Example

```json
{"level":"info","time":"2026-01-02T10:30:00.000Z","service":"opencode-addons","module":"Ledger","msg":"Created epic","epicId":"abc123","title":"Review code"}
{"level":"warn","time":"2026-01-02T10:30:01.000Z","service":"opencode-addons","module":"SkillLoader","msg":"Agents directory not found","agentsDir":"/path/to/agents"}
{"level":"error","time":"2026-01-02T10:30:02.000Z","service":"opencode-addons","module":"DurableStream","msg":"Failed to persist event","error":{"message":"Permission denied"}}
```

### Environment Variables

| Variable    | Default | Description                       |
| ----------- | ------- | --------------------------------- |
| `LOG_LEVEL` | `info`  | Minimum log level to output       |
| `NODE_ENV`  | -       | Set to `test` to silence all logs |

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
_Version: 5.1.0 (Multi-Turn Dialogue) + 6.0.0 (File-Based Ledger)_
