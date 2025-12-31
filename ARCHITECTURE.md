# ARCHITECTURE & DESIGN PATTERNS

This document outlines the core architectural principles, design patterns, and workflows implemented in the `swarm-tool-addons` plugin, following the **Hybrid Delegator Pattern**.

## 1. Design Philosophy: Skill-Based Subagents

Instead of a single monolithic agent, this system utilizes a **Skill-Based Subagent** architecture. This represents a paradigm shift where domain expertise is packaged into reusable, on-demand workers.

### Monolithic vs Skill-Based (The Hybrid Delegator)

```ascii
┌─────────────────────────────────────────────────────────────────┐
│                   MONOLITHIC VS SKILL-BASED                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ Monolithic Approach ]       [ Skill-Based Swarm ]            │
│  ┌───────────────────┐         ┌───────────────────┐            │
│  │   Single Agent    │         │  Chief-of-Staff   │            │
│  │   (128k Context)  │         │  (Coordinator)    │            │
│  └─────────┬─────────┘         └─────────┬─────────┘            │
│            │                             │                      │
│      (Context Mix)            ┌──────────┼──────────┐           │
│      [Code][Tests]            ▼          ▼          ▼           │
│      [Docs][Auth]        ┌─────────┐┌─────────┐┌─────────┐      │
│      [Logic][UI]         │ Planner ││ Executor││Validator│      │
│                          │ (8k ctx)││ (8k ctx)││ (8k ctx)│      │
│    -> High Noise         └─────────┘└─────────┘└─────────┘      │
│    -> 16x more tokens    -> 16x reduction in context            │
│    -> High Dilution      -> Zero Expertise Dilution             │
│                          -> Parallel Execution Capable          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The Hybrid Delegator Architecture

The system implements a two-layer design:

1.  **Discovery Layer**: Dynamically scans `~/.config/opencode/skill/` for Markdown (`.md`) or TypeScript (`.ts`) agent definitions.
2.  **Spawning Layer**: Uses the `skill_agent` tool to invoke OpenCode's native `task` or `background_task` APIs, creating isolated Actor sessions.

## 2. Core Design Patterns

### I. Actor Model (Isolation)

Treats each agent as a **Stateless Actor**. communication occurs via structured JSON results, and no chat history is passed between spawns to preserve context purity.

### II. Durable Stream (Persistence via LEDGER.md)

Ensures continuity across session clears. The `LEDGER.md` acts as a physical snapshot of the event stream, allowing the system to resume tasks after a context wipe.

### III. Agent-as-Tool Pattern

Complex sub-agents are exposed as deep modules with simple interfaces.
• **Surface**: A single tool call with 4 parameters.
• **Hidden**: Discovery, YAML parsing, dynamic imports, and error handling.

## 3. Workflow Patterns

These patterns emphasize human-in-the-loop checkpoints for critical decisions.

### I. Pattern 1: Ask User Question (Interviewer-Led)

Used when a request is ambiguous or requires clarification.
• **Handoff**: Interviewer takes control to ask targeted questions.
• **Accumulation**: Requirements are gathered and summarized.
• **Approval**: User must confirm requirements before downstream agents (Oracle/Planner) start.

### II. Pattern 2: Spec-Driven Development (SDD)

Phased execution for new features or complex tasks.
• **Phase 1: Clarification**: (Interviewer) ⭐ needs_input
• **Phase 2: Specification**: (Spec-Writer) ⭐ needs_approval
• **Phase 3: Strategy**: (Oracle) Automated task decomposition.
• **Phase 4: Planning**: (Planner) ⭐ needs_approval
• **Phase 5: Execution**: (Executor) Supervised implementation.
• **Phase 6: Aggregation**: Summary of all results.

### III. Decision Tree: Pattern Selection

```
 User Request
      |
 Is request clear?
      |
      +--- NO ---> Ask User Question Pattern
      |            (Interviewer -> Oracle -> Planner -> Execute)
      |
     YES
      |
 Is it a new feature?
      |
      +--- YES ---> SDD Pattern
      |             (Interviewer -> Spec-Writer -> Oracle -> Planner -> Execute)
      |
      +--- NO ----> Direct Execution
                    (Oracle -> Planner -> Execute)
