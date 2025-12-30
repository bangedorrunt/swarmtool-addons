# Orchestrator Module: Skill-Based Subagent System

> **The innovation**: Package AI behaviors as composable, on-demand workers spawned via `skill_agent` tool with isolated contexts, self-learning capabilities, and assumption tracking.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Makes This Unique](#what-makes-this-unique)
3. [Architecture Overview](#architecture-overview)
4. [Core Design Patterns](#core-design-patterns)
5. [Workflow Patterns](#workflow-patterns)
6. [Tool Ecosystem](#tool-ecosystem)
7. [Self-Learning System](#self-learning-system)
8. [Implementation Guide](#implementation-guide)
9. [Sample Code](#sample-code)
10. [Actionable Roadmap](#actionable-roadmap)

---

## Executive Summary

The Orchestrator Module implements a **Skill-Based Subagent System** that enables:

- **Resilient Orchestration**: Background supervisor for task health and auto-retry
- **Sisyphus Loop**: Self-healing task execution with adaptive intervals
- **LEDGER.md SSOT**: Project continuity via formal state projection
- **Modular Expertise**: Package AI behaviors as SKILL.md files
- **Isolated Contexts**: Each spawned agent gets fresh context (no pollution)
- **Self-Learning**: Automatic memory injection at session start, capture at end

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SKILL-BASED SUBAGENT SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    User Request                                                             │
│         │                                                                   │
│         ▼                                                                   │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │                    CHIEF-OF-STAFF                                │    │
│    │                                                                  │    │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│    │  │ Direction   │  │ Assumption  │  │ Fleet Manager           │  │    │
│    │  │ Tracker     │  │ Surfacer    │  │ (parallel workers)      │  │    │
│    │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │    │
│    │                                                                  │    │
│    └────────────────────────────┬─────────────────────────────────────┘    │
│                                 │                                          │
│              ┌──────────────────┼──────────────────┐                       │
│              │                  │                  │                       │
│              ▼                  ▼                  ▼                       │
│    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│    │   PLANNER    │   │  EXECUTOR    │   │  VALIDATOR   │                  │
│    │              │   │              │   │              │                  │
│    │  Research    │   │  TDD         │   │  Quality     │                  │
│    │  Blueprint   │   │  Implement   │   │  Gate        │                  │
│    └──────────────┘   └──────────────┘   └──────────────┘                  │
│              │                  │                  │                       │
│              └──────────────────┼──────────────────┘                       │
│                                 │                                          │
│                                 ▼                                          │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │                    MEMORY LANE                                   │    │
│    │                                                                  │    │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│    │  │ Session     │  │ Learning    │  │ Cross-Session           │  │    │
│    │  │ Start       │  │ Capture     │  │ Wisdom                  │  │    │
│    │  │ Injection   │  │ (End Hook)  │  │ Accumulation            │  │    │
│    │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │    │
│    │                                                                  │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What Makes This Unique

### 1. Declarative Agent Definition

Agents are defined in **SKILL.md** files, not code:

```markdown
---
name: chief-of-staff/planner
description: Strategic design agent
model: google/gemini-3-flash
metadata:
  type: planner
  tool_access: [read, bash, lsp_document_symbols, memory-lane_find]
---

# PLANNER AGENT

You are the Strategic Architect...
```

**Benefits:**
- Non-engineers can create agents
- Version control friendly (diff-able markdown)
- Runtime-swappable (no rebuild needed)

### 2. Context Partitioning

Each agent spawns with **isolated context**, eliminating pollution:

```
┌─────────────────────────────────────────────────────────────────┐
│                   CONTEXT PARTITIONING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MONOLITHIC APPROACH (Anti-Pattern):                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Single Agent (128k tokens)               │   │
│  │  [Security] [Performance] [Testing] [Docs] [Review] ... │   │
│  │  → All expertise mixed = context dilution                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SKILL-BASED APPROACH (This System):                            │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Coordinator (32k)    Worker A (8k)   Worker B (8k)      │ │
│  │  [orchestration]      [security]      [performance]       │ │
│  │  ┌─────────────────┐  ┌──────────┐   ┌──────────────┐     │ │
│  │  │ skill_agent()   │──▶│ Focused  │   │ Focused      │     │ │
│  │  │ skill_agent()   │──▶│ context  │   │ context      │     │ │
│  │  └─────────────────┘  └──────────┘   └──────────────┘     │ │
│  │  → Each worker: minimal, specialized context              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Self-Learning Loop

Agents automatically learn from past sessions:

```
Session 1: User says "No, use Zod not io-ts"
    │
    ▼
memory-catcher extracts: { type: 'preference', info: 'User prefers Zod' }
    │
    ▼
Session 2: Agent starts
    │
    ▼
Session Start Hook: memory-lane_find("schema validation") 
    │
    → Returns: "User prefers Zod over io-ts"
    │
    ▼
Agent uses Zod without being told
```

### 4. Assumption Surfacing (Chief-of-Staff)

Implicit decisions are tracked and periodically reviewed:

```
┌─────────────────────────────────────────────────────────────────┐
│              ASSUMPTION TRACKING                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Worker: "Implementing auth with JWT"                           │
│        │                                                        │
│        ▼                                                        │
│  Chief-of-Staff logs: { assumed: "JWT", confidence: 0.8 }       │
│                                                                 │
│  After 10 worker completions:                                   │
│        │                                                        │
│        ▼                                                        │
│  Chief surfaces to user:                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  "I've tracked 3 assumptions across your workers:        │   │
│  │   1. JWT for sessions (Worker A, confidence: 0.8)        │   │
│  │   2. SQLite for storage (Worker B, confidence: 0.6)      │   │
│  │   3. REST over GraphQL (Worker C, confidence: 0.9)       │   │
│  │                                                          │   │
│  │  Should I continue with these assumptions?"              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  If user says "No, use PostgreSQL":                             │
│        │                                                        │
│        ▼                                                        │
│  Chief: Updates direction + stores as preference                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### Layer Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYER ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 4: WORKFLOW PATTERNS                                           │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐  │ │
│  │  │ Spec-Driven Dev │ │ Interactive Q   │ │ Chief-of-Staff          │  │ │
│  │  │ (SDD Pipeline)  │ │ (User Interview)│ │ (Assumption Tracking)   │  │ │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 3: RESILIENT ORCHESTRATION                                     │ │
│  │  skill_agent() + Sisyphus Loop + Task Registry + LEDGER.md            │ │
│  │  → Supervisor watchdog ensures task health and auto-retry              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 2: STATE PERSISTENCE (SSOT)                                    │ │
│  │  LEDGER.md + Handoffs + Standalone Memory Lane                        │ │
│  │  → pure file-based/local storage, no swarm-tools locks                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 1: HOOK RUNTIME (PLUGGABLE)                                    │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐  │ │
│  │  │ OpenCode Hooks  │ │ Claude Code     │ │ Custom Shell Hooks      │  │ │
│  │  │ (development)   │ │ (CCv2-style)    │ │ (future)                │  │ │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
~/.config/opencode/skill/
└── chief-of-staff/                  # Skill directory
    ├── SKILL.md                     # Parent skill (kernel)
    └── agents/                      # Subagent directory
        ├── chief-of-staff/
        │   └── SKILL.md             # Assumption tracker + fleet manager
        ├── interviewer/
        │   └── SKILL.md             # Interactive question agent
        ├── spec-writer/
        │   └── SKILL.md             # Requirements extraction
        ├── planner/
        │   └── SKILL.md             # Strategic design
        ├── validator/
        │   └── SKILL.md             # Quality gate
        ├── executor/
        │   └── SKILL.md             # TDD implementation
        ├── memory-catcher/
        │   └── SKILL.md             # Learning extraction
        ├── oracle/
        │   └── SKILL.md             # Expert advisor
        ├── explore/
        │   └── SKILL.md             # Codebase search
        └── librarian/
            └── SKILL.md             # External research

.opencode/                           # Project state (SSOT)
├── LEDGER.md                        # Current state projection
├── handoff-*.md                     # Context wipe recovery files
└── registry.json                    # Persistent task registry state
```

---

## Resilient Orchestration: The Sisyphus Loop

The Orchestrator implements a **Self-Healing Execution Loop** managed by the **Task Supervisor**.

### 1. The Supervisor Watchdog
A background process that monitors active tasks in the `TaskRegistry`.
- **Adaptive Intervals**: Checks every 30s for simple tasks, up to 120s for high complexity.
- **Heartbeat Monitoring**: Agents send periodic `task_heartbeat` signals.
- **Auto-Retry**: If a task fails or times out, the supervisor re-spawns it (Sisyphus mechanism).

### 2. Task Registry
Internal state machine for all delegated tasks:
- `pending`: Queued for execution
- `running`: Active agent session
- `completed`: Result captured and stored
- `failed`/`timeout`: Trigger for retry or manual intervention

### 3. LEDGER.md Synchronization
Every state change in the loop is flushed to `LEDGER.md`:
- **Epics**: High-level objectives
- **Tasks**: Granular execution units
- **Learnings**: Patterns and Anti-patterns extracted from successful/failed runs

---

## Access Control & Security

The system implements **Hierarchical Access Control** to maintain session integrity:

1. **Namespace isolation**: Agents are addressed via `chief-of-staff/{agent}`.
2. **Limited Visibility**: Only the `Chief-of-Staff` is exposed as a top-level agent; all others are sub-agents reachable via tools.
3. **Tool Gating**: Each `SKILL.md` defines its own `tool_access` whitelist.
4. **Session Boxing**: Sub-agents run in isolated child sessions to prevent parent context pollution.


---

## OpenCode SDK: 3-Way Communication Mechanism

Understanding how the **User**, **Coordinator**, and **Specialist** communicate is critical to building robust swarm orchestration. The OpenCode SDK uses a **Session-Centric** model where the session acts as a shared blackboard, not a direct message channel.

### The Three Participants

```
┌─────────────────────────────────────────────────────────────────┐
│                  3-WAY COMMUNICATION MODEL                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │     USER     │  (Initiates requests, provides direction)    │
│  └──────┬───────┘                                              │
│         │                                                       │
│         │ "Build auth system"                                   │
│         ▼                                                       │
│  ┌──────────────────┐                                          │
│  │   COORDINATOR    │  (Planner, Chief-of-Staff)               │
│  │   (The Brain)    │                                          │
│  └────────┬─────────┘                                          │
│           │                                                     │
│           │ Delegates task                                      │
│           ▼                                                     │
│  ┌──────────────────┐                                          │
│  │   SPECIALIST     │  (Executor, Oracle, Interviewer)         │
│  │   (The Muscle)   │                                          │
│  └──────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Two Communication Patterns

#### Pattern A: Parallel (Interactive Handoff)
**Use Case**: User needs to see and interact with the Specialist.

```
[ User ]       [ Coordinator ]       [ Hook ]       [ Specialist ]
   |              |                   |                |
   |--"Do Task"-->|                   |                |
   |              |--[skill_agent]--> |                |
   |              |  (async: true)    |                |
   |              |                   |                |
   |              |--[HANDOFF_INTENT]-|                |
   |              | (Turn Ends)       |                |
   |              |                   |--[PromptAsync]->
   |              |                   |                |
   |<<<<<<<<<<<<<<<<< DIRECT INTERACTION >>>>>>>>>>>>>>|
   | "What is X?" <----------------------------------------|
```

**Key Characteristics**:
- Coordinator finishes its turn immediately
- Specialist takes over the **same session**
- User sees Specialist's work in the UI
- Coordinator does NOT receive the result

#### Pattern B: Sequential (Durable Stream)
**Use Case**: Coordinator needs the Specialist's result to continue.

```
[ User ]       [ Coordinator ]       [ Hook ]       [ Specialist ]
   |              |                   |                |
   |--"Do Task"-->|                   |                |
   |              |--[skill_agent]--> |                |
   |              |  (async: false)   |                |
   |              |                   |                |
   |              |<<<< [ BLOCK & POLL STATUS ] >>>>>> |
   |              |                   |                |
   |              |                   |--[Prompt]----->|
   |              |                   |                |--[Execute]-->
   |              |                   |                |--[Result]--|
   |              |                   |                |<-----------|
   |              |<---[Return Text]--|                |
   |              |                   |                |
   |<-[Final Msg]-|                   |                |
```

**Key Characteristics**:
- Coordinator blocks and waits
- Specialist works in a **new isolated session**
- User does NOT see Specialist's internal work
- Coordinator receives the result as text

---

### Why Our Previous Approach Failed (Deadlock Issue)

#### ❌ The Failed Attempt: `promptAsync` Inside Tool

**What we tried:**
```typescript
// ANTI-PATTERN: Calling promptAsync inside the tool
export const skill_agent = tool({
  async execute(args, ctx) {
    // ... resolve agent ...
    
    // ❌ DEADLOCK: Trying to prompt while the current turn is still active
    await ctx.client.session.promptAsync({
      path: { id: ctx.sessionID },
      body: { agent: targetAgent, parts: [{ type: 'text', text: args.prompt }] }
    });
    
    return JSON.stringify({ success: true });
  }
});
```

**Why it failed:**
1. **Turn Ownership Conflict**: The SDK expects the current tool to *finish* and return its output before the next prompt can be processed.
2. **State Race Condition**: When `promptAsync` is called inside the tool, the SDK is still waiting for the tool's return value to append to the session history.
3. **Result**: The session enters a "queued" or "stuck" state where neither the tool nor the new prompt can proceed.

**Symptoms:**
- Agent appears to "stop working" after calling the tool
- No error messages, just silence
- Session status shows `queued` or `processing` indefinitely

---

### ✅ The Solution: Hook-Based Handoff

**How it works now:**

#### Step 1: Tool Returns Intent (Not Action)
```typescript
// src/orchestrator/tools.ts
export const skill_agent = tool({
  async execute(args, ctx) {
    const isAsync = args.async !== false; // Default to true
    
    if (isAsync) {
      // PARALLEL MODE: Return metadata intent
      return JSON.stringify({
        success: true,
        status: 'HANDOFF_INTENT',  // ⭐ Signal to hook
        metadata: {
          handoff: {
            target_agent: targetAgent,
            prompt: args.prompt,
            session_id: ctx.sessionID
          }
        }
      });
    } else {
      // SEQUENTIAL MODE: Block and return result
      const newSession = await ctx.client.session.create({
        body: { parentID: ctx.sessionID, title: `Sync: ${targetAgent}` }
      });
      
      await ctx.client.session.prompt({
        path: { id: newSession.data.id },
        body: { agent: targetAgent, parts: [{ type: 'text', text: args.prompt }] }
      });
      
      // Poll for completion
      let isIdle = false;
      while (!isIdle) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await ctx.client.session.status();
        if (status.data?.[newSession.data.id]?.type === 'idle') isIdle = true;
      }
      
      // Retrieve result
      const messages = await ctx.client.session.messages({
        path: { id: newSession.data.id }
      });
      const lastMsg = messages.data
        .filter(m => m.info.role === 'assistant')
        .pop();
      
      return lastMsg.parts[0].text; // Return TEXT, not metadata
    }
  }
});
```

#### Step 2: Hook Detects Intent and Triggers Prompt
```typescript
// src/index.ts
'tool.execute.after': async (hookInput, hookOutput) => {
  // Check for HANDOFF_INTENT
  const isHandoff = hookOutput.metadata?.status === 'HANDOFF_INTENT';
  const data = hookOutput.metadata?.handoff;
  
  if (isHandoff && data) {
    // ⭐ KEY: Defer the prompt to allow current turn to settle
    setTimeout(async () => {
      await input.client.session.promptAsync({
        path: { id: data.session_id },
        body: {
          agent: data.target_agent,
          parts: [{ type: 'text', text: data.prompt }]
        }
      });
    }, 800); // 800ms safety window
  }
}
```

**Why this works:**
1. **Turn Separation**: The tool finishes and returns its output *before* the hook triggers the next prompt.
2. **State Settlement**: The 800ms delay ensures the SDK has fully committed the tool's output to the session history.
3. **No Race Conditions**: The hook runs *after* the tool execution context is closed.

---

### Code Demonstration: Both Patterns in Action

#### Demo 1: Parallel Handoff (User Sees Specialist)
```typescript
// User: "Ask the interviewer to clarify auth requirements"

// Coordinator calls:
const result = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'interviewer',
  prompt: 'Clarify auth requirements',
  async: true  // ⭐ PARALLEL MODE
});

// Result: { success: true, status: 'HANDOFF_INTENT', metadata: {...} }
// Coordinator's turn ENDS here.

// Hook detects HANDOFF_INTENT and triggers:
// → promptAsync({ agent: 'interviewer', ... })

// Now the USER sees:
// Interviewer: "Before I proceed, I need to clarify:
//               1. OAuth providers?
//               2. Session or JWT?"
```

#### Demo 2: Sequential Delegation (Coordinator Gets Result)
```typescript
// User: "Plan and execute the auth system"

// Coordinator (Chief-of-Staff) calls:
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Create auth implementation plan',
  async: false  // ⭐ SEQUENTIAL MODE
});

// Coordinator BLOCKS here, waiting for planner to finish.
// Planner works in a NEW isolated session (invisible to user).

// Result: "Here is the plan: 1. Create auth routes... 2. Add middleware..."
// Coordinator's turn CONTINUES with the plan text.

// Coordinator can now use the plan:
const execution = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'executor',
  prompt: `Implement phase 1: ${plan}`,
  async: false
});
```

---

### Session Isolation Strategy

#### Why New Sessions for Sync Calls?

**Problem**: If we use the current session for sync calls, the Coordinator and Specialist would share the same chat history, leading to:
- Context pollution (Specialist's internal reasoning visible to Coordinator)
- Turn conflicts (both trying to write to the same session)

**Solution**: Create a **new child session** for each sync call.

```typescript
const newSession = await client.session.create({
  body: {
    parentID: ctx.sessionID,  // Link to parent for traceability
    title: `Sync: ${agentName}`
  }
});
```

**Benefits**:
- Clean separation of concerns
- Specialist's internal tool calls don't pollute Coordinator's context
- Parent session remains focused on high-level coordination

---

### The Polling Mechanism

**Why polling is necessary:**

The SDK's `session.prompt()` method sends the prompt but doesn't wait for the agent's *entire* multi-turn reasoning loop to complete. If the agent calls tools, we need to poll `session.status()` until it reaches `idle`.

```typescript
// Polling loop
let isIdle = false;
let attempts = 0;
const maxAttempts = 30; // 60 seconds max

while (!isIdle && attempts < maxAttempts) {
  await new Promise(r => setTimeout(r, 2000)); // Wait 2s
  attempts++;
  
  const statusResult = await client.session.status();
  const sessionStatus = statusResult.data?.[syncSessionID];
  
  if (sessionStatus?.type === 'idle' || !sessionStatus) {
    isIdle = true;
  }
}
```

**Key Insight**: `idle` is the only reliable signal that the agent has finished all its work, including tool calls and multi-turn reasoning.

---

### Summary: The Architecture That Works

```
┌─────────────────────────────────────────────────────────────────┐
│              SUCCESSFUL 3-WAY COMMUNICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Tool declares INTENT via metadata (not action)              │
│  2. Tool returns and ENDS its turn                              │
│  3. Hook detects intent AFTER turn settlement                   │
│  4. Hook triggers promptAsync with 800ms delay                  │
│  5. SDK processes new prompt in clean state                     │
│                                                                 │
│  Result: No deadlocks, clean turn boundaries, reliable handoffs │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The Three Rules**:
1. **Never call `promptAsync` inside a tool** - use metadata intent instead
2. **Always poll for `idle`** - don't assume prompt completion
3. **Use new sessions for sync** - avoid context pollution

---

## Core Design Patterns

### Pattern 1: Agent-as-Tool

**Principle**: Sub-agents are tools with structured output, not chat partners.

```
Main Agent                    Sub-Agent
    │                             │
    │  skill_agent({              │
    │    skill: "chief-of-staff", │
    │    agent: "planner",        │
    │    prompt: "Design auth"    │
    │  })                         │
    │ ──────────────────────────▶ │ (isolated context)
    │                             │
    │  ◀────────────────────────  │
    │  { success: true,           │
    │    output: { plan: [...] }} │  (structured JSON)
    │                             │
```

**Anti-Pattern Avoided**: No chat history passed between agents.

### Pattern 2: Continuity Ledger

**Principle**: Human-readable state projection for debugging and recovery.

```markdown
# LEDGER.md

## Goal
Refactor authentication system to use JWT tokens

## Current State
**Phase**: EXECUTION
**Status**: in_progress
**Last Updated**: 2025-12-29T13:00:00Z
**Stream Offset**: 127

## Active Workers
- executor-auth: Implementing src/auth/jwt.ts
- executor-db: Implementing src/db/sessions.ts

## Tracked Assumptions
- JWT for sessions (confidence: 0.8)
- bcrypt for hashing (confidence: 0.95)

## Decisions
1. Chose PostgreSQL over MySQL (pgvector support)
2. Using Zod for schema validation (user preference)
```

### Pattern 3: MapReduce Spawning

**Principle**: Parallel agent execution for independent tasks.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAPREDUCE PATTERN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COORDINATOR                                                    │
│       │                                                         │
│       │  skill_spawn_batch([                                    │
│       │    { agent: executor, prompt: "Implement auth" },       │
│       │    { agent: executor, prompt: "Implement db" },         │
│       │    { agent: executor, prompt: "Write tests" },          │
│       │  ], { wait: true })                                     │
│       │                                                         │
│       ├────────────┬────────────┬────────────┐                  │
│       ▼            ▼            ▼            ▼                  │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐             │
│  │Worker 1│   │Worker 2│   │Worker 3│   │Worker 4│             │
│  │ auth   │   │  db    │   │ tests  │   │ docs   │             │
│  └───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘             │
│      │            │            │            │                   │
│      └────────────┴────────────┴────────────┘                   │
│                          │                                      │
│                          ▼                                      │
│  COORDINATOR (skill_gather)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  results: [                                              │   │
│  │    { worker: 1, success: true, files: [...] },           │   │
│  │    { worker: 2, success: true, files: [...] },           │   │
│  │    { worker: 3, success: false, error: "..." },          │   │
│  │    { worker: 4, success: true, files: [...] }            │   │
│  │  ]                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern 4: Interview-First Planning

**Principle**: Ask clarifying questions before making assumptions.

```
User: "Build a dashboard"
       │
       ▼
chief-of-staff/interviewer:
┌─────────────────────────────────────────────────────────────────┐
│  Before I proceed, I need to clarify:                           │
│                                                                 │
│  1. What data sources will the dashboard display?               │
│     □ Database (PostgreSQL, MySQL, etc.)                        │
│     □ API endpoints                                             │
│     □ Real-time feeds (WebSocket)                               │
│                                                                 │
│  2. Who are the primary users?                                  │
│     □ Developers (technical)                                    │
│     □ Business users (charts, summaries)                        │
│     □ Executives (high-level KPIs)                              │
│                                                                 │
│  [Waiting for your response before proceeding]                  │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼ (user answers)
       │
Chief-of-Staff: Logs answers as explicit direction
       │
       ▼
chief-of-staff/planner: Creates plan with zero assumptions
```

---

## Workflow Patterns

### Workflow 1: Spec-Driven Development (SDD)

```
┌─────────────────────────────────────────────────────────────────┐
│              SPEC-DRIVEN DEVELOPMENT PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SPEC PHASE                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  chief-of-staff/spec-writer                              │   │
│  │  Input: "Build auth system"                              │   │
│  │  Output: {                                               │   │
│  │    requirements: [...],                                  │   │
│  │    acceptance_criteria: [...],                          │   │
│  │    non_functional: [...]                                 │   │
│  │  }                                                       │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                 │
│  2. PLAN PHASE                ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  chief-of-staff/planner                                  │   │
│  │  Input: spec.requirements                                │   │
│  │  Output: {                                               │   │
│  │    phases: [...],                                        │   │
│  │    files: [...],                                         │   │
│  │    dependencies: [...]                                   │   │
│  │  }                                                       │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                 │
│  3. VALIDATE PHASE            ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  chief-of-staff/validator                                │   │
│  │  Input: plan + memory-lane precedents                    │   │
│  │  Output: {                                               │   │
│  │    verdict: "PASS" | "FAIL",                             │   │
│  │    required_pivots: [...]                                │   │
│  │  }                                                       │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                 │
│  4. EXECUTE PHASE             ▼ (if PASS)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  chief-of-staff/executor (parallel workers)              │   │
│  │  Input: plan.phases[current]                             │   │
│  │  Output: {                                               │   │
│  │    files_touched: [...],                                 │   │
│  │    tests_passed: true,                                   │   │
│  │    diagnostics: 0                                        │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow 2: Chief-of-Staff Coordination

```
┌─────────────────────────────────────────────────────────────────┐
│              CHIEF-OF-STAFF WORKFLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STATE MANAGEMENT                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  explicit_direction: {                                   │   │
│  │    goals: ["Build auth with OAuth"],                     │   │
│  │    constraints: ["No external db", "TypeScript only"]    │   │
│  │  }                                                       │   │
│  │                                                          │   │
│  │  tracked_assumptions: [                                  │   │
│  │    { worker: "auth", assumed: "JWT", confidence: 0.8 },  │   │
│  │    { worker: "db", assumed: "SQLite", confidence: 0.6 }  │   │
│  │  ]                                                       │   │
│  │                                                          │   │
│  │  pending_decisions: [                                    │   │
│  │    { context: "OAuth provider", options: ["Google"...] } │   │
│  │  ]                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PERIODIC SURFACING (every 10 completions OR 3+ pending)        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Pause worker spawning                                │   │
│  │  2. Present assumption summary to user                   │   │
│  │  3. Ask: "Should I continue with these assumptions?"     │   │
│  │  4. Update direction based on response                   │   │
│  │  5. Resume workers with updated parameters              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tool Ecosystem

### Core Tools

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `skill_agent` | Spawn single agent | skill, agent, prompt | { success, output } |
| `skill_list` | Discover agents | skill? | { agents: [...] } |
| `skill_spawn_batch` | Parallel spawn | tasks[] | { task_ids, results? } |
| `skill_gather` | Collect results | task_ids | { completed, pending } |
| `memory-lane_find` | Query learnings | query | { memories: [...] } |
| `memory-lane_store` | Persist learning | info, type | { id } |
| `swarmmail_send` | Inter-agent message | to, body | { sent: true } |
| `ledger_update` | Update state | state | { updated: true } |

### Tool Flow

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
│       ├──▶ skill_agent(chief-of-staff/interviewer)              │
│       ├──▶ skill_agent(chief-of-staff/planner)                  │
│       ├──▶ skill_agent(chief-of-staff/validator)                │
│       │                                                         │
│  [Execution - Parallel]                                         │
│       ├──▶ skill_spawn_batch([executors...])                    │
│       ├──▶ skill_gather(task_ids)                               │
│       │                                                         │
│  [Coordination]                                                 │
│       ├──▶ swarmmail_send(chief, assumptions)                   │
│       ├──▶ ledger_update(current_state)                         │
│       │                                                         │
│  [Session End]                                                  │
│       ├──▶ skill_agent(chief-of-staff/memory-catcher)           │
│       └──▶ memory-lane_store(learnings)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Self-Learning System

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                  SELF-LEARNING LIFECYCLE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SESSION START                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Hook: createSessionLearningInjector                     │   │
│  │                                                          │   │
│  │  1. Extract keywords from user's first message           │   │
│  │  2. Query: memory-lane_find({ query: keywords })         │   │
│  │  3. Load: .opencode/LEDGER.md (if exists)                 │   │
│  │  4. Inject into system prompt:                           │   │
│  │     "## Relevant Past Learnings                          │   │
│  │      - [correction]: User prefers Zod over io-ts         │   │
│  │      - [decision]: Use PostgreSQL for vector storage     │   │
│  │      ## Continuity State                                 │   │
│  │      Previous work detected. Resume from ledger."        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  WORKING SESSION                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agents work with pre-loaded context                     │   │
│  │  Chief-of-Staff tracks new assumptions                   │   │
│  │  Workers discover patterns via trial/error               │   │
│  │  User corrections captured in real-time                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SESSION END                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Hook: createSessionLearningCapture                      │   │
│  │                                                          │   │
│  │  1. Spawn: chief-of-staff/memory-catcher                 │   │
│  │  2. Pass: { transcript, files_touched }                  │   │
│  │  3. Extract: corrections, decisions, patterns            │   │
│  │  4. Store: memory-lane_store(each learning)              │   │
│  │  5. Update: LEDGER.md if ongoing work           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  NEXT SESSION                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agent automatically starts with relevant learnings      │   │
│  │  → Avoids repeating known mistakes                       │   │
│  │  → Builds on proven patterns                             │   │
│  │  → Uses user preferences without re-asking               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Learning Taxonomy

| Type | Priority | Description | Example |
|------|----------|-------------|---------|
| `correction` | HIGH | User corrected agent | "No, use Zod not io-ts" |
| `decision` | HIGH | Explicit architectural choice | "Chose PostgreSQL for pgvector" |
| `preference` | HIGH | User preference discovered | "Always use TypeScript" |
| `pattern` | MEDIUM | Successful approach | "Repository pattern works well here" |
| `anti_pattern` | MEDIUM | Failed approach | "Don't use sync bcrypt in async" |
| `constraint` | MEDIUM | Hard constraint | "Must support IE11" |
| `insight` | LOW | General discovery | "This codebase uses barrel exports" |

### Memory-Catcher Agent (Revised)

The memory-catcher agent is reimplemented to embrace the self-learning workflow:

```yaml
---
name: chief-of-staff/memory-catcher
description: >-
  Session-end learning extraction agent. Analyzes transcripts to find
  corrections, decisions, patterns, and anti-patterns. Stores via Memory Lane
  with appropriate taxonomy for automatic session-start injection.
model: opencode/grok-code
metadata:
  type: extraction
  invocation: session_end_hook  # NEW: Called by hook, not manually
  tool_access:
    - memory-lane_store
    - memory-lane_find
    - memory-lane_feedback
---

# MEMORY CATCHER (Self-Learning Workflow)

## Mission

You are invoked AUTOMATICALLY at session end via hook.
Your job: Extract learnings that will help FUTURE sessions.

## Input Context

You receive structured context from the session end hook:
\`\`\`typescript
{
  transcript_summary: string,    // Summarized conversation
  files_touched: string[],       // Modified files
  user_corrections: string[],    // Detected "No, do X instead"
  worker_assumptions: object[],  // From Chief-of-Staff
  session_duration_ms: number
}
\`\`\`

## Extraction Priority

1. **CORRECTIONS**: Any "No, do X instead" → `type: 'correction'`
2. **DECISIONS**: Explicit choices → `type: 'decision'`
3. **PREFERENCES**: User preferences → `type: 'preference'`
4. **ANTI-PATTERNS**: Failed approaches → `type: 'anti_pattern'`
5. **PATTERNS**: Successful approaches → `type: 'pattern'`

## Storage Format

For each learning, call:
\`\`\`typescript
memory-lane_store({
  information: "Concise, actionable learning",
  type: 'correction' | 'decision' | 'preference' | ...,
  entities: ['project:name', 'library:name'],  // For retrieval
  tags: 'auth,jwt,security'
})
\`\`\`

## Example Extractions

### From User Correction
Transcript: "No, Amy and I are casual - keep it friendly"
→ memory-lane_store({
    information: "Amy Hoy prefers casual, friendly tone (not formal)",
    type: 'preference',
    entities: ['person:amy-hoy']
  })

### From Worker Assumption (via Chief)
Input: { assumed: "JWT for sessions", confidence: 0.8, verified: true }
→ memory-lane_store({
    information: "JWT chosen for session management (verified)",
    type: 'decision',
    entities: ['project:auth-service']
  })

### From Failed Approach
Transcript: "That didn't work... let me try X instead... that worked!"
→ memory-lane_store({
    information: "Approach Y failed because Z. Use X instead.",
    type: 'anti_pattern',
    entities: ['library:name']
  })

## Output

Return structured summary:
\`\`\`json
{
  "learnings_captured": 5,
  "by_type": {
    "correction": 2,
    "decision": 1,
    "preference": 1,
    "anti_pattern": 1
  },
  "entities_tagged": ["person:amy-hoy", "library:jwt"]
}
\`\`\`
```

---

## LEDGER.md: Single Source of Truth

The **LEDGER.md** file consolidates all continuity state into a single, human-readable file.

### Location

`.opencode/LEDGER.md`

### Structure

```markdown
# LEDGER

## Meta
session_id: sess_abc123
status: active
phase: EXECUTION
tasks_completed: 2/3

---

## Epic: abc123

**Title**: Build E-commerce Checkout
**Status**: in_progress

| ID | Title | Agent | Status |
|----|-------|-------|--------|
| abc123.1 | Payment Routes | executor | ✅ |
| abc123.2 | Order Logic | executor | ✅ |
| abc123.3 | Admin Dashboard | executor | ⏳ |

---

## Learnings

### Patterns ✅
- Stripe: Use `stripe.checkout.sessions.create`

### Anti-Patterns ❌
- Don't use `bcrypt.hashSync` in async routes

---

## Handoff
*Empty when active*

---

## Archive
| Epic | Title | Outcome | Date |
|------|-------|---------|------|
| xyz789 | User Auth | SUCCEEDED | 2025-12-29 |
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Epic** | Top-level goal with max 3 tasks |
| **Task IDs** | Hash format: `abc123.1`, `abc123.2` |
| **Learnings** | Patterns, anti-patterns, decisions |
| **Handoff** | Context for session breaks |
| **Archive** | Last 5 completed epics |

### Session Lifecycle

1. **Start**: Load LEDGER, surface learnings, resume epic
2. **Work**: Update task status, log progress, extract learnings
3. **Break**: Create handoff in LEDGER
4. **End**: Archive epic, compound learnings

### Integration with SDD Workflow

```
PHASE 0: LOAD LEDGER
PHASE 1: CLARIFICATION → Store in LEDGER Context
PHASE 2: DECOMPOSITION → Write Epic to LEDGER
PHASE 3: PLANNING → Update task details
PHASE 4: EXECUTION → Update status per task, extract learnings
PHASE 5: COMPLETION → Archive epic, cleanup
```

---

## Implementation Guide

### Step 1: Core Tools (Week 1)

```typescript
// src/opencode/agent/tools.ts

// 1. Enhance existing skill_agent with context support
export function createSkillAgentTools(client: any) {
  return {
    skill_agent: tool({
      args: {
        skill_name: tool.schema.string(),
        agent_name: tool.schema.string(),
        prompt: tool.schema.string(),
        run_in_background: tool.schema.boolean().optional(),
        // NEW: Structured context injection
        context: tool.schema.object({
          explicit_direction: tool.schema.any().optional(),
          assumptions: tool.schema.any().optional(),
          relevant_memories: tool.schema.any().optional(),
          files_assigned: tool.schema.array(tool.schema.string()).optional(),
        }).optional(),
      },
      async execute(args, _context) {
        // ... existing spawn logic
        // NEW: Include context in spawn args
        const spawnArgs = {
          description: args.prompt,
          agent: fullName,
          context: args.context ? JSON.stringify(args.context) : undefined,
        };
        // ...
      }
    }),

    // 2. NEW: Agent discovery tool
    skill_list: tool({
      description: 'List available skill-based agents',
      args: {
        skill: tool.schema.string().optional(),
        include_metadata: tool.schema.boolean().optional(),
      },
      async execute(args) {
        const agents = await loadSkillAgents();
        const filtered = args.skill 
          ? agents.filter(a => a.name.startsWith(`${args.skill}/`))
          : agents;
        
        return JSON.stringify({
          agents: filtered.map(a => ({
            name: a.name,
            description: a.config.description,
            ...(args.include_metadata && {
              model: a.config.model,
              tool_access: a.config.metadata?.tool_access,
            }),
          })),
        });
      }
    }),

    // 3. NEW: Parallel spawn tool
    skill_spawn_batch: tool({
      description: 'Spawn multiple agents in parallel',
      args: {
        tasks: tool.schema.array(tool.schema.object({
          skill: tool.schema.string(),
          agent: tool.schema.string(),
          prompt: tool.schema.string(),
        })),
        wait: tool.schema.boolean().optional(),
        timeout_ms: tool.schema.number().optional(),
      },
      async execute(args) {
        const taskIds = await Promise.all(
          args.tasks.map(t => 
            client.call('background_task', {
              agent: `${t.skill}/${t.agent}`,
              description: t.prompt,
            })
          )
        );
        
        if (args.wait) {
          // Poll until all complete or timeout
          const results = await waitForTasks(taskIds, args.timeout_ms);
          return JSON.stringify({ task_ids: taskIds, results });
        }
        
        return JSON.stringify({ task_ids: taskIds });
      }
    }),
  };
}
```

### Step 2: Self-Learning Hooks (Week 2)

```typescript
// src/orchestrator/hooks/session-learning.ts

export function createSessionLearningInjector() {
  return {
    name: 'session-learning-injector',
    event: 'session_start',
    
    async execute(context: SessionContext) {
      // 1. Extract keywords from first message
      const firstMessage = context.messages[0]?.content || '';
      const keywords = extractKeywords(firstMessage);
      
      // 2. Query Memory Lane
      const { memories } = await memory_lane_find({
        query: keywords.join(' '),
        limit: 10,
      });
      
      // 3. Load ledger
      const ledgerPath = '.opencode/LEDGER.md';
      const ledger = existsSync(ledgerPath) 
        ? await readFile(ledgerPath, 'utf-8')
        : null;
      
      // 4. Build injection
      let injection = '';
      
      if (memories.length > 0) {
        injection += '\n## Relevant Past Learnings\n\n';
        for (const m of memories) {
          injection += `- **[${m.type}]**: ${m.information}\n`;
          if (m.confidence < 0.5) {
            injection += `  ⚠️ Low confidence - verify\n`;
          }
        }
      }
      
      if (ledger) {
        injection += '\n## Continuity State\n';
        injection += 'Previous work detected. Resume from LEDGER.md.\n';
      }
      
      return { systemPromptAddition: injection };
    }
  };
}

export function createSessionLearningCapture() {
  return {
    name: 'session-learning-capture',
    event: 'session_end',
    
    async execute(context: SessionContext) {
      // Spawn memory-catcher with session context
      const result = await skill_agent({
        skill_name: 'chief-of-staff',
        agent_name: 'memory-catcher',
        prompt: 'Extract learnings from this session.',
        context: {
          transcript_summary: context.summarize(),
          files_touched: context.getModifiedFiles(),
          user_corrections: context.detectCorrections(),
          worker_assumptions: await loadChiefAssumptions(),
        },
      });
      
      return { learnings_captured: true };
    }
  };
}
```

### Step 3: Chief-of-Staff Agent (Week 3)

```markdown
<!-- chief-of-staff/agents/chief-of-staff/SKILL.md -->
---
name: chief-of-staff/chief-of-staff
description: Strategic manager tracking direction, assumptions, and worker fleet
model: google/gemini-3-pro
metadata:
  type: coordinator
  tool_access:
    - skill_agent
    - skill_list
    - skill_spawn_batch
    - skill_gather
    - memory-lane_find
    - memory-lane_store
    - swarmmail_send
    - swarmmail_inbox
    - ledger_update
---

# CHIEF-OF-STAFF

## State Management

Track three categories:

### Explicit Direction (from user)
```json
{
  "goals": ["Build auth with OAuth"],
  "constraints": ["TypeScript only", "No external DB"],
  "priorities": ["Security > Performance > UX"]
}
```

### Tracked Assumptions (from workers)
```json
{
  "assumptions": [
    { "worker": "auth", "assumed": "JWT", "confidence": 0.8 }
  ]
}
```

### Pending Decisions
```json
{
  "decisions": [
    { "context": "OAuth provider", "options": ["Google", "GitHub"] }
  ]
}
```

## Surfacing Rules

Surface to user when:
- `pending_decisions.length > 3`
- `assumptions.filter(a => a.confidence < 0.6).length > 2`
- Every 10 worker completions
- User explicitly asks for status

## Surfacing Template

"I've tracked N assumptions across your workers:
 1. [assumption] (Worker, confidence: X)
 ...
 
Should I continue with these assumptions, or would you like to change direction?"
```

---

## Sample Code

### Complete Workflow Example

```typescript
// Example: Full SDD pipeline with self-learning

async function runSDDPipeline(userRequest: string) {
  // 1. Session start - load learnings (via hook, automatic)
  // 2. Chief-of-Staff orchestrates
  
  const chief = await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'chief-of-staff',
    prompt: `User request: "${userRequest}". Begin SDD pipeline.`,
  });
  
  // Chief internally:
  // a) Spawns interviewer if request is ambiguous
  // b) Spawns spec-writer with clarified requirements
  // c) Spawns planner with spec
  // d) Spawns validator with plan + memory-lane precedents
  // e) If validated: spawns parallel executors
  // f) Tracks assumptions throughout
  // g) Surfaces assumptions at threshold
  
  // 3. Session end - capture learnings (via hook, automatic)
}

// Example: Parallel execution
async function parallelImplementation(plan: Plan) {
  // Spawn batch
  const { task_ids } = await skill_spawn_batch({
    tasks: plan.phases.map(phase => ({
      skill: 'chief-of-staff',
      agent: 'executor',
      prompt: `Implement phase: ${phase.title}`,
    })),
    wait: false,
  });
  
  // Gather results (polling)
  let results;
  do {
    await sleep(5000);
    results = await skill_gather({ task_ids, partial: true });
    console.log(`Completed: ${results.completed.length}/${task_ids.length}`);
  } while (results.pending.length > 0);
  
  return results;
}
```

---

## Actionable Roadmap

### Phase 1: Core Infrastructure (Week 1)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Enhance `skill_agent` with context arg | `tools.ts` update |
| 2 | Implement `skill_list` | Agent discovery tool |
| 3 | Implement `skill_spawn_batch` | Parallel spawn tool |
| 4 | Implement `skill_gather` | Result aggregation |
| 5 | Unit tests for all new tools | `tools.test.ts` |

### Phase 2: Self-Learning Hooks (Week 2)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Session start hook (learning injection) | `session-learning.ts` |
| 2 | Session end hook (learning capture) | `session-learning.ts` |
| 3 | Revise memory-catcher SKILL.md | Updated agent |
| 4 | Integration test: learning round-trip | `learning.test.ts` |
| 5 | Hook registration in plugin | `index.ts` |

### Phase 3: Workflow Agents (Week 3)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Chief-of-Staff agent | SKILL.md |
| 2 | Interviewer agent | SKILL.md |
| 3 | Spec-writer agent | SKILL.md |
| 4 | Assumption tracking state | `assumptions.ts` |
| 5 | Surfacing logic | Chief integration |

### Phase 4: Integration & Polish (Week 4)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Full SDD pipeline test | Integration test |
| 2 | SwarmMail coordination | Agent messaging |
| 3 | Ledger integration | File-based state |
| 4 | Documentation | README, examples |
| 5 | Demo workflow | End-to-end example |

---

## References

- [SKILL_BASED_AGENTS_SPEC.md](../docs/SKILL_BASED_AGENTS_SPEC.md) - Detailed specification
- [SKILL_SUBAGENTS.md](../docs/SKILL_SUBAGENTS.md) - Guide to creating skill agents
- [docs/PLAN.md](../docs/PLAN.md) - High-level architecture

---

*This plan implements a skill-based subagent system with self-learning capabilities, assumption tracking, and composable workflow patterns.*
