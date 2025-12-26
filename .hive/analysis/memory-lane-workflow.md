# Memory Lane System - Complete Swarm-Tools Workflow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Memory Lane System                             │
│                                                                      │
│  ┌──────────────────┐         ┌──────────────────┐                  │
│  │  Memory Lane    │         │   Swarm Mail     │                  │
│  │  (PGLite +      │◄──────►│   (Event Bus)    │                  │
│  │   Ollama Embeds) │         │                  │                  │
│  └──────────────────┘         └──────────────────┘                  │
│           ▲                           │                               │
│           │                           │                               │
│           │                           │                               │
│  ┌────────┴──────────────────────────┴────────────────────┐         │
│  │           Swarm-Tools Integration Layer               │         │
│  └──────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Workflow: From Task to Learning Storage

### Phase 1: Swarm Initialization (Coordinator)

```typescript
// Step 1: Initialize Swarm Mail (coordinator)
await swarmmail_init({
  project_path: "/Users/bangedorrunt/workspace/swarm-tools",
  task_description: "Swarm: Add OAuth authentication",
});

// Step 2: Query Past Learnings (Phase 2 of swarm-coordination)
const learnings = await semantic_memory_find({
  query: "oauth authentication patterns",
  limit: 5
});

// Step 3: Synthesize context for workers
const shared_context = `
## Relevant Past Learnings
${learnings.map(l => `- ${l.information}`).join('\n')}
`;
```

**What Happens:**
- Coordinator registers with Swarm Mail event bus
- Queries Memory Lane for relevant learnings about the task domain
- Past learnings injected into `shared_context` to prevent rediscovery

---

### Phase 2: Worker Spawn (Context Injection)

```typescript
// Coordinator spawns worker with relevant learnings
await Task({
  subagent_type: "swarm/worker",
  description: "Implement OAuth login flow",
  prompt: `
    You are working on: Add OAuth authentication to swarm-tools
    
    ## Past Learnings Relevant to This Task
    ${learnings.map(l => 
      `### ${l.type}\n${l.information}`
    ).join('\n\n')}
    
    ## Your Task
    ${taskDescription}
  `
});
```

**What Happens:**
- Each worker receives relevant learnings in their prompt
- Workers don't need to rediscover solutions
- ~2k tokens of learnings prevent ~20k tokens of trial-and-error

---

### Phase 3: Worker Survival Checklist (MANDATORY 9 Steps)

```typescript
// Worker executes 9-step survival checklist

// Step 1: INITIALIZE - Register with Swarm Mail
await swarmmail_init({
  project_path: "/Users/bangedorrunt/workspace/swarm-tools",
  task_description: "bd-123.4: Implement OAuth login",
});

// Step 2: QUERY LEARNINGS - Check what past agents learned
const relevantLearnings = await semantic_memory_find({
  query: "oauth login implementation",
  limit: 5
});

// Step 3: LOAD SKILLS - Get domain expertise
await skills_list();
await skills_use({ name: "python-development" }); // or "frontend-ui-ux-engineer"

// Step 4: RESERVE FILES - Claim exclusive ownership
await swarmmail_reserve({
  paths: ["src/auth/**", "src/features/oauth/**"],
  reason: "bd-123.4: Implementing OAuth login flow",
  ttl_seconds: 3600
});

// Step 5: DO WORK
// ... implement changes ...

// Step 6: REPORT PROGRESS - Every 30min or at milestones
await swarm_progress({
  project_key: "/Users/bangedorrunt/workspace/swarm-tools",
  agent_name: "BlueLake",
  bead_id: "bd-123.4",
  status: "in_progress",
  message: "OAuth login service 80% complete",
  progress_percent: 80
});

// Step 7: CHECKPOINT - Before risky operations
await swarm_checkpoint({
  bead_id: "bd-123.4",
  checkpoint_name: "pre-auth-refactor",
  reason: "About to refactor auth flow structure"
});

// Step 8: STORE LEARNINGS - Capture discoveries immediately
// ❌ WRONG - Wait until end (learnings get lost)
// ✅ CORRECT - Store immediately when discovered

// Worker discovers: "OAuth refresh tokens need 5min buffer"
await semantic_memory_store({
  information: "OAuth refresh tokens need 5min buffer to avoid race conditions. Without buffer, token refresh can fail mid-request if expiry happens between check and use.",
  metadata: "auth, oauth, tokens, race-conditions"
});

// Step 9: COMPLETE - Auto-releases, runs UBS, records outcome
await swarm_complete({
  project_key: "/Users/bangedorrunt/workspace/swarm-tools",
  agent_name: "BlueLake",
  bead_id: "bd-123.4",
  summary: "OAuth login flow implemented with JWT tokens and 5min refresh buffer",
  evaluation: "Implemented OAuth login with proper token refresh. Used 5min buffer to prevent race conditions. All tests passing.",
  files_touched: ["src/auth/service.ts", "src/auth/schema.ts", "src/features/oauth/login.tsx"],
  duration_ms: 180000,  // 3 minutes
  error_count: 0,
  retry_count: 0,
  success: true
});
```

