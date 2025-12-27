# Research: Skill-Based Subagent Implementation Patterns

## Executive Summary

This document analyzes three approaches for implementing skill-based subagents within the OpenCode ecosystem. The goal is to allow skills to define specialized sub-workers (e.g., `oracle`, `researcher`, `worker`) that can be spawned on-demand. We recommend the **Hybrid Delegator Pattern** as it provides the best balance of flexibility, context isolation, and developer experience.

---

## 1. Approach Analysis

### 1.1 Markdown-in-Skill Pattern (Sisyphus Pattern)

**Mechanism**: Agents are defined as `SKILL.md` files within a `skill-name/agent/{agent-name}/` directory.

- **Context Engineering**: Naturally supports **Progressive Disclosure** (`context-fundamentals`). The main skill only loads references; subagent prompts are loaded just-in-time.
- **Pros**: Zero build step; low barrier for non-developers; consistent with native skill discovery.
- **Cons**: No type safety; limited expressiveness; hard to bundle custom logic or validation.

### 1.2 TypeScript-Plugin Pattern (OMO Pattern)

**Mechanism**: Agents are defined as TypeScript factory functions and registered via the plugin's configuration.

- **System Design**: Creates **Deep Modules** (`system-design`) with full type safety. Complexity of model selection and tool configuration is hidden behind the factory.
- **Pros**: High reliability; IDE support; complex logic possible; build-time validation.
- **Cons**: High coupling; requires rebuild for any change; agents are tied to the plugin, not the skill.

### 1.3 Hybrid Delegator Pattern (Recommended)

**Mechanism**: A specialized `skill_agent` tool resolves agent definitions (MD or TS) from skill paths and spawns them via a central loader.

- **Context Partitioning**: Achieves aggressive **Context Partitioning** (`context-optimization`). Each subagent operates in an isolated context, preventing "observation bloat" in the coordinator.
- **Multi-Agent Pattern**: Implements a **Supervisor/Orchestrator** flow where the main skill delegates atomic tasks to specialized agents.
- **Pros**: Loose coupling; supports mixed formats; supports context isolation; incremental adoption.
- **Cons**: Small indirection overhead (<500ms); requires centralized loader logic.

---

## 2. Skill-Based Architectural Recommendations

### 2.1 Context Isolation & Partitioning

Following `context-optimization` principles, subagents should be used to **partition context**.

- **Recommendation**: The delegator tool should summarize the current state before spawning the subagent. This ensures the subagent receives high-signal tokens without the noise of the coordinator's full history.
- **Observation Masking**: Subagent results should be returned as a summary, with the raw output masked or stored in a separate reference if needed.

### 2.2 System Design: Pulling Complexity Down

Per `system-design` (Ousterhout), the `skill_agent` tool must be a **Deep Module**:

- **Simple Interface**: `skill_agent(skill, agent, prompt)`
- **Deep Implementation**: The tool handles path resolution, format detection (Markdown vs. TypeScript), frontmatter parsing, and SDK spawning internally.

### 2.3 Tool Design: Defining Errors Away

The delegation tool should follow `tool-design` and `system-design` to eliminate friction:

- **Sensible Defaults**: Default to the skill's preferred model/temperature if not specified.
- **Self-Healing**: If an agent isn't found, the tool should list available agents in that skill instead of throwing a generic error.

### 2.4 Learning from Outcomes

Integration with `learning-systems` allows the swarm to improve over time:

- **Success Metrics**: Use `swarm_record_outcome` to track which agents (e.g., `oracle` vs `researcher`) have higher success rates for specific task types.
- **Implicit Feedback**: Duration and retry signals should be used to refine agent system prompts automatically.

---

## 3. Implementation Roadmap (TDD Cycle)

We will follow the **RED-GREEN-REFACTOR** rhythm (`tdd`):

1. **RED**: Write a test in `loader.test.ts` that fails to resolve a subagent from a mock skill directory.
2. **GREEN**: Implement `resolveAgentPath` to handle the standard OpenCode skill structure (`~/.opencode/skill/.../agent/`).
3. **REFACTOR**: Pull configuration loading into a `loadAgentConfig` utility that handles both frontmatter parsing (MD) and dynamic imports (TS).

---

## 4. Visual Architecture (ASCII)

```text
┌───────────────────────────┐          ┌───────────────────────────┐
│     Main Agent Context     │          │    Subagent Context (1)   │
│  (Coordinator/Planner)    │          │    (Specialized Work)     │
└─────────────┬─────────────┘          └─────────────▲─────────────┘
              │                                      │
              ▼  [Summarized State]                  │
      ┌───────┴───────┐                              │
      │  skill_agent  │ ────► [Resolves MD/TS] ──────┘
      │     Tool      │
      └───────▲───────┘
              │
      ┌───────┴───────┐
      │ Agent Loader  │ ────► [.hive/memories.jsonl]
      │ (Deep Module) │       (Learning signals)
      └───────────────┘
```

---

## 5. Risk Analysis & Mitigations

| Risk                   | Probability | Mitigation                                                       |
| :--------------------- | :---------- | :--------------------------------------------------------------- |
| **Context Exhaustion** | Medium      | Apply **Context Partitioning**; summarize results before return. |
| **Discovery Latency**  | Low         | Implement caching for parsed agent configurations.               |
| **Type Safety**        | Medium      | Implement JSON Schema validation for Markdown frontmatter.       |
