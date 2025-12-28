# Memory Lane Module

The Memory Lane module provides event-driven memory extraction and semantic storage for swarm agents. It captures learnings from completed tasks and makes them discoverable via semantic search with entity awareness and feedback loops.

## Overview

The Memory Lane module is responsible for:

- **Memory Extraction**: Automatically extracting learnings from completed task transcripts
- **Semantic Storage**: Storing memories with rich taxonomy and entity associations
- **Smart Search**: Intent-boosted search with entity resolution and disambiguation
- **Feedback Loops**: Adaptive learning via helpful/harmful signals
- **Hooks Integration**: Event-driven extraction via tool execution hooks

## Features

### Automatic Memory Extraction

Extracts valuable learnings from completed tasks automatically:

- **Trigger on Completion**: Listens to `swarm_complete` tool execution
- **Transcript Analysis**: Parses full task transcripts for insights
- **Entity Resolution**: Extracts entities from touched files
- **Taxonomy Classification**: Categorizes learnings (correction, decision, insight, etc.)

### Taxonomy-Based Storage

Memories are stored with rich metadata:

```typescript
{
  lane_version: "1.0.0",
  memory_type: "decision" | "correction" | "insight" | ...,
  entity_slugs: ["person:mark-robinson", "project:swarm-tools"],
  entities: [{ type, raw, slug, resolved }],
  confidence_score: 85,
  source_chunk: "...verbatim excerpt from transcript...",
  tags: ["architecture", "async-patterns"],
  feedback_score: 1.0,
  feedback_count: 0
}
```

### Smart Semantic Search

Advanced search with intent boosting and entity awareness:

```typescript
memory_lane_find({
  query: 'How should I handle async errors?',
  entities: ['project:swarm-tools'],
  limit: 5,
});
```

**Search Features:**

- **Intent Boosting**: Prioritizes relevant memory types based on query
- **Entity Filtering**: Narrows results by entity associations
- **Disambiguation**: Asks for clarification on ambiguous entity names
- **Feedback-Aware**: Adjusts rankings based on helpful/harmful signals

### Entity Resolution

Entity system with automatic disambiguation:

- **Entity Types**: person, project, business, feature, agent, other
- **Slug Generation**: Stable identifiers (e.g., `person:mark-robinson`)
- **Disambiguation**: Detects and resolves ambiguous entity references
- **Rich Metadata**: Maintains raw, resolved, and type information

### Adaptive Learning

Feedback mechanism for continuous improvement:

- **Helpful Signal**: Increases future relevance by +10%
- **Harmful Signal**: Decreases future relevance by -50%
- **Score Tracking**: Records feedback count and cumulative score
- **Ranking Adjustment**: Adjusts search results based on feedback

## Module Structure

```
src/memory-lane/
├── tools.ts               # Memory tools (find, store, feedback)
├── adapter.ts             # MemoryLaneAdapter for storage operations
├── hooks.ts               # Automatic extraction via tool hooks
├── hooks.test.ts          # Hook tests
├── resolver.ts            # EntityResolver for entity operations
├── taxonomy.ts            # Memory types, priorities, and schemas
├── migration.ts           # Database schema migrations
├── memory-lane.test.ts    # Core functionality tests
└── index.ts              # Module exports
```

## Key Components

### Memory Tools (`tools.ts`)

Exports tools for interacting with Memory Lane:

**1. memory_lane_find** - Smart semantic search

```typescript
memory_lane_find({
  query?: string,              // Natural language search query
  entities?: string[],        // Entity slugs or names
  limit?: number             // Max results (default: 5)
})
```

**Response:**

```typescript
{
  results: [
    {
      id: "mem-abc123",
      content: "...",
      metadata: { ... },
      score: 0.85
    }
  ],
  total: 5
}
```

**2. memory_lane_store** - Store categorized memory

```typescript
memory_lane_store({
  information: string,          // Knowledge to store
  type: MemoryType,           // Taxonomy type
  entities?: string[],         // Entity slugs
  tags?: string              // Comma-separated tags
})
```

**3. memory_lane_feedback** - Record feedback

```typescript
memory_lane_feedback({
  id: string, // Memory ID
  signal: 'helpful' | 'harmful',
});
```

