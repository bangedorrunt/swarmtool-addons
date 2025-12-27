# Memory Lane System Gap Analysis

**Date:** 2025-12-27
**Epic ID:** swarmtool-addons-gfoxls-mjnz24ayd86

---

## Executive Summary

This document synthesizes findings from three comprehensive analysis subtasks examining integration gaps between Memory Lane (swarmtool-addons) and the swarm-tools plugin's cell/bead tracking system. The analysis reveals three critical issues: database path mismatches creating isolated database instances, migration logic gaps that fail to create required hive tables, and schema design differences reflecting complementary (not competing) coordination and knowledge retention goals. These gaps manifest as "could not connect to swarm.db" errors and "no such table: cells" failures for users attempting to use Memory Lane features.

## Problem Statement

Users and developers experience database connection errors and missing table errors when attempting to use Memory Lane features alongside the swarm-tools plugin. Common error messages include:

- **"Could not connect to swarm.db"** - Silent failures when querying hive tables
- **"no such table: cells"** - Runtime errors when Memory Lane tools attempt to access cells view
- **"hive\* tables not found"** - Missing hive-specific database structures

These errors prevent Memory Lane from functioning as intended, blocking knowledge retention and semantic search capabilities that depend on proper integration with swarm-tools' coordination infrastructure.

---

## Root Causes

### 1. Database Path Mismatch

The plugin and addon resolve database paths using different context variables, creating separate database instances:

- **Plugin** uses `input.directory` from OpenCode context → resolves to swarm-tools directory
- **Addon** uses `process.cwd()` → resolves to swarmtool-addons directory

This separation causes the addon to create its own isolated database in the wrong location, missing all tables created by swarm-mail.

### 2. Migration Logic Gap

The `ensureSchema()` function only migrates the `memories` table, leaving hive tables (`cells`, `beads`, `cellEvents`) uncreated. The function name suggests comprehensive schema migration but actually handles only Memory Lane's memory tables. Hive tables are managed by swarm-mail's v7-v8 migrations, but Memory Lane has no coordination or verification that these migrations have run.

### 3. Initialization Sequence Gap

The initialization flow (`getSwarmMailLibSQL()` → `ensureSchema()` → `createMemoryAdapter()`) assumes hive tables exist without verification. No fallback or error handling exists for missing hive tables, causing silent failures when tools query them.

---

## Analysis Findings

### 1. Schema Comparison

#### Missing Columns Comparison

| Column        | Memory Lane (memories) | Plugin (cells) | Impact                                 |
| ------------- | ---------------------- | -------------- | -------------------------------------- |
| valid_from    | ✅ TEXT                | ❌ Missing     | Temporal validity tracking unavailable |
| valid_until   | ✅ TEXT                | ❌ Missing     | Cannot express memory expiration       |
| superseded_by | ✅ TEXT                | ❌ Missing     | No memory replacement tracking         |
| auto_tags     | ✅ TEXT                | ❌ Missing     | No auto-classification support         |
| keywords      | ✅ TEXT                | ❌ Missing     | Search optimization unavailable        |

#### Structural Differences

**Memory Lane (memories table):**

- Nested JSONB metadata for flexible information storage
- Temporal fields (valid_from, valid_until) for time-bounded knowledge
- Relationship tracking (superseded_by) for knowledge evolution
- Tag-based classification (auto_tags, keywords) for retrieval optimization

**Plugin (cells table):**

- Flat column structure optimized for task coordination
- Status-focused fields for workflow tracking
- Priority and dependency fields for scheduling
- Simpler design focused on execution, not knowledge retention

#### Design Implications

The schema differences reflect **complementary system goals**, not competing implementations:

- **Plugin (cells)**: Task coordination, workflow orchestration, execution tracking
- **Memory Lane (memories)**: Knowledge retention, semantic search, learning capture

The systems should coexist as separate tables sharing the same database, with Memory Lane optionally linking memories to cells/beads for context.

### 2. Connection & Path Logic

#### Path Resolution Audit

**Plugin Path Resolution:**

