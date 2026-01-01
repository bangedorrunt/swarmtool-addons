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

## 2. Configuration System

### I. Config File Location

Platform-specific paths:

| Platform    | Path                                               |
| ----------- | -------------------------------------------------- |
| macOS/Linux | `~/.config/opencode/swarmtool-addons.json`         |
| Windows     | `%APPDATA%\Roaming\opencode\swarmtool-addons.json` |

### II. Model Override Feature

The configuration system allows overriding models for **any agent** — both skill-based subagents and native OpenCode agents.

```json
{
  "models": {
    "chief-of-staff": { "model": "google/gemini-3-pro" },
    "chief-of-staff/oracle": { "model": "google/gemini-3-flash", "temperature": 0.1 },
    "chief-of-staff/executor": { "model": "google/gemini-3-pro", "disable": false },
    "Code": { "model": "anthropic/claude-3.5-sonnet" },
    "Ask": { "model": "openai/gpt-4o" }
  },
  "debug": false,
  "logLevel": "info"
}
```

### III. Override Priority

The config hook processes overrides in a specific order to ensure user preferences take precedence:

1. **Register skill-based agents** with their default models from `SKILL.md`
2. **Register chief-of-staff subagents** with internal visibility
3. **Apply user config overrides** — this step overwrites any previous model assignments
4. **Apply DEFAULT_MODELS fallback** for agents not yet registered

This ensures that user-specified models in `swarmtool-addons.json` always win.

### IV. Supported Agent Paths

| Category                | Agent Paths                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Primary Agent**       | `chief-of-staff`                                                                                |
| **Strategy Subagents**  | `chief-of-staff/oracle`, `chief-of-staff/planner`, `chief-of-staff/workflow-architect`          |
| **Dialogue Subagents**  | `chief-of-staff/interviewer`, `chief-of-staff/spec-writer`                                      |
| **Execution Subagents** | `chief-of-staff/executor`, `chief-of-staff/validator`, `chief-of-staff/frontend-ui-ux-engineer` |
| **Research Subagents**  | `chief-of-staff/explore`, `chief-of-staff/librarian`                                            |
| **Learning Subagents**  | `chief-of-staff/memory-catcher`                                                                 |
| **Native OpenCode**     | `Code`, `Ask`, `Summarize`, `Plan`, `Build`, `Explore` (case-sensitive)                         |

### V. Model Override Fields

| Field          | Type     | Required | Description                                      |
| -------------- | -------- | -------- | ------------------------------------------------ |
| `model`        | string   | ✅       | Model identifier (e.g., `google/gemini-3-flash`) |
| `temperature`  | number   | ❌       | Generation temperature (0.0 - 2.0)               |
| `disable`      | boolean  | ❌       | Disable this agent entirely                      |
| `forcedSkills` | string[] | ❌       | Force specific skills to load                    |

## 3. Configuration Hooks

The plugin utilizes the `config` hook to modify the OpenCode runtime at startup:

- **Model Overrides**: Merges user preferences from `swarmtool-addons.json` with the default models defined in `SKILL.md`.
- **Visibility Control**: Marks internal sub-agents (e.g., `executor`) with `visibility: internal` to hide them from the primary user UI while keeping them accessible to the coordinator.
- **Dynamic Tool Registration**: Injects module tools (`skill_agent`, `memory_lane_find`) into the global tool registry.

## 4. Event Handling

The `index.ts` file acts as the global switchboard, registering hooks for the entire session lifecycle:

- `tool.execute.before`: Injects continuity context from `LEDGER.md` before tool execution.
- `tool.execute.after`: Intercepts `HANDOFF_INTENT` for orchestration and learning extraction.
- `event`: Handles session start/end events for learning injection and capture across all agents.

---

_Module Version: 3.0.0_
