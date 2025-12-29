# SPEC: Skill-Based Subagent System

> **Innovation**: Package AI behaviors as composable, on-demand workers spawned via `skill_agent` tool with isolated contexts and structured outputs.

---

## Executive Summary

The **Skill-Based Subagent System** represents a paradigm shift from monolithic agents to a **modular, composable architecture** where:

1. **Skills** = Domain expertise (e.g., "code-reviewer", "data-analyzer")
2. **Agents** = Specialized workers within a skill (e.g., "security-auditor", "performance-profiler")
3. **Orchestrators** = Coordinators that delegate to skill-based agents

**Key Innovation**: Each spawned agent gets its own context window, eliminating noise from unrelated tasks while maintaining coordination through durable messaging.

---

## Core Principles

### 1. Agent-as-Tool Pattern

```
Main Agent                    Skill Agent
    │                             │
    │  skill_agent({              │
    │    skill: "analyzer",       │
    │    agent: "security",       │
    │    prompt: "Check auth.ts"  │
    │  })                         │
    │ ──────────────────────────▶ │ (Isolated context)
    │                             │
    │  ◀────────────────────────  │
    │  { success: true,           │
    │    output: { ... } }        │  (Structured JSON)
    │                             │
```

- **No chat history** passed between agents
- **Structured output** (JSON) replaces conversation
- **Fresh context** per spawn (preserves LLM cache)

### 2. Context Partitioning

| Approach | Context per Task | Expertise Dilution |
|----------|-----------------|-------------------|
| Monolithic Agent | 128k tokens (all tasks) | High (mixed expertise) |
| Skill-Based | 8-16k tokens (focused) | None (specialized) |

### 3. Durable Coordination

Agents coordinate via **SwarmMail** (durable message bus), not shared memory:

```
Coordinator ──▶ swarmmail_send() ──▶ Worker
     ▲                                   │
     └────── swarmmail_inbox() ◀─────────┘
```

---

## Architecture

### Directory Structure

```
~/.config/opencode/skill/
└── <skill-name>/
    ├── SKILL.md              # Parent skill instructions
    └── agents/
        ├── <agent-a>/
        │   └── SKILL.md      # Agent A definition
        ├── <agent-b>/
        │   └── SKILL.md      # Agent B definition
        └── ...
```

### Agent Definition (SKILL.md)

```yaml
---
name: <skill>/<agent>
description: What this agent does
model: opencode/model-name
temperature: 0.1
tools:
  write: false     # Can create files?
  edit: false      # Can modify files?
  bash: true       # Can run commands?
metadata:
  type: executor|planner|validator|advisor
  parent: <skill>
  tool_access: [list, of, allowed, tools]
---

# Agent Instructions

[Markdown content with mission, constraints, output format]
```

---

## Innovative Workflow Patterns

### Pattern 1: Spec-Driven Development Agents

**Purpose**: Enforce structured development workflows with quality gates.