**What Happens in Step 9 (`swarm_complete`):**

1. **Releases file reservations** automatically
2. **Runs verification gate** (typecheck, tests, lint)
3. **Records outcome** for learning system
4. **Triggers memory-catcher** via Swarm Mail event

---

### Phase 4: Memory-Catcher Auto-Extraction (Event-Driven)

**Event Flow:**

```
Worker → swarm_complete()
            ↓
    swarm_record_outcome() stores outcome in Hive
            ↓
Coordinator → swarmmail_send("memory-catcher-extract", {outcome})
            ↓
   Swarm Mail Queue (persists message)
            ↓
createSwarmCompletionHook() polls every 5 seconds
            ↓
    Finds message with subject "memory-catcher-extract"
            ↓
        Parses outcome data
            ↓
    Spawns memory-catcher skill (via Task)
            ↓
    Analyzes outcome for learnings
            ↓
    Calls memory-lane_store() for each learning
            ↓
    Acknowledges message (retry-safe)
```

**Code Implementation:**

```typescript
// Coordinator sends extraction event after worker completes (Phase 6 of swarm-coordination)
await swarmmail_send({
  to: ["memory-catcher"],
  subject: "memory-catcher-extract",
  body: JSON.stringify({
    transcript: fullWorkerConversation,
    summary: "OAuth login flow implemented",
    evaluation: "Implemented with proper token refresh. All tests passing.",
    files_touched: ["src/auth/service.ts", "src/auth/schema.ts"],
    duration_ms: 180000,
    error_count: 0,
    retry_count: 0,
    success: true,
    bead_id: "bd-123.4",
    agent_name: "BlueLake",
    project_key: "/Users/bangedorrunt/workspace/swarm-tools"
  }),
  importance: "normal",
  ack_required: false  // Non-blocking - doesn't halt swarm
});
```

**Memory-Catcher Processing:**

```typescript
// Memory-catcher skill analyzes outcome

// 1. Determine memory type from outcome
let memoryType;
if (outcome.error_count > 0 && outcome.success) {
  memoryType = "correction";  // Error → fix recovery
} else if (outcome.evaluation.includes("decision")) {
  memoryType = "decision";  // Architectural choice
} else if (outcome.evaluation.includes("unexpected")) {
  memoryType = "insight";  // Non-obvious discovery
}

// 2. Extract entities from file paths
const entities = EntityResolver.extractFromPaths(outcome.files_touched);
// "src/auth/service.ts" → ["feature:auth", "project:swarm-tools"]

// 3. Calculate confidence based on evidence
let confidence = 70;  // Base
if (outcome.duration_ms < 30000) confidence += 10;  // Quick success
if (outcome.error_count > 0 && outcome.success) confidence += 15;  // Clean recovery
confidence = Math.max(0, Math.min(100, confidence));

// 4. Store each extracted learning
await memory-lane_store({
  information: "OAuth login requires JWT tokens with 5min refresh buffer to prevent race conditions between token check and use.",
  type: memoryType,  // e.g., "decision"
  entities: entities,  // ["feature:auth", "project:swarm-tools"]
  tags: "oauth,authentication,tokens,jwt",
  confidence_score: confidence  // e.g., 85
});
```

---

### Phase 5: Learning Feedback Loop (Continuous Improvement)

