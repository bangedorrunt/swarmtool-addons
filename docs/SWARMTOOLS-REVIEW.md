# Codebase Review: Swarm Tools Architecture & Context Engineering

## 1. Executive Summary
This document provides a comprehensive review of the Swarm Tools architecture, implementation patterns, and strategic improvements based on modern Context Engineering principles (specifically Phil Schmid's "Context Engineering for AI Agents: Part 2").

Swarm Tools is a high-integrity multi-agent orchestration framework that leverages **Event Sourcing** and the **Actor Model** to manage parallel workflows for AI coding agents.

---

## 2. Architectural Analysis

### 2.1 The Nervous System: Swarm Mail & Durable Streams
Swarm Mail implements a local-first Actor Model using an embedded PGLite (Postgres) database as an event store.

*   **Durable Streams Protocol:** The system implements the semantics of durable, append-only byte streams. Every inter-agent message is a `message_sent` event.
*   **Synchronous Projections:** Unlike distributed systems with eventual consistency, Swarm Tools uses synchronous projections. When an event is appended, the materialized views (Inbox, Reservations) are updated immediately. This ensures "Read-Your-Own-Writes" consistency, which is critical for agent coordination.
*   **Application-Level Locking:** File locks (Reservations) are managed via `DurableLock` primitives using optimistic concurrency control (CAS) on the projections table.

### 2.2 The Brain: Learning & Heuristics
The Learning System optimizes decomposition strategies based on historical execution outcomes.

*   **Confidence Decay:** Learned patterns have a 90-day half-life. $V_{current} = V_{raw} \times 0.5^{(\frac{age}{90})}$. This ensures that stale engineering practices don't persist indefinitely.
*   **Implicit Feedback Scoring:** Success, Duration, Errors, and Retries are weighted to score the "Process Quality" of a task decomposition.
*   **3-Strike Rule:** Prevents infinite retry loops by detecting architectural stalls. After 3 failures on a single cell, the system triggers a mandatory architectural review.

---
## 3. Context Engineering Concepts

### 3.1 Core Definitions (from Phil Schmid)

**Context Engineering** is the discipline of designing a system that provides the right information and tools, in the right format, to give an LLM everything it needs to accomplish a task. Key dimensions:

| Concept | Definition | Swarm Tools Alignment |
|----------|-------------|---------------------|
| **Context Rot** | LLM performance degrades as context fills, even within technical limits (effective window ~256k tokens) | Partially addressed via checkpoint system, but compaction still uses summarization |
| **Context Pollution** | Too much irrelevant/redundant information distracts LLM and degrades reasoning | `output-guardrails.ts` truncates responses; Memory Lane prevents duplicate injections |
| **Context Confusion** | LLM cannot distinguish instructions/data/markers or encounters conflicting directives | Hierarchical tool structure (Coordinator vs Workers) reduces confusion |
| **Effective Context Window** | Quality performance range (<256k for most models) vs advertised limit (1M+) | Not explicitly monitored; compaction triggered by OpenCode, not rot threshold |

**Key Insight from Phil Schmid**: "Context Engineering is not about adding more context. It is about finding the **minimal effective context** required for the next step."

### 3.2 Context Compaction vs Summarization

Phil Schmid distinguishes two approaches to reducing context:

#### Compaction (Reversible) ✅
Strip information redundant because it exists in the environment. If the agent needs it later, it can use a tool to retrieve.

**Examples:**
- Replace 500-line file with path: `Output saved to /src/main.py`
- Replace tool output with reference: `See results of swarmmail_inbox(limit=5)`

**Swarm Tools Status**: **PARTIALLY IMPLEMENTED**
- ✅ `output-guardrails.ts` truncates responses (structure-aware)
- ✅ `swarmmail_inbox()` limits to 5 messages without bodies
- ❌ No `swarm_context_stash()` / `swarm_expand()` tools for reversible compaction
- ❌ Compaction hook preserves swarm state but doesn't replace large context blocks with stash IDs

#### Summarization (Lossy) ⚠️
Use LLM to summarize history including tool calls/messages. Triggered at context rot threshold (e.g., 128k tokens). Keep most recent tool calls raw to maintain "rhythm."

**Swarm Tools Status**: **CURRENT APPROACH**
- `compaction-hook.ts` injects swarm context but doesn't specify tail preservation
- OpenCode's summarization may wipe recent tool calls
- **Gap**: No explicit instruction to preserve last 3-5 tool calls in raw format

**Recommendation**: Update `compaction-hook.ts` to enforce raw tail preservation:

```typescript
// Add to SWARM_COMPACTION_CONTEXT
export const TAIL_PRESERVATION_INSTRUCTION = `
## TAIL PRESERVATION (MANDATORY)

When summarizing, you MUST preserve the last 5-10 tool calls in their RAW XML/JSON format.
This maintains the model's "rhythm" and prevents degradation of output quality.

DO NOT summarize:
- The most recent swarmmail_inbox() calls
- The most recent swarm_progress() calls
- The most recent hive_query() calls

These should appear in the summary exactly as they appeared in the conversation.
`;
```

#### Priority Order
**Phil Schmid recommends**: Raw > Compaction > Summarization

**Swarm Tools Reality**: Currently prioritizes Summarization (lossy) over Compaction (reversible). This is a missed opportunity for preserving precision.

### 3.3 Share Context by Communicating, Not by Sharing Context

**Problem**: Multi-agent systems fail due to context pollution. If every sub-agent shares the same context, massive KV-cache penalty + confusion.

**Solution from GoLang**: "Share memory by communicating, don't communicate by sharing memory."

#### Discrete Tasks ✅
Fresh sub-agent with specific instruction (no full history).

**Examples:**
- "Search this documentation for X"
- "Find implementation pattern Y in codebase"

**Swarm Tools Status**: **IMPLEMENTED**
- `swarm_spawn_subtask()` creates isolated worker agents
- Workers receive only: subtask description, file list, shared context
- Coordinator manages full context; workers stay focused

#### Complex Reasoning ⚠️
Share full history only when sub-agent must understand entire trajectory (e.g., debugging agent needing previous error attempts).

**Swarm Tools Status**: **POTENTIALLY VIOLATED**
- `SUBTASK_PROMPT_V2` includes `compressed_context` parameter
- Recovery mechanism injects `recovery_context.shared_context`
- **Risk**: If `compressed_context` is too large, workers inherit coordinator's pollution

**Recommendation**: Use `swarm_expand(stash_id)` pattern instead of passing compressed context. Workers fetch what they need on demand.

### 3.4 Keep the Model's Toolset Small (Hierarchical Action Space)

**Problem**: 100+ tools → Context Confusion. LLM hallucinates parameters, calls wrong tools.

**Solution**: Hierarchical Action Space with 3 levels.

#### Level 1: Atomic Tools (~20 core)
Stable, cache-friendly, always visible.

**Swarm Tools Atomic Layer**:
| Category | Tools |
|-----------|--------|
| Work Tracking | `hive_create`, `hive_query`, `hive_update`, `hive_close` |
| Coordination | `swarmmail_init`, `swarmmail_send`, `swarmmail_inbox`, `swarmmail_reserve` |
| Orchestration | `swarm_init`, `swarm_status`, `swarm_progress`, `swarm_complete` |

**Current Count**: ~15 atomic tools ✅

#### Level 2: Sandbox Utilities
Use general tools (bash, browser) instead of specific commands.

**Phil Schmid Example**: `mcp-cli <command>` instead of specific tools for grep, ffmpeg, etc.

**Swarm Tools Status**: **MIXED**
- ✅ Uses `bash` tool for CLI commands
- ⚠️ Has both `swarmmail_inbox()` AND `swarmmail_read_message()` (could be combined)
- ❌ Exposes internal coordination tools (`mailbox_init`, `reserve_files`) to coordinator unnecessarily

**Recommendation**: Create a curated "Primary" toolset:

```typescript
// Tools visible to Coordinator ONLY
const COORDINATOR_TOOLS = {
  // Hive (atomic)
  hive_create_epic, hive_query, hive_update, hive_close,

  // Swarm orchestration (atomic)
  swarm_decompose, swarm_spawn_subtask, swarm_status, swarm_complete,

  // Messaging (atomic)
  swarmmail_broadcast, swarmmail_inbox,  // NOT swarmmail_read_message

  // Learning (atomic)
  swarm_record_outcome, semantic_memory_find, semantic_memory_store,

  // Skills (atomic)
  skills_list, skills_use,

  // Internal coordination (HIDDEN from Coordinator)
  // swarmmail_init, swarmmail_reserve, swarmmail_release - used by workers only
};
```

#### Level 3: Code/Packages
Libraries/functions for complex logic chains.

**Swarm Tools Status**: **IMPLEMENTED via Skills**
- `skills_use(name="testing-patterns")` loads 25 dependency-breaking techniques
- `skills_use(name="swarm-coordination")` loads multi-agent patterns
- These are pre-compiled knowledge packages, not tool definitions ✅

**Gap**: No reusable code functions for common patterns (e.g., "auth_flow" function for fetch token → validate → refresh).

### 3.5 Treat Agent as Tool with Structured Schemas (MapReduce Pattern)

**Anti-Pattern**: "Org Chart" of agents (Manager, Designer, Coder) that chat with each other. This is anthropomorphic over-engineering.

**Phil Schmid Solution**: Treat sub-agents as **deterministic function calls**.

**Pattern**: `call_planner(goal="...")` returns structured Plan object. Main agent uses result without further conversation.

**Swarm Tools Status**: **IMPLEMENTED ✅**
```typescript
// Coordinator calls planner like a function
const planningResult = await Task({
  subagent_type: "swarm/planner",
  description: "Decompose task into subtasks"
});

// Parses structured JSON result
const cellTree = JSON.parse(planningResult);
// { epic: {...}, subtasks: [...] }

// No conversation - just data in, data out
```

**WorkerHandoff Schema**: Defines machine-readable contract between coordinator and workers.

```typescript
interface WorkerHandoff {
  task_id: string;
  files_owned: string[];
  files_readonly: string[];
  dependencies_completed: string[];
  success_criteria: string[];
  epic_summary: string;
  your_role: string;
  what_others_did: string;
  what_comes_next: string;
}
```

**Key Insight**: "The main agent treats the sub-agent exactly like a deterministic code function. It can define the goal, tools, and output schema. This ensures the data returned is instantly usable without further parsing."

### 3.6 Best Practices from Phil Schmid

#### Don't Use RAG for Tool Definitions ❌
Dynamic tool fetching breaks KV cache and confuses models with "hallucinated" tools that disappear between turns.

**Swarm Tools Status**: **COMPLIANT ✅**
- All tool definitions are static in `plugin.ts`
- No dynamic tool discovery
- Tools don't change during session

#### Don't Train Your Own Models (Yet) ⚠️
The harness will be obsolete when next frontier model drops. Training locks into local optimum.

**Swarm Tools Status**: **COMPLIANT ✅**
- No model training
- Learning system is **behavioral** (pattern maturity, confidence decay)
- Focus on context engineering as flexible interface

#### Define a "Pre-Rot Threshold" ❌
Monitor token count and compact before hitting rot zone (~256k effective limit).

**Swarm Tools Status**: **NOT IMPLEMENTED**
- Relies on OpenCode to trigger compaction
- No explicit token monitoring in swarm system
- **Risk**: May already be in rot zone when compaction happens

**Recommendation**: Add `swarm_monitor_context()` tool:

```typescript
export const swarm_monitor_context = tool({
  description: "Check context utilization and recommend compaction if near rot threshold",
  args: {},
  async execute() {
    // Pseudo-code - OpenCode API integration needed
    const tokenCount = await getCurrentTokenCount();
    const utilization = tokenCount / 256000; // Effective limit

    if (utilization > 0.8) {
      return {
        status: "WARNING",
        utilization: `${(utilization * 100).toFixed(1)}%`,
        recommendation: "Trigger manual compaction or reduce context usage"
      };
    }

    return {
      status: "OK",
      utilization: `${(utilization * 100).toFixed(1)}%`,
      recommendation: "Continue"
    };
  }
});
```

#### Agent-as-a-Tool for Planning ✅
Instead of `todo.md` file (wasted ~30% tokens), use Planner sub-agent returning structured Plan object.

**Swarm Tools Status**: **IMPLEMENTED ✅**
- `swarm_plan_prompt()` generates planning prompt
- Returns `CellTree` schema (epic + subtasks)
- No persistent todo files

#### The "Intern Test" ✅
Use binary success/fail metrics on real environments, not subjective LLM-as-a-Judge scores.

**Swarm Tools Status**: **PARTIALLY IMPLEMENTED**
- ✅ Implicit feedback scoring (duration, errors, retries, success)
- ✅ UBS scan runs on `swarm_complete()`
- ✅ Tests run via TDD workflow
- ⚠️ Still uses `swarm_evaluation_prompt()` with self-assessment (subjective)

**Recommendation**: Prioritize objective signals:
```typescript
// Current (subjective)
const evaluation = await swarm_evaluation_prompt({ bead_id, subtask_title, files_touched });

// Objective-only (add to swarm_complete)
const objectiveChecks = {
  compiles: await runTypecheck(files_touched),  // binary
  tests_pass: await runTests(files_touched),        // binary
  bugs_found: await runUBSScan(files_touched),    // binary count
  files_match: files_touched.length === planned_files.length  // binary
};
```

#### Security & Manual Confirmation ✅
Human-in-the-loop for dangerous operations.

**Swarm Tools Status**: **NOT IMPLEMENTED**
- No confirmation prompts for risky operations
- **Risk**: Agents can run destructive commands without approval

**Recommendation**: Add guardrails:
```typescript
// Before destructive operations
if (operation.isDestructive) {
  const approved = await requestUserApproval({
    operation: operation.name,
    risk: operation.riskLevel,
    preview: operation.preview
  });

  if (!approved) return "Operation cancelled by user";
}
```

#### Embrace "Stochastic Gradient Descent" ✅
Rewrite as models improve. Remove scaffolding rather than adding it.

**Swarm Tools Status**: **IN PROGRESS**
- 5 rewrites in 6 months (Manus case study) - consistent with industry
- Learning system removes bad patterns (anti-patterns)
- **Gap**: No mechanism to detect over-engineering and trigger refactoring

### 3.7 Swarm Tools Context Engineering Scorecard

| Phil Schmid Principle | Status | Evidence | Gap |
|---------------------|---------|-----------|------|
| **Reversible Compaction** | ❌ Partial | `output-guardrails.ts` truncates but no stash/expand | Missing stash tools, tail preservation |
| **Minimal Toolset** | ⚠️ Mixed | ~15 atomic tools ✅, but exposes internal coordination | Curated "Primary" toolset needed |
| **Share by Communicating** | ⚠️ Mixed | Isolated workers ✅, but compressed_context pollution | Replace with expand-on-demand |
| **Hierarchical Action Space** | ✅ Implemented | Atomic + Sandbox + Skills levels | Could add Level 3 code functions |
| **Agent-as-Tool** | ✅ Implemented | WorkerHandoff schema, structured output | None |
| **Pre-Rot Threshold** | ❌ Missing | No token monitoring | Add context monitoring tool |
| **Objective Evaluation** | ⚠️ Partial | UBS + tests ✅, but subjective self-eval | Prioritize objective signals |
| **Dynamic Tool Avoidance** | ✅ Compliant | Static tool definitions, no RAG | None |

**Overall Grade**: B+ (Strong foundation, compaction and monitoring gaps)

### 3.8 Actionable Improvements

#### High Priority (Immediate Impact)

1. **Implement Reversible Compaction** (Section 4.1 in REVIEW.md)
   - Add `swarm_context_stash()` and `swarm_expand()` tools
   - Replace large context blocks with stash IDs
   - Preserve raw tail (last 5 tool calls) during summarization

2. **Curate Primary Toolset** (Section 4.2 in REVIEW.md)
   - Create `COORDINATOR_TOOLS` exposing only ~15 atomic tools
   - Hide internal coordination tools (`mailbox_init`, `reserve_files`) from coordinator

3. **Add Context Monitoring** (New)
   - Implement `swarm_monitor_context()` with pre-rot threshold detection
   - Alert at 80% effective context window utilization

#### Medium Priority (Quality Improvements)

4. **Replace Compressed Context with Expand-on-Demand**
   - Remove `compressed_context` parameter from `swarm_spawn_subtask()`
   - Workers fetch context via `swarm_expand(stash_id)` when needed

5. **Prioritize Objective Signals in Evaluation**
   - Remove subjective self-assessment from `swarm_evaluation_prompt()`
   - Focus on: compilation, test results, UBS bug count, file match

6. **Add Safety Guardrails**
   - User confirmation for destructive operations
   - Preview before irreversible actions

#### Low Priority (Future Enhancements)

7. **Create Level 3 Code Functions**
   - Common patterns as reusable functions (auth_flow, data_pipeline, etc.)
   - Reduces repetitive instruction in prompts

8. **Over-Engineering Detection**
   - Metrics to identify unnecessary complexity
   - Trigger refactoring suggestions

---
## 4. Specific Codebase Improvements

### 4.1 Swarm-Mail Primitives
*   **Transition to Effect-TS:** Move remaining functional wrappers in `swarm-mail.ts` to the full `Durable*` class primitives defined in the `effect/` directory to improve type safety and error handling.
*   **WAL Safety:** Improve handling of PGLite WAL (Write-Ahead Log) to prevent corruption when multiple agents attempt to initialize the store simultaneously in high-concurrency swarms.

### 4.2 Application Logic (Based on Provided Snippets)
For applications using this library (e.g., `ResearchManager` and `api_star_reviews`):
*   **Traceability:** Ensure `gen_trace_id()` is propagated through Swarm Mail envelopes so that distributed agent work can be reconstructed in a single trace view.
*   **Metric Feedback:** Connect `ResearchRating` data back into the `swarm_record_outcome` tool to provide **Explicit Feedback** to the learning system, augmenting the current implicit signals.

---

## 5. Actionable Roadmap
1.  [ ] Implement `swarm_context_stash` and `swarm_expand` tools for reversible compaction.
2.  [ ] Update `compaction-hook.ts` to enforce raw preservation of the conversation tail.
3.  [ ] Refactor `swarmTools` to expose a curated "Primary" toolset for Coordinators.
4.  [ ] Integrate `ResearchRating` (Star Reviews) as a direct signal in `learning.ts`.