```
┌─────────────────────────────────────────────────────────────────┐
│                   SPEC-DRIVEN DEVELOPMENT                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SPEC AGENT (Creates structured requirements)                │
│     ┌──────────────────────────────────────────────────┐       │
│     │  Input: "Build auth system"                      │       │
│     │  Output: { spec: { requirements: [...],          │       │
│     │            acceptance_criteria: [...] } }        │       │
│     └──────────────────────────────────────────────────┘       │
│                           │                                     │
│                           ▼                                     │
│  2. PLANNER AGENT (Creates implementation plan)                 │
│     ┌──────────────────────────────────────────────────┐       │
│     │  Input: spec.requirements                        │       │
│     │  Output: { plan: { phases: [...],                │       │
│     │            files: [...], dependencies: [...] } } │       │
│     └──────────────────────────────────────────────────┘       │
│                           │                                     │
│                           ▼                                     │
│  3. VALIDATOR AGENT (Gates: checks against precedents)          │
│     ┌──────────────────────────────────────────────────┐       │
│     │  Input: plan + memory-lane precedents            │       │
│     │  Output: { verdict: "PASS" | "FAIL",             │       │
│     │            required_pivots: [...] }              │       │
│     └──────────────────────────────────────────────────┘       │
│                           │                                     │
│                           ▼ (if PASS)                           │
│  4. EXECUTOR AGENT (TDD implementation)                         │
│     ┌──────────────────────────────────────────────────┐       │
│     │  Input: plan.phases[current]                     │       │
│     │  Output: { files_touched: [...],                 │       │
│     │            tests_passed: true, diagnostics: 0 }  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Agents Required**:
- `sisyphus/spec-writer` - Creates structured specs
- `sisyphus/planner` - Designs implementation strategy
- `sisyphus/validator` - Quality gate (memory-lane integration)
- `sisyphus/executor` - TDD execution

---

### Pattern 2: Interactive Question Agents

**Purpose**: AI proactively asks clarifying questions instead of making assumptions.

```
┌─────────────────────────────────────────────────────────────────┐
│                   INTERACTIVE CLARIFICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User: "Build a dashboard"                                      │
│                           │                                     │
│                           ▼                                     │
│  INTERVIEWER AGENT (Extracts requirements)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  Instead of assuming, I need to clarify:                 │  │
│  │                                                          │  │
│  │  1. What data sources will the dashboard display?        │  │
│  │     □ Database (PostgreSQL, MySQL, etc.)                 │  │
│  │     □ API endpoints                                       │  │
│  │     □ Real-time feeds (WebSocket)                        │  │
│  │                                                          │  │
│  │  2. Who are the primary users?                           │  │
│  │     □ Developers (technical)                             │  │
│  │     □ Business users (charts, summaries)                 │  │
│  │     □ Executives (high-level KPIs)                       │  │
│  │                                                          │  │
│  │  3. What's the deployment target?                        │  │
│  │     □ Web (browser)                                       │  │
│  │     □ Electron (desktop)                                 │  │
│  │     □ Mobile (React Native)                              │  │
│  │                                                          │  │
│  │  [Wait for user response before proceeding]              │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Output: { questions: [...], user_responses: {...} }            │
│                                                                 │
│  → ONLY THEN spawn Planner with complete requirements           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Definition**:

```yaml
---
name: sisyphus/interviewer
description: Proactively clarifies requirements before assumptions
model: google/gemini-3-flash
tools:
  write: false
  edit: false
  bash: false
metadata:
  type: interviewer
  requires_user_input: true
---

# INTERVIEWER AGENT

You NEVER assume. You ALWAYS ask.

## Mission

1. Identify ambiguities in user request
2. Generate structured clarification questions
3. Wait for user input before proceeding
4. Pass complete requirements to downstream agents

## Output Format

{
  "clarifications_needed": true,
  "questions": [
    { "id": "q1", "category": "data", "question": "...", "options": [...] },
    { "id": "q2", "category": "users", "question": "...", "options": [...] }
  ],
  "assumptions_avoided": ["Assumed React", "Assumed PostgreSQL", ...]
}

## CONSTRAINT: Never proceed without explicit user answers.
```

---

### Pattern 3: Chief-of-Staff Agent

**Purpose**: Proactively manage direction, surface assumptions, and interview at decision points.

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHIEF-OF-STAFF PATTERN                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    CHIEF-OF-STAFF                         │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  STATE MANAGER                                      │  │ │
│  │  │  • Explicit Direction (user-provided)               │  │ │
│  │  │  • Tracked Assumptions (agent-made)                 │  │ │
│  │  │  • Decision Points (pending user input)             │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                           │                               │ │
│  │           ┌───────────────┼───────────────┐               │ │
│  │           ▼               ▼               ▼               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │ │
│  │  │ ASSUMPTION  │  │ STRATEGIC   │  │ FLEET       │       │ │
│  │  │ SURFACER    │  │ INTERVIEWER │  │ MANAGER     │       │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │ │
│  │        │                │                │                │ │
│  └────────┼────────────────┼────────────────┼────────────────┘ │
│           │                │                │                  │
│           ▼                ▼                ▼                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              ASYNC WORKER FLEET                         │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │  │
│  │  │Worker A │  │Worker B │  │Worker C │  │Worker D │    │  │
│  │  │(auth)   │  │(db)     │  │(api)    │  │(tests)  │    │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │  │
│  │                                                         │  │
│  │  Workers operate within:                                │  │
│  │  • Explicit direction parameters                        │  │
│  │  • Chief's tracked assumptions                          │  │
│  │  • Bounded file ownership                               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Chief-of-Staff Responsibilities**:

1. **Assumption Tracking**: Log every assumption workers make
2. **Periodic Surfacing**: At intervals, present accumulated assumptions to user
3. **Strategic Interviews**: At decision points, pause and ask user
4. **Fleet Coordination**: Manage parallel workers, resolve conflicts

**Agent Definition**:

```yaml
---
name: sisyphus/chief-of-staff
description: Proactive manager of direction, assumptions, and async worker fleet
model: google/gemini-3-pro
metadata:
  type: coordinator
  manages_fleet: true
  surfaces_assumptions: true
  conducts_interviews: true
  tool_access:
    - swarmmail_init
    - swarmmail_send
    - swarmmail_inbox
    - skill_agent
    - memory-lane_find
    - memory-lane_store
    - read
    - write
---

# CHIEF-OF-STAFF

You are the strategic manager between the user and the worker fleet.

## STATE YOU MAINTAIN

### 1. Explicit Direction (Source: User)
```json
{
  "goals": ["Build auth system with OAuth"],
  "constraints": ["No external databases", "TypeScript only"],
  "priorities": ["Security > Performance > UX"]
}
```

### 2. Tracked Assumptions (Source: Workers)
```json
{
  "assumptions": [
    { "worker": "auth-worker", "assumed": "Using JWT for sessions", "confidence": 0.8 },
    { "worker": "db-worker", "assumed": "SQLite for local storage", "confidence": 0.6 }
  ]
}
```

### 3. Decision Points (Pending)
```json
{
  "pending_decisions": [
    { "context": "OAuth provider", "options": ["Google", "GitHub", "Both"], "impact": "high" }
  ]
}
```

## PERIODIC SURFACING

Every 10 worker completions OR when `pending_decisions.length > 3`:

1. Pause worker spawning
2. Present assumption summary to user
3. Ask: "Should I continue with these assumptions?"
4. Update direction based on response
5. Resume workers with updated parameters

## STRATEGIC INTERVIEW TRIGGERS

Surface and interview when:
- Worker reports conflicting assumptions
- High-impact decision needed
- User explicitly asks for status
- Context suggests architectural pivot

## FLEET MANAGEMENT

- Track active workers via SwarmMail thread
- Resolve file conflicts between workers
- Escalate blockers to user
- Aggregate worker outputs for user review
```

---

## Implementation Roadmap

### Phase 1: Core Agent Framework (Week 1)

| Task | Deliverable | Status |
|------|------------|--------|
| Enhance `skill_agent` tool | Support `run_in_background`, structured output | 🔲 |
| Create interviewer agent | `sisyphus/interviewer` SKILL.md | 🔲 |
| Create spec-writer agent | `sisyphus/spec-writer` SKILL.md | 🔲 |
| Test agent composition | Integration tests for agent chains | 🔲 |

### Phase 2: Spec-Driven Workflow (Week 2)

| Task | Deliverable | Status |
|------|------------|--------|
| Spec → Plan → Validate → Execute flow | Full SDD pipeline | 🔲 |
| Quality gate integration | Validator with Memory Lane | 🔲 |
| Ledger state management | SISYPHUS_LEDGER.md updates | 🔲 |
| Context wipe resilience | Handoff/resume support | 🔲 |

### Phase 3: Chief-of-Staff (Week 3)