**Legacy Redirects:**

- `semantic_memory_find` → Redirects to `memory_lane_find`
- `semantic_memory_store` → Redirects to `memory_lane_store` (with type="learning")

### Memory Adapter (`adapter.ts`)

Core storage operations via MemoryLaneAdapter:

- **Store**: Insert new memories with taxonomy metadata
- **Find**: Execute semantic search with entity filtering
- **Feedback**: Record and apply feedback signals
- **SmartFind**: Combines search, entity resolution, and boosting

### Entity Resolver (`resolver.ts`)

Entity discovery and disambiguation:

- **Discover**: Extract entities from file paths and text
- **Resolve**: Generate stable slugs for entities
- **Disambiguate**: Handle ambiguous entity names (e.g., "Mark" → "mark-robinson" or "mark-smith")

### Taxonomy (`taxonomy.ts`)

Memory types with priority weights:

| Type          | Weight | Description                           |
| ------------- | ------ | ------------------------------------- |
| correction    | 1.0    | User behavior corrections             |
| decision      | 1.0    | Explicit architectural/design choices |
| commitment    | 1.0    | User preferences and commitments      |
| insight       | 0.7    | Non-obvious discoveries               |
| learning      | 0.7    | New knowledge acquisition             |
| confidence    | 0.7    | Strong signals from operations        |
| pattern_seed  | 0.4    | Repeated behavior patterns            |
| cross_agent   | 0.4    | Relevant to other agents              |
| workflow_note | 0.4    | Process observations                  |
| gap           | 0.4    | Missing capability identification     |

### Hooks (`hooks.ts`)

Automatic memory extraction via tool execution hooks:

- **Hook Type**: `tool.execute.after` on `swarm_complete` tool
- **Mechanism**: Spawns memory-catcher subagent for extraction
- **Timeout**: 5-minute timeout for extraction process
- **Logging**: Writes to `.hive/memory-lane.log` for debugging

**Extraction Process:**

1. Listen to `swarm_complete` tool execution
2. Extract outcome data (summary, files, transcript)
3. Truncate transcript to prevent context overflow
4. Spawn memory-catcher subagent via opencode CLI
5. Memory-catcher uses skills_load(memory-catcher) skill
6. Learings stored via `memory_lane_store` tool

## Usage Examples

### Storing a Decision

```typescript
const { memory_lane_store } = memoryLaneTools;

await memory_lane_store.execute({
  information: 'Use adapter pattern for database connections to enable testing',
  type: 'decision',
  entities: ['project:swarm-tools', 'architecture:adapter-pattern'],
  tags: 'database,testing,pattern',
});
```

### Searching with Entity Filter

```typescript
const { memory_lane_find } = memoryLaneTools;

const results = await memory_lane_find.execute({
  query: 'Database connection best practices',
  entities: ['project:swarm-tools'],
  limit: 3,
});

console.log(`Found ${results.total} relevant memories`);
```

### Providing Feedback

```typescript
const { memory_lane_feedback } = memoryLaneTools;

// Mark memory as helpful for future searches
await memory_lane_feedback.execute({
  id: 'mem-abc123',
  signal: 'helpful',
});
```

### Handling Entity Ambiguity

```typescript
const results = await memory_lane_find.execute({
  query: "What did Mark say about this?",
  entities: ["Mark"]  // Ambiguous!
});

// System detects ambiguity and returns:
{
  success: false,
  error: "CLARIFICATION_REQUIRED",
  ambiguities: {
    "Mark": ["person:mark-robinson", "person:mark-smith"]
  },
  hint: "Use full slug (e.g. 'person:mark-robinson') in entities array."
}

// User clarifies:
const results = await memory_lane_find.execute({
  query: "What did Mark say about this?",
  entities: ["person:mark-robinson"]
});
```

## Architecture

### Event-Driven Memory Extraction

