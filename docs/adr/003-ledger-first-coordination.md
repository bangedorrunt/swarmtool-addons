# ADR 003: LEDGER-FIRST COORDINATION PATTERN

## Status
Done

## Context
As agentic workflows become more complex, relying on the LLM's conversation context for state management leads to "context rot" (degraded performance due to noise, token limits, and lost focus). We need a robust way to maintain state across long-running tasks, multiple sessions, and parallel agent executions.

## Decision
We adopt the "Ledger-First" and "Non-Invasive Sidecar" coordination pattern, inspired by `Continuous-Claude-v2`.

### Key Components:
1. **The Ledger**: A structured Markdown file (`LEDGER.md`) serving as the absolute source of truth for an Epic's state, current task, and context.
2. **Lifecycle Hooks**: Automatic loading/saving of the Ledger at session boundaries via OpenCode `tool.execute.after` hooks.
3. **Agent-as-Tool**: Decomposing work into small, focused tasks executed by sub-agents with clean context, orchestrated by a "Chief of Staff" using the Ledger.

## Consequences
### Positive
• PERSISTENCE: Work can be paused and resumed across `/clear` or session exits without losing state.
• RELIABILITY: Reduced risk of "hallucinated state" by forcing the agent to read/write to a physical file.
• TOKEN EFFICIENCY: Minimal context needed for each session; only the Ledger and immediate task requirements are loaded.
• PARALLELISM: Multiple agents can work on different tasks if the Ledger supports task-level dependencies.

### Negative
• LATENCY: Small overhead for reading/writing the Ledger at session boundaries.
• FILE CHURN: Frequent updates to Ledger files in the `.hive/` or `thoughts/` directory.

## References
• [Continuous-Claude-v2](https://github.com/parcadei/Continuous-Claude-v2)
• [OpenCode Swarm Coordination Spec](../src/opencode/skill/swarm-coordination/SKILL.md)
