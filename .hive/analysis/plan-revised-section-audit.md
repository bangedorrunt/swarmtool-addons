# PLAN_REVISED.md Section Audit

**Epic ID:** swarm-tool-addons--sofrx-mjm9b8qv8qw
**Cell ID:** swarm-tool-addons--sofrx-mjm9b8r04aq
**Agent:** GoldHawk-Worker-2
**Date:** 2025-12-26

## Executive Summary

This audit identifies sections in `docs/PLAN_REVISED.md` that need to be added, removed, updated, or consolidated to reflect the architectural shift toward Phil Schmid's Context Engineering principles, including Agent-as-Tool pattern, Context Compaction (MapReduce, summarization thresholds), and Minimal Complexity principle.

**Key Architectural Shifts:**

1. Agent-as-Tool pattern (both architectures align)
2. Context Engineering with compaction, thresholds, and MapReduce patterns
3. Hierarchical Action Space (managing tool complexity to ~20 tools)
4. Minimal Complexity principle (removing scaffolding vs adding features)

---

## Section Audit Table

| Section                                      | Current Status | Action     | Rationale                                                                                                                                                                                     |
| -------------------------------------------- | -------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executive Summary                            | Lines 3-13     | **UPDATE** | Needs to reflect broader scope beyond Memory Lane integration. Should emphasize architectural alignment with Phil Schmid's Context Engineering (85% aligned).                                 |
| Design Philosophy                            | Lines 15-41    | **KEEP**   | 3-pronged integration approach (hijack hooks, SKILL.md, isolated feature directories) remains valid. Skill-Based Agent Pattern still relevant.                                                |
| Research Context                             | Lines 43-50    | **UPDATE** | Currently lists 3 references. Must add Phil Schmid's Context Engineering as a major influence. Should reference `technical-alignment-phil-schmid-vs-plan-revised.md` analysis.                |
| Auto-Invocation: Three Approaches Considered | Lines 52-135   | **REMOVE** | Option A/B/C decision is complete. This is now an implementation detail, not planning material. Consolidate to brief note in "Architectural Decisions" section.                               |
| Project Architecture                         | Lines 137-169  | **KEEP**   | Directory structure and tool/skill hierarchy remain valid. Minor updates to reference new patterns (compaction, MapReduce).                                                                   |
| Gaps and Next Steps                          | Lines 171-196  | **UPDATE** | Gap 4 (Ollama Context Limits) should expand to full "Context Engineering Strategy: Compaction, Thresholds, and MapReduce". Add new gaps for hierarchical action space and minimal complexity. |
| Next Steps (Actionable Roadmap)              | Lines 198-217  | **UPDATE** | Add implementation roadmap for new patterns (Agent-as-Tool, Context Compaction, Hierarchical Action Space, Minimal Complexity). Should reference Phil Schmid's recommendations.               |
| Conclusion                                   | Lines 219-222  | **UPDATE** | Expand to summarize architectural alignment with Context Engineering (85% aligned), key gaps (compaction strategy, rewrite triggers), and next priorities.                                    |

---

## New Sections to Add

### 1. Architectural Shift: Agent-as-Tool Pattern (NEW)

**Location:** After "Design Philosophy" section

**Content:**

- Phil Schmid's principle: "Share by communicating, not communicate by sharing"
- Implemented via Swarm Mail event bus (decoupled message passing)
- Main model treats sub-agent as tool with structured output (`Task()` tool)
- Avoids anti-pattern of "org chart of agents chatting with each other"
- KV-cache preservation: Each agent gets fresh context, no forking
- Alignment: 100% with Phil Schmid's Agent-as-Tool pattern

**Reference:** `technical-alignment-phil-schmid-vs-plan-revised.md` lines 112-133

---

### 2. Context Engineering Strategy: Compaction, Thresholds, and MapReduce (NEW)

**Location:** After "Architectural Shift" section (replace or expand "Gap 4")

**Content:**

#### Compaction Hierarchy (Schmid's Pattern)

- **Raw:** Unmodified conversation history (recent turns)
- **Compaction (Reversible):** Strip redundant info, keep references
  - Example: Instead of 500-line code file, store path: `Output saved to /src/main.py`
  - Trigger: Immediate (strip what exists in environment)
