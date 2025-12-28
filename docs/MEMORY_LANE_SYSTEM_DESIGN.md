# Memory Lane System Design for Swarm Tools (Non-Invasive Sidecar)

This document outlines the design for "Memory Lane," an advanced persistent memory system implemented as a standalone OpenCode plugin. It enhances Swarm Tools (opencode-swarm-plugin) by using hooks to provide entity-aware, adaptive learning without modifying the core codebase.

## 1. Executive Summary

Memory Lane transforms agent memory from a simple knowledge store into a **behavioral guidance system**. By leveraging OpenCode's plugin hooks, it intercepts generic memory queries and redirects them to a more sophisticated retrieval engine that prioritizes corrections, decisions, and commitments.

**Zero-Core-Mod Strategy:** This system is built as a "sidecar" plugin. It uses `opencode-swarm-plugin` as a dependency and interacts with it via standardized hooks (`tool.execute.before`, `tool.execute.after`) and an event-driven message bus (`swarm-mail`).

---

## 2. Architectural Shifts: From Fork to Sidecar

### 2.1 Comparison Matrix

| Feature          | Legacy Approach (Fork)    | Memory Lane (Sidecar Plugin)                            |
| :--------------- | :------------------------ | :------------------------------------------------------ |
| **Integration**  | Direct code modification  | **OpenCode Hooks** (Middleware Pattern)                 |
| **Inference**    | Hardcoded prompts in Core | **Dynamic Context Injection** via `tool.execute.before` |
| **Dependency**   | Modified Source           | **NPM Dependency** (`opencode-swarm-plugin`)            |
| **Extraction**   | Blocking post-process     | **Event-Driven Hook** (Asynchronous Swarm Mail)         |
| **Maintenance**  | Manual Upstream Syncs     | **Conflict-Free** (Versioned dependency)                |
| **Coordination** | Tightly coupled processes | **Decoupled via Swarm-Mail**                            |
| **Evolution**    | Locked to fork point      | **Independent releases**                                |

### 2.2 The Fork Problem (Why We Needed This)

**Legacy Fork-Based Approach:**

```
opencode-swarm-plugin (forked)
│
├── Core features (modified)
│   └── Memory integration baked in
│
├── Custom memory logic
│   └── Tightly coupled to core
│
└── Upstream changes?
    └── Manual merge conflicts → Maintenance hell
```

**Problems:**

- Every upstream update required manual conflict resolution
- Memory improvements forced full plugin rebuilds
- Other teams couldn't use the base plugin independently
- Innovation slowed by merge overhead

### 2.3 The Sidecar Solution

**Memory Lane as Sidecar Plugin:**

```
opencode-swarm-plugin (upstream, unmodified)
│
├── Core features (clean)
│   └── Hook system (tool.execute.before/after)
│
├── Swarm-Mail (event bus)
│   └── Decoupled coordination
│
└── Memory Lane Plugin (sidecar)
    ├── Hooks into core via OpenCode API
    ├── Listens to swarm-mail events
    ├── Stores in shared libSQL instance
    └── Versioned independently
```

**Benefits:**

- **Upstream-first:** Always tracks latest opencode-swarm-plugin
- **Zero conflicts:** No direct code modifications required
- **Pluggable:** Can be enabled/disabled per project
- **Parallel evolution:** Core and memory improvements independently
- **Ecosystem-friendly:** Multiple sidecars can coexist

### 2.4 Integration Points

Memory Lane integrates with the core through **four key interfaces**:

1. **OpenCode Hooks (Synchronous)**
   - `tool.execute.before`: Intercept memory queries, inject context
   - `tool.execute.after`: Capture metrics, validate results
   - `swarm.completion`: Trigger outcome extraction

2. **Swarm-Mail (Asynchronous)**
   - Listen for `swarm_record_outcome` events
   - Decouple extraction from worker lifecycle
   - Enable retry/resilience patterns

3. **Shared Storage (libSQL)**
   - Core memory store: Simple vector embeddings
   - Memory Lane: Enhanced metadata (Schema Virtualization), entity tags, feedback scores
   - Logical separation: All Memory Lane specific fields reside within the `metadata` JSONB column.
   - Zero Schema Bloat: No `ALTER TABLE` calls on core `memories` table.

4. **Tool API (Direct)**
   - `memory-lane_find`: Entity-aware retrieval
   - `memory-lane_store`: Enhanced memory creation
   - `memory-lane_feedback`: Explicit user feedback

---

## 3. Core Architecture

### 3.1 Overview

