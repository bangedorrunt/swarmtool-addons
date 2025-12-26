# Memory Lane: Andy's Memory System

*Last Updated: 2025-12-20*

A comprehensive guide to how Memory Lane works, for anyone building AI agents with persistent memory.

## Overview

Memory Lane allows Claude Code sessions to build context over time. Instead of each conversation starting fresh, the system:

1. **Extracts** learnings from completed sessions
2. **Stores** them with rich metadata and vector embeddings
3. **Retrieves** relevant memories during new sessions via dual search
4. **Learns** from user feedback to improve relevance

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│ Memory Catcher   │────▶│   PostgreSQL    │
│    Session      │     │   (extraction)   │     │  + pgvector     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  New Session    │◀────│ Context Hooks    │◀─────────────┘
│  (with context) │     │  (retrieval)     │
└─────────────────┘     └──────────────────┘
```

---

## Opencode Integration (New)

Memory Lane is now integrated with the Opencode Swarm Plugin to provide enhanced learning and coordination capabilities.

### 1. Swarm Plugin Integration
- **Outcome Tracking**: Uses `swarm_record_outcome` to feed success/failure signals back into the memory system.
- **Pattern Maturity**: Memories move from `candidate` to `proven` based on successful swarm completions.
- **CASS Search**: Retrieval now includes searching cross-agent session history via `cass_search` as an additional context layer.

### 2. Verification Gate (UBS)
- Every memory extraction process is followed by a `ubs_scan` to ensure no sensitive data (keys, secrets) or invalid code snippets are stored.
- Memory extraction fails if `ubs_scan` detects critical security issues in the `source_chunk`.

---

## 1. Memory Extraction

### When It Happens

After each Claude Code session completes, the **memory-catcher agent** processes the transcript.

### What Gets Extracted

The system identifies 10 types of memories, prioritized by value:

| Priority | Type | Description |
|----------|------|-------------|
| High | `correction` | User corrected the agent's behavior |
| High | `decision` | Explicit choice made with reasoning |
| High | `commitment` | User expressed preference or commitment |
| Medium | `insight` | Non-obvious discovery or connection |
| Medium | `learning` | New knowledge gained |
| Medium | `confidence` | Strong confidence in approach/outcome |
| Lower | `pattern_seed` | Repeated behavior worth formalizing |
| Lower | `cross_agent` | Info relevant to other agents |
| Lower | `workflow_note` | Process observation |
| Lower | `gap` | Missing capability or limitation |

### Extraction Triggers

The system pays special attention to "surprise moments":

- **Recovery patterns**: Error → workaround → success
- **User corrections**: Agent did X, user said "no, do Y instead"
- **Enthusiasm signals**: Positive user reactions
- **Repeated requests**: Same workflow executed multiple times

### Memory Structure

Each memory includes:

```typescript
{
  id: string;                    // UUID
  type: MemoryType;              // From list above
  category: string;              // Domain: email, task, code, etc.
  title: string;                 // Brief summary (max 500 chars)
  content: string;               // Full description

  // For semantic search
  source_chunk: string;          // Verbatim transcript excerpt
  embedding: vector(1024);       // mxbai-embed-large via Ollama

  // Relationships
  related_entities: [{
    type: 'person' | 'project' | 'business' | ...;
    raw: string;                 // Original mention ("Neal Brown")
    slug: string;                // Resolved ID ("brown-neal")
    resolved: boolean;           // Was it matched?
  }];
  target_agents: string[];       // Which agents should see this

  // Confidence & evidence
  confidence_score: number;      // 0-100
  reasoning: string;             // Why this was extracted
  evidence: object[];            // Supporting facts

  // Observation tracking
  times_observed: number;        // How many times seen
  recall_count: number;          // How many sessions recalled it
  first_observed_at: datetime;
  last_observed_at: datetime;
}
```

### Entity Resolution

Related entities go through a resolution process:

1. **Extract raw mentions** from transcript ("Neal Brown", "Indy Hall")
2. **Match against known entities** in relationships/businesses directories
3. **Two-pass matching**:
   - Pass 1: Exact full name match
   - Pass 2: Fuzzy first name match (with ambiguity detection)
4. **Track resolution status** - unresolved entities flagged for manual review

---

## 2. Memory Storage

### Database Schema

PostgreSQL with pgvector extension for vector similarity search.

**memories table:**
- Core fields (id, type, category, title, content)
- JSONB fields for complex data (related_entities, evidence, alternatives)
- Vector field for embeddings (1024 dimensions)
- Timestamps for observation tracking

**session_recalls table:**
- Links memories to sessions where they were surfaced
- Tracks: source (entity-match vs semantic), similarity score, search query
- Enables persistence across page refreshes

**memory_feedback table:**
- Stores thumbs up/down on each memory per session
- Includes query that surfaced it (for analysis)
- Influences future retrieval ranking

### Key Query Patterns

The Memory model includes scopes for common queries:

```php
Memory::ofType(['decision', 'correction'])
  ->withEntity('person', 'brown-neal')
  ->observedAtLeast(2)
  ->hasEmbedding()
  ->get();