- **Summarization (Lossy):** LLM-summarizes history
  - Trigger: Context rot threshold (~128k tokens)
  - Strategy: Summarize oldest 20 turns, keep last 3 turns raw
  - Preserve: Recent tool calls to maintain model's "rhythm"

#### MapReduce Pattern

- Main agent spawns sub-agent with specific task
- Sub-agent returns structured output (not chat transcript)
- Main agent immediately uses structured data for next action
- Eliminates need to pass full chat history between agents

#### Context Rot Management

- **Schmid's threshold:** ~256k effective tokens (effective window << advertised 1M+)
- **PLAN_REVISED approach:** Managed via selective retrieval (Memory Lane), not full chat history
- **Gap:** No explicit compaction strategy before rot threshold

**Reference:** `technical-alignment-phil-schmid-vs-plan-revised.md` lines 11-68

---

### 3. Hierarchical Action Space: Managing Tool Complexity (NEW)

**Location:** After "Project Architecture" section

**Content:**

#### Phil Schmid's 3-Level Hierarchy

- **Level 1 (Atomic):** ~20 core tools: `file_write`, `browser_navigate`, `bash`, `search`
  - Stable and cache-friendly
  - Small to prevent Context Confusion (hallucinated parameters, wrong tool calls)
- **Level 2 (Sandbox Utilities):** Instruct model to use `bash` tool
  - Example: `mcp-cli <command>` instead of `grep`, `find`, `sed` tools
  - Keeps tool definitions out of context window
- **Level 3 (Code/Packages):** Complex logic chains handled by libraries/functions
  - Let agent write dynamic script instead of 3 LLM roundtrips
  - Example: Fetch city → Get ID → Get Weather → Single script

#### PLAN_REVISED Implementation

- **Tool Layer:** ~40 total tools (but per-agent = subset via skills)
  - Memory Lane: 3 tools
  - Swarm Coordination: 12 tools
  - Memory System: 6 tools
  - Worktree: 3 tools
  - File Operations: Via `bash` tool (Level 2 pattern) ✓

- **Skill Layer (Orchestration):**
  - Skills = domain expertise + when/why to call tools
  - Each skill has tool_access list (permissions)
  - Workers typically load: swarm-coordination (12) + memory-lane (3) + domain-skill (5-10) = ~20-25 tools ✓

#### Tool Hierarchy Dashboard (Recommended)

- Visualize tool count per skill level
- Flag agents approaching Context Confusion (>30 tools)
- Recommend skill shedding

**Reference:** `technical-alignment-phil-schmid-vs-plan-revised.md` lines 136-226

---

### 4. Minimal Complexity Principle: Removing Scaffolding (NEW)

**Location:** Before "Conclusion" section

**Content:**

#### Phil Schmid's Philosophy

- **"Remove over add"**: Biggest gains come from REMOVING things, not adding
- **Harness obsolescence:** Harness built today will be obsolete when next frontier model drops
- **Rewrite culture:** Manus rewritten 5 times in 6 months; LangChain re-architected Open Deep Research 4 times
- **Over-engineering signal:** If harness gets more complex while models improve, over-engineering

#### PLAN_REVISED Implementation (Aligned)

- **Implicit feedback scoring:** Automatically scores patterns based on success, duration, errors, retries
- **Confidence decay:** Decayed value = raw value × 0.5^(age_days / 90)
- **Pattern maturity:** candidate → established → proven (or deprecated)
- **Anti-pattern inversion:** Auto-invert patterns at >60% failure rate
- **Automatic removal:** Deprecated patterns excluded (0x multiplier), harmful criteria floored at 0.1

#### Gaps in PLAN_REVISED

1. **No harness rewrite mechanism:** Incremental pattern management only, no trigger for wholesale restructure
2. **No complexity monitoring:** No alert when harness gets more complex while models improve
3. **No over-engineering detection:** Can't flag when patterns accumulate without improvement

#### Recommendations

1. Add rewrite triggers based on pattern maturity distribution
2. Monitor complexity vs. model improvement ratio
3. If >30% patterns deprecated → flag for harness review

**Reference:** `technical-alignment-phil-schmid-vs-plan-revised.md` lines 228-337

---

## Sections to Remove