```typescript
// Uses input.directory from OpenCode context
const dbPath = path.join(input.directory, '.hive', 'swarm.db');
// Example: /Users/user/project/swarm-tools/.hive/swarm.db
```

**Addon Path Resolution:**

```typescript
// Uses process.cwd()
const dbPath = path.join(process.cwd(), '.hive', 'swarm.db');
// Example: /Users/user/project/swarmtool-addons/.hive/swarm.db
```

#### Root Cause of Separation

The path resolution differences create distinct database instances:

```
┌─────────────────────────────────────────────────────────────┐
│                    File System                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /Users/user/project/                                        │
│  ├── swarm-tools/          ← Plugin's CWD                   │
│  │   └── .hive/            ← Plugin creates DB here          │
│  │       └── swarm.db      ← Contains hive tables            │
│  │           ├─ cells      (swarm-mail creates)              │
│  │           ├─ beads      (swarm-mail creates)              │
│  │           └─ memories   (Memory Lane adds)               │
│  │                                                           │
│  └── swarmtool-addons/     ← Addon's CWD                     │
│      └── .hive/            ← Addon creates DB here (WRONG)   │
│          └── swarm.db      ← Isolated, missing tables        │
│              └─ memories   (Memory Lane only)                │
│                                                           │
└─────────────────────────────────────────────────────────────┘
```

**Impact:** Addon queries cells table from its isolated database → Table not found → Silent failure

### 3. Migration Logic & Error Patterns

#### ensureSchema() Limitations

**Critical Finding:** `ensureSchema()` only handles memories table migration:

```typescript
function ensureSchema(db: Database): void {
  // Adds Memory Lane specific columns to memories table
  db.exec(`
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_from TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_until TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS auto_tags TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS keywords TEXT;
  `);
  // NO logic for cells, beads, cellEvents creation
}
```

**Misleading Name:** The function name suggests comprehensive schema handling but only augments existing memories table.

#### Initialization Sequence Gap

**Current Flow:**

```
getSwarmMailLibSQL()
    ↓
ensureSchema() ← Only adds columns to memories table
    ↓
createMemoryAdapter() ← Assumes hive tables exist
    ↓
Tools run → Query cells/beads → ERROR: no such table
```

**Missing Verification:**

- No check for hive table existence
- No fallback or error handling
- No coordination with swarm-mail migrations
- No retry logic for missing tables

#### Hive Table Management Responsibility

**swarm-mail** handles hive table creation:

- Runs v7-v8 migrations on initialization
- Creates cells, beads, cellEvents tables
- Creates views and indexes for coordination

**Memory Lane** should NOT create hive tables:

- Coordination domain (not knowledge domain)
- Managed by swarm-mail's migration system
- Memory Lane should only augment memories table

**Race Condition:**

- Memory Lane tools may run before swarm-mail migrations complete
- No synchronization mechanism exists
- Tools fail silently without proper initialization ordering

#### Error Pattern Mappings

| Error Message                   | Root Cause                                   | Location in Code                            |
| ------------------------------- | -------------------------------------------- | ------------------------------------------- |
| "no such table: cells"          | ensureSchema() doesn't create cells view     | memory-lane/index.ts - ensureSchema()       |
| "hive\* tables not found"       | Hive migrations not run, cells view missing  | swarm-mail - initialization                 |
| "could not connect to swarm.db" | Silent failure when tables don't exist       | adapter.ts - query execution                |
| "missing column: valid_from"    | ensureSchema() never ran on correct database | memory-lane/index.ts - getSwarmMailLibSQL() |

---

## Impact Analysis

### User Impact

1. **Feature Unavailability**: Memory Lane tools (memory-lane_store, memory-lane_find) fail silently
2. **Lost Knowledge**: Learnings and corrections cannot be persisted
3. **Broken Semantic Search**: Context retrieval features non-functional
4. **No Error Visibility**: Silent failures make debugging difficult

### Developer Impact

1. **Unclear Error Messages**: Generic database errors mask root causes
2. **Configuration Confusion**: Unclear where database should be located
3. **Integration Complexity**: Requires manual database path configuration
4. **Debugging Overhead**: Must manually verify table creation and database location

### System Impact