```

---

## 3. Memory Retrieval (The Smart Part)

### Two-Hook Architecture

Memories are injected at two points during Claude Code sessions:

#### Hook 1: UserPromptSubmit

Runs when the user sends a message. Implements **dual retrieval**:

**A. Entity-Based Retrieval (Hybrid)**

The entity retrieval uses a hybrid approach: filter by entity, then rank by query relevance.

```
User prompt: "What events does Indy Hall have coming up?"
                                              ↓
                              Entity extraction: "Indy Hall"
                                              ↓
                              Match against businesses DB
                                              ↓
                              Found: business:indy-hall
                                              ↓
                              Filter memories with this entity
                                              ↓
                              Rank by semantic similarity to query
                                              ↓
                              Return top matches above 0.4 threshold
```

**Why hybrid?** Without query-based ranking, mentioning "Indy Hall" would return *any* memory tagged with that entity - checkin counts, website notes, unrelated meetings. With hybrid retrieval, only memories semantically relevant to "events coming up" are returned.

- High-precision entity filter (exact matches only)
- Semantic ranking within filtered set
- Handles ambiguity ("Mark" → multiple Marks? Ask user to clarify)
- Excludes common words that happen to be names (`will`, `may`, `can`)
- Falls back to confidence/recency ranking if embedding fails

**B. Pure Semantic Search (Fallback)**

When no entities are detected in the query, the system falls back to pure semantic search:

```
User prompt: "How should I handle email filtering?"
                                              ↓
                              No entities detected
                                              ↓
                              Generate embedding for query
                                              ↓
                              Vector similarity search (0.5 threshold)
                                              ↓
                              Apply query-aware type boosting
                                              ↓
                              Return top matches
```

This ensures queries without named entities still retrieve relevant memories.

### Query-Aware Type Boosting

The system detects intent keywords in queries and boosts matching memory types by 15%:

| Keywords | Types Boosted |
|----------|---------------|
| decision, decided, chose, choice | `decision` |
| preference, prefer, like | `commitment`, `correction`, `decision` |
| always, usually | `commitment`, `pattern_seed` |
| mistake, wrong, error | `correction`, `gap` |
| issue, problem | `correction`, `gap`, `learning` |
| pattern, habit, routine | `pattern_seed`, `commitment` |
| learned, realized, discovered | `learning`, `insight` |

**Example:** Query "What mistakes have we made?" detects "mistakes" → boosts `correction` and `gap` types. A correction memory at 65% base similarity becomes 80% after the 15% boost, rising above other results.

### The Re-Ranking Algorithm

Raw semantic search results go through multi-signal re-ranking:

| Signal | Weight | Description |
|--------|--------|-------------|
| Vector similarity | 60% | Cosine similarity from embedding |
| Recency | 10% | Exponential decay over 4 weeks |
| Confidence score | 15% | From extraction (0-100 → 0-1) |
| Observation count | 10% | How many times recalled |
| Type boost | 5% | +1 for correction/decision/commitment |
| Query-aware type boost | +15% | When query keywords match memory type |
| Keyword overlap | +10% bonus | High-value keywords matched |

**Adaptive similarity floor:**
- Pure semantic (no entities): 0.50 minimum similarity
- Entity + query hybrid: 0.40 minimum similarity
- Technical queries: 0.55 (allows more recall for code topics)

### Feedback Integration

User feedback directly influences retrieval:

- **Positive feedback**: +10% boost to similarity score
- **Negative feedback**: Graduated penalty
  - 1-2 negative: 0.9x (light)
  - 3-4 negative: 0.7x (moderate)
  - 5+ negative: 0.5x (heavy)

This allows highly relevant memories to survive some negative feedback while suppressing consistently unhelpful ones.

#### Hook 2: PostToolUse

Runs when Claude reads/edits files in personal-data directories:

```
Claude reads: /personal-data/relationships/contacts/brown-neal.md
                                              ↓
                              Extract entity from path: person:brown-neal
                                              ↓
                              Semantic search with file context
                                              ↓
                              Inject additional relevant memories
