# Swarm-Tool-Addons: Project Plan

## Executive Summary

**Swarm-tool-addons** extends joelhooks/swarm-tools as an OpenCode plugin with a modular architecture:

- **OpenCode SDK** (`opencode/`) - Agent loading, tools, configuration
- **Orchestrator** (`orchestrator/`) - Skill-based subagents, workflows, self-learning
- **Memory Lane** (`memory-lane/`) - Persistent cross-session learning
- **Conductor** (`conductor/`) - Spec-driven development framework

---

## Module Overview

### 1. Orchestrator Module ⭐ NEW

The **Orchestrator** provides a skill-based subagent system with:

#### Features
- **11 Specialized Agents** - Oracle, Librarian, Planner, Executor, etc.
- **4 Core Tools** - `skill_agent`, `skill_list`, `skill_spawn_batch`, `skill_gather`
- **Self-Learning Hooks** - Automatic learning injection and capture
- **8 Workflow Patterns** - From simple consultation to parallel coordination

#### Available Agents

| Agent | Purpose |
|-------|---------|
| 🔮 Oracle | Expert technical advisor |
| 📚 Librarian | Library research specialist |
| 🔍 Explore | Codebase search expert |
| 🎤 Interviewer | Requirement clarifier |
| 📋 Spec-Writer | Requirements documenter |
| 📐 Planner | Implementation strategist |
| ✅ Validator | Quality gate checker |
| 🔨 Executor | TDD implementer |
| 🧠 Memory-Catcher | Learning extractor |
| 👔 Chief-of-Staff | Team coordinator |
| 🏗️ Workflow-Architect | Pattern designer |

#### Workflow Patterns

1. **Quick Expert Consultation** - Oracle for technical questions
2. **Library Research** - Librarian for learning new libraries
3. **Codebase Exploration** - Explore for finding code
4. **Feature Planning** - Planner for implementation blueprints
5. **Spec-Driven Development** - Full pipeline: Interview → Spec → Plan → Validate → Execute
6. **Parallel Work** - skill_spawn_batch for independent tasks
7. **Interactive Clarification** ⭐ - Interviewer with **DIALOGUE MODE** (multi-turn until approval)
8. **Chief-of-Staff Coordination** ⭐ - **DIALOGUE MODE** for checkpoints + assumption verification

#### Interaction Modes (NEW)

| Mode | Behavior | Agents |
|------|----------|--------|
| `one_shot` | Return immediately | Oracle, Planner, Executor, etc. |
| `dialogue` | Loop until user approves | Interviewer, Chief-of-Staff, Spec-Writer (optional) |

**Dialogue statuses:** `needs_input`, `needs_approval`, `needs_verification`, `approved`, `rejected`, `completed`

#### Self-Learning

The system automatically learns from interactions:

| Captured | Example |
|----------|---------|
| Corrections | "No, use Zod not io-ts" |
| Preferences | "I prefer functional components" |
| Decisions | "We chose PostgreSQL for vector support" |
| Anti-patterns | "Don't use bcrypt.hashSync in async" |

Learnings are injected at session start and captured at session end.

---

### 2. Memory Lane Module

**Memory Lane** provides persistent semantic memory with:

- **Temporal Validity** - Memories expire over time
- **Confidence Decay** - Trust degrades without reinforcement
- **Intent Boosting** - Queries match memory types (correction, decision, preference)
- **Entity Filtering** - Filter by person, project, library, etc.

#### Tools

| Tool | Purpose |
|------|---------|
| `memory-lane_find` | Smart semantic search with intent boosting |
| `memory-lane_store` | Store new memories with taxonomy |
| `memory-lane_feedback` | Reinforce or penalize memories |

---

### 3. Conductor Module

**Conductor** provides spec-driven development (SDD):

- **Tracks** - Organized task directories with specs and plans
- **Quality Gates** - Verify before implementation
- **Checkpoints** - Track progress through phases

#### Tools

| Tool | Purpose |
|------|---------|
| `conductor_verify` | Check quality gates |
| `conductor_checkpoint` | Commit task completion |

---

### 4. OpenCode SDK Module

**OpenCode SDK** provides infrastructure:

- **Agent Loading** - From local and skill directories
- **Command Parsing** - Frontmatter extraction for .md files
- **Configuration** - Variable substitution and overrides
- **Tool Creation** - Type-safe tool schemas

---

## Architecture