| Task | Deliverable | Status |
|------|------------|--------|
| Assumption tracker | State management for assumptions | 🔲 |
| Strategic interviewer | Decision point detection | 🔲 |
| Fleet manager | Parallel worker coordination | 🔲 |
| User surfacing protocol | Periodic assumption reviews | 🔲 |

### Phase 4: Integration & Polish (Week 4)

| Task | Deliverable | Status |
|------|------------|--------|
| SwarmMail integration | Durable coordination | 🔲 |
| Memory Lane learning | Cross-session wisdom | 🔲 |
| Dashboard visibility | Real-time fleet status | 🔲 |
| Documentation | User guides, examples | 🔲 |

---

## Lifecycle Hooks: Independence Strategy

### Question: OpenCode hooks vs Custom hooks vs swarm-tools?

**Recommendation: Use OpenCode hooks as the foundation**, with CCv2-inspired state persistence.

### Comparison

| Hook System | Pros | Cons |
|-------------|------|------|
| **OpenCode Hooks** | 24 production-ready hooks, plugin architecture, maintained | Tied to OpenCode runtime |
| **CCv2 Hooks** | Shell-based, IDE-agnostic, ledger/handoff patterns | Claude Code specific |
| **swarm-tools** | Event sourcing, durable stream | Heavier dependency |
| **Custom Hooks** | Full control | Maintenance burden |

### Recommendation: Layered Independence

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOOK LAYERING                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 3: Skill-Based Agents (YOUR INNOVATION)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  skill_agent() + SKILL.md + Ledger + SwarmMail          │   │
│  │  → Works with ANY hook system below                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  Layer 2: State Persistence (CCv2-INSPIRED)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SISYPHUS_LEDGER.md (continuity)                         │   │
│  │  handoff-*.md (context wipe recovery)                    │   │
│  │  → File-based, no runtime dependency                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  Layer 1: Hook Runtime (PLUGGABLE)                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │ OpenCode      │  │ Claude Code   │  │ Custom Shell      │   │
│  │ (current)     │  │ (CCv2-style)  │  │ (future)          │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What This Means

1. **Skill-Based Agents are hook-agnostic**: They use `skill_agent()` tool + file-based state
2. **State lives in files**: LEDGER.md and handoff.md work regardless of hook system
3. **OpenCode hooks for dev velocity**: Use existing session-recovery, preemptive-compaction, etc.
4. **No swarm-tools lock-in**: SwarmMail optional for coordination, not required

### OpenCode Hooks to Leverage

| Hook | Purpose | Integration |
|------|---------|-------------|
| `createSessionRecoveryHook` | Resume from errors | Restore agent state |
| `createPreemptiveCompactionHook` | Trigger before context full | Generate handoff |
| `createTodoContinuationEnforcer` | Ensure tasks complete | Block premature closure |
| `createContextWindowMonitorHook` | Track context % | Warn Chief-of-Staff |
| `createCompactionContextInjector` | Inject state after compaction | Resume from ledger |

### CCv2 Patterns to Adopt (File-Based)

| Pattern | Implementation | Independence |
|---------|---------------|--------------|
| **Continuity Ledger** | `.sisyphus/SISYPHUS_LEDGER.md` | Pure file, no runtime |
| **Auto-Handoff** | `handoff-{timestamp}.md` | Shell-triggerable |
| **TypeScript Preflight** | Run `tsc --noEmit` before edits | CLI-based |
| **Skill Hints** | Keyword → agent recommendations | Static config |

---

## Workflow Composition: Interoperability

### Question: Should workflows interact with each other?

**Yes.** Workflows should be **composable building blocks**, not isolated silos.

