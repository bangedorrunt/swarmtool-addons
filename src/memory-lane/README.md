# Memory Lane Module

The Memory Lane module provides standalone memory storage and semantic search for OpenCode. It captures learnings from completed tasks and makes them discoverable via semantic search with entity awareness and feedback loops.

## Overview

The Memory Lane module is responsible for:

- **Memory Extraction**: Automatically extracting learnings from any agent's session transcript
- **Semantic Storage**: Storing memories with rich taxonomy and entity associations
- **Smart Search**: Intent-boosted search with entity resolution and disambiguation
- **Feedback Loops**: Adaptive learning via helpful/harmful signals
- **Hooks Integration**: Event-driven extraction via session lifecycle hooks
- **Independence**: Operates natively with OpenCode, decoupled from swarm-tools

## Features

### Automatic Memory Extraction

Extracts valuable learnings from completed sessions automatically:

- **Trigger on Idle/Exit**: Listens to `session.idle` and `session.deleted` events
- **Transcript Analysis**: Parses conversation for insights across all agents
- **Entity Resolution**: Extracts entities from touched files
- **Taxonomy Classification**: Categorizes learnings (correction, decision, insight, etc.)

### Taxonomy-Based Storage

Memories are stored with rich metadata:

```typescript
{
  lane_version: "1.0.0",
  memory_type: "decision" | "correction" | "insight" | ...,
  entity_slugs: ["person:mark-robinson", "project:swarmtool-addons"],
  confidence_score: 85,
  source_chunk: "...verbatim excerpt...",
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
  entities: ['project:swarmtool-addons'],
  limit: 5,
});
```

**Search Features:**

- **Intent Boosting**: Prioritizes relevant memory types based on query
- **Entity Filtering**: Narrows results by entity associations
- **Disambiguation**: Asks for clarification on ambiguous entity names
- **Feedback-Aware**: Adjusts rankings based on helpful/harmful signals

## Module Structure

```
src/memory-lane/
├── tools.ts               # OpenCode tools (find, store, feedback)
├── memory-store.ts        # Standalone Memory DB operations (Drizzle)
├── hooks.ts               # Extraction trigger via tool hooks
├── resolver.ts            # EntityResolver for entity operations
├── taxonomy.ts            # Memory types, priorities, and schemas
└── index.ts               # Module exports
```

## Key Components

### Memory Store (`memory-store.ts`)

Core storage operations via `MemoryLaneStore`:

- **Standalone libSQL**: Uses `@libsql/client` directly
- **Drizzle ORM**: Type-safe queries and schema management
- **Local Embeddings**: Communicates directly with lm-studio HTTP API
- **Cosine Similarity**: Fast JavaScript-based vector search

### Memory Tools (`tools.ts`)

Exports tools for interacting with Memory Lane:

**1. memory_lane_find** - Smart semantic search

**2. memory_lane_store** - Store categorized memory

**3. memory_lane_feedback** - Record feedback

**Legacy Redirects:**

- `semantic_memory_find` → Redirects to `memory_lane_find`
- `semantic_memory_store` → Redirects to `memory_lane_store` (with type="learning")

## Architecture

Memory Lane is a sidecar to OpenCode, providing a persistent knowledge layer for all agents.

```
┌─────────────────────────────────────────────────────────────────┐
│                   OpenCode Runtime                              │
│         │                              │                        │
│         ▼                              ▼                        │
│  ┌─────────────────┐           ┌──────────────┐                 │
│  │  Memory Lane    │           │  Orchestrator│                 │
│  │  (Sidecar)      │           │  (Core)      │                 │
│  │  ┌───────────┐  │           │              │                 │
│  │  │   Hooks   │◄─┴───────────┤   Lifecycle  │                 │
│  │  │ (Session) │              │   System     │                 │
│  │  └───────────┘              └──────────────┘                 │
│  │                                                         ││
│  │  Session Events trigger:                                    ││
│  │  ┌─────────────────┐                                     ││
│  │  │ memory-catcher│  ← Spawned via skill_agent               ││
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
│  │  │  Memory Store  │  Independent SQLite database          ││
│  │  │  (Drizzle)     │  ~/.opencode/memories.db              ││
│  │  │  └─────────────────┘                                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

```

## Database Location

Memory Lane resolves the database path with the following order:

1.  **Environment**: `OPENCODE_DB_PATH`
2.  **Global (Default)**: `~/.opencode/memories.db`
3.  **Project-Local**: `.opencode/memories.db`

This ensures that persisted learning is shared across projects globally by default.

## Testing

```bash
# Run all memory-lane tests
npm test src/memory-lane
```