```

This catches cases where the entity wasn't mentioned by the user but Claude is working with their data.

---

## 4. Memory UI (Memory Lane)

### What Users See

When memories are injected, the UI shows a "Memory Lane" card:

```
┌──────────────────────────────────────────────────┐
│ 🧠 3 memories  semantic                          │
├──────────────────────────────────────────────────┤
│ [Decision] 79%                            👍 👎  │
│ User chose full memory database replacement      │
│ 16h ago · recalled 3m                            │
├──────────────────────────────────────────────────┤
│ [Insight] 67%                             👍 👎  │
│ Andy memory system uses hybrid retrieval         │
│ 2d ago · recalled now                            │
└──────────────────────────────────────────────────┘
```

### Features

- **Type badges**: Color-coded by memory type
- **Source indicators**: Entity match vs semantic search
- **Match quality**: Percentage for semantic, "Mentioned" for entity
- **Timestamps**: When formed, when recalled
- **Feedback buttons**: Thumbs up/down on each memory
- **Expandable content**: Click to see full memory content
- **Sorting**: Most recently recalled first

### Session Durability

Recalls are persisted to the database, so:
- Memories survive page refresh
- Same session on different devices shows same Memory Lane
- Historical record of what was surfaced when

---

## 5. Embedding Infrastructure

### Model Choice

**mxbai-embed-large** via Ollama
- 1024 dimensions
- Good balance of quality and speed
- Self-hosted (no API costs)

### What Gets Embedded

Priority order for embedding text:

1. **source_chunk** (preferred): Verbatim transcript excerpt
   - Contains user's actual language
   - Best for matching future queries
2. **Fallback**: title + content + reasoning + alternatives
   - Used for legacy memories or backfill

### Vector Storage

PostgreSQL with pgvector extension:

```sql
CREATE TABLE memories (
  ...
  embedding vector(1024),
  embedded_at timestamp
);

CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops);
```

### Similarity Search

```sql
SELECT *, 1 - (embedding <=> query_embedding) as similarity
FROM memories
WHERE embedding IS NOT NULL
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

---

## Key Design Decisions

### 1. Hybrid Entity Retrieval

Entity matching alone is too broad - mentioning "Indy Hall" would return every memory that happens to mention it. Pure semantic search misses the precision of knowing exactly who/what is being discussed. The hybrid approach gets both: filter to the entity, then rank by query relevance.

### 2. Re-Ranking Over Raw Similarity

Raw vector similarity returns false positives. Multi-signal re-ranking with recency, confidence, and feedback dramatically improves relevance.

### 3. Source Chunk Over Summary

Embedding the user's actual words (source_chunk) produces better matches than embedding a cleaned-up summary. User queries will use similar language.

### 4. Feedback as Signal, Not Filter

Negative feedback reduces ranking but doesn't eliminate memories. A memory might be unhelpful for one query type but perfect for another.

### 5. Session Durability

