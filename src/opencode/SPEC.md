# OpenCode Integration Module

This module serves as the bridge between the plugin features and the OpenCode AI SDK runtime.

## 1. Loader Mechanism

The system uses a hierarchical discovery pattern to load agents and commands.

### I. Skill Discovery

The `skill-loader.ts` scans specific directories for `SKILL.md` files:

1.  **Project Local**: `.opencode/skill/`
2.  **Global Config**: `~/.config/opencode/skill/`
3.  **Built-in**: `src/orchestrator/chief-of-staff/` (Auto-migrated to project local on start).

### II. Skill Hierarchy

Skills are named using a slash-convention: `[skill-name]/[agent-name]`.

- Example: `chief-of-staff/planner`.
- The parent `SKILL.md` defines the shared tools and environment.
- Sub-agent `SKILL.md` defines specific personas and instructions.

## 2. Configuration Hooks

The plugin utilizes the `config` hook to modify the OpenCode runtime at startup:

- **Model Overrides**: Merges user preferences from `config.json` with the default models defined in `SKILL.md`.
- **Visibility Control**: Marks internal sub-agents (e.g., `executor`) with `visibility: internal` to hide them from the primary user UI while keeping them accessible to the coordinator.
- **Dynamic Tool Registration**: Injects module tools (`skill_agent`, `memory_lane_find`) into the global tool registry.

## 3. Event Handling

The `index.ts` file acts as the global switchboard, registering hooks for the entire session lifecycle:

- `tool.execute.before`: Injects continuity context from `LEDGER.md` before tool execution.
- `tool.execute.after`: Intercepts `HANDOFF_INTENT` and `swarm_complete` for orchestration and learning extraction.
- `event`: Handles session start/end events for learning injection and capture.

---

_Module Version: 2.5.0_