1. **Dual Database Instances**: Wasted disk space and potential confusion
2. **No Coordination**: Memory Lane and swarm-tools operate in isolation
3. **Migration Fragility**: No verification that required tables exist
4. **Initialization Race**: Tools may run before tables are ready

---

## Recommendations

### Immediate Actions (High Priority)

#### 1. Fix Database Path Resolution (CRITICAL)

**Location:** `src/memory-lane/index.ts` - `getSwarmMailLibSQL()`

**Action:** Replace `process.cwd()` with OpenCode's `input.directory`:

```typescript
// BEFORE (WRONG):
const hivePath = path.join(process.cwd(), '.hive', 'swarm.db');

// AFTER (CORRECT):
const hivePath = path.join(input.directory, '.hive', 'swarm.db');
```

**Rationale:** Ensures addon uses same database as plugin, preventing isolation.

**Testing:** Verify both plugin and addon connect to same database instance.

---

#### 2. Add Hive Table Verification (CRITICAL)

**Location:** `src/memory-lane/index.ts` - `getSwarmMailLibSQL()`

**Action:** Add verification before returning database connection:

```typescript
function getSwarmMailLibSQL(input: { directory: string }): Database {
  const hivePath = path.join(input.directory, '.hive', 'swarm.db');
  const db = new Database(hivePath);

  // Verify hive tables exist
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('cells', 'beads', 'cellEvents')
  `
    )
    .all();

  if (tables.length < 3) {
    throw new Error('Hive tables not found. Run swarm-mail migrations first.');
  }

  return db;
}
```

**Rationale:** Fail fast with clear error message instead of silent failure.

**Testing:** Verify error thrown when hive tables missing.

---

#### 3. Rename ensureSchema() for Clarity (HIGH)

**Location:** `src/memory-lane/index.ts`

**Action:** Rename function and add documentation:

```typescript
// Rename from ensureSchema to ensureMemoriesSchema
function ensureMemoriesSchema(db: Database): void {
  /**
   * Augments memories table with Memory Lane specific columns.
   * Does NOT create hive tables (managed by swarm-mail migrations).
   */
  db.exec(`
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_from TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS valid_until TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS auto_tags TEXT;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS keywords TEXT;
  `);
}
```

**Rationale:** Clear function purpose and expectations.

**Testing:** Verify rename doesn't break existing calls.

---

#### 4. Add Initialization Retry Logic (HIGH)

**Location:** `src/memory-lane/index.ts` - Memory Lane tool execution

**Action:** Wrap tool queries with retry logic:

```typescript
async function retryQuery<T>(query: () => T, maxRetries = 3, delayMs = 100): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return query();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

**Rationale:** Handles race condition where hive tables not yet created.

**Testing:** Verify retry logic handles transient failures.

---

#### 5. Add Migration Documentation (HIGH)

**Location:** `docs/MEMORY-LANE-SYSTEM.md` (create if needed)

**Action:** Document initialization sequence:

```markdown
## Database Initialization Sequence

1. **swarm-mail initialization**
   - Runs v7-v8 migrations
   - Creates cells, beads, cellEvents tables
   - Creates views and indexes

2. **Memory Lane initialization**
   - Verifies hive tables exist
   - Augments memories table with temporal and tracking columns
   - Creates MemoryAdapter for semantic operations

3. **Tool execution**
   - All tools connect to same database instance
   - Queries verify table existence on first use
   - Retry logic handles transient initialization delays
```

**Rationale:** Clear documentation prevents confusion about responsibilities.

---

### Design Considerations (Medium Priority)

#### 1. Shared Database Schema Contracts

**Action:** Define formal schema contracts between swarm-mail and Memory Lane:

```typescript
// src/memory-lane/schema-contracts.ts
export const HIVE_TABLE_CONTRACT = {
  required: ['cells', 'beads', 'cellEvents'],
  optional: ['cells_view', 'beads_view'],
} as const;

export const MEMORY_TABLE_CONTRACT = {
  baseColumns: ['id', 'type', 'information', 'metadata'],
  addonColumns: ['valid_from', 'valid_until', 'superseded_by', 'auto_tags', 'keywords'],
} as const;
```