Storing recalls in the database (not just frontend state) enables cross-device continuity and historical analysis.

### 6. Ambiguity Detection

When entity matching is uncertain (multiple "Marks"), the system asks for clarification rather than guessing wrong.

### 7. Pure Semantic Fallback

When no entities are detected, the system doesn't give up - it falls back to pure semantic search. This handles queries like "How do I usually handle X?" that contain no named entities but still deserve context.

### 8. Query-Aware Type Boosting

Rather than treating all memory types equally, the system detects intent keywords and boosts relevant types. Asking about "mistakes" surfaces corrections; asking about "decisions" surfaces decision memories. This closes the gap between what users ask and what they mean.

---

## Practical Examples & Test Scenarios

### Example 1: Hybrid Entity Retrieval in Action

**Prompt:** "What events does Indy Hall have coming up?"

**Without hybrid (entity-only):**
```
❌ Memory: "Indy Hall checkin count reached 847 this month"
❌ Memory: "Website copy for indyhall.org updated"
❌ Memory: "Alex prefers meeting in the Boardroom at Indy Hall"
```
All technically mention Indy Hall, but none are about events.

**With hybrid (entity + query ranking):**
```
✅ Memory: "Drink & Draw events happen every Tuesday at Indy Hall"
✅ Memory: "User scheduled Happy Hour for December community event"
```
Filtered to Indy Hall, ranked by relevance to "events coming up".

---

### Example 2: Correction Memory Recall

**Session 1 (memory formed):**
> User: "Send an email to Amy"
> Claude: Drafts formal email
> User: "No, Amy and I are casual - use a friendly tone"

**Memory extracted:**
```json
{
  "type": "correction",
  "title": "Amy Hoy prefers casual, friendly email tone",
  "related_entities": [{"type": "person", "slug": "hoy-amy"}],
  "confidence_score": 92
}
```

**Session 2 (memory recalled):**
> User: "Help me reply to Amy's email"

Memory Lane surfaces the correction. Claude drafts casual tone without being told.

---

### Example 3: Cross-Session Pattern Recognition

**Session 1:** User defers email to Friday
**Session 2:** User defers different email to Friday
**Session 3:** User defers third email to Friday

**Memory extracted:**
```json
{
  "type": "pattern_seed",
  "title": "User batches email follow-ups to Fridays",
  "times_observed": 3
}
```

Next time user asks about email timing, this pattern surfaces.

---

### Example 4: Query-Aware Type Boosting

**Prompt:** "What mistakes have we made with the memory system?"

**Without type boosting:**
```
insight: Andy memory system uses hybrid retrieval (66%)
learning: MCP health server needed restart after changes (65%)
decision: User chose full memory database replacement (64%)
```
General matches, not specifically about mistakes.

**With type boosting (correction/gap +15%):**
```
correction: User wants sequential memory processing, not concurrent (81%)  ← was 66%
gap: Memory selection reasoning not surfaced in output (80%)               ← was 65%
gap: No explicit reasoning chains in memories (80%)                        ← was 65%
correction: Delete ALL memories before backfill, not just test (79%)       ← was 64%
```
Corrections and gaps rise to the top because "mistakes" triggered the boost.

---

### Test Scenarios to Try

These prompts exercise different retrieval paths:

#### Entity + Query Combinations
| Prompt | Tests |
|--------|-------|
| "What do I know about Neal's preferences?" | Person entity + preference memories |
| "Any decisions about the Stacking the Bricks website?" | Business entity + decision type |
| "What events has GoodSomm hosted?" | Less-frequent entity + event context |

#### Pure Semantic (No Entities)
| Prompt | Tests |
|--------|-------|
| "How do I usually handle newsletter scheduling?" | Workflow memory retrieval |
| "What's my approach to email triage?" | Process/pattern memories |
| "Any past issues with MCP servers?" | Technical troubleshooting context |

#### Ambiguity & Edge Cases
| Prompt | Tests |
|--------|-------|
| "What did Mark say about the project?" | Multiple Marks - should ask for clarification |
| "Update the website" | Which website? Tests disambiguation |
| "Remind me about that thing from last week" | Vague temporal - tests recency weighting |