#### Memory Lane Storage

```typescript
// Memory Lane adapter stores with taxonomy
await memoryLaneAdapter.storeLaneMemory({
  information: "OAuth refresh tokens need 5min buffer...",
  type: "decision",
  entities: ["feature:auth"],
  confidence_score: 85,
  tags: "oauth,auth,tokens"
});

// Stored metadata:
{
  lane_version: "1.0.0",
  memory_type: "decision",
  entity_slugs: ["feature:auth"],
  confidence_score: 85,
  tags: ["oauth", "auth", "tokens"],
  feedback_score: 1.0,  // Neutral initially
  feedback_count: 0
}
```

#### Semantic Search with Intent Boosting

```typescript
// Next worker queries Memory Lane
const result = await memoryLaneAdapter.smartFind({
  query: "I made a mistake with token refresh",  // "mistake" keyword
  limit: 5
});

// Internal processing:
// 1. Detect intent: "mistake" → boosts ["correction", "gap"]
// 2. Vector search retrieves 15 candidates
// 3. Re-rank results:
//    - Apply taxonomy priority weights (correction: 1.2, decision: 1.0)
//    - Apply intent boost (+15% to corrections)
//    - Apply feedback adjustment (helpful memories get +10%, harmful get -50%)
//    - Filter by entities if provided (strict match)
// 4. Return top 5 results

// Result:
{
  results: [
    {
      id: "mem_xyz123",
      content: "OAuth refresh tokens need 5min buffer...",
      score: 0.92,  // boosted by intent "mistake"
      metadata: {
        memory_type: "correction",
        entity_slugs: ["feature:auth"],
        feedback_score: 1.1  // +10% from helpful feedback
      }
    },
    // ... more results
  ],
  count: 5
}
```

#### User Feedback Adjusts Rankings

```typescript
// User marks memory as helpful
await memory_lane_feedback({
  id: "mem_xyz123",
  signal: "helpful"
});

// Internal processing:
// metadata.feedback_score *= 1.10;  // +10%
// metadata.feedback_count += 1;

// Future searches for "token refresh" will see this memory rank higher
```

---

## End-to-End Example

### Scenario: Multiple Workers on Epic

```
┌──────────────────────────────────────────────────────────────────────┐
│ EPIC: Add OAuth Authentication to swarm-tools                      │
└──────────────────────────────────────────────────────────────────────┘

Step 1: Coordinator initializes
├─ swarmmail_init() ✓
├─ semantic_memory_find("oauth") → 5 past learnings
└─ Synthesizes shared_context

Step 2: Decompose into 3 workers
├─ Worker 1: Backend auth service
├─ Worker 2: Frontend login component
└─ Worker 3: Integration tests

Step 3: Each worker executes survival checklist

Worker 1 (Backend auth service):
├─ Step 1: swarmmail_init() ✓
├─ Step 2: semantic_memory_find("auth service") → 3 learnings
│  └─ "Use JWT with 5min refresh buffer" (from past epic)
├─ Step 3: skills_use("python-development")
├─ Step 4: swarmmail_reserve(["src/auth/**"]) ✓
├─ Step 5: Implement OAuth service
├─ Step 6: swarm_progress(50%) → auto-checkpoint
├─ Step 7: Discover "Bun's crypto module faster than Node.js"
├─ Step 8: semantic_memory_store({
│     information: "Bun's crypto.createHash() is 2x faster than Node.js crypto for JWT generation. Use Bun native crypto in auth services.",
│     tags: "bun,performance,crypto,jwt"
│   }) ✓
├─ Step 9: swarm_complete({
│     success: true,
│     files_touched: ["src/auth/service.ts"],
│     duration_ms: 120000
│   }) ✓

Step 4: Coordinator sends memory-catcher event
├─ swarmmail_send("memory-catcher-extract", { outcome })
├─ Memory-catcher spawns (via Task)
│  ├─ Extracts learning: "Bun crypto faster for JWT"
│  ├─ Type: "insight" (unexpected discovery)
│  ├─ Entities: ["feature:auth", "project:swarm-tools"]
│  └─ memory-lane_store() ✓

Step 5: Worker 2 repeats process
├─ Learns from Worker 1's insight (query returns "Bun crypto faster")
├─ Implements login component
├─ Stores own learnings
└─ Completes

Step 6: Worker 3 repeats process
├─ Learns from both previous workers
├─ Writes integration tests
└─ Completes

Step 7: Epic completion
├─ Coordinator: hive_close(epic_id)
├─ Coordinator: swarmmail_send("memory-catcher-extract", { epic_summary })
│  └─ Memory-catcher extracts swarm-level learnings
└─ All workers' learnings now stored in Memory Lane

Result:
- 5+ new learnings stored
- All learnings tagged with entities
- Confidence scores calculated
- Available for future workers
```

