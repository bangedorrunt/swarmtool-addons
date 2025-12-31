# Configuration Module

Provides type-safe configuration management for swarm-tool-addons plugin.

## Overview

The config module handles:

- **Type-safe configuration** with TypeScript interfaces
- **JSON parsing and validation** for config files
- **Default values** for all required settings
- **File I/O** for reading and writing configs
- **Model substitution** for agent prompts

## Config File Location

Platform-specific default paths:

- **macOS/Linux**: `~/.config/opencode/swarmtool-addons.json`
- **Windows**: `%APPDATA%\Roaming\opencode\swarmtool-addons.json`

## Agent Hierarchy

The configuration supports a skill-based subagent architecture:

### Primary Agent (User-Facing)
- `chief-of-staff`: The main orchestrator agent exposed to users

### Subagents (Internal, only callable by authorized agents)

| Agent Path | Role | Default Model |
|------------|------|---------------|
| `chief-of-staff/oracle` | Strategic advisor | google/gemini-3-flash |
| `chief-of-staff/planner` | Blueprint creator | google/gemini-3-flash |
| `chief-of-staff/executor` | TDD code generator | google/gemini-3-pro |
| `chief-of-staff/interviewer` | User clarification | google/gemini-3-flash |
| `chief-of-staff/spec-writer` | Requirements extraction | google/gemini-3-flash |
| `chief-of-staff/validator` | Quality gate | google/gemini-3-flash |
| `chief-of-staff/explore` | Codebase search | opencode/grok-code |
| `chief-of-staff/librarian` | Library research | opencode/grok-code |
| `chief-of-staff/frontend-ui-ux-engineer` | UI/UX implementation | google/gemini-3-pro |
| `chief-of-staff/memory-catcher` | Learning extraction | google/gemini-3-flash |
| `chief-of-staff/workflow-architect` | Workflow design | google/gemini-3-pro |

## Configuration Schema

The configuration supports overriding **both skill-based subagents and native OpenCode agents**.

### Example Configuration

```json
{
  "models": {
    // Override skill-based subagents
    "chief-of-staff": {
      "model": "google/gemini-3-pro"
    },
    "chief-of-staff/oracle": {
      "model": "google/gemini-3-flash",
      "temperature": 0.1
    },
    "chief-of-staff/executor": {
      "model": "google/gemini-3-pro",
      "disable": false,
      "forcedSkills": ["system-design"]
    },

    // Override native OpenCode agents
    "Code": {
      "model": "anthropic/claude-3.5-sonnet"
    },
    "Ask": {
      "model": "openai/gpt-4o",
      "temperature": 0.3
    },
    "Summarize": {
      "model": "google/gemini-3-flash"
    }
  },
  "debug": false,
  "logLevel": "info"
}
```

### Native OpenCode Agents

You can override any native OpenCode agent by using its exact name:

| Agent Name | Purpose |
|------------|---------|
| `Code` | Code generation and editing |
| `Ask` | General questions and assistance |
| `Summarize` | Code and content summarization |
| `Plan` | Planning tasks |
| `Build` | Build and compile tasks |
| `Explore` | Codebase exploration |

> **Note**: Agent names are case-sensitive. Use the exact name as shown in OpenCode.


### Model Override Fields

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | **Required**. Model identifier |
| `temperature` | number | Optional. 0.0 - 2.0 for generation |
| `disable` | boolean | Optional. Disable this agent |
| `forcedSkills` | string[] | Optional. Force skills to load |

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `debug` | boolean | `false` | Enable debug logging |
| `logLevel` | string | `"info"` | One of: `debug`, `info`, `warn`, `error` |

## Usage

### Loading Configuration

```typescript
import { loadConfig } from './config';

// Load with default path
const config = loadConfig();

// Load with custom path
const config = loadConfig('/path/to/config.json');
```

### Saving Configuration

```typescript
import { saveConfig } from './config';

const myConfig = {
  models: {
    'chief-of-staff': { model: 'google/gemini-3-pro' },
    'chief-of-staff/oracle': { model: 'opencode/custom-model' },
    'chief-of-staff/planner': { model: 'opencode/custom-model' },
  },
};

saveConfig(myConfig);
```

### Validation

```typescript
import { validateConfig, parseConfig } from './config';

// Parse JSON string
const config = parseConfig(jsonString);

// Validate config
const validation = validateConfig(config);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

### Model Substitution

The `substituteModel` function replaces model lines in agent prompts:

```typescript
import { substituteModel } from './config';

const prompt = `---
description: My agent
mode: subagent
model: opencode/old-model
---
Agent content goes here`;

const config = {
  'chief-of-staff/planner': { model: 'opencode/new-model' },
  'chief-of-staff/executor': { model: 'opencode/executor' },
};

const modifiedPrompt = substituteModel(prompt, 'chief-of-staff/planner', config);
// Result: model line is replaced with opencode/new-model
```

## Type Safety

All configuration interfaces are fully typed:

```typescript
import type { SwarmToolAddonsConfig, ModelOverride, AgentModelConfig, LogLevel } from './config';

const config: SwarmToolAddonsConfig = {
  models: {
    'chief-of-staff': { model: 'google/gemini-3-pro' },
    'chief-of-staff/oracle': { model: 'google/gemini-3-flash' },
    'chief-of-staff/planner': { model: 'google/gemini-3-flash' },
  },
  logLevel: 'debug', // TypeScript enforces valid log levels
};
```

## Error Handling

The loader uses graceful error handling:

- **Missing file**: Returns default config (doesn't throw)
- **Invalid JSON**: Returns default config, logs error
- **Missing fields**: Returns default config, logs error
- **Validation errors**: Logs errors, still loads config

This ensures the plugin always works even if config is broken.

## Testing

All modules have comprehensive test coverage:

```bash
bun test src/config/
```

Tests cover:

- Type definitions
- JSON parsing
- Validation logic
- File I/O
- Model substitution
- Edge cases
