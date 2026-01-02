# OpenCode Module

The OpenCode module provides agent loading, skill discovery, and command parsing functionality for the `opencode-agent-addons` plugin. It serves as the foundation for discovering and loading agents from various sources.

## Overview

The OpenCode module is responsible for:

- **Agent Loading**: Discovering and loading agents from local directories and skill definitions
- **Frontmatter Parsing**: Extracting configuration from markdown frontmatter
- **Skill-Based Agents**: Supporting agent definitions within skill directories
- **Configuration Management**: Type-safe configuration handling and validation

## Features

### Agent Discovery

The module supports multiple agent discovery patterns:

1. **Local Agents**: Load agents from a specified directory path
2. **Skill-Based Agents**: Automatically discover agents defined within OpenCode skills
3. **Command Loading**: Parse command definitions from markdown files

### Frontmatter Support

Parses YAML frontmatter from markdown files with the following fields:

- `agent`: Agent name/type
- `model`: Model identifier
- `temperature`: Temperature setting (0-1)
- `description`: Agent description
- `subtask`: Boolean flag for subtask agents
- `disable`: Boolean flag to disable agent
- `forcedSkills`: Comma-separated list of required skills

## Available Commands

The module includes pre-built commands for common workflows:

### `sdd` - Spec-Driven Development

Interactive workflow with dialogue mode for building features from requirements to implementation.

```bash
sdd "Build user authentication with OAuth"
```

**What it does:**

1. **Interview** (dialogue) - Clarifies requirements with multi-turn Q&A
2. **Spec** - Creates structured specification document
3. **Plan** - Generates implementation blueprint
4. **Validate** - Quality gate against best practices
5. **Execute** - Phased implementation with checkpoints

**Key Features:**

- Interactive approval loops (no assumptions without confirmation)
- Checkpoints before each phase
- Assumption tracking and verification
- Chief-of-Staff coordination

### `ama` - Ask Me Anything (Oracle)

Quick expert consultation for technical decisions.

```bash
ama "Should I use PostgreSQL or MongoDB for analytics?"
```

**What it does:**

- One-shot consultation (fast, ~10-30 seconds)
- Structured recommendation with trade-offs
- Action plan and effort estimate
- No implementation (advice only)

**Use when:**

- Need quick technical decision

---

## Repo-provided helper skills

This repo includes developer helper skills under `src/opencode/skill/` (for authoring prompts and commands in this plugin).

- `src/opencode/skill/opencode-command-creator/SKILL.md`: creates/updates OpenCode command markdown files under `src/opencode/command/`.
- Comparing technologies/libraries
- Getting architecture advice
- Code review recommendations

---

### Skill-Based Agent Tools

Provides the `skill_agent` tool for spawning specialized subagents defined within skills. This follows the Hybrid Delegator Pattern:

```
Agent → skill_agent tool → Background Task/Task Native Tool → Specialized Subagent
```

**Benefits:**

- **Context Partitioning**: Each subagent gets isolated context, reducing noise
- **Extensibility**: Skills can define specialized agents without modifying core code
- **Consistency**: Standardized interface for all skill-based agents

## Module Structure

```
src/opencode/
├── agent/
│   ├── index.ts              # Agent module entry
│   ├── tools.ts             # skill_agent tool implementation
│   └── tools.test.ts        # Tool tests
├── config/
│   ├── index.ts             # Configuration exports
│   ├── loader.ts            # Configuration loading logic
│   ├── loader.test.ts       # Loader tests
│   ├── substitutor.ts       # Variable substitution
│   ├── substitutor.test.ts  # Substitutor tests
│   └── types.ts            # Configuration types
├── loader.ts              # Agent loading and discovery
├── loader.test.ts         # Loader tests
├── index.ts               # Module exports
├── integration.test.ts     # Integration tests
└── README.md              # This file
```

## Key Components

### Agent Loader (`loader.ts`)

Core functions for discovering and loading agents:

- `loadLocalAgents(agentDir)`: Load agents from local directory
- `loadSkillAgents()`: Discover agents in OpenCode skill directories
- `loadCommands(commandDir)`: Load command definitions
- `parseFrontmatter(content)`: Parse YAML frontmatter from markdown
- `parseAgentMarkdown(content, name)`: Parse agent configuration

### Skill Agent Tools (`agent/tools.ts`)

The `skill_agent` tool enables spawning specialized subagents:

```typescript
skill_agent({
  skill_name: 'code-review', // Skill containing the agent
  agent_name: 'reviewer', // Agent name within skill
  prompt: 'Review this code...', // Task description
  run_in_background: false, // Optional: async execution
});
```

**Discovery Pattern:**

- Searches for agents in `~/.config/opencode/skill/<skill>/agent/` or `agents/`
- Supports three agent definition formats:
  1. **Markdown**: `SKILL.md` files with frontmatter
  2. **TypeScript**: `.ts` files with default export
  3. **Simple Markdown**: `.md` files with frontmatter

### Configuration Management (`config/`)

Type-safe configuration handling:

- **Types**: Strongly typed configuration schemas
- **Loading**: Load and validate configuration from files
- **Substitution**: Variable substitution in configuration values

## Usage Examples

### Loading Local Agents

```typescript
import { loadLocalAgents } from 'opencode-agent-addons/opencode';

const agents = await loadLocalAgents('./my-agents');
console.log(`Found ${agents.length} local agents`);
```

### Spawning a Skill-Based Subagent

```typescript
import { createSkillAgentTools } from 'opencode-agent-addons/opencode';

const tools = createSkillAgentTools(client);

const result = await tools.skill_agent.execute({
  skill_name: 'code-review',
  agent_name: 'reviewer',
  prompt: 'Review the authentication module for security issues',
  run_in_background: false,
});
```

### Creating a Skill-Based Agent

Create a file at `~/.config/opencode/skill/code-review/agent/reviewer/SKILL.md`:

```markdown
---
agent: code-reviewer
model: gpt-4
temperature: 0.3
description: Specialized code review agent
---

You are a code reviewer specializing in security and best practices.
Focus on:

1. Security vulnerabilities
2. Code quality
3. Adherence to patterns
```

Then spawn it via the `skill_agent` tool.

## Design Principles

**Non-Invasive Sidecar:**

- Module does not modify OpenCode core behavior
- Exports tools for other modules to use
- Operates independently and degrades gracefully

**Extensibility:**

- Skills can define specialized agents without code changes
- Plugin architecture for extending functionality
- Support for multiple agent definition formats

**Type Safety:**

- Strongly typed interfaces and schemas
- Configuration validation at runtime
- Zod schemas for complex types

**Event-Driven:**

- Asynchronous agent loading
- Non-blocking discovery operations
- Eventual consistency in agent discovery

## Integration

The OpenCode module is the foundation for other modules:

- **Orchestrator**: Re-exports `skill_agent` tool for coordination patterns
- **Memory Lane**: No direct dependency, but agents can use memory tools

## Testing

```bash
# Run all tests
bun test src/opencode

# Run specific test files
bun test src/opencode/loader.test.ts
bun test src/opencode/agent/tools.test.ts
```

## See Also

- **AGENTS.md**: Module implementation guide and integration patterns