Memory Lane operates as a **non-invasive sidecar plugin** that enhances the core opencode-swarm-plugin without requiring modifications to the core codebase. The architecture follows an event-driven, middleware-based pattern:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenCode Runtime Layer                      │
│  ┌──────────────────────────┐         ┌──────────────────────────┐  │
│  │  Core Agent Orchestration│         │   Memory Lane Sidecar    │  │
│  │   (opencode-swarm-plugin)│         │   (this plugin)          │  │
│  │                          │         │                          │  │
│  │  • Task decomposition    │         │  • Enhanced retrieval    │  │
│  │  • Worker spawning       │         │  • Entity awareness      │  │
│  │  • Swarm coordination    │         │  • Outcome extraction    │  │
│  └──────────┬───────────────┘         └──────────┬───────────────┘  │
└─────────────┼────────────────────────────────────┼──────────────────┘
              │                                    │
              │  OpenCode Hooks (Middleware)       │
              ├────────────────────────────────────┤
              │ • tool.execute.before              │
              │ • tool.execute.after               │
              │ • swarm.completion                 │
              └────────────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Swarm-Mail Event Bus                           │
│  • Asynchronous coordination layer                                  │
│  • Decouples core from sidecar logic                                │
│  • Enables event-driven outcome extraction                          │
└─────────────────────────────────────────────────────────────────────┘
              │                                    │
              ▼                                    ▼
      ┌──────────────┐                    ┌──────────────────┐
      │  libSQL DB   │ ◄──────────────────┤ Memory Lane      │
      │  (Vectors)   │                    │ Logic & Search   │
      │              │                    │                  │
      │ • Embeddings │                    │ • Entity Filter  │
      │ • Metadata   │                    │ • Semantic Rank  │
      │ • Feedback   │                    │ • Intent Boost   │
      └──────────────┘                    └──────────────────┘
```

### 3.2 Sidecar Lifecycle (ASCII Diagram)

The sidecar lifecycle demonstrates the event-driven coordination via swarm-mail:

```text
                    ┌─────────────────────────────────────────┐
                    │         WORKER EXECUTION CYCLE          │
                    └─────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  1. Worker starts task                  │
                    │     (e.g., implementing a feature)      │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  2. Worker queries memory               │
                    │     (semantic-memory_find)              │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │  3. tool.execute.before hook fires  │
                    │  ┌────────────────────────────────┐ │
                    │  │ Memory Lane Sidecar intercepts │ │
                    │  │ • Analyzes query intent        │ │
                    │  │ • Applies entity filtering     │ │
                    │  │ • Injects "memory-first" hint  │ │
                    │  └────────────────────────────────┘ │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │  4. Worker executes with enhanced   │
                    │     context (entity-aware)          │
                    └──────────────────┬──────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  5. Worker completes task               │
                    │     (swarm_complete called)             │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │  6. Core records outcome            │
                    │     (swarm_record_outcome)          │
                    └──────────────────┬──────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      SWARM-MAIL EVENT BUS                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  7. Message published: task outcome event                       │ │
│  │     • Bead ID                                                   │ │
│  │     • Success status                                            │ │
│  │     • Files touched                                             │ │
│  │     • Duration / retries / errors                               │ │
│  └───────────────────────────────┬─────────────────────────────────┘ │
└──────────────────────────────────┼───────────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  8. swarm.completion hook fires         │
                    │     (Memory Lane sidecar listener)      │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  9. memory-catcher skill spawned        │
                    │     (Agent-as-Tool pattern)             │
                    │                                         │
                    │  ┌───────────────────────────────────┐  │
                    │  │ • Reads full transcript           │  │
                    │  │ • Extracts learnings              │  │
                    │  │ • Identifies decisions/corrections│  │
                    │  │ • Stores to memory-lane           │  │
                    │  └───────────────────────────────────┘  │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  10. Memory Lane stores new memories    │
                    │      • Entity tags (project/feature)    │
                    │      • Intent tags (decision/correction)│
                    │      • Feedback score (implicit)        │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  11. Learning feedback loop closes      │
                    │      (next worker benefits from this)   │
                    └─────────────────────────────────────────┘
