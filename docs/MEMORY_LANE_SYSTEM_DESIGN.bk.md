# Memory Lane System Design for Swarm Tools (Non-Invasive Sidecar)

This document outlines the design for "Memory Lane," an advanced persistent memory system implemented as a standalone OpenCode plugin. It enhances Swarm Tools (opencode-swarm-plugin) by using hooks to provide entity-aware, adaptive learning without modifying the core codebase.

## 1. Executive Summary

Memory Lane transforms agent memory from a simple knowledge store into a **behavioral guidance system**. By leveraging OpenCode's plugin hooks, it intercepts generic memory queries and redirects them to a more sophisticated retrieval engine that prioritizes corrections, decisions, and commitments.

**Zero-Core-Mod Strategy:** This system is built as a "sidecar" plugin. It uses `opencode-swarm-plugin` as a dependency and interacts with it via standardized hooks (`tool.execute.before`, `tool.execute.after`) and an event-driven message bus (`swarm-mail`).

---

## 2. Architectural Shifts

| Feature | Legacy Approach (Fork) | Memory Lane (Sidecar Plugin) |
| :--- | :--- | :--- |
| **Integration** | Direct code modification | **OpenCode Hooks** (Middleware Pattern) |
| **Inference** | Hardcoded prompts in Core | **Dynamic Context Injection** via `tool.execute.before` |
| **Dependency** | Modified Source | **NPM Dependency** (`opencode-swarm-plugin`) |
| **Extraction** | Blocking post-process | **Event-Driven Hook** (Asynchronous Swarm Mail) |
| **Maintenance** | Manual Upstream Syncs | **Conflict-Free** (Versioned dependency) |

---

## 3. Proposed Architecture

### 3.1 Logical Flow (ASCII)

```text
┌─────────────────────────────────────────────────────────────┐
│                      OpenCode Runtime                       │
│  ┌──────────────────────┐           ┌────────────────────┐  │
│  │ Swarm Tools (Core)   │           │ Memory Lane Plugin │  │
│  │ (opencode-swarm-plugin)          │ (this repo)        │  │
│  └──────────┬───────────┘           └──────────┬─────────┘  │
│             │                                  │            │
│             │ 1. Execute tool                  │            │
│             │ (semantic-memory_find)           │            │
│             ├─────────────────────────────────>│            │
│             │                                  │            │
│             │ 2. tool.execute.before Hook      │            │
│             │ <────────────────────────────────┤            │
│             │ (Inject context or swap tool)    │            │
│             │                                  │            │
│             │ 3. Execute with injected context │            │
│             │ <────────────────────────────────┤            │
└─────────────┼──────────────────────────────────┼────────────┘
              │                                  │
              ▼                                  ▼
      ┌──────────────┐                  ┌──────────────────┐
      │  PGLite DB   │◄─────────────────┤ Memory Lane Logic│
      │ (Core Store) │                  │ (Adapter/Search) │
      └──────────────┘                  └──────────────────┘
```

### 3.2 Coordination Flow

1.  **Context Injection (Synchronous):** When a swarm worker attempts to call `semantic-memory_find`, the `tool.execute.before` hook intercepts the call. It either:
    *   Redirects the call to `memory-lane_find`.
    *   OR injects a system instruction into the context to prioritize specific memory types (corrections, decisions).
2.  **Outcome Extraction (Asynchronous):** Upon task completion, `swarm_record_outcome` (in Core) sends a message to `swarm-mail`. The `createSwarmCompletionHook` (in Memory Lane) listens for these events and spawns the `memory-catcher` skill to process the transcript and update the memory store.

---

## 4. Implementation Components

### 4.1 Sidecar Adapter
The `MemoryLaneAdapter` wraps the core `MemoryAdapter` features. It implements the "Dual-Search" algorithm (Entity Filter + Semantic Rank) and "Intent Boosting" (recognizing keywords like "mistake" or "decision").

### 4.2 OpenCode Plugin Entry Point (`src/index.ts`)
The plugin registers:
- **Tools:** `memory-lane_find`, `memory-lane_store`, `memory-lane_feedback`.
- **Hooks:**
    - `tool.execute.before`: Injects "memory-first" directives into workers.
    - `tool.execute.after`: Captures session metrics for feedback loops.
- **Initialization:** Starts the `swarm-mail` listener for asynchronous extraction.

### 4.3 Skill-Based Extraction
The `memory-catcher` is packaged as a skill that utilizes the Agent-as-Tool pattern. It runs independently, preventing long-running extraction processes from blocking the main agent session.

---

## 5. Actionable Roadmap (Refactoring Plan)

### Phase 1: Hook-Based Interception
- [ ] **Implement `tool.execute.before`:** Create a middleware in `src/index.ts` to detect `semantic-memory_find` calls.
- [ ] **Inject Directives:** Automatically append "Prefer memory-lane_find for better entity filtering" to the context of memory tools.
- [ ] **Tool Aliasing:** Experiment with swapping tool execution dynamically if OpenCode allows (otherwise use instruction injection).

### Phase 2: Context Compaction
- [ ] **Transcript Truncation:** Update the `memory-catcher` hook to truncate transcripts to 4k tokens to prevent Ollama failures.
- [ ] **Compaction Logic:** Integrate basic summarization for transcripts exceeding the 4k threshold before extraction.

### Phase 3: Entity Resolution Enhancement
- [ ] **File-Path Resolver:** Improve `resolver.ts` to automatically extract project/feature slugs from `files_touched`.
- [ ] **Metadata Enrichment:** Ensure all extracted memories are tagged with `metadata.lane_version` for future-proofing.

### Phase 4: Feedback Persistence
- [ ] **Refactor `adapter.ts`:** Store aggregate feedback scores directly in the `metadata` JSONB of the memory record.
- [ ] **Re-Ranking Logic:** Ensure retrieval scores are adjusted based on user feedback (+10% helpful / -50% harmful).