### Composition Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                  WORKFLOW COMPOSITION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ CHIEF-OF-STAFF   │ ◄─── Top-Level Orchestrator              │
│  │                  │                                          │
│  │  • Tracks all assumptions                                   │
│  │  • Interviews at decision points                            │
│  │  • Manages worker fleet                                     │
│  └────────┬─────────┘                                          │
│           │                                                     │
│           │ spawns/coordinates                                  │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SPEC-DRIVEN DEVELOPMENT                      │  │
│  │  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐     │  │
│  │  │  Spec  │→│ Planner │→│ Validator │→│ Executor │     │  │
│  │  └────────┘  └────────┘  └──────────┘  └──────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│           │                                                     │
│           │ can invoke at any stage                             │
│           ▼                                                     │
│  ┌──────────────────┐                                          │
│  │ INTERACTIVE      │ ◄─── Clarification on demand             │
│  │ QUESTION AGENTS  │                                          │
│  │                  │                                          │
│  │  • Spec unclear? → Interview user                           │
│  │  • Plan ambiguous? → Ask clarifying Qs                      │
│  │  • Assumption risky? → Surface to Chief-of-Staff            │
│  └──────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Interaction Scenarios

#### Scenario 1: Chief-of-Staff → SDD Pipeline

```
User: "Build auth system"
       │
       ▼
Chief-of-Staff: "Starting new epic. Spawning SDD pipeline."
       │
       ├──▶ sisyphus/spec-writer → Creates requirements
       │          │
       │          ▼ (assumption detected)
       │    sisyphus/interviewer: "Which OAuth providers?"
       │          │
       │          ▼ (user answers)
       │    Chief-of-Staff: Logs assumption resolution
       │
       ├──▶ sisyphus/planner → Creates implementation plan
       ├──▶ sisyphus/validator → Checks against precedents
       └──▶ sisyphus/executor → Implements with TDD
```

#### Scenario 2: SDD → Interactive → Chief

```
Executor hits ambiguity:
       │
       ▼
Executor: "Config structure unclear. Escalating."
       │
       ├──▶ sisyphus/interviewer: "Two options for config..."
       │          │
       │          ▼ (user chooses)
       │
       └──▶ Chief-of-Staff: Logs choice as explicit direction
                │
                ▼
           Executor resumes with clear parameters
```

#### Scenario 3: Parallel Workers with Assumption Tracking

```
Chief-of-Staff spawns 3 parallel executors:
       │
       ├──▶ Worker A (auth)  → Assumes JWT
       ├──▶ Worker B (db)    → Assumes SQLite  
       └──▶ Worker C (api)   → Assumes REST
       
After 10 completions, Chief-of-Staff surfaces:
       │
       ▼
"I've tracked 3 assumptions across your workers:
 1. JWT for sessions (Worker A, confidence: 0.8)
 2. SQLite for storage (Worker B, confidence: 0.6)
 3. REST over GraphQL (Worker C, confidence: 0.9)
 
Should I continue with these assumptions?"
```

### Composition API

```typescript
// Workflows can call each other via skill_agent
const result = await skill_agent({
  skill_name: "sisyphus",
  agent_name: "interviewer",
  prompt: "Clarify: Which database provider?",
});

// Chief-of-Staff can spawn SDD pipeline
const pipeline = await skill_agent({
  skill_name: "sisyphus",
  agent_name: "planner",
  prompt: JSON.stringify({
    spec: specResult.output,
    context: chiefState.assumptions,
  }),
});

// Workers report to Chief via SwarmMail
await swarmmail_send({
  to: ["chief-of-staff"],
  subject: "Assumption made",
  body: JSON.stringify({
    worker: "auth-executor",
    assumed: "Using bcrypt for password hashing",
    confidence: 0.85,
  }),
});
```

---

## skill_agent Tool Analysis & Improvements

### Current Implementation Review

```typescript
// Current: src/opencode/agent/tools.ts (76 lines)
skill_agent({
  skill_name: string,      // e.g., "sisyphus"
  agent_name: string,      // e.g., "planner"
  prompt: string,          // Task description
  run_in_background?: boolean  // Foreground (blocking) or background
})
→ { success: true, output/taskId } | { success: false, error, message }
```

### Identified Limitations