```

### 3.3 Key Architectural Principles

1. **Non-Invasive Integration**
   - Memory Lane never modifies core opencode-swarm-plugin code
   - Uses OpenCode's hook system for interception
   - All integration points are versioned via npm dependency

2. **Event-Driven Coordination**
   - Synchronous path: Hooks inject context before tool execution (instant feedback)
   - Asynchronous path: Swarm-mail delivers outcome events (non-blocking)
   - Decoupled: Core and sidecar evolve independently

3. **Enhanced Retrieval, Not Replacement**
   - Core memory operations remain functional
   - Memory Lane provides entity-aware layer on top
   - Workers can opt-in to enhanced retrieval via hooks

4. **Learning Loop**
   - Every task completion feeds the memory store
   - Implicit feedback via success/failure patterns
   - Explicit feedback via memory-lane_feedback tool

### 3.2 Coordination Flow

1.  **Context Injection (Synchronous):** When a swarm worker attempts to call `semantic-memory_find`, the `tool.execute.before` hook intercepts the call. It either:
    - Redirects the call to `memory-lane_find`.
    - OR injects a system instruction into the context to prioritize specific memory types (corrections, decisions).
2.  **Outcome Extraction (Asynchronous):** Upon task completion, `swarm_record_outcome` (in Core) sends a message to `swarm-mail`. The `createSwarmCompletionHook` (in Memory Lane) listens for these events and spawns the `memory-catcher` skill to process the transcript and update the memory store.

---

## 4. Implementation Components

### 4.1 Sidecar Adapter

The `MemoryLaneAdapter` wraps the core `MemoryAdapter` features. It implements the "Dual-Search" algorithm (Entity Filter + Semantic Rank) and "Intent Boosting" (recognizing keywords like "mistake" or "decision").

### 4.2 OpenCode Plugin Entry Point (`src/index.ts`)

The plugin registers:

- **Tools:** `memory-lane_find`, `memory-lane_store`, `memory-lane_feedback`.
- **Hooks:**
  - `tool.execute.before`: Injects "memory-first" directives into workers.
  - `tool.execute.after`: Captures session metrics for feedback loops.
- **Initialization:** Starts the `swarm-mail` listener for asynchronous extraction.

### 4.3 Skill-Based Extraction

The `memory-catcher` is packaged as a skill that utilizes the Agent-as-Tool pattern. It runs independently, preventing long-running extraction processes from blocking the main agent session.

---

## 5. Actionable Roadmap (Refactoring Plan)

### Phase 1: Hook-Based Interception

- [ ] **Implement `tool.execute.before`:** Create a middleware in `src/index.ts` to detect `semantic-memory_find` calls.
- [ ] **Inject Directives:** Automatically append "Prefer memory-lane_find for better entity filtering" to the context of memory tools.
- [ ] **Tool Aliasing:** Experiment with swapping tool execution dynamically if OpenCode allows (otherwise use instruction injection).

### Phase 2: Context Compaction

- [ ] **Transcript Truncation:** Update the `memory-catcher` hook to truncate transcripts to 4k tokens to prevent Ollama failures.
- [ ] **Compaction Logic:** Integrate basic summarization for transcripts exceeding the 4k threshold before extraction.

### Phase 3: Entity Resolution Enhancement

- [ ] **File-Path Resolver:** Improve `resolver.ts` to automatically extract project/feature slugs from `files_touched`.
- [ ] **Metadata Enrichment:** Ensure all extracted memories are tagged with `metadata.lane_version` for future-proofing.

### Phase 4: Feedback Persistence

- [ ] **Refactor `adapter.ts`:** Store aggregate feedback scores directly in the `metadata` JSONB of the memory record.
- [ ] **Re-Ranking Logic:** Ensure retrieval scores are adjusted based on user feedback (+10% helpful / -50% harmful).

---

## 6. Technical Implementation Details

### 6.1 Database Architecture: libSQL + Drizzle

Memory Lane uses a **libSQL** database managed through **Drizzle ORM**, providing a robust, serverless SQLite-compatible backend with vector search capabilities.

**Schema Overview:**

The system stores memories in the `memories` table with the following structure:

```typescript
// Core memory table (managed by swarm-mail)
interface MemoryTable {
  id: string; // Unique ID: mem_timestamp_random
  content: string; // Memory content (text)
  embedding: Blob; // F32_BLOB: 1536-dimensional vector
  collection: string; // Collection name (e.g., "memory-lane")
  metadata: JSONB; // MemoryLaneMetadata (taxonomy, feedback, entities)
  tags: string; // Comma-separated tags
  confidence: number; // 0.0-1.0 confidence score (affects decay rate)
  createdAt: datetime; // Timestamp (used for decay calculations)
  updatedAt: datetime; // Last update timestamp
}
```

**Vector Storage Format (F32_BLOB):**

- Embeddings are stored as **F32_BLOB** (32-bit float binary large objects)
- Dimensions: **1536** (OpenAI text-embedding-3-small)
- Storage efficiency: ~6KB per embedding (1536 × 4 bytes)
- Used for: Semantic similarity search via cosine distance

**Querying Vectors:**

```typescript
// Vector search implementation (from memory.ts:392-396)
results = await store.search(queryEmbedding, {
  limit,
  threshold: 0.3, // Minimum similarity score
  collection: args.collection,
});
```

**Connection Pattern:**

```typescript
// From tools.ts:15-20
async function getLaneAdapter(): Promise<MemoryLaneAdapter> {
  const swarmMail = await getSwarmMailLibSQL(process.cwd());
  const db = await swarmMail.getDatabase();
  const baseMemory = await createMemoryAdapter(db);
  return new MemoryLaneAdapter(baseMemory);
}
```

---

### 6.2 Mem0 Upsert Pattern (ADD/UPDATE/DELETE/NOOP)

Memory Lane implements the **Mem0 upsert pattern** to intelligently manage memory lifecycle. Before storing, the system uses an LLM to decide whether to ADD, UPDATE, DELETE, or skip (NOOP).

**Upsert Workflow:**

```typescript
// From memory.ts:498-525
async upsert(args: UpsertArgs): Promise<UpsertResult> {
  // 1. Find semantically similar memories (vector search)
  const similar = await vectorSearch(queryEmbedding, limit=5);

  // 2. LLM Decision (if similar memories found)
  const decision = await llm.decide({
    context: args.information,
    similarMemories: similar,
    options: ["ADD", "UPDATE", "DELETE", "NOOP"]
  });

  // 3. Execute operation
  switch (decision.operation) {
    case "ADD":
      return await storeMemory(args); // New memory
    case "UPDATE":
      return await updateMemory(decision.targetId, args); // Merge with existing
    case "DELETE":
      return await deleteMemory(decision.targetId); // Replace stale memory
    case "NOOP":
      return { operation: "NOOP", reason: "Already exists" }; // Skip duplicate
  }
}
```

**LLM Decision Logic:**

| Operation  | Trigger Condition                                 | Action                          |
| ---------- | ------------------------------------------------- | ------------------------------- |
| **ADD**    | No similar memories (score < 0.85)                | Insert new memory               |
| **UPDATE** | Similar memory found (score ≥ 0.85) + content补充 | Merge content, keep existing ID |
| **DELETE** | Similar memory found + new memory contradicts     | Remove stale memory, insert new |
| **NOOP**   | Duplicate detected (score ≥ 0.95)                 | Skip, return existing memory    |

**Benefits:**

- Prevents duplicate memories (semantic deduplication)
- Enables memory evolution (UPDATE merges new info into old)
- Stale memory cleanup (DELETE removes outdated info)
- Reduces storage costs (NOOP skips unnecessary writes)

---

### 6.3 Implicit Feedback Scoring Formula

Memory Lane uses **implicit feedback** from task outcomes to adjust memory relevance without explicit user ratings. Feedback signals are extracted from `swarm_record_outcome` data and converted to scores.

**Signal Categories & Weights:**

```typescript
// From learning-systems skill (weight: 0.0-1.0)
signals = {
  success: { weight: 0.4, helpful: 1.0, harmful: 0.0 },
  duration_ms: { weight: 0.2, fast: 1.0, medium: 0.6, slow: 0.2 },
  error_count: { weight: 0.2, none: 1.0, few: 0.6, many: 0.2 },
  retry_count: { weight: 0.2, zero: 1.0, one: 0.7, many: 0.3 },
};
```

**Scoring Thresholds:**

| Signal       | Helpful | Neutral  | Harmful  |
| ------------ | ------- | -------- | -------- |
| **Duration** | < 5 min | 5-30 min | > 30 min |
| **Errors**   | 0       | 1-2      | 3+       |
| **Retries**  | 0       | 1        | 2+       |
| **Success**  | ✅ true | -        | ❌ false |

**Weighted Score Calculation:**

```typescript
// From learning-systems skill
rawScore =
  (success ? 1.0 : 0.0) * 0.4 + duration_score * 0.2 + error_score * 0.2 + retry_score * 0.2;

