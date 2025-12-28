# Orchestrator Module

The Orchestrator module provides coordination patterns, research capabilities, and skill-based agent definitions for multi-agent workflows. It focuses on patterns like Sisyphus (main orchestrator) and Conductor (spec-driven development).

## Overview

The Orchestrator module is responsible for:

- **Coordination Patterns**: Multi-agent coordination strategies (Sisyphus, Conductor)
- **Skill-Based Agents**: Spawning specialized subagents via `skill_agent` tool
- **Research Workflows**: Documenting and analyzing orchestration approaches
- **Agent Loading**: Re-exporting agent discovery from OpenCode module

## Features

### Coordination Patterns

The orchestrator defines and implements multi-agent coordination patterns:

1. **Sisyphus Pattern**: Main orchestrator for background task management
2. **Conductor Pattern**: Spec-driven development with quality gates

### Skill-Based Agent Spawning

Provides the `skill_agent` tool for delegating to specialized subagents:

```
Coordinator → skill_agent tool → Background/Task Native Tool → Specialized Subagent
```

**Key Benefits:**

- **Context Partitioning**: Isolated contexts reduce noise in coordinator
- **Specialization**: Each subagent has focused expertise
- **Scalability**: Parallel task execution via background tasks

## Module Structure

```
src/orchestrator/
├── tools.ts               # skill_agent tool implementation
├── tools.test.ts          # Tool tests
├── index.ts              # Module exports (re-exports)
├── PLAN.md               # Orchestrator research and planning
└── RESEARCH.md           # Detailed research documentation
```

## Key Components

### Skill Agent Tool (`tools.ts`)

The `skill_agent` tool enables spawning specialized subagents defined within skills.

**Tool Signature:**

```typescript
skill_agent({
  skill_name: string,        // Name of skill defining the agent
  agent_name: string,        // Agent name within the skill
  prompt: string,            // Task description for the subagent
  run_in_background?: boolean  // Optional: async execution
})
```

**Response Format:**

```typescript
{
  success: boolean,
  taskId?: string,           // If run_in_background: true
  output?: string,          // If run_in_background: false
  error?: string,           // If spawn failed
  message?: string          // Error details or available agents
}
```

**Discovery and Error Handling:**

- Discovers all skill-based agents automatically
- Provides helpful error messages listing available agents
- Supports both markdown and TypeScript agent definitions

### Module Exports (`index.ts`)

The orchestrator re-exports key functionality from the OpenCode module:

```typescript
// Re-export skill_agent tool for convenience
export { createSkillAgentTools } from '../opencode';

// Re-export agent loading functions
export { loadSkillAgents, loadLocalAgents } from '../opencode';
```

**Rationale:**

- Single import point for orchestration needs
- Avoids duplication by using OpenCode implementation
- Maintains clear module boundaries

## Usage Examples

### Spawning a Code Reviewer Subagent

```typescript
import { createSkillAgentTools } from 'swarm-tool-addons/orchestrator';

const tools = createSkillAgentTools(client);

const result = await tools.skill_agent.execute({
  skill_name: 'code-review',
  agent_name: 'reviewer',
  prompt: 'Review authentication module for security issues',
});

if (result.success) {
  console.log('Review output:', result.output);
} else {
  console.error('Spawn failed:', result.error);
}
```

### Running Subagent in Background

```typescript
const result = await tools.skill_agent.execute({
  skill_name: 'researcher',
  agent_name: 'doc-finder',
  prompt: 'Find documentation for React hooks',
  run_in_background: true,
});

if (result.success) {
  console.log('Background task ID:', result.taskId);
  // Task continues running in background
}
```

### Handling Agent Not Found Errors

```typescript
const result = await tools.skill_agent.execute({
  skill_name: 'code-review',
  agent_name: 'nonexistent', // Typo or wrong name
  prompt: 'Review code',
});

if (!result.success && result.error === 'AGENT_NOT_FOUND') {
  console.log(result.message);
  // "Agent 'nonexistent' not found in skill 'code-review'.
  //  Available agents in this skill: reviewer, linter, analyzer"
}
```

## Architecture

### Hybrid Delegator Pattern

The orchestrator follows the Hybrid Delegator Pattern for skill-based subagents:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Coordinator Agent                            │
│                                                             │
│  1. Receives complex task                                   │
│  2. Decomposes into subtasks                                 │
│  3. Calls skill_agent tool for each subtask                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  skill_agent Tool      │
                  │  (Orchestrator)     │
                  └───────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  Background/Task       │
                  │  Native Tool          │
                  └───────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                              │
              ▼                              ▼
    ┌─────────────────┐          ┌─────────────────┐
    │  Code Reviewer  │          │  Researcher     │
    │  (Subagent)     │          │  (Subagent)     │
    │  Isolated Context│          │  Isolated Context│
    └─────────────────┘          └─────────────────┘
```

### Context Partitioning

Each spawned subagent gets its own isolated context:

- **No Noise**: Subagent only sees its specific task
- **Relevant Information**: Context scoped to its expertise
- **Parallel Execution**: Multiple subagents work simultaneously

## Design Principles

**Consolidation Over Duplication:**

- Single `skill_agent` implementation in `opencode/agent/tools.ts`
- Orchestrator re-exports, avoiding duplicate code
- Clear separation: OpenCode = discovery, Orchestrator = patterns

**Non-Invasive Sidecar:**

- Does not modify swarm-tools core behavior
- Uses native tools (task, background_task) for execution
- Operates independently with graceful degradation

**Event-Driven Architecture:**

- Async subagent spawning
- Background task support for long-running operations
- Eventual consistency in task completion

**Extensibility:**

- Skills can define new agents without core changes
- Standardized interface via skill_agent tool
- Pattern-based approach for new coordination strategies

## Research and Planning

The orchestrator module includes comprehensive research documentation:

- **PLAN.md**: High-level planning and roadmap
- **RESEARCH.md**: Detailed analysis of coordination patterns

These documents explore:

- Multi-agent coordination strategies
- Context optimization techniques
- Agent spawning patterns
- Integration with swarm-tools

## Testing

```bash
# Run all orchestrator tests
bun test src/orchestrator

# Run specific test file
bun test src/orchestrator/tools.test.ts
```

## Integration

The orchestrator module integrates with other modules:

- **OpenCode**: Uses `skill_agent` tool and agent loading
- **Conductor**: Can spawn subagents for track tasks
- **Memory Lane**: No direct dependency, but subagents can use memory tools

## See Also

- **AGENTS.md**: Module implementation guide and integration patterns
- **SKILL_SUBAGENTS.md**: Skill-based subagent architecture
- **Hybrid Delegator Pattern**: Research on agent spawning patterns
- **src/opencode/README.md**: Agent loading and discovery