| Limitation | Impact | Solution Needed |
|------------|--------|-----------------|
| **No agent discovery** | Agents must guess available agents | `skill_list` tool |
| **No parallel spawn** | Sequential only, slow for map-reduce | `skill_spawn_batch` |
| **No result aggregation** | Must manually poll background tasks | `skill_gather` |
| **No context passing** | Limited to prompt string | Structured `context` arg |
| **No learning injection** | Agents start cold each session | Session start hook |

### Proposed Supporting Tools

#### 1. `skill_list` - Agent Discovery

```typescript
skill_list({
  skill?: string,          // Optional: filter by skill
  include_metadata?: boolean  // Include model, tools, etc.
})
→ {
  agents: [
    { 
      name: "sisyphus/planner",
      description: "Strategic design agent...",
      model: "gemini-3-flash",
      tool_access: ["read", "bash", "lsp_*"]
    },
    ...
  ]
}
```

**Use Case**: Chief-of-Staff discovers available specialists before delegation.

#### 2. `skill_spawn_batch` - Parallel Execution

```typescript
skill_spawn_batch({
  tasks: [
    { skill: "sisyphus", agent: "executor", prompt: "Implement auth" },
    { skill: "sisyphus", agent: "executor", prompt: "Implement db" },
    { skill: "sisyphus", agent: "executor", prompt: "Write tests" },
  ],
  wait?: boolean,  // true = block until all complete (default: false)
  timeout_ms?: number  // Max wait time
})
→ {
  task_ids: ["task-abc", "task-def", "task-ghi"],
  // If wait=true:
  results: [
    { task_id: "task-abc", success: true, output: "..." },
    ...
  ]
}
```

**Use Case**: MapReduce pattern for parallel document analysis.

#### 3. `skill_gather` - Collect Background Results

```typescript
skill_gather({
  task_ids: ["task-abc", "task-def"],
  timeout_ms?: number,  // Max wait (default: 60000)
  partial?: boolean     // Return completed even if some pending
})
→ {
  completed: [
    { task_id: "task-abc", success: true, output: "..." }
  ],
  pending: ["task-def"],
  failed: []
}
```

**Use Case**: Aggregate results from parallel workers.

#### 4. `skill_context` - Rich Context Injection

```typescript
// Enhanced skill_agent with structured context
skill_agent({
  skill_name: "sisyphus",
  agent_name: "executor",
  prompt: "Implement the next phase",
  context: {
    // Chief-of-Staff's tracked state
    explicit_direction: { goals: [...], constraints: [...] },
    assumptions: [{ assumed: "JWT", confidence: 0.8 }],
    
    // SDD pipeline state
    spec: { /* from spec-writer */ },
    plan: { /* from planner */ },
    
    // Memory Lane context
    relevant_memories: [/* from memory-lane_find */],
    
    // File context
    files_assigned: ["src/auth.ts"],
    ledger_snapshot: "..."
  }
})
```

**Use Case**: Agents receive rich context without prompt bloat.

---

## Self-Learning Workflow Pattern

### The Problem

Each new session starts "cold" - agents don't automatically benefit from past learnings:

```
Session 1: "Build auth" → Makes mistake X → Stores learning
Session 2: "Build auth" → ... repeats mistake X (didn't query Memory Lane)
```

### The Solution: Session Start Learning Injection

