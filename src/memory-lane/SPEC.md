# Memory Lane: Semantic Knowledge Module (v4.1)

Memory Lane provides a persistent knowledge sidecar for all agents, capturing cross-session learnings and enabling semantic discovery.

## 1. Data Flow

The learning lifecycle follows a "Capture -> Vectorize -> Inject" pattern.

```
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

---

## 2. Data Schemas (v4.1)

### 2.1 Memory Entry (Database)

Memories are stored in a SQLite database (default: `~/.opencode/memories.db`).

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  metadata TEXT,            -- JSON blob (MemoryLaneMetadata)
  collection TEXT DEFAULT 'memory-lane',
  tags TEXT,                -- JSON array
  embedding BLOB,           -- F32 vector (mxbai-embed-large-v1, 1024 dims)
  decay_factor REAL DEFAULT 1.0,
  valid_from TEXT,
  valid_until TEXT,
  superseded_by TEXT,
  auto_tags TEXT,
  keywords TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 2.2 Memory Metadata (`MemoryLaneMetadata`)

```typescript
const MemoryLaneMetadataSchema = z.object({
  // Version tracking
  lane_version: z.string(),

  // Taxonomy classification
  memory_type: z.enum([
    'correction', // User behavior correction (High priority)
    'decision', // Explicit choice (High)
    'commitment', // User preference/commitment (High)
    'insight', // Non-obvious discovery (Medium)
    'learning', // New knowledge (Medium)
    'confidence', // Strong signal (Medium)
    'pattern_seed', // Repeated behavior (Lower)
    'cross_agent', // Relevant to other agents (Lower)
    'workflow_note', // Process observation (Lower)
    'gap', // Missing capability (Lower)
  ]),

  // Entity associations
  entity_slugs: z.array(z.string()).default([]),
  entities: z.array(z.any()).default([]),

  // Confidence metrics
  confidence_score: z.number().min(0).max(100).default(70),
  decay_factor: z.number().min(0).max(1).default(1.0),

  // Source and provenance
  source_chunk: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // Feedback loop
  feedback_score: z.number().optional().default(1.0),
  feedback_count: z.number().optional().default(0),

  // Temporal validity
  valid_from: z.string().nullable(), // ISO 8601 timestamp
  valid_until: z.string().nullable(), // ISO 8601 timestamp

  // Supersession chains (knowledge evolution)
  supersedes: z.array(z.string()).nullable(),
  superseded_by: z.string().nullable(),

  // Observation tracking
  times_observed: z.number().optional().default(1),
  first_observed_at: z.string().optional(),
  last_observed_at: z.string().optional(),

  // Access tracking (for decay)
  access_count: z.number().nullable().default(0),
  last_accessed_at: z.string().nullable(),
});

type MemoryLaneMetadata = z.infer<typeof MemoryLaneMetadataSchema>;
```

### 2.3 Memory Search Result

```typescript
interface MemorySearchResult {
  id: string;
  content: string;
  score: number; // Final relevance score
  collection: string;
  metadata: MemoryLaneMetadata;
  effective_confidence: number; // After decay applied
  decay_factor: number;
}
```

---

## 3. Learning Taxonomy (Priority Weights)

Higher weight = higher relevance in default ranking.

| Type            | Weight | Description                              |
| :-------------- | :----- | :--------------------------------------- |
| `correction`    | 1.0    | Direct user feedback ("No, use X not Y") |
| `decision`      | 1.0    | Architectural choices                    |
| `commitment`    | 1.0    | User preferences                         |
| `insight`       | 0.7    | Non-obvious discoveries                  |
| `learning`      | 0.7    | New knowledge acquired                   |
| `confidence`    | 0.7    | Strong signals                           |
| `pattern_seed`  | 0.4    | Repeated behaviors                       |
| `cross_agent`   | 0.4    | Relevant to other agents                 |
| `workflow_note` | 0.4    | Process observations                     |
| `gap`           | 0.4    | Missing capabilities                     |

---

## 4. Storage Architecture

### 4.1 Vector Embeddings

- **Model**: `mixedbread-ai/mxbai-embed-large-v1` (1024 dimensions)
- **Provider**: Local lm-studio instance (`http://127.0.0.1:1234`)
- **Auto-start**: On macOS, attempts to launch LM Studio automatically.

### 4.2 Semantic Search Algorithm

1. **Query**: Generate embedding for search query.
2. **Fetch**: Load all memories from collection.
3. **Score**: Calculate cosine similarity for each.
4. **Filter**: Apply decay factor, taxonomy weight, and feedback score.
5. **Rank**: Sort by final score and return top N results.

```typescript
// Scoring formula
finalScore =
  cosineSimilarity(query, memory) *
  PRIORITY_WEIGHTS[memory_type] *
  decay_factor *
  feedback_score *
  (intent_boost ? 1.15 : 1.0);
```

### 4.3 Temporal Decay

Memories decay based on age and access patterns:

| Last Access | Decay Factor   |
| :---------- | :------------- |
| < 7 days    | 1.0 (no decay) |
| 7-30 days   | 0.8 (light)    |
| 30-90 days  | 0.6 (moderate) |
| 90+ days    | 0.4 (heavy)    |

---

## 5. Extraction Mechanism

The extraction is triggered by session lifecycle events (`session.idle`, `session.deleted`).

### 5.1 Extraction Flow

```
1. Hook detects session.idle or session.deleted
2. Spawn chief-of-staff/memory-catcher subagent
3. Agent analyzes transcript for patterns
4. Structured memories sent to memory_lane_store tool
5. Embeddings generated and persisted to SQLite
```

### 5.2 Feedback Loop

Users can rate memories as helpful or harmful:

```typescript
// Helpful: Increase feedback_score by 10%
memory.feedback_score *= 1.1;

// Harmful: Decrease feedback_score by 50%
memory.feedback_score *= 0.5;
```

Higher feedback scores boost memory relevance in future searches.

---

## 6. Configuration

| Setting             | Default                              | Description                  |
| :------------------ | :----------------------------------- | :--------------------------- |
| `dbPath`            | `~/.opencode/memories.db`            | SQLite database location     |
| `embeddingModel`    | `mixedbread-ai/mxbai-embed-large-v1` | Vector embedding model       |
| `lmStudioUrl`       | `http://127.0.0.1:1234`              | lm-studio API endpoint       |
| `minScoreThreshold` | 0.2 (0.15 with entity filter)        | Minimum similarity to return |

---

_Module Version: 4.1.0_
