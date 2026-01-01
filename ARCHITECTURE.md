# ARCHITECTURE & DESIGN PATTERNS

This document outlines the core architectural principles, design patterns, and workflows implemented in the `opencode-agent-addons` plugin.

## 1. Design Philosophy: Skill-Based Subagents

Instead of a single monolithic agent, this system utilizes a **Skill-Based Subagent** architecture. This represents a paradigm shift where domain expertise is packaged into reusable, on-demand workers.

### Monolithic vs Skill-Based (The Hybrid Delegator)

```ascii
┌─────────────────────────────────────────────────────────────────┐
│                   MONOLITHIC VS SKILL-BASED                     │
│─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ Monolithic Approach ]       [ Skill-Based System ]           │
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

1.  **Discovery Layer**: Dynamically scans `~/.config/opencode/skill/` for Markdown (`.md`) or TypeScript (`.ts`) subagent definitions.
2.  **Spawning Layer**: Uses the `skill_agent` tool to invoke OpenCode's native `task` or `background_task` APIs, creating isolated Actor sessions.

## 2. Core Design Patterns

### I. Actor Model (Isolation)

Treats each agent as a **Stateless Actor**. Communication occurs via structured JSON results, and no chat history is passed between spawns to preserve context purity.

### II. Event-Sourced Persistence (Durable Stream)

Ensures continuity and auditability. The `Durable Stream` acts as an append-only event log, while `LEDGER.md` serves as the primary project state view.

### III. Universal Memory (Semantic Sidecar)

A standalone vector database (Memory Lane) that works with **all agents**. It automatically captures learnings when sessions go idle and injects relevant context at session start.

## 3. Workflow Patterns

These patterns emphasize human-in-the-loop checkpoints and autonomous governance.

### I. Pattern 1: Strategic Polling (Chief-Led)

Used when a request is ambiguous or requires critical choices.
• **Detection**: Chief-of-Staff identifies missing Directives.
• **Polling**: Presents structured options (A/B/C) to the user.
• **Enforcement**: Once selected, the option becomes an immutable Directive for all subagents.

### II. Pattern 2: Spec-Driven Development (SDD)

Phased execution for new features or complex tasks.
• **Phase 1: Clarification**: (Interviewer) ⭐ needs_input
• **Phase 2: Specification**: (Spec-Writer) ⭐ needs_approval
• **Phase 3: Strategy**: (Oracle) Automated task decomposition.
• **Phase 4: Planning**: (Planner) ⭐ needs_approval
• **Phase 5: Execution**: (Executor) Supervised implementation.
• **Phase 6: Validation**: (Validator) QA against specifications.

### III. Pattern 3: Autonomous Tracking (Auto-Ledger)

Works with native OpenCode agents (Code, Build).
• **Hook**: Listens for file modifications across any tool.
• **Logging**: Automatically updates `LEDGER.md` progress logs.
• **Continuity**: Ensures custom subagents can see what native agents have done.

## 4. LEDGER.md: Single Source of Truth

The `.opencode/LEDGER.md` file persists project state across sessions and context clears.

### Structure

```
┌─────────────────────────────────────────┐
│            LEDGER.md Structure          │
├─────────────────────────────────────────┤
│ ## Governance                           │
│   Directives (Law) & Assumptions (Debt) │
│                                         │
│ ## Epic: [Current Project]              │
│   - Task 1: executor → completed ✓      │
│   - Task 2: Code Agent → auto-tracked   │
│                                         │
│ ## Learnings                            │
│   - Patterns and Anti-patterns          │
│                                         │
│ ## Progress Log                         │
│   - Real-time audit of all actions      │
└─────────────────────────────────────────┘
```

## 5. SELF-LEARNING WORKFLOW (v4.1)

The system builds cross-session wisdom through autonomous hooks and event-driven extraction:

```ascii
┌─────────────────────────────────────────────────────────────────┐
│              UNIVERSAL SELF-LEARNING LOOP                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  (Start) Message Received ─────▶ (Work) Any Agent (Native/Custom)│
│       ▲  ├─ Inject relevant memory      │ (Tool Usage)           │
│       │  └─ Load Ledger state           ▼                        │
│       │                                                          │
│  (Next) Repeat Success    ◀──── (End) Session Idle/Exit          │
│         Avoid Mistakes            ├─ Auto-Extract Learnings      │
│                                   └─ Log to Durable Stream       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

• **Extraction**: Uses `LearningExtractor` to analyze transcripts for corrections, decisions, and patterns.
• **Persistence**: Stored in Memory Lane (Vector DB) and emitted as events to the Durable Stream.

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
