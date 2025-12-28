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

## Configuration Schema

```json
{
  "models": {
    "planner": {
      "model": "opencode/big-pickle",
      "temperature": 0.7,
      "maxTokens": 4096
    },
    "worker": {
      "model": "opencode/glm-4.7-free",
      "temperature": 0.5,
      "maxTokens": 2048
    },
    "researcher": {
      "model": "opencode/grok-code",
      "temperature": 0.3,
      "maxTokens": 8192
    }
  },
  "debug": false,
  "logLevel": "info"
}
```

### Required Fields

- `models.planner.model`: Model identifier for planner agent
- `models.worker.model`: Model identifier for worker agent
- `models.researcher.model`: Model identifier for researcher agent

### Optional Fields

- `models.*.temperature`: Temperature (0.0 - 2.0) for generation
- `models.*.maxTokens`: Maximum tokens to generate (positive integer)
- `debug`: Enable debug logging (default: `false`)
- `logLevel`: Logging level - `"debug" | "info" | "warn" | "error"`

### Default Models

If config file doesn't exist or is invalid, these defaults are used:

- **planner**: `opencode/big-pickle`
- **worker**: `opencode/glm-4.7-free`
- **researcher**: `opencode/grok-code`

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
    planner: { model: 'custom/model' },
    worker: { model: 'custom/model' },
    researcher: { model: 'custom/model' },
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
  planner: { model: 'opencode/new-model' },
  worker: { model: 'opencode/worker' },
  researcher: { model: 'opencode/researcher' },
};

const modifiedPrompt = substituteModel(prompt, 'planner', config);
// Result: model line is replaced with opencode/new-model
```

## Type Safety

All configuration interfaces are fully typed:

```typescript
import type { SwarmToolAddonsConfig, ModelOverride, AgentModelConfig, LogLevel } from './config';

const config: SwarmToolAddonsConfig = {
  models: {
    planner: { model: 'opencode/model' },
    worker: { model: 'opencode/model' },
    researcher: { model: 'opencode/model' },
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