```
┌─────────────────────────────────────────────────────────────────┐
│              SELF-LEARNING WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SESSION START HOOK (Automatic)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Extract keywords from user's first message          │   │
│  │  2. Query Memory Lane: memory-lane_find({ query })      │   │
│  │  3. Inject relevant learnings into system prompt        │   │
│  │  4. Load SISYPHUS_LEDGER.md if exists                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  WORKING SESSION                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agents work with pre-loaded relevant memories          │   │
│  │  Chief-of-Staff tracks new assumptions                  │   │
│  │  Workers discover patterns (via trial/error)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  SESSION END HOOK (Automatic)                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Spawn sisyphus/memory-catcher agent                 │   │
│  │  2. Extract learnings from conversation                 │   │
│  │  3. Store via memory-lane_store with taxonomy           │   │
│  │  4. Update LEDGER if work ongoing                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  NEXT SESSION                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Automatically starts with relevant past learnings      │   │
│  │  Avoids repeating known mistakes                        │   │
│  │  Builds on proven patterns                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: Session Start Hook

```typescript
// Hook: createSessionLearningInjector
export function createSessionLearningInjector() {
  return {
    name: 'session-learning-injector',
    event: 'session_start',
    async execute(context: SessionContext) {
      // 1. Extract intent from first message
      const firstMessage = context.messages[0]?.content || '';
      const keywords = extractKeywords(firstMessage);
      
      // 2. Query Memory Lane for relevant learnings
      const learnings = await memory_lane_find({
        query: keywords.join(' '),
        limit: 10,
      });
      
      // 3. Load ledger if exists
      const ledgerPath = '.sisyphus/SISYPHUS_LEDGER.md';
      const ledger = existsSync(ledgerPath) 
        ? await readFile(ledgerPath, 'utf-8')
        : null;
      
      // 4. Build context injection
      const injection = buildLearningContext(learnings, ledger);
      
      // 5. Inject into system prompt
      return {
        systemPromptAddition: injection,
      };
    }
  };
}

function buildLearningContext(learnings: Memory[], ledger: string | null) {
  let context = '';
  
  if (learnings.length > 0) {
    context += `\n## Relevant Past Learnings\n`;
    context += `The following insights from previous sessions may help:\n\n`;
    
    for (const learning of learnings) {
      context += `- **${learning.type}**: ${learning.information}\n`;
      if (learning.confidence < 0.5) {
        context += `  ⚠️ Low confidence - verify before applying\n`;
      }
    }
  }
  
  if (ledger) {
    context += `\n## Continuity State\n`;
    context += `Previous work detected. Resume from SISYPHUS_LEDGER.md.\n`;
  }
  
  return context;
}
```

### Implementation: Session End Hook

```typescript
// Hook: createSessionLearningCapture
export function createSessionLearningCapture() {
  return {
    name: 'session-learning-capture',
    event: 'session_end',
    async execute(context: SessionContext) {
      // 1. Spawn memory-catcher to extract learnings
      const result = await skill_agent({
        skill_name: 'sisyphus',
        agent_name: 'memory-catcher',
        prompt: `
          Analyze this session transcript and extract actionable learnings.
          
          Categories to capture:
          - Corrections: Mistakes made and how they were fixed
          - Decisions: Important architectural/design choices
          - Patterns: Successful approaches to repeat
          - Anti-patterns: Approaches that failed
          
          Store each via memory-lane_store with appropriate type.
        `,
        context: {
          transcript_summary: context.summarize(),
          files_touched: context.getModifiedFiles(),
        }
      });
      
      // 2. Update ledger if ongoing work
      if (context.hasOngoingWork()) {
        await updateLedger(context);
      }
      
      return { learnings_captured: true };
    }
  };
}
```

### Learning Taxonomy Integration

```typescript
// Memory types for self-learning
type LearningType = 
  | 'correction'    // Mistake + fix
  | 'decision'      // Architectural choice + rationale
  | 'pattern'       // Successful approach
  | 'anti_pattern'  // Failed approach to avoid
  | 'preference'    // User preference discovered
  | 'constraint'    // Hard constraint discovered
  | 'insight'       // General insight

// Example stored learnings:
{
  type: 'anti_pattern',
  information: 'Using bcrypt sync in async handlers blocks event loop',
  entities: ['project:auth-service', 'library:bcrypt'],
  confidence: 0.95,
  timestamp: '2025-12-29T...'
}

{
  type: 'preference',
  information: 'User prefers Zod over io-ts for schema validation',
  entities: ['person:bangedorrunt'],
  confidence: 0.9,
  timestamp: '2025-12-29T...'
}
```

### Self-Correcting Feedback Loop

```
User says: "That's wrong" or "Not what I asked"
       │
       ▼