**Rationale:** Explicit contracts prevent breaking changes and enable schema verification.

**Implementation:** Add schema verification tests using contracts.

---

#### 2. Migration Coordination Interface

**Action:** Create interface for swarm-mail to signal migration completion:

```typescript
// Define event or hook for migration completion
interface SwarmMailMigrations {
  onMigrationsComplete(callback: () => void): void;
  waitForMigrations(): Promise<void>;
}

// Memory Lane initialization waits for migrations
await swarmMailMigrations.waitForMigrations();
```

**Rationale:** Eliminates race condition by explicit synchronization.

**Implementation:** Use swarm-mail hooks or Swarm Mail event system.

---

#### 3. Diagnostic Tools for Database Health

**Action:** Create diagnostic tool for database state:

```typescript
export function diagnoseDatabase(dbPath: string): DatabaseHealth {
  return {
    hiveTablesPresent: checkHiveTables(dbPath),
    memoriesTablePresent: checkMemoriesTable(dbPath),
    memoriesColumns: getMemoriesColumns(dbPath),
    swarmMailVersion: getSwarmMailVersion(dbPath),
    recommendations: generateRecommendations(),
  };
}
```

**Rationale:** Enables developers to quickly identify database configuration issues.

**Implementation:** Add as CLI command or Swarm Tool for easy debugging.

---

### Future Enhancements (Low Priority)

#### 1. Optional Memory-to-Cell Linking

**Action:** Add optional foreign key relationship from memories to cells:

```sql
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cell_id TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS bead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_memories_cell ON memories(cell_id);
CREATE INDEX IF NOT EXISTS idx_memories_bead ON memories(bead_id);
```

**Rationale:** Enables context-aware memories linked to task execution.

**Implementation:** Optional feature, not required for basic functionality.

---

#### 2. Database Path Configuration

**Action:** Allow explicit database path configuration:

```typescript
interface MemoryLaneConfig {
  dbPath?: string; // Override automatic path resolution
}
```

**Rationale:** Enables custom database locations for testing or special deployments.

**Implementation:** Add configuration parameter to initialization functions.

---

## Appendix

### Files Analyzed

#### Schema Comparison Analysis (Subtask 0)

- `src/memory-lane/taxonomy.ts` - Memory Lane schema definitions
- `src/memory-lane/index.ts` - Memory Lane initialization
- Plugin cell tracking implementation (referenced from analysis)
- `src/memory-lane/schema-contracts.ts` - Proposed contracts

#### Connection & Path Logic Audit (Subtask 1)

- `src/memory-lane/index.ts` - Database path resolution logic
- Plugin database initialization (referenced from analysis)
- OpenCode context documentation

#### Migration Logic & Error Pattern Review (Subtask 2)

- `src/memory-lane/index.ts` - `ensureSchema()` function
- `src/memory-lane/adapter.ts` - MemoryAdapter query execution
- `src/memory-lane/tools.ts` - Tool implementations
- swarm-mail migration scripts (v7-v8) - Referenced

### References

#### Findings

- Finding mem-937fb58c9f3d5dfa: Database migration gap analysis
- Schema comparison findings: Missing temporal and tracking columns
- Path resolution audit: `process.cwd()` vs `input.directory` mismatch
- Migration logic audit: `ensureSchema()` scope limitation

#### Documentation

- `docs/MEMORY-LANE-SYSTEM.md` - Memory Lane system design
- `docs/MEMORY-LANE-VS-SWARMTOOLS.md` - System comparison
- `docs/SWARMTOOLS-ARCHITECTURE.md` - swarm-tools architecture
- AGENTS.md - Agent development guidelines

#### Related Work

- Event-sourced beads feasibility analysis (`.hive/analysis/event-sourced-beads-feasibility.md`)
- Memory Lane workflow documentation (`.hive/analysis/memory-lane-workflow.md`)
- Observability runtime visibility (`.hive/analysis/observability-runtime-visibility.md`)

---

_Document generated as part of Memory Lane Gap Analysis Epic (swarmtool-addons-gfoxls-mjnz24ayd86)_
_Agent: BoldWolf | Date: 2025-12-27_