```
swarm-tool-addons/
├── src/
│   ├── index.ts                 # Main plugin entry
│   ├── opencode/                # SDK infrastructure
│   │   ├── agent/               # Agent loading
│   │   ├── command/             # Command parsing
│   │   └── loader.ts            # Skill-based agent discovery
│   ├── orchestrator/            # Skill-based subagents ⭐
│   │   ├── PLAN.md              # Technical architecture
│   │   ├── README.md            # User-facing guide
│   │   ├── tools.ts             # skill_* tools
│   │   ├── hooks/               # Self-learning hooks
│   │   ├── examples/            # Demo workflows
│   │   └── sisyphus/            # Main orchestrator skill
│   │       └── agents/          # 11 specialized agents
│   ├── memory-lane/             # Semantic memory
│   └── conductor/               # SDD framework
└── docs/
    ├── PLAN.md                  # This file
    ├── WORKFLOW_PATTERNS_GUIDE.md
    └── SKILL_BASED_AGENTS_SPEC.md
```

---

## Design Principles

### 1. Agent-as-Tool Pattern

Agents return structured JSON, not conversation history:

```typescript
const result = await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'planner',
  prompt: 'Create plan for auth feature',
});
// result.output = { phases: [...], files: [...] }
```

### 2. Context Partitioning

Each agent gets minimal, focused context:

```typescript
context: {
  explicit_direction: { goals: ['Build auth'], constraints: ['TypeScript'] },
  relevant_memories: queriedMemories,
  files_assigned: ['src/auth/'],
}
```

### 3. Continuity via Ledger

State persists across context wipes:

```
.sisyphus/
├── SISYPHUS_LEDGER.md    # Human-readable state
└── assumptions.json       # Tracked assumptions
```

### 4. Self-Learning Loop

```
Session 1:
  User: "No, use Zod"
      ↓
  memory-catcher captures preference

Session 2:
  [Session Start]
      ↓
  Hook injects: "User prefers Zod over io-ts"
      ↓
  Agent uses Zod automatically
```

---

## Getting Started

### Use an Agent

```typescript
// Ask the oracle
skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'oracle',
  prompt: 'Should I use PostgreSQL or MongoDB for analytics?'
})
```

### Parallel Execution

```typescript
// Refactor multiple files in parallel
skill_spawn_batch({
  tasks: files.map(f => ({
    skill: 'sisyphus',
    agent: 'executor',
    prompt: `Refactor ${f} to TypeScript`
  })),
  wait: true
})
```

### Query Past Learnings

```typescript
import { queryLearnings } from './orchestrator';

const memories = await queryLearnings("database preferences");
// Returns: "User prefers PostgreSQL", "Chose pgvector for embeddings"
```

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Core Tools (skill_*) | ✅ Complete |
| Session Learning Hooks | ✅ Complete |
| OpenCode Integration | ✅ Complete |
| Memory Lane Integration | ✅ Complete |
| Workflow Agents (11) | ✅ Complete |
| Documentation | ✅ Complete |
| Demo Pipeline | ✅ Complete |
| Unit Tests | ⏳ Partial |

---

## Files Reference

### Orchestrator

| File | Purpose |
|------|---------|
| `orchestrator/PLAN.md` | Technical architecture (~800 lines) |
| `orchestrator/README.md` | User-facing guide with examples |
| `orchestrator/tools.ts` | skill_* tool implementations |
| `orchestrator/hooks/session-learning.ts` | Standalone hooks |
| `orchestrator/hooks/opencode-session-learning.ts` | OpenCode integration |
| `orchestrator/examples/sdd-pipeline-demo.ts` | Complete demo |

### Agents

| Agent | SKILL.md Location |
|-------|-------------------|
| Oracle | `sisyphus/agents/oracle/` |
| Librarian | `sisyphus/agents/librarian/` |
| Explore | `sisyphus/agents/explore/` |
| Interviewer | `sisyphus/agents/interviewer/` |
| Spec-Writer | `sisyphus/agents/spec-writer/` |
| Planner | `sisyphus/agents/planner/` |
| Validator | `sisyphus/agents/validator/` |
| Executor | `sisyphus/agents/executor/` |
| Memory-Catcher | `sisyphus/agents/memory-catcher/` |
| Chief-of-Staff | `sisyphus/agents/chief-of-staff/` |
| Workflow-Architect | `sisyphus/agents/workflow-architect/` |

---

## Further Reading

- [Orchestrator README](../src/orchestrator/README.md) - User-facing guide
- [Workflow Patterns Guide](./WORKFLOW_PATTERNS_GUIDE.md) - Detailed patterns
- [Technical PLAN](../src/orchestrator/PLAN.md) - Implementation details
- [SKILL_BASED_AGENTS_SPEC](./SKILL_BASED_AGENTS_SPEC.md) - Full specification