Chief-of-Staff detects negative feedback
       │
       ├──▶ memory-lane_store({
       │      type: 'correction',
       │      information: 'Original approach X failed because Y. Use Z instead.',
       │    })
       │
       └──▶ Update assumption confidence to 0.0 (block future use)

Next session mentions similar topic:
       │
       ▼
Session Start Hook queries Memory Lane
       │
       ▼
Correction surfaces: "Avoid X, use Z instead"
       │
       ▼
Agent avoids mistake before making it
```

---

## Proposed Tool Ecosystem

### Complete Tool Matrix

| Tool | Purpose | Workflow Pattern |
|------|---------|-----------------|
| **skill_agent** | Spawn single agent | All |
| **skill_list** | Discover available agents | Discovery |
| **skill_spawn_batch** | Parallel agent execution | MapReduce |
| **skill_gather** | Collect background results | Aggregation |
| **memory-lane_find** | Query past learnings | Self-Learning |
| **memory-lane_store** | Persist new learnings | Self-Learning |
| **memory-lane_feedback** | Adjust learning relevance | Adaptive |
| **swarmmail_send** | Inter-agent communication | Coordination |
| **ledger_update** | Persist continuity state | Resilience |

### Tool Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   TOOL ECOSYSTEM FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Session Start]                                                │
│       │                                                         │
│       ├──▶ memory-lane_find (load relevant learnings)           │
│       ├──▶ skill_list (discover available agents)               │
│       │                                                         │
│  [Planning]                                                     │
│       ├──▶ skill_agent(sisyphus/planner)                        │
│       ├──▶ skill_agent(sisyphus/validator)                      │
│       │                                                         │
│  [Execution - Parallel]                                         │
│       ├──▶ skill_spawn_batch([                                  │
│       │      { agent: executor, prompt: "auth" },               │
│       │      { agent: executor, prompt: "db" },                 │
│       │    ])                                                   │
│       │                                                         │
│       ├──▶ skill_gather(task_ids) ← wait for completion         │
│       │                                                         │
│  [Coordination]                                                 │
│       ├──▶ swarmmail_send(chief, "assumption made")             │
│       ├──▶ ledger_update(current_state)                         │
│       │                                                         │
│  [Session End]                                                  │
│       ├──▶ skill_agent(sisyphus/memory-catcher)                 │
│       └──▶ memory-lane_store(learnings)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

| Aspect | swarm-tools | Skill-Based System |
|--------|------------|-------------------|
| Agent Definition | Code in TypeScript | SKILL.md (declarative) |
| Spawning | `swarm_spawn_subtask()` | `skill_agent()` |
| Context | Shared event stream | Isolated per agent |
| Expertise | Generic workers | Specialized skill agents |
| User Interaction | Minimal | Interview-first (Chief-of-Staff) |
| Assumptions | Implicit | Tracked and surfaced |

---

## Success Metrics

1. **Context Efficiency**: 4x reduction in tokens per task
2. **User Alignment**: 80% fewer "I assumed wrong" corrections
3. **Parallel Execution**: 3+ workers running concurrently
4. **Recovery**: Zero-effort resume after context wipe
5. **Learning**: Cross-session pattern accumulation via Memory Lane

---

## Appendix: Existing Sisyphus Agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| `sisyphus/oracle` | Expert advisor (read-only analysis) | read |
| `sisyphus/planner` | Strategic designer | read, bash, LSP |
| `sisyphus/validator` | Quality gate (precedent check) | read, memory-lane |
| `sisyphus/executor` | TDD implementation | read, write, edit, bash |
| `sisyphus/explore` | Codebase search | read, grep, LSP |
| `sisyphus/librarian` | External research | gh, context7, websearch |
| `sisyphus/memory-catcher` | Learning extraction | memory-lane |
| `sisyphus/frontend-ui-ux-engineer` | UI/UX specialist | TBD |

---

*This SPEC represents the next evolution of the orchestrator module, building on the proof-of-concept in `src/orchestrator/sisyphus/`.*
