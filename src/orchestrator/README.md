# Orchestrator Module

> **Smart AI agents that remember, learn, and work together.**

The Orchestrator module provides skill-based agents that can be composed into powerful workflows. Each agent is a specialist that focuses on one thing and does it well.

---

## 🚀 Quick Start

### Get Expert Advice

```
"Ask the oracle: Should I use PostgreSQL or MongoDB for a real-time analytics app?"
```

### Research a Library

```
"Ask the librarian about Drizzle ORM migration patterns"
```

### Plan a Feature

```
"Create a plan for implementing user authentication with OAuth"
```

---

## 📦 Available Agents

| Agent                        | What It Does                 | When to Use                                   |
| ---------------------------- | ---------------------------- | --------------------------------------------- |
| **👔 Chief-of-Staff**        | Governor & Strategist (v4.1) | Complex multi-step projects, drift prevention |
| **🔮 Oracle**                | Tactical Architect (v4.1)    | Architecture questions, technology choices    |
| **🎯 Interviewer**           | Strategist with Polling      | Complex multi-turn clarification only         |
| **🔨 Executor**              | Transparent Worker (v4.1)    | Actual code implementation (TDD)              |
| **📋 Spec-Writer**           | Requirements documenter      | Before starting new features                  |
| **📐 Planner**               | Implementation strategist    | Creating step-by-step plans                   |
| **✅ Validator**             | Quality gate checker         | Reviewing plans against best practices        |
| **📚 Librarian**             | Library research specialist  | Learning new libraries, finding examples      |
| **🔍 Explore**               | Codebase search expert       | Finding code, understanding project structure |
| **🧠 Memory-Catcher**        | Learning extractor           | Automatically captures what you prefer        |
| **🏗️ Workflow-Architect**    | Pattern designer             | Creating new workflow patterns                |
| **📝 Spec-Reviewer**         | Spec compliance checker      | First stage of two-stage review               |
| **🎯 Code-Quality-Reviewer** | Code quality checker         | Second stage of two-stage review              |
| **🐛 Debugger**              | Root cause analyst           | Systematic debugging (4-phase protocol)       |

> ⭐ **v4.1 agents** include Governance features: `assumptions_made` output, Directive compliance, and Event-Sourced Persistence.

---

## 🎯 Workflow Patterns

### Pattern 1: Strategic Polling ⭐ NEW

**When to use:** A request requires a choice between multiple valid technical approaches.

**What happens:**

1. Chief-of-Staff identifies a missing **Directive**.
2. Instead of asking open-ended questions, it generates a **Poll** (A/B/C).
3. Your selection becomes an immutable constraint for all sub-agents.

---

### Pattern 2: Spec-Driven Development (Multi-Agent)

**When to use:** You want a thorough, validated approach for important features.

**What happens:**

1. **Interviewer** clarifies requirements if needed.
2. **Spec-Writer** creates detailed specification.
3. **Planner** creates implementation plan.
4. **Validator** checks plan against best practices.
5. **Executor** implements with TDD.

---

### Pattern 3: Autonomous Project Tracking ⭐ NEW

**When to use:** You use native OpenCode agents (like Code or Build) alongside custom specialists.

**What happens:**

1. The system hooks into file modification tools.
2. Changes are automatically logged to the `## Progress Log` in `LEDGER.md`.
3. The context of native agent work is preserved for future sub-agent spawns.

---

### Pattern 4: Universal Self-Learning ⭐ NEW

**When to use:** Always active for all agents.

**What happens:**

1. When a session goes idle, `LearningExtractor` analyzes the conversation.
2. It detects corrections ("No, do X instead") and successful patterns.
3. These are vectorized into **Memory Lane** and injected into future sessions.

---

## 🏛️ Governance (v4.1)

Chief-of-Staff now manages **Directives** (The Law) and **Assumptions** (The Debt):

```
┌─────────────────────────────────────────┐
│        .opencode/LEDGER.md              │
├─────────────────────────────────────────┤
│ ## Governance                           │
│                                         │
│ ### Directives (The Law)                │
│ - [x] Tech Stack: Next.js (User)        │
│ - [x] Database: PostgreSQL (User)       │
│                                         │
│ ### Assumptions (The Debt)              │
│ - [?] UI Lib: Shadcn (Executor: standard)│
│ - [?] Auth: Clerk (Oracle: fastest)     │
└─────────────────────────────────────────┘
```

**Key concepts:**

- **Directives**: User decisions that agents MUST follow.
- **Assumptions**: Agent decisions pending user review.
- **Durable Checkpoints**: Human-in-the-loop approvals that survive session clears.

---

## 📋 State Persistence (LEDGER.md)

All project state is persisted to `.opencode/LEDGER.md`, ensuring that different agents can collaborate on the same project without losing context.

**Why it matters:**

- Resume work after session ends or context clears.
- Unified progress view across native and custom agents.
- Accumulate architectural decisions and patterns permanently.

---

## 🔐 Access Control

Sub-agents are protected by access control to ensure they only operate under the governance of the Chief-of-Staff.

| Agent              | Can Call Directly? | Recommended        |
| ------------------ | ------------------ | ------------------ |
| **chief-of-staff** | ✅ Yes             | Direct Interaction |
| Sub-Agents         | ❌ No              | Delegation via CoS |

---

## 📚 Further Reading

- [SPEC.md](./SPEC.md) - Technical architecture
- [AGENTS.md](../../AGENTS.md) - Sub-agent implementation guide
- [Memory Lane Spec](../memory-lane/SPEC.md) - Semantic memory details