### 1. "Auto-Invocation: Three Approaches Considered" (Lines 52-135)

**Reason:** Option A/B/C decision is complete (Option C: Event-Driven Hook Pattern chosen). This is now an implementation detail, not planning material. The detailed Option A/B rejection rationale is no longer needed.

**Consolidate to:** Brief note in new "Architectural Decisions" section:

```markdown
## Architectural Decisions

### Event-Driven Hook Pattern (Option C) ✅ CHOSEN

**Decision:** Implemented event-driven hook pattern via `createSwarmCompletionHook()` and Swarm Mail.

**Why this approach:**

- Decoupled architecture (swarm-coordination only knows about message bus)
- Non-blocking (doesn't halt swarm workflow)
- Retry-safe (message persists in queue if memory-catcher fails)
- Scalable (other agents can listen to same events)
- Plugin architecture (memory-catcher optional per project)

**Implementation Status:** ✅ Complete - 15/15 tests passing, production-ready
```

---

## Suggested Section Ordering

```markdown
# Plan Revised: Memory Lane as Swarm-Integrated Skill

## Executive Summary [UPDATE]

- Emphasize architectural alignment with Phil Schmid's Context Engineering (85% aligned)
- Broader scope: Memory Lane + Agent-as-Tool + Context Compaction

## Design Philosophy [KEEP]

- 3-pronged integration approach
- Skill-Based Agent Pattern

## Architectural Shift: Agent-as-Tool Pattern [NEW]

- Share by communicating principle
- Swarm Mail event bus implementation
- KV-cache preservation

## Context Engineering Strategy: Compaction, Thresholds, and MapReduce [NEW]

- Compaction hierarchy (Raw > Compaction > Summarization)
- MapReduce pattern
- Context rot management

## Research Context [UPDATE]

- Add Phil Schmid's Context Engineering
- Reference technical-alignment-phil-schmid-vs-plan-revised.md

## Architectural Decisions [CONSOLIDATED]

- Brief note on Event-Driven Hook Pattern (from removed Auto-Invocation section)

## Project Architecture [KEEP]

- Directory structure
- Tool/skill hierarchy

## Hierarchical Action Space: Managing Tool Complexity [NEW]

- Phil Schmid's 3-level hierarchy
- PLAN_REVISED implementation via skills
- Tool count per agent (~20-25)

## Minimal Complexity Principle: Removing Scaffolding [NEW]

- "Remove over add" philosophy
- Implicit feedback scoring and anti-pattern detection
- Gap: No harness rewrite mechanism

## Gaps and Next Steps [UPDATE]

- Gap 4: Expand to full Context Engineering strategy
- Add gaps for hierarchical action space formalization
- Add gaps for harness rewrite triggers

## Next Steps (Actionable Roadmap) [UPDATE]

- Add implementation roadmap for new patterns:
  1. Implement Context Compaction (Schmid's pattern)
  2. Formalize Tool Hierarchies (L1/L2/L3)
  3. Add Rewrite Triggers (monitor pattern maturity)
  4. Tool Hierarchy Dashboard

## Conclusion [UPDATE]

- Summarize 85% alignment with Phil Schmid
- Key gaps: compaction strategy, rewrite triggers
- Next priorities
```

---

## Detailed Rationale by Action

### KEEP Sections (3)

1. **Design Philosophy**: The 3-pronged approach (hijack hooks, SKILL.md, isolated feature directories) is fundamental to the plugin architecture and remains valid. Skill-Based Agent Pattern aligns with Phil Schmid's principles.

2. **Project Architecture**: Directory structure and tool/skill hierarchy are accurate. Minor updates to reference new patterns (compaction, MapReduce) but structure is sound.

3. **Executive Summary**: KEEP but UPDATE to reflect broader scope. Currently focuses only on Memory Lane integration; should emphasize architectural alignment with Context Engineering.

---

### UPDATE Sections (4)

1. **Executive Summary**: Currently narrow (Memory Lane only). Expand to:
   - Architectural alignment with Phil Schmid (85% aligned)
   - Agent-as-Tool pattern
   - Context Engineering (compaction, thresholds, MapReduce)
   - Hierarchical Action Space (~20 tools per agent)
   - Minimal Complexity principle