```

### IV. Chief-of-Staff Coordination

Manages the "State Triangle":
• **Explicit Direction**: High-level goals from the user.
• **Tracked Assumptions**: Implicit choices made by workers.
• **Decision Points**: Strategic pivots requiring user approval.

## 4. LEDGER.md: Single Source of Truth

The `.opencode/LEDGER.md` file persists agent state across sessions and context clears.

### Structure

```
┌─────────────────────────────────────────┐
│            LEDGER.md Structure          │
├─────────────────────────────────────────┤
│ ## Meta                                 │
│   session_id, status, phase, progress   │
│                                         │
│ ## Epic: [Current Task]                 │
│   - Task 1: executor → completed ✓      │
│   - Task 2: executor → running...       │
│   - Task 3: validator → pending         │
│                                         │
│ ## Learnings                            │
│   - Pattern: Use Stripe SDK for...      │
│   - Decision: Chose PostgreSQL for...   │
│                                         │
│ ## Handoff (if context limit)           │
│   - What's done, What's next            │
│                                         │
│ ## Archive (last 5 epics)               │
└─────────────────────────────────────────┘
```

### Crash Recovery

On session start, `TaskRegistry.loadFromLedger()` restores state:

```
Session Start
     │
     ▼
Load .opencode/LEDGER.md
     │
     ├─── Active Epic? ───YES──→ Resume incomplete tasks
     │                          ├─ pending → re-queue
     │                          └─ running → mark as stuck, retry
     │
     └─── Handoff? ───YES──→ Display context to user
                              └─ "Resuming from: ..."
```

### Error Handling: User Rejection

When user rejects at `needs_approval`:

```
User: "No, I want X instead"
     │
     ▼
Status: 'rejected'
     │
     ├─── Interviewer? ──→ Re-gather requirements
     │                     └─ Loop back to needs_input
     │
     ├─── Planner? ──→ Return to Oracle with feedback
     │                 └─ Generate new plan
     │
     └─── Spec-Writer? ──→ Revise specification
                           └─ Re-prompt for approval
```

## 5. SELF-LEARNING WORKFLOW

The system builds a cross-session wisdom loop through two automatic hooks and dual-source learning:

```ascii
┌─────────────────────────────────────────────────────────────────┐
│              SELF-LEARNING FEEDBACK LOOP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  (Start) Query Both Sources ────▶ (Work) Agent Execution        │
│       ▲  ├─ LEDGER.md learnings                                 │
│       │  └─ Memory Lane (semantic)        │                     │
│       │                                   ▼                     │
│  (Next) Repeat Success    ◀──── (End) Capture Learnings         │
│         Avoid Mistakes            ├─ Save to LEDGER             │
│                                   └─ Store in Memory Lane       │
│                                         (Memory Catcher)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Dual-Source Learning Retrieval

| Source | Format | Purpose | Tool |
|--------|--------|---------|------|
| **LEDGER.md** | Markdown | Current session, fast local | `ledger_get_learnings` |
| **Memory Lane** | Vector DB | Cross-session, semantic search | `memory-lane_find` |

• **Injection**: Queries Memory Lane for relevant `corrections` or `preferences` at session start.
• **Capture**: The `memory-catcher` agent distills the transcript into taxonomy entries.

## 6. DIRECTORY STRUCTURE & NAMING

Agents follow a standardized layout for discovery:
• **Global Path**: `~/.config/opencode/skill/<skill-name>/agents/<agent-name>/SKILL.md`
• **Naming**: `kebab-case` for both skills and agents.
• **Invocation**: `skill_agent({ skill_name: "code-reviewer", agent_name: "security-auditor" })`

## 7. PROJECT VISION & SPECS

• **[ROADMAP.md](ROADMAP.md)**: Vision and planned enhancements.
• **[Agent Interaction Patterns](.gemini/antigravity/brain/.../agent_interaction_patterns.md)**: Detailed sequence diagrams.
• **Module Specifications**:
  • [Orchestrator Spec](src/orchestrator/SPEC.md): Technical details of coordination and supervision.
  • [Memory Lane Spec](src/memory-lane/SPEC.md): Semantic storage and learning extraction.
  • [OpenCode Integration](src/opencode/SPEC.md): Loader mechanism and runtime hooks.

---

_Last Updated: 2025-12-31_