---

## Key Integration Points

### 1. Tool Layer (Building Blocks)

| Tool | Used By | Purpose |
|-------|----------|---------|
| `memory-lane_find` | Coordinator (Phase 2), Workers (Step 2) | Search past learnings with intent boosting |
| `memory-lane_store` | Memory-catcher (auto), Workers (Step 8) | Store extracted learnings |
| `memory-lane_feedback` | Any agent | Adjust memory rankings based on feedback |
| `semantic-memory_find` | Coordinator (Phase 2), Workers (Step 2) | Legacy tool, now wraps Memory Lane |

### 2. Event Flow

```typescript
// Swarm Mail Event Flow

swarm_complete()                    // Worker completes
  ↓
swarm_record_outcome()              // Store outcome in Hive
  ↓
swarmmail_send()                   // Coordinator sends event
  { to: ["memory-catcher"], subject: "memory-catcher-extract" }
  ↓
Swarm Mail Queue                   // Persists until processed
  ↓
createSwarmCompletionHook()         // Polls every 5 seconds
  ↓
Memory-catcher spawns              // Via Task tool
  ↓
memory-lane_store()               // Stores extracted learnings
  ↓
swarmmail_acknowledge()           // Marks message as processed
```

### 3. Learning Loop

```
┌────────────────────────────────────────────────────────────────┐
│         Continuous Learning Loop                              │
└────────────────────────────────────────────────────────────────┘

Work Complete
      ↓
Extract Learnings (Memory-catcher)
      ↓
Store in Memory Lane (memory-lane_store)
      ↓
Next Worker Queries (memory-lane_find)
      ↓
Apply Past Learnings (prevents rediscovery)
      ↓
Work Faster (with fewer errors)
      ↓
User Feedback (memory-lane_feedback)
      ↓
Adjust Rankings (helpful +10%, harmful -50%)
      ↓
Better Future Retrieval
      ↑
      └─────────────┘
```

---

## Benefits

### For Workers

1. **Don't Rediscover Solutions:** Query Memory Lane before starting work
2. **Store Discoveries Immediately:** Step 8 prevents learning loss
3. **Context Optimization:** ~2k tokens of learnings vs ~20k trial-and-error

### For Coordinator

1. **Automatic Learning Extraction:** Event-driven via Swarm Mail
2. **Non-Blocking:** `ack_required: false` doesn't halt swarm
3. **Retry-Safe:** If memory-catcher fails, message persists in queue

### For System

1. **Continuous Improvement:** Each completion adds to knowledge base
2. **Intent-Aware Search:** "mistake" queries boost corrections
3. **Entity-Based Filtering:** Filter by project/feature/agent
4. **Adaptive Rankings:** User feedback adjusts future results

---

## File Structure

```
packages/opencode-swarm-plugin/
├── src/
│   ├── memory-lane/
│   │   ├── adapter.ts          # MemoryLaneAdapter with smartFind
│   │   ├── taxonomy.ts         # 10 memory types + priority weights
│   │   ├── resolver.ts         # EntityResolver for file paths
│   │   ├── hooks.ts           # createSwarmCompletionHook()
│   │   └── tools.ts          # memory-lane_find/store/feedback
│   └── memory.ts             # Base MemoryAdapter (semantic-memory_*)
│
└── global-skills/
    ├── swarm-coordination/
    │   └── SKILL.md          # Phase 2 (query), Step 2 (query), Step 8 (store), Phase 6 (send event)
    └── memory-catcher/
        └── SKILL.md          # Extraction logic + patterns
```