// Classification
if (rawScore >= 0.7) type = 'helpful';
else if (rawScore <= 0.4) type = 'harmful';
else type = 'neutral';
```

**Feedback Application (Re-ranking):**

When retrieving memories, feedback scores adjust search rankings:

```typescript
// From adapter.ts:141-142
finalScore *= metadata.feedback_score || 1.0;

// Feedback update (from adapter.ts:77-82)
if (signal === 'helpful') {
  metadata.feedback_score *= 1.1; // +10% boost
} else {
  metadata.feedback_score *= 0.5; // -50% penalty
}
```

**Impact on Retrieval:**

- **Helpful memories**: 10% boost per positive feedback (compound growth)
- **Harmful memories**: 50% penalty per negative feedback (rapid decay)
- **Unvoted memories**: Default score 1.0 (no adjustment)

---

### 6.4 Decay Tracking (90-Day Half-Life)

Memory relevance **decays over time** unless revalidated by feedback. This prevents stale memories from dominating search results.

**Decay Formula:**

```typescript
// From learning-systems skill
decayed_value = (raw_value * 0.5) ^ (age_days / 90);
```

**Decay Timeline:**

| Age     | Retained Weight | Decay           |
| ------- | --------------- | --------------- |
| Day 0   | 100%            | 0%              |
| Day 30  | 81%             | 19%             |
| Day 90  | 50%             | 50% (half-life) |
| Day 180 | 25%             | 75%             |
| Day 270 | 12.5%           | 87.5%           |

**Criterion Weight Calculation:**

Feedback events are aggregated with decay applied:

```typescript
// From learning-systems skill
helpfulSum = sum(
  helpful_events.map((e) =>
    e.raw_value * 0.5 ^ ((now - e.timestamp) / 90 days)
  )
);

harmfulSum = sum(
  harmful_events.map((e) =>
    e.raw_value * 0.5 ^ ((now - e.timestamp) / 90 days)
  )
);