2. **Research Context**: Currently lists 3 references (existing implementation, swarm-coordination patterns, OpenCode standard). **Must add:**
   - Phil Schmid's Context Engineering principles
   - Reference `technical-alignment-phil-schmid-vs-plan-revised.md` analysis
   - Context of 85% alignment, 10% complementary, 5% divergent

3. **Gap 4: Ollama Context Limits**: Currently a brief section about Ollama context window limits. **Expand to:**
   - Full Context Engineering Strategy section (see "ADD sections")
   - Cover compaction hierarchy, MapReduce pattern, context rot management
   - Reference Schmid's patterns vs. PLAN_REVISED gaps

4. **Next Steps**: Currently lists immediate tasks (investigate Task tool, create tests, etc.). **Add:**
   - Implementation roadmap for new patterns:
     - Implement Context Compaction (strip redundant info, summarization thresholds)
     - Formalize Tool Hierarchies (L1: core tools, L2: sandbox via bash, L3: complex skills)
     - Add Rewrite Triggers (monitor pattern maturity distribution, flag if >30% deprecated)
     - Tool Hierarchy Dashboard (visualize tool count, flag agents approaching Context Confusion)
   - Reference Phil Schmid's recommendations from technical alignment analysis

---

### REMOVE Sections (1)

1. **Auto-Invocation: Three Approaches Considered** (Lines 52-135):
   - **Reason:** Option A/B/C decision is complete (Option C chosen). This is now an implementation detail, not planning material.
   - **Detailed rejection rationale (84 lines):** No longer needed. The pros/cons analysis was useful for decision-making, but after implementation, it's historical context, not forward-looking guidance.
   - **Consolidate to:** Brief note in new "Architectural Decisions" section (see "Consolidation" above).

---

### ADD Sections (4)

1. **Architectural Shift: Agent-as-Tool Pattern** (NEW):
   - Phil Schmid's core principle
   - How PLAN_REVISED implements via Swarm Mail
   - Alignment metrics (100% aligned)
   - Why this matters: decoupling, KV-cache preservation, avoids org chart anti-pattern

2. **Context Engineering Strategy: Compaction, Thresholds, and MapReduce** (NEW):
   - **Critical addition:** This is the biggest gap in PLAN_REVISED (Divergent in analysis)
   - Compaction hierarchy: Raw > Compaction (reversible) > Summarization (lossy)
   - MapReduce pattern: structured output vs. chat transcripts
   - Context rot: Schmid's threshold (~256k tokens) vs. PLAN_REVISED (retrieval-based)
   - Implementation recommendations: add token counting, trigger compaction at 128k, alert on rot

3. **Hierarchical Action Space: Managing Tool Complexity** (NEW):
   - Phil Schmid's 3-level hierarchy (L1: atomic, L2: sandbox, L3: code/packages)
   - PLAN_REVISED's implementation via skills (already ~20-25 tools per agent ✓)
   - Gap: No explicit L1/L2/L3 labeling
   - Recommendation: Formalize hierarchy, create dashboard, flag Context Confusion

4. **Minimal Complexity Principle: Removing Scaffolding** (NEW):
   - Phil Schmid's "remove over add" philosophy
   - PLAN_REVISED's aligned implementation (implicit feedback, decay, anti-pattern detection)
   - Gap: No harness rewrite mechanism (Schmid emphasizes wholesale rewrites 5x in 6 months)
   - Recommendation: Monitor pattern maturity, trigger structural review if >30% deprecated

---

## References

- **PLAN_REVISED.md** (source document)
- **technical-alignment-phil-schmid-vs-plan-revised.md** (565 lines, detailed comparison)
- **memory-catcher-issues.md** (290 lines, context on memory-first patterns)
- **gap-analysis-plan-revised-vs-phil-schmid.md** (26,265 lines, deeper gap analysis)

---

## Next Actions

1. **Review this audit** with coordinator and other agents
2. **Implement section updates** in PLAN_REVISED.md (separate cell)
3. **Create new sections** as outlined above (separate cell)
4. **Remove Auto-Invocation section** and consolidate to Architectural Decisions (separate cell)
5. **Verify alignment** with Phil Schmid's principles after updates

---

**Audit Complete:** Identified 3 KEEP, 4 UPDATE, 1 REMOVE, 4 ADD sections.