#### Feedback Impact Testing
| Experiment | Method |
|------------|--------|
| Suppress irrelevant memory | Give 5+ thumbs down, verify reduced ranking |
| Boost helpful memory | Give thumbs up, verify it surfaces more readily |
| Override negative | Give thumbs up after prior negative, check recovery |

#### Cross-Entity Queries
| Prompt | Tests |
|--------|-------|
| "What connections exist between Indy Hall and Stacking the Bricks?" | Multi-entity retrieval |
| "Who from the 10k community has attended Indy Hall events?" | Cross-reference entities |

#### Type-Specific Retrieval
| Prompt | Tests |
|--------|-------|
| "What have I decided about X?" | Should prioritize decision-type memories |
| "What mistakes have we made with Y?" | Should surface corrections and gaps |
| "What patterns have emerged in Z?" | Should find pattern_seeds |

---

### Real Memory Examples

These are actual memories from the system:

**Decision Memory:**
```
Type: decision
Title: User chose full memory database replacement over incremental
Content: When migrating from JSON file storage to PostgreSQL, user
         explicitly chose to start fresh rather than migrate existing
         memories. Reasoning: "clean slate, old memories were noisy"
Confidence: 85
Entities: [project:andy-core]
```

**Correction Memory:**
```
Type: correction
Title: Don't use ellipses in messages - comes across as passive aggressive
Content: User corrected communication style preference. Sentences
         should end with periods, not trailing off with "..."
Confidence: 95
Entities: [agent:andy]
```

**Insight Memory:**
```
Type: insight
Title: Hybrid retrieval dramatically improves entity search relevance
Content: Entity-only retrieval returned too many false positives.
         Adding semantic ranking within entity matches reduced noise
         from ~15 irrelevant results to 2-3 highly relevant ones.
Confidence: 78
Entities: [project:andy-core, feature:memory-lane]
```

---

## Implementation Checklist

If you're building a similar system:

- [ ] **Session storage**: Store transcripts as JSONL with type/message/timestamp
- [ ] **Extraction prompt**: Detailed instructions with memory type hierarchy and surprise triggers
- [ ] **Entity database**: Directory of known people/businesses with slugs
- [ ] **Embedding model**: Self-hosted recommended (Ollama) for cost/privacy
- [ ] **Vector storage**: PostgreSQL + pgvector, or dedicated vector DB
- [ ] **Hybrid retrieval**: Entity filter + semantic ranking within matches
- [ ] **Pure semantic fallback**: When no entities detected, fall back to semantic search
- [ ] **Query-aware type boosting**: Detect intent keywords, boost matching memory types
- [ ] **Feedback loop**: Track which query surfaced each result
- [ ] **Durability**: Persist recalls to database, not just UI state
- [ ] **Two hooks**: User prompt submit + tool use on relevant files

---

## Files Reference

| Component | Path |
|-----------|------|
| Memory Model | `andy-core/app/Models/Memory.php` |
| Memory Controller | `andy-core/app/Http/Controllers/Api/MemoryController.php` |
| Embedding Service | `andy-core/app/Services/EmbeddingService.php` |
| Memory Catcher Agent | `.claude/agents/memory-catcher.md` |
| Context Hook (UserPrompt) | `hooks/memories-context-hook.js` |
| Context Hook (ToolUse) | `hooks/assistant-memory-hook.js` |
| Memory Lane UI | `andy-core/resources/js/components/chat/components/MemoryLaneCard.tsx` |
| Entity Resolver | `hooks/entity-resolver.js` |
| Opencode Plugin | `plugin/swarm.ts` |
| Memory Tool | `tool/semantic-memory.ts` |

---

## Future Directions

- **Pattern graduation**: Auto-promote pattern_seeds to preferences after 3+ observations
- **Memory consolidation**: Merge similar memories to reduce noise
- **Agent-specific memories**: Filter by target_agents for specialized context
- **Decay function**: Reduce confidence over time for stale memories
