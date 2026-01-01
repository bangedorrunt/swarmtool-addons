# Memory Lane: Semantic Knowledge Module

Memory Lane provides a persistent knowledge sidecar for all agents, capturing cross-session learnings and enabling semantic discovery.

## 1. Data Flow

The learning lifecycle follows a "Capture -> Vectorize -> Inject" pattern.

```ascii
┌─────────────────────────────────────────────────────────────────┐
│                    LEARNING LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Session End      Memory Catcher      Vector DB        Next Session
│       │                 │                 │                 │
│       ▼                 ▼                 ▼                 ▼
│  ┌─────────┐      ┌───────────┐     ┌───────────┐     ┌─────────┐
│  │ Outcome │─────▶│ Extract   │────▶│ Cosine    │────▶│ Inject  │
│  │ Detected│      │ Taxonomy  │     │ Similarity│     │ Context │
│  └─────────┘      └───────────┘     └───────────┘     └─────────┘
│                                           ▲                 │
│                                           └─────────────────┘
│                                             Semantic Search
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Learning Taxonomy

Learnings are categorized into specific types to optimize retrieval boosting:

- **Correction**: High priority. Direct user feedback ("No, use X").
- **Decision**: Architectural choices ("Chose SQLite for portability").
- **Preference**: User coding style or library preferences.
- **Pattern**: Successful implementation strategies.
- **Anti-Pattern**: Strategies that failed or caused bugs.

## 3. Storage Architecture

### I. Database Schema (SQLite via PGlite)

Memories are stored in a standalone database (default: `~/.opencode/memories.db`).

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding BLOB,           -- Vector data
  type TEXT,                -- Taxonomy
  entities TEXT,            -- JSON array of slugs
  metadata TEXT,            -- JSON blob
  feedback_score REAL,      -- Helpful/Harmful signal
  created_at TIMESTAMP
);
```

### II. Semantic Search

- **Local Embeddings**: Communicates with Ollama or local LLM providers to generate vector representations.
- **Similarity Search**: Performs cosine similarity in JavaScript for fast, dependency-free retrieval.
- **Intent Boosting**: The `memory_lane_find` tool adjusts scores based on the query intent (e.g., boosting `correction` when the user expresses frustration).

## 4. Extraction Mechanism

The extraction is triggered by session lifecycle events (`session.idle`, `session.deleted`).

1. Intercepts session events to detect idle state.
2. Spawns the `chief-of-staff/memory-catcher` subagent via the skill-based agent infrastructure.
3. The agent distills the session transcript into structured taxonomy entries.
4. Entries are persisted via the `memory_lane_store` tool.

---

_Module Version: 1.2.0_