```
┌─────────────────────────────────────────────────────────────────┐
│                   OpenCode Runtime                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Swarm-Mail Event Bus                           ││
│  │  (async, decoupled message passing between agents)          ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                              │                        │
│         ▼                              ▼                        │
│  ┌─────────────────┐           ┌──────────────┐                 │
│  │  Memory Lane    │           │   swarm-tools│                 │
│  │  (Sidecar)      │           │  (Core)      │                 │
│  │  ┌───────────┐  │           │              │                 │
│  │  │   Hooks   │◄─┴───────────┤   Hive       │                 │
│  │  │ (Tool/Msg)│              │   System     │                 │
│  │  └───────────┘              └──────────────┘                 │
│  │                                                         ││
│  │  swarm_complete triggers:                                  ││
│  │  ┌─────────────────┐                                     ││
│  │  │ memory-catcher│  ← Spawned via opencode CLI            ││
│  │  │ Subagent      │                                     ││
│  │  └─────────────────┘                                     ││
│  │           │                                              ││
│  │           ▼                                              ││
│  │  ┌─────────────────┐                                     ││
│  │  │  memory_lane_  │  Extract, classify, store             ││
│  │  │  store Tool    │                                     ││
│  │  └─────────────────┘                                     ││
│  │                                                         ││
│  │  ┌─────────────────┐                                     ││
│  │  │  Memory Lane   │  SQLite with semantic search             ││
│  │  │  Storage       │  (libSQL via PGlite)                 ││
│  │  └─────────────────┘                                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Schema Integration

Memory Lane integrates with the standard swarm-tools databases:

**1. swarm.db (Primary Knowledge Base)**

- Location: `~/.config/swarm-tools/swarm.db`
- `memories`: Core memory storage with enhanced metadata
- **Drizzle-Aligned Columns**: Direct storage for temporal validity (`valid_from`, `valid_until`), confidence decay (`decay_factor`), and supersession chains (`superseded_by`).
- `memories_embed`: Embedding vectors for semantic search (F32_BLOB)

**2. swarm-mail.db (Event Bus)**

- Location: `~/.config/swarm-tools/swarm-mail.db`
- `hive_events`: Outcome logs used for memory extraction
- `hive_messages`: Inter-agent communication log

**Drizzle Migration (v1.1.0):**
Memory Lane has been migrated to use direct Drizzle ORM and libSQL client. This resolves the P0 `getClient()` type error by bypassing brittle adapter wrappers and communicating directly with the database via type-safe Drizzle queries.

## Design Principles

**Non-Invasive Sidecar:**

- Extends `swarm.db` metadata schema via Schema Virtualization
- Uses tool hooks to extract data from `swarm-mail.db` events
- Does not modify swarm-tools core behavior

**Event-Driven Architecture:**

- Async memory extraction triggered by `swarm-mail.db` events
- Background spawning of memory-catcher subagent
- Eventual consistency in memory storage (stored to `swarm.db`)

**Adaptive Learning:**

- Feedback loop adjusts search relevance
- Entity resolution improves over time
- Taxonomy priority weights guide extraction

**Rich Metadata:**

- Structured taxonomy for memory types
- Entity associations for filtering
- Source chunk tracking for provenance
- Confidence scores for quality signals

## Integration

The Memory Lane module integrates with:

- **swarm-mail**: Uses libSQL database with semantic search
- **opencode-swarm-plugin**: Extends memory system with taxonomy
- **Orchestrator**: Agents can use memory tools for context
- **All Modules**: Automatic extraction on task completion

## Database Path Resolution

**Important**: Memory Lane automatically resolves the database path with the following priority:

1.  **Centralized**: `~/.config/swarm-tools/swarm.db`
2.  **Project-Local**: `.opencode/swarm.db`

This ensures that persisted learning is shared across tools while maintaining a project-specific fallback if needed.

**Scenario to Avoid:**
Manual hardcoding of database paths in tools. Always use the `getDatabasePath()` helper in `tools.ts` to maintain consistency with the swarm-tools ecosystem.

## Testing

```bash
# Run all memory-lane tests
bun test src/memory-lane

# Run specific test files
bun test src/memory-lane/memory-lane.test.ts
bun test src/memory-lane/hooks.test.ts
```

## See Also

- **AGENTS.md**: Module implementation guide and integration patterns
- **MEMORY_LANE_SYSTEM_DESIGN.md**: Detailed system architecture
- **MEMORY_LANE_SYSTEM.md**: Taxonomy and entity system design
- **taxonomy.ts**: Memory types, priorities, and metadata schema