weight = max(0.1, helpfulSum / (helpfulSum + harmfulSum));
// Minimum weight floor: 0.1 (prevents zeroing)
```

**Revalidation:**

Recording new feedback resets the decay timer:

```typescript
{
  criterion: "type_safe",
  weight: 0.85,
  helpful_count: 12,
  harmful_count: 3,
  last_validated: "2024-12-12T00:00:00Z",  // Reset on new feedback
  half_life_days: 90,
}
```

**Decay in Retrieval:**

```typescript
// Not yet implemented in current codebase (TODO in adapter.ts:447)
// Planned: Apply decay to confidence_score before ranking
const ageDays = (Date.now() - memory.createdAt) / (1000 * 60 * 60 * 24);
const decayFactor = 0.5 ^ (ageDays / 90);
finalScore *= decayFactor;
```

---

### 6.5 Design Patterns

Memory Lane uses three core design patterns to achieve separation of concerns, extensibility, and non-invasive integration.

#### Pattern 1: Adapter Pattern

**Purpose:** Wrap base `MemoryAdapter` to add Memory Lane-specific behavior without modifying the original.

**Implementation:**

```typescript
// From adapter.ts:27-58
export class MemoryLaneAdapter {
  constructor(private readonly baseAdapter: MemoryAdapter) {}

  // Enhanced storage with Memory Lane metadata
  async storeLaneMemory(
    args: StoreArgs & {
      type: MemoryType;
      entities?: string[];
      confidence_score?: number;
    }
  ): Promise<StoreResult> {
    const laneMetadata: MemoryLaneMetadata = {
      lane_version: this.LANE_VERSION,
      memory_type: args.type,
      entity_slugs: args.entities || [],
      confidence_score: args.confidence_score ?? 70,
      feedback_score: 1.0,
      feedback_count: 0,
    };

    return this.baseAdapter.store({
      ...args,
      collection: this.COLLECTION,
      metadata: JSON.stringify(laneMetadata),
    });
  }

  // Enhanced retrieval with re-ranking
  async smartFind(args: SmartFindArgs): Promise<FindResult> {
    const baseResult = await this.baseAdapter.find(args);

    // Apply Memory Lane logic (intent boosting, entity filtering)
    return this.reRankResults(baseResult);
  }
}
```

**Benefits:**

- **Deep module:** Simple public API (smartFind, storeLaneMemory), rich implementation
- **Composability:** Can chain adapters (e.g., LaneAdapter → CacheAdapter → BaseAdapter)
- **Testing:** Easy to mock base adapter for unit tests
- **Swappability:** Replace base adapter implementation without changing Memory Lane code

---

#### Pattern 2: Middleware Pattern (OpenCode Hooks)

**Purpose:** Intercept tool execution to inject context and extract outcomes without modifying core swarm code.

**Implementation (Context Injection):**

```typescript
// From index.ts:127-139
"tool.execute.before": async (input, output) => {
  const memoryTools = ["semantic-memory_find", "memory-lane_find"];

  if (memoryTools.includes(input.tool)) {
    // Inject "memory-first" directive into agent context
    output.context.push(
      "SYSTEM: Memory Lane Guidance\n" +
      "ALWAYS prioritize 'memory-lane_find' over 'semantic-memory_find'.\n" +
      "Memory Lane provides intent boosting and entity filtering."
    );
  }
}
```

**Implementation (Outcome Extraction):**

```typescript
// From index.ts:143-165
"tool.execute.after": async (input, output) => {
  if (input.tool === "swarm_complete") {
    // Extract outcome data from tool arguments
    const outcomeData = {
      bead_id: input.args.bead_id,
      summary: input.args.summary,
      files_touched: input.args.files_touched || [],
      success: true,
      agent_name: input.args.agent_name,
    };

    // Trigger memory extraction (non-blocking)
    triggerMemoryExtraction(projectPath, outcomeData, Bun.$);
  }
}
```

**Benefits:**

- **Zero Core Mod:** No changes to opencode-swarm-plugin required
- **Non-blocking:** Hooks run synchronously for injection, asynchronously for extraction
- **Composable:** Multiple plugins can register hooks without conflicts
- **Observability:** Every tool call passes through middleware (logging, metrics)

---

#### Pattern 3: Event Sourcing (Swarm Mail)

**Purpose:** Asynchronously extract memories from completed tasks without blocking worker execution.

**Event Flow:**

```text
Worker completes → swarm_complete()
                   ↓
         swarm_record_outcome() stores data in Hive
                   ↓
         Coordinator sends event via swarmmail_send()
                   ↓
         Swarm Mail Queue (persists message)
                   ↓
         Hook polls every 5s (createSwarmCompletionHook)
                   ↓
         Finds "memory-catcher-extract" message
                   ↓
         Spawns memory-catcher skill (Agent-as-Tool)
                   ↓
         Memory-catcher extracts learnings → memory-lane_store()
                   ↓
         Acknowledges message
