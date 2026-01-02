# OpenCode Integration Module (v4.1)

This module serves as the bridge between the plugin features and the OpenCode AI SDK runtime.

## 1. Skill Discovery Mechanism (ASCII)

The system uses a hierarchical pattern to discover and load specialized agents.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SKILL DISCOVERY HIERARCHY                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Built-in Skills  ──▶ src/orchestrator/chief-of-staff/       │
│                                                                 │
│  2. Global Skills    ──▶ ~/.config/opencode/skill/              │
│                                                                 │
│  3. Project Skills   ──▶ .opencode/skill/                       │
│                                                                 │
│  [ Loader ] ────────▶ [ Unified Registry ] ────────▶ [ Spawner ]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Note: This repo also includes developer helper skills under `src/opencode/skill/` (not part of OpenCode’s default discovery paths).

## 2. Configuration & Model Overrides

The system allows overriding models for **any agent** via `swarmtool-addons.json`.

• **Priority Order**: 1. Register skills from `SKILL.md` (Defaults). 2. Mark internal subagents (Executor, Oracle) as `internal` visibility. 3. Apply user overrides from config file (High Priority). 4. Fallback to global defaults for unregistered agents.

## 3. Runtime Hooks (v4.1)

The plugin registers global switchboard hooks to implement Governance-First tracking:

• **`tool.execute.before`**:
• Injects `LEDGER.md` context (Directives/Assumptions) into the agent's immediate memory.
• **`tool.execute.after`**:
• Detects file changes and automatically emits `ledger.task.completed` events.
• Intercepts `HANDOFF_INTENT` for subagent communication.
• **`event` (Lifecycle)**:
• **Start**: Triggers Memory Lane semantic injection.
• **Idle/End**: Triggers automated learning extraction.

## 4. Visibility Control

To maintain a clean user interface, only the `chief-of-staff` is exposed as a public agent. All other specialists (Oracle, Executor, etc.) are registered with `visibility: internal`, accessible only via the `skill_agent` orchestration tool.
