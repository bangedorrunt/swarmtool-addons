# Context Engineering Research Summary

## Article: Context Engineering for AI Agents:

**Source:** Phil Schmid, December 2025
**Based on:** Manus Peak Ji webinar + Lance Ji (LangChain) + industry research

## Core Definitions

### Context Engineering

The discipline of designing a system that provides the right information and tools, in the right format, to give an LLM everything it needs to accomplish a task. Includes:

- Context Offloading (move information to external system)
- Context Reduction (compress history)
- Context Retrieval (add information dynamically)
- Context Isolation (separate context)

### Agent Harness

Software wrapper around the model that:

- Executes tool calls
- Manages message history loop
- Handles Context Engineering logic
- Separates reasoning (LLM) from execution (harness)

### Critical Phenomena

**Context Rot:** Performance degradation as context fills up, even within technical limits. Effective context window (~256k tokens) << advertised limit (1M+ tokens).

**Context Pollution:** Too much irrelevant/redundant/conflicting information that distracts the LLM and degrades reasoning.

**Context Confusion:** Failure mode where LLM cannot distinguish between instructions, data, and structural markers, or encounters logically incompatible directives. Occurs when System Instructions clash internally or with user instructions.

## Five Key Principles

### 1. Context Compaction and Summarization Prevent Context Rot

**Hierarchy: Raw > Compaction > Summarization**

**Context Compaction (Reversible):**

- Strip redundant information that exists in environment
- If agent needs to read code later, use tool to read file
- Example: Instead of 500-line code file in chat history, only store path: `Output saved to /src/main.py`

**Summarization (Lossy):**

- Use LLM to summarize history including tool calls and messages
- Trigger at context rot threshold (e.g., 128k tokens)
- Keep recent tool calls in raw format to preserve model's "rhythm" and formatting style
- Example: If context > 128k, summarize oldest 20 turns using JSON, keep last 3 turns raw

### 2. Share Context by Communicating, Not Communicate by Sharing Context

**Principle:** "Share memory by communicating, don't communicate by sharing memory" (GoLang applied to agents)

**Discrete Tasks:**

- Spin up fresh sub-agent with its own context
- Pass only specific instruction
- Example: "Search this documentation for X"

**Complex Reasoning:**

- Share full context only when sub-agent MUST understand entire trajectory
- Example: Debugging agent needs to see previous error attempts
- Treat shared context as expensive dependency to minimize
- Forking context breaks KV-cache

### 3. Keep the Model's Toolset Small

**Problem:** 100+ tools lead to Context Confusion (hallucinated parameters, wrong tool calls)

**Solution: Hierarchical Action Space**

**Level 1 (Atomic):**

- ~20 core tools: `file_write`, `browser_navigate`, `bash`, `search`
- Stable and cache-friendly

**Level 2 (Sandbox Utilities):**

- Instead of specific tools (e.g., `grep`), instruct model to use `bash` tool to call CLI commands
- Example: `mcp-cli <command>` keeps tool definitions out of context window

**Level 3 (Code/Packages):**

- For complex logic chains (Fetch city → Get ID → Get Weather)
- Provide libraries/functions that handle logic
- Let agent write dynamic script instead of 3 LLM roundtrips

### 4. Treat Agent as Tool with Structured Schemas

**Anti-pattern:** Org chart of agents (Manager, Designer, Coder) chatting with each other

**Pattern: Agent-as-Tool**

- For main model, "Deep Research" or "Plan Task" = tool call
- Main agent invokes: `call_planner(goal="...")`
- Harness spins up temporary sub-agent loop
- Returns structured result

**MapReduce Pattern:**

- Main agent treats sub-agent like deterministic code function
- Defines goal, tools, and output schema (e.g., specific JSON structure)
- Data returned instantly usable without further parsing

### 5. Embrace Iteration and Minimal Complexity

**The Bitter Lesson:** The harness you build today will be obsolete when next frontier model drops

**Principles:**

- Don't train your own models (yet) - locks you into local optimum
- Use Context Engineering as flexible interface that adapts to improving models
- Biggest gains come from REMOVING things, not adding
- Manus rewritten 5 times in 6 months
- LangChain re-architected Open Deep Research 4 times

**Stochastic Gradient Descent:** Rewrite is normal. As models get smarter, harness changes. If harness gets more complex while models improve, you're over-engineering.

## Implementation Best Practices

### Don't Use RAG for Tool Definitions

- Fetching tool definitions dynamically per step based on semantic similarity fails
- Creates shifting context that breaks KV-cache
- Confuses model with "hallucinated" tools present in turn 1 but gone in turn 2

### Define Pre-Rot Threshold

- If model has 1M context window, performance degrades around < 256k
- Don't wait for API error
- Monitor token count and implement Compaction/Summarization BEFORE hitting rot zone

### Use Agent-as-a-Tool for Planning

- Early Manus used constantly rewritten `todo.md` file (~30% token waste)
- Better: Specific Planner sub-agent returning structured Plan object
- Object injected into context only when needed

### Security & Manual Confirmation

- Sandbox isolation not enough for browser/shell access
- Enforce rules that tokens don't leave sandbox
- Use human-in-the-loop interrupts for Manual Confirmation before proceeding

### The "Intern Test"

- Static benchmarks like GAIA saturated quickly
- Didn't align with user satisfaction
- Focus on computationally verifiable tasks:
  - Did code compile?
  - Did file exist after command ran?
  - Can sub-agent verify parent's output?
- Use binary success/fail metrics on real environments over subjective LLM-as-a-Judge scores

## Key Takeaway

"Context Engineering is not about adding more context. It is about finding the minimal effective context required for the next step."

**As models get stronger, we shouldn't be building more scaffolding, we should be getting out of the model's way.**

## Relevance to OpenCode Swarm-Plugin

This research is HIGHLY relevant to the OpenCode project:

3. **Skills System**: Hierarchical knowledge injection (similar to hierarchical action space)
4. **Multi-agent coordination**: Could benefit from Agent-as-Tool pattern
5. **Context Optimization**: Current 128k context limits align with Pre-Rot Threshold concept

## Tags

context-engineering, phil-schmid, memory, agent-systems, multi-agent, context-optimization, agent-harness