```

**Implementation:**

```typescript
// From hooks.ts:55-103
export async function createSwarmCompletionHook(projectPath: string): Promise<HookListener> {
  let swarmMail: any = null;
  let isRunning = false;

  // Register memory-catcher agent
  await swarmMail.registerAgent(projectPath, 'memory-catcher');

  // Start polling for messages (every 5 seconds)
  const pollInterval = setInterval(async () => {
    if (!isRunning) return;

    // Check inbox for "memory-catcher-extract" messages
    const inbox = await swarmMail.getInbox(projectPath, 'memory-catcher', {
      limit: 10,
      includeBodies: true,
    });

    for (const message of inbox) {
      if (message.subject === 'memory-catcher-extract') {
        await processMessage(swarmMail, projectPath, message);
      }
    }
  }, 5000);

  return () => {
    isRunning = false;
    if (pollInterval) clearInterval(pollInterval);
  };
}
```

**Message Structure:**

```typescript
// From swarm-coordination skill
await swarmmail_send({
  to: ['memory-catcher'],
  subject: 'memory-catcher-extract',
  body: JSON.stringify({
    transcript: fullWorkerConversation,
    summary: 'OAuth login flow implemented',
    evaluation: 'Used 5min refresh buffer',
    files_touched: ['src/auth/service.ts'],
    duration_ms: 180000,
    error_count: 0,
    retry_count: 0,
    success: true,
    bead_id: 'bd-123.4',
    agent_name: 'BlueLake',
    project_key: '/Users/bangedorrunt/workspace/swarm-tools',
  }),
  importance: 'normal',
  ack_required: false, // Non-blocking
});
```

**Benefits:**

- **Decoupling:** Workers don't wait for memory extraction
- **Retry Safety:** Messages persist in queue if hook crashes
- **Scalability:** Multiple memory-catcher agents can process in parallel
- **Auditability:** Full event log in swarm-mail database

---

### 6.6 Taxonomy & Priority Weights

Memory Lane categorizes memories into 9 types with different priority weights for retrieval ranking.

**Memory Types (from taxonomy.ts):**

```typescript
const MemoryTypeSchema = z.enum([
  'correction', // User behavior correction (HIGH: 1.0)
  'decision', // Explicit choice (HIGH: 1.0)
  'commitment', // User preference/commitment (HIGH: 1.0)
  'insight', // Non-obvious discovery (MEDIUM: 0.7)
  'learning', // New knowledge (MEDIUM: 0.7)
  'confidence', // Strong signal (MEDIUM: 0.7)
  'pattern_seed', // Repeated behavior (LOW: 0.4)
  'cross_agent', // Relevant to other agents (LOW: 0.4)
  'workflow_note', // Process observation (LOW: 0.4)
  'gap', // Missing capability (LOW: 0.4)
]);
```

**Priority Weights:**

```typescript
export const PRIORITY_WEIGHTS: Record<MemoryType, number> = {
  correction: 1.0,
  decision: 1.0,
  commitment: 1.0,
  insight: 0.7,
  learning: 0.7,
  confidence: 0.7,
  pattern_seed: 0.4,
  cross_agent: 0.4,
  workflow_note: 0.4,
  gap: 0.4,
};
```

**Ranking Formula:**

```typescript
// From adapter.ts:132-134
finalScore = baseScore * PRIORITY_WEIGHTS[metadata.memory_type];

// Example:
baseScore: 0.85
type: "correction"
finalScore: 0.85 * 1.0 = 0.85

baseScore: 0.85
type: "workflow_note"
finalScore: 0.85 * 0.4 = 0.34
```

**Intent Boosting (+15%):**

```typescript
// From adapter.ts:136-139
if (boostedTypes.includes(metadata.memory_type)) {
  finalScore *= 1.15;
}

// Query keywords trigger boosts:
"mistake" → boosts "correction", "gap"
"decided" → boosts "decision"
"pattern" → boosts "pattern_seed", "commitment"
"learned" → boosts "learning", "insight"
```

---

### 6.7 Event-Sourced Reflection Workflow

Memory Lane implements an **event-sourced reflective loop** that extracts learnings from completed tasks without blocking worker execution. This post-session reflection transforms raw task outcomes into persistent knowledge through a decoupled, event-driven architecture.

#### 6.7.1 Outcome Signals

When a worker completes a task, `swarm_record_outcome` captures four key signals:

```typescript
interface OutcomeSignals {
  bead_id: string; // Hive cell identifier
  agent_name: string; // Worker agent name
  duration_ms: number; // Task execution time
  error_count: number; // Errors encountered
  retry_count: number; // Retry attempts
  success: boolean; // Task completion status
  files_touched: string[]; // Modified file paths
  summary: string; // Human-readable summary
  evaluation: string; // Self-evaluation text
  criteria?: string[]; // Checklist criteria
}
```

#### 6.7.2 Implicit Feedback Scoring

Memory Lane converts outcome signals into learning scores without explicit user feedback:

**Signal Weighting:**

```typescript
signals = {
  success: { weight: 0.4, helpful: 1.0, harmful: 0.0 },
  duration_ms: { weight: 0.2, fast: 1.0, medium: 0.6, slow: 0.2 },
  error_count: { weight: 0.2, none: 1.0, few: 0.6, many: 0.2 },
  retry_count: { weight: 0.2, zero: 1.0, one: 0.7, many: 0.3 },
};
```

**Classification Thresholds:**

| Signal       | Helpful | Neutral  | Harmful  |
| ------------ | ------- | -------- | -------- |
| **Duration** | < 5 min | 5-30 min | > 30 min |
| **Errors**   | 0       | 1-2      | 3+       |
| **Retries**  | 0       | 1        | 2+       |
| **Success**  | ✅ true | -        | ❌ false |

**Score Calculation:**

```typescript
rawScore = (success ? 1.0 : 0.0) * 0.4 + durationScore * 0.2 + errorScore * 0.2 + retryScore * 0.2;

// Classification
if (rawScore >= 0.7) type = 'helpful';
else if (rawScore <= 0.4) type = 'harmful';
else type = 'neutral';
```

#### 6.7.3 Reflective Loop (Post-Session)

The reflective loop operates asynchronously via Swarm Mail after task completion:

```text
┌──────────────────────────────────────────────────────────────────┐
│              EVENT-SOURCED REFLECTIVE LOOP                      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
            ┌──────────────────────────────────────┐
            │ 1. Worker completes task           │
            │   (swarm_complete called)          │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 2. Core records outcome            │
            │   (swarm_record_outcome)          │
            │                                    │
            │   • Stores: duration_ms,          │
            │     error_count, retry_count,      │
            │     success, files_touched         │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 3. Coordinator sends event         │
            │   (swarmmail_send)                │
            │                                    │
            │   to: ["memory-catcher"]           │
            │   subject: "memory-catcher-extract" │
            │   body: { outcomeData }           │
            │   ack_required: false              │
            └──────────────────┬───────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   SWARM-MAIL EVENT BUS (PERSISTENT)                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 4. Message queued and persisted                               │ │
│  │                                                               │ │
│  │ {                                                             │ │
│  │   to: "memory-catcher",                                      │ │
│  │   subject: "memory-catcher-extract",                           │ │
│  │   body: { outcomeData },                                      │ │
│  │   importance: "normal"                                        │ │
│  │ }                                                             │ │
│  └───────────────────────────────┬────────────────────────────────┘ │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
                                   ▼
            ┌──────────────────────────────────────┐
            │ 5. Hook polls (every 5s)          │
            │   (createSwarmCompletionHook)     │
            │                                    │
            │   Register memory-catcher agent    │
            │   Check inbox for extraction msg   │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 6. Hook finds "memory-catcher-     │
            │    extract" message                │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 7. Spawn memory-catcher skill      │
            │   (Agent-as-Tool pattern)          │
            │                                    │
            │   • Task subagent with memory-     │
            │     catcher skill loaded            │
            │   • Pass outcomeData as context    │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 8. Memory-catcher analyzes         │
            │   (skill/memory-catcher/SKILL.md)   │
            │                                    │
            │   • Parse outcomeData              │
            │   • Determine memory type:          │
            │     - error_count > 0 → correction  │
            │     - config files → decision       │
            │     - "unexpected" → insight        │
            │     - "always/never" → commitment   │
            │     - "missing" → gap              │
            │                                    │
            │   • Extract entities from files:    │
            │     src/auth/*.ts → ["feature:auth"]│
            │                                    │
            │   • Calculate confidence:           │
            │     base: 70                       │
            │     +15 if error → success         │
            │     +10 if quick (<30s)            │
            │                                    │
            │   • Check for duplicates:          │
            │     memory-lane_find() similarity   │
            │     > 0.85 → skip                 │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────┐
            │ 9. Store each extracted memory   │
            │   (memory-lane_store)            │
            │                                  │
            │   information: "OAuth login uses │
            │     JWT with 5min refresh"       │
            │   type: "correction"             │
            │   entities: ["feature:auth"]     │
            │   confidence_score: 85           │
            │   tags: "oauth,jwt,refresh"      │
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 10. Acknowledge message             │
            │   (swarmmail_ack)                 │
            │   (retry-safe: persists on failure)│
            └──────────────────┬───────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │ 11. Learning feedback loop closes    │
            │   (next worker benefits)           │
            │                                    │
            │   • Future workers query via        │
            │     memory-lane_find()             │
            │   • Intent boosting prioritizes     │
            │     corrections & decisions          │
            │   • Feedback scores adjust ranking │
            └──────────────────────────────────────┘
```

#### 6.7.4 Decoupling Benefits

The event-sourced architecture provides critical decoupling:

| Aspect          | Blocking Approach                | Event-Sourced Approach                 |
| --------------- | -------------------------------- | -------------------------------------- |
| **Worker Flow** | Waits for extraction to complete | Returns immediately after completion   |
| **Extraction**  | Synchronous in worker process    | Asynchronous via Swarm Mail            |
| **Failures**    | Blocks task completion           | Retries automatically via queue        |
| **Scalability** | Limited by worker concurrency    | Multiple memory-catcher agents process |
| **Debugging**   | Mixed with worker logs           | Separate extraction logs in Swarm Mail |

**Key Design Decision:** `ack_required: false` ensures non-blocking extraction. If memory-catcher fails, the Swarm Mail queue persists the message for retry. Workers never wait for reflection to complete.

#### 6.7.5 Memory Extraction Patterns

Memory-catcher skill uses outcome signals to determine memory type:

| Outcome Signal                                    | Memory Type | Confidence Boost      | Example                                |
| ------------------------------------------------- | ----------- | --------------------- | -------------------------------------- |
| `error_count > 0 && success`                      | correction  | +15 (error recovery)  | "Build failed, added types, succeeded" |
| `files_touched` includes "config", "setup"        | decision    | +10 (architectural)   | "Chose SQLite over PostgreSQL"         |
| `evaluation` contains "unexpected", "discovered"  | insight     | +5 (discovery)        | "Found async/await performs 3x better" |
| `evaluation` contains "always", "never", "prefer" | commitment  | +15 (user preference) | "Always run tests before committing"   |
| `evaluation` contains "missing", "lacking"        | gap         | +10 (capability gap)  | "No native Git worktree support"       |

**Confidence Formula:**

```typescript
confidence =
  70 + // Base confidence
  (error_count > 0 && success ? 15 : 0) + // Error recovery
  (duration_ms < 30000 ? 10 : 0) + // Quick success
  (evaluation_evidence.length > 2 ? 15 : 0); // Strong evidence

confidence = Math.max(0, Math.min(100, confidence)); // Clamp to 0-100
```

#### 6.7.6 Full Example: OAuth Implementation

**Worker Output:**

```typescript
swarm_complete({
  bead_id: 'cell-abc123',
  agent_name: 'BlueLake',
  summary: 'OAuth login flow implemented with JWT',
  evaluation:
    'Used 5min refresh buffer to prevent race conditions. Build initially failed with 2 TS errors, fixed by adding types.',
  files_touched: ['src/auth/service.ts', 'src/auth/schema.ts'],
  error_count: 2,
  retry_count: 0,
  success: true,
  duration_ms: 180000, // 3 minutes
});
```

**Outcome Recording:**

```typescript
swarm_record_outcome({
  bead_id: 'cell-abc123',
  duration_ms: 180000,
  error_count: 2,
  retry_count: 0,
  success: true,
  files_touched: ['src/auth/service.ts', 'src/auth/schema.ts'],
});
```

**Implicit Feedback Scoring:**

```typescript
durationScore = 0.6  // Medium (3 min)
errorScore = 0.6      // Few (2 errors)
retryScore = 1.0      // Zero retries
successScore = 1.0     // Success

rawScore = 1.0 * 0.4 + 0.6 * 0.2 + 0.6 * 0.2 + 1.0 * 0.2 = 0.88
type = 'helpful'  // (0.88 >= 0.7)
```

**Memory-Catcher Extraction:**

```typescript
// 1. Determine type
memoryType = 'correction'  // error_count > 0 && success

// 2. Extract entities
entities = EntityResolver.extractFromPaths([
  "src/auth/service.ts",
  "src/auth/schema.ts"
]);
// → ["feature:auth"]

// 3. Calculate confidence
confidence = 70 + 15 + 10 = 95  // Base + error recovery + strong evidence

// 4. Check duplicates
existing = await memory-lane_find({
  query: "OAuth login requires JWT with 5min refresh buffer",
  limit: 3
});
// → No similar memories (score < 0.85)

// 5. Store
await memory-lane_store({
  information: "OAuth login requires JWT tokens with 5min refresh buffer to prevent race conditions. Build errors occurred due to missing type definitions.",
  type: "correction",
  entities: ["feature:auth"],
  confidence_score: 95,
  tags: "oauth,jwt,refresh,race-conditions"
});
```

#### 6.7.7 Integration with Learning System

The reflective loop feeds the broader learning system:

1. **Outcome Recording:** `swarm_record_outcome` captures task completion data
2. **Implicit Scoring:** Outcome signals converted to helpful/harmful/neutral
3. **Pattern Observation:** Decomposition strategies tracked (success/failure counts)
4. **Maturity Progression:** Patterns advance: candidate → established → proven
5. **Anti-Pattern Inversion:** Failed patterns (>60% failure) become anti-patterns
6. **Feedback Decay:** Old feedback decays with 90-day half-life
7. **Confidence Revalidation:** New feedback resets decay timer

**Closed Learning Loop:**

```text
Worker completes → Outcome recorded → Scored as helpful → Pattern proven
                                                           ↓
                                         Future decomposition uses proven pattern
                                                           ↓
                                         Faster execution → Better outcome → Higher score
```

---

### 6.8 Technical Stack Summary

| Component       | Technology                | Purpose                              |
| --------------- | ------------------------- | ------------------------------------ |
| **Database**    | libSQL                    | Serverless SQLite-compatible storage |
| **ORM**         | Drizzle                   | Type-safe database queries           |
| **Vectors**     | F32_BLOB (1536-dim)       | Semantic similarity search           |
| **Embeddings**  | Ollama (nomic-embed-text) | Local embedding generation           |
| **Events**      | Swarm Mail                | Asynchronous message queue           |
| **Validation**  | Zod                       | Runtime schema validation            |
| **Integration** | OpenCode Hooks            | Non-invasive tool interception       |
| **Plugin API**  | @opencode-ai/plugin       | Tool registration & lifecycle hooks  |

---
