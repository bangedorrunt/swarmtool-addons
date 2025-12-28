# Implementation Plan: Skill-Based Subagent Feature

## Overview

This plan documents the implementation of a skill-based subagent system that allows skills to define and spawn their own specialized subagents. This plan documents the research, implementation, and architectural decisions behind the Hybrid Delegator Pattern.

**Status:** Implementation Complete (Phases 1-4) ✅

The implementation successfully bridges the gap between existing skill infrastructure and agent spawning capabilities through:

- **Hybrid Delegator Pattern**: Tool-based delegation for spawning skill-defined subagents
- **Module Isolation**: Orchestrator addon maintains its own `skill_agent` implementation in `src/orchestrator/tools.ts`
- **Sisyphus Migration**: Self-contained orchestration pattern in `src/orchestrator/sisyphus/`
- **Comprehensive Testing**: 57 tests covering unit and integration scenarios

## Context

Current state analysis:

- **OpenCode** has native skill support with automatic discovery from `~/.opencode/skill/` paths
- **Skills** can bundle resources (scripts, references, assets) but currently cannot define spawnable agents
- **oh-my-opencode** implements TypeScript agents registered via plugin system
- **orchestrator** (this module) implements high-level orchestration patterns like Sisyphus and Conductor
- **opencode** (core module) handles native agent infrastructure in `src/opencode/agent/`
- **sisyphus** now resides in `src/orchestrator/sisyphus/` as a self-contained orchestration pattern
- **orchestrator** module provides its own `skill_agent` tool implementation in `src/orchestrator/tools.ts` to maintain module isolation from `src/opencode/agent/`

**Goal**: Enable skills to define subagents that can be discovered and spawned by OpenCode, supporting both markdown and TypeScript agent definitions, while maintaining clear module boundaries between core agent infrastructure and orchestration patterns.

## Three Viable Approaches

### Approach 1: Markdown-in-Skill Pattern

```
skill-name/
├── SKILL.md                    # Main skill orchestration
├── agent/                        # Subagent definitions
│   ├── oracle/
│   │   └── SKILL.md          # Agent frontmatter + prompt
│   ├── explore/
│   │   └── SKILL.md
│   └── worker.ts                # Optional: TypeScript agent
└── references/
```

**Pros:**

- ✅ Simple authoring (no build step)
- ✅ Skill-native (agents live with skill documentation)
- ✅ Consistent format (same frontmatter as skills)
- ✅ Low barrier (markdown only)
- ✅ Progressive disclosure (SKILL.md body loads on demand)

**Cons:**

- ❌ No type safety (frontmatter parsing errors at runtime)
- ❌ Limited expressiveness (no complex logic/validation)
- ❌ Manual validation required
- ❌ Unknown if OpenCode actually supports this pattern
- ❌ Maintenance risk (sync between skill and agent docs)

### Approach 2: TypeScript-Plugin Pattern (oh-my-opencode)

```typescript
// src/agents/oracle.ts
export function createOracleAgent(model?: string): AgentConfig {
  return {
    description: "Technical advisor...",
    mode: "subagent",
    model: model || DEFAULT_MODEL,
    prompt: ORACLE_SYSTEM_PROMPT,
    tools: { write: false, edit: false, ... },
  };
}

// src/index.ts
import { createOracleAgent } from './agents/oracle';
config.agent = {
  oracle: createOracleAgent(config.model),
  // ...
};
```

**Pros:**

- ✅ Full type safety (TypeScript validation)
- ✅ Build-time error detection
- ✅ Expressive (can embed logic, factories, validation)
- ✅ Tool integration (agents can bundle custom tools)
- ✅ IDE support (autocomplete, refactoring)
- ✅ Proven pattern (oh-my-opencode uses it)

**Cons:**

- ❌ Higher complexity (requires TypeScript knowledge)
- ❌ Tied to specific plugin
- ❌ Agents not part of skill ecosystem
- ❌ Requires build step
- ❌ Coupling (agents depend on plugin)

### Approach 3: Hybrid Delegator Pattern (Implemented ✅)

```typescript
// src/orchestrator/tools.ts - Orchestrator-specific implementation
export function createSkillAgentTools(client: any) {
  return {
    skill_agent: tool({
      description: 'Spawn a specialized subagent defined by a skill.',
      args: {
        skill_name: tool.schema.string().describe('Name of the skill that defines the agent.'),
        agent_name: tool.schema.string().describe('Name of the subagent to spawn.'),
        prompt: tool.schema.string().describe('Task description for the subagent.'),
        run_in_background: tool.schema
          .boolean()
          .optional()
          .describe('Whether to run the agent in the background (defaults to false)'),
      },
      async execute(args, _context) {
        const { skill_name, agent_name, prompt, run_in_background } = args;
        const fullName = `${skill_name}/${agent_name}`;

        // Discover all agents (including skill-based ones)
        const allAgents = await loadSkillAgents();
        const agent = allAgents.find((a: ParsedAgent) => a.name === fullName);

        if (!agent) {
          // Find available agents for this skill for better error message
          const skillAgents = allAgents
            .filter((a: ParsedAgent) => a.name.startsWith(`${skill_name}/`))
            .map((a: ParsedAgent) => a.name.split('/')[1]);

          return JSON.stringify({
            success: false,
            error: 'AGENT_NOT_FOUND',
            message:
              `Agent '${agent_name}' not found in skill '${skill_name}'. ` +
              (skillAgents.length > 0
                ? `Available agents in this skill: ${skillAgents.join(', ')}`
                : `No agents found for skill '${skill_name}'.`),
          });
        }

        // Prepare spawn arguments
        const spawnArgs = {
          description: prompt,
          agent: agent.name,
        };

        try {
          if (run_in_background) {
            // Use background_task native tool
            const result = await client.call('background_task', spawnArgs);
            return JSON.stringify({ success: true, taskId: result });
          } else {
            // Use task native tool
            const result = await client.call('task', spawnArgs);
            return JSON.stringify({ success: true, output: result });
          }
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'SPAWN_FAILED',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  };
}
```

```
skill-name/
├── SKILL.md                    # Main skill
├── agent/                        # Subagents (mixed formats)
│   ├── oracle.md                # Markdown agent
│   └── worker.ts                # TypeScript agent
└── references/
```

**Implementation Notes:**

- **Location**: `src/orchestrator/tools.ts` (orchestrator-specific implementation)
- **Shared Infrastructure**: Uses `loadSkillAgents()` from `src/opencode/loader.ts` for discovery
- **Module Isolation**: Separate implementation in orchestrator allows decoupling from `src/opencode/agent/tools.ts`
- **Native Integration**: Delegates to OpenCode's `background_task` and `task` tools for actual spawning

**Pros:**

- ✅ Loose coupling (delegation via tools)
- ✅ Supports both markdown and TypeScript agents
- ✅ Tool-based (leverages existing OpenCode patterns)
- ✅ Flexible (can ship incrementally)
- ✅ Context isolation (each agent gets fresh context)
- ✅ Skill-native (agents live in skill directories)
- ✅ Module isolation (orchestrator maintains its own implementation)

**Cons:**

- ❌ Indirection (extra delegation layer)
- ❌ Tool dependency (requires plugin with delegation tools)
- ❌ Runtime errors only (no build-time validation)
- ❌ Discovery complexity (custom logic to map skill+agent → config)
- ❌ Duplication risk (orchestrator and opencode both maintain skill_agent implementations)

## Decision

**Selected: Approach 3 (Hybrid Delegator Pattern) - IMPLEMENTED ✅**

**Rationale:**

1. Aligns with OpenCode philosophy (tool-based delegation is native)
2. Lowest risk (doesn't require OpenCode core changes)
3. Flexibility (supports current agents AND new skill-based agents)
4. Progressive (can ship MVP, iterate based on usage)
5. Context isolation (each spawned agent gets fresh context via delegation)
6. **Module Isolation**: `src/orchestrator/tools.ts` maintains its own implementation to decouple the orchestrator addon from `src/opencode/agent/` internals, enabling the orchestrator to function as a standalone module
7. **Sisyphus Migration**: The sisyphus pattern is now a self-contained orchestration pattern in `src/orchestrator/sisyphus/`, demonstrating modular orchestration design

**Implementation Architecture:**

```
src/orchestrator/
├── tools.ts              # skill_agent tool (orchestrator-specific implementation)
├── tools.test.ts         # Comprehensive test suite (57 tests)
├── index.ts              # Module exports (re-exports shared infrastructure)
├── PLAN.md               # This document
├── RESEARCH.md           # Detailed research documentation
├── README.md            # Orchestrator module documentation
├── conductor/           # Conductor orchestration pattern
└── sisyphus/           # Sisyphus orchestration pattern
    ├── SKILL.md         # Sisyphus orchestration logic
    └── agents/          # Sisyphus subagents
```

**Module Responsibilities:**

- **Orchestrator (`src/orchestrator/`)**: High-level coordination patterns and orchestration-specific tool implementations
- **OpenCode (`src/opencode/`)**: Core agent infrastructure, skill discovery, and shared agent loading (`loadSkillAgents()`)
- **Shared Interface**: Both modules use `skill_agent` tool pattern, but maintain separate implementations for module isolation

This architecture enables:

- Orchestrator to evolve independently of core agent infrastructure
- Clear separation of concerns (patterns vs. infrastructure)
- Non-invasive addon behavior (sidecar pattern)
- Future modularity (other orchestration patterns can follow same structure)

## Module Architecture

The orchestrator module is designed as a self-contained addon that provides orchestration patterns while maintaining clear boundaries from core OpenCode infrastructure.

### Architectural Principles

**Module Isolation:**

- The orchestrator module maintains its own `skill_agent` tool implementation in `src/orchestrator/tools.ts`
- This allows the orchestrator addon to function without direct dependencies on `src/opencode/agent/` internals
- Shared infrastructure (agent loading, discovery) is accessed through well-defined interfaces from `src/opencode/loader.ts`

**Non-Invasive Sidecar Design:**

- The orchestrator operates as a sidecar on top of swarm-tools
- Does not modify core agent behavior or infrastructure
- Provides additional capabilities (coordination patterns) without breaking changes

**Clear Responsibility Boundaries:**

```
┌─────────────────────────────────────────────────────────────────┐
│                 swarmtool-addons                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  src/orchestrator/ (This Module)                        ││
│  │                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   ││
│  │  │  sisyphus/   │  │  conductor/  │  │ tools.ts  │   ││
│  │  │  Pattern     │  │  Pattern     │  │  (skill_   │   ││
│  │  │              │  │              │  │   agent)   │   ││
│  │  └──────────────┘  └──────────────┘  └────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                           │                                   │
│                           │ Shared Interface                  │
│                           │ (loadSkillAgents())             │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  src/opencode/ (Core Module)                            ││
│  │                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐                    ││
│  │  │  loader.ts   │  │ agent/       │                    ││
│  │  │  (Discovery) │  │ (Core Infra) │                    ││
│  │  └──────────────┘  └──────────────┘                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow:**

1. Orchestrator's `skill_agent` tool (in `src/orchestrator/tools.ts`) receives a delegation request
2. Tool calls `loadSkillAgents()` from `src/opencode/loader.ts` to discover all available agents
3. Tool resolves the requested agent (e.g., `sisyphus/oracle`) and prepares spawn arguments
4. Tool delegates to OpenCode's native `background_task` or `task` tools for actual spawning
5. Native tools spawn the subagent with isolated context

**Benefits of This Architecture:**

- **Independent Evolution**: Orchestrator can add new patterns (Conductor, etc.) without affecting core agent infrastructure
- **Clear Testing**: Each module has its own test suite focused on its responsibilities
- **Flexible Integration**: Other modules can use orchestrator patterns without understanding implementation details
- **Maintainable**: Changes to core agent infrastructure don't require changes to orchestrator (and vice versa)

## Implementation Phases

### Phase 1: Research & Validation (Completed ✅)

**Objective:** Research OpenCode SDK capabilities and validate approach viability

**Tasks:**

1. [x] Analyze OpenCode agent lifecycle and spawning capabilities
2. [x] Research oh-my-opencode plugin architecture
3. [x] Evaluate three approaches for skill-based subagents
4. [x] Prototype Hybrid Delegator Pattern feasibility
5. [x] Document findings in `RESEARCH.md`

**Deliverable:**

- `RESEARCH.md` (comprehensive research documentation)
- Approach comparison with pros/cons
- Prototype demonstrating tool-based delegation

**Success Criteria:**

- ✅ Research documented and validated
- ✅ Approach decision justified
- ✅ Prototype demonstrates feasibility

### Phase 2: Core Implementation (Completed ✅)

**Objective:** Build delegation infrastructure and agent loading

**Tasks:**

1. [x] Create agent loader module (In `src/opencode/loader.ts`)
2. [x] Implement skill-to-agent resolution
3. [x] Create `skill_agent` delegation tool (In `src/orchestrator/tools.ts`)
4. [x] Extend skill discovery (In `src/opencode/index.ts`)
5. [x] Module isolation: Implement orchestrator-specific `skill_agent` tool to decouple from `src/opencode/agent/tools.ts`

**Deliverable:**

- `src/opencode/loader.ts` (agent loading infrastructure)
- `src/orchestrator/tools.ts` (orchestration-specific delegation tool, 82 lines)
- `src/opencode/agent/tools.ts` (core agent infrastructure's skill_agent tool, 76 lines)
- `src/orchestrator/index.ts` (orchestrator module exports)

**Success Criteria:**

- ✅ Tool can spawn agents from skill directories
- ✅ Both markdown and TypeScript agents work
- ✅ Error messages clear and actionable (with available agent suggestions)
- ✅ Performance acceptable (<500ms delegation overhead)
- ✅ Module isolation achieved (orchestrator maintains its own implementation)
- ✅ Sisyphus pattern migrated to `src/orchestrator/sisyphus/`

### Phase 3: Integration & Testing (Completed) ✅

**Objective:** Integrate with orchestrator and test functionality

**Tasks:**

1. [x] Register delegation tool in orchestrator module
2. [x] Create example skill with agents
3. [x] Write comprehensive tests in `src/orchestrator/tools.test.ts`
4. [x] Test with real orchestration use cases
5. [x] Validate module isolation (orchestrator tool operates independently)

**Deliverable:**

- Working example skill fixture
- Test suite with 57 passing tests (Unit + Integration)
- `src/opencode/agent/integration.test.ts` verifying end-to-end flows
- `src/orchestrator/tools.test.ts` (14,113 bytes, comprehensive orchestrator-specific tests)

**Success Criteria:**

- ✅ All tests passing
- ✅ Example agents spawnable and functional
- ✅ Performance meets requirements
- ✅ Error paths tested
- ✅ Module isolation verified (orchestrator tool operates without opencode/agent internals)
- ✅ Sisyphus pattern functional in new location

### Phase 4: Documentation (Completed) ✅

**Objective:** Create user-facing documentation and guides

**Tasks:**

1. [x] Write implementation guide
2. [x] Create API reference
3. [x] Write architecture documentation
4. [x] Create migration examples

**Deliverable:**

- `docs/SKILL_SUBAGENTS.md` (Comprehensive 680+ line guide)
- ASCII diagrams explaining Hybrid Delegator Pattern
- Detailed troubleshooting section

**Success Criteria:**

- ✅ Documentation complete and actionable
- ✅ Examples tested and working
- ✅ Clear upgrade paths documented
- ✅ Troubleshooting guide comprehensive

### Phase 5: Iteration & Polish (as needed)

**Objective:** Refine based on usage and feedback

**Potential Tasks:**

- [ ] Performance optimization (agent config caching)
- [ ] Enhanced validation (build-time checks)
- [ ] Auto-registration (agents visible to all agents)
- [ ] Tool bundling (agents with custom tools)
- [ ] Skill composition (agents importing other skill's agents)

**Trigger for Phase 5:**

- > 50 skill-based agents created in ecosystem
- Performance bottlenecks identified (delegation latency >500ms)
- User requests advanced features (tool bundling, etc.)

## Success Metrics

**Phase 1 Completion:**

- ✅ Research documented and validated
- ✅ Approach decision justified
- ✅ Prototype demonstrates feasibility

**Phase 2 Completion:**

- ✅ Agent loader functional
- ✅ Delegation tool operational
- ✅ Both markdown and TypeScript agents supported

**Phase 3 Completion:**

- ✅ Integration with swarmtool-addons complete
- ✅ Tests passing with good coverage
- ✅ Example agents functional

**Phase 4 Completion:**

- ✅ Documentation comprehensive
- ✅ Examples tested
- ✅ Migration paths clear

**Overall Success:**

- Skills can define spawnable agents
- Both markdown and TypeScript agent definitions work
- Clear migration path from existing patterns
- Performance acceptable (<500ms delegation overhead)
- Documentation enables skill authors

## Risks & Mitigations

### Risk 1: OpenCode Doesn't Support Automatic Discovery

**Probability:** Medium

**Impact:** High (approach invalid, need pivot)

**Mitigation:**

- Build delegation tool layer first (doesn't require auto-discovery)
- Document that agents must be registered via delegation tool
- Fallback: If SDK supports registration, add that support later

### Risk 2: Context Window Exhaustion

**Probability:** Medium

**Impact:** High (agents degrade performance)

**Mitigation:**

- Apply context-optimization patterns from loaded skills
- Implement observation masking for verbose tool outputs
- Summarize before passing to subagents
- Document context budgeting in skill templates

### Risk 3: Agent Naming Conflicts

**Probability:** Low

**Impact:** Medium (confusion in spawning)

**Mitigation:**

- Namespace agents with skill prefix: `skill-name/agent-name`
- Allow override in skill frontmatter
- Document priority rules for conflict resolution

### Risk 4: Performance Impact

**Probability:** Low

**Impact:** Medium (latency concerns)

**Mitigation:**

- Cache agent configurations
- Lazy-load agents only when needed
- Benchmark delegation overhead
- Optimize loader for speed

## Escalation Triggers

**Escalate to TypeScript-only approach if:**

- Research shows OpenCode SDK supports dynamic agent registration at runtime
- Performance requirements demand in-process agent spawning
- Need to bundle tools with specific agents
- Team strongly prefers type safety over flexibility
- Building production system with strict validation requirements

**Stick with Hybrid Delegator if:**

- Want to support existing markdown agents
- Need gradual migration path
- Value ecosystem compatibility over optimization
- Want to minimize changes to OpenCode core
- Prototyping or exploring patterns

## Timeline

- **Phase 1:** Completed ✅ (research & validation)
- **Phase 2:** Completed ✅ (core implementation)
- **Phase 3:** Completed ✅ (integration & testing)
- **Phase 4:** Completed ✅ (documentation)
- **Phase 5:** Ongoing (iteration based on usage)

Total actual time: **Completed** (phases 1-4) + ongoing (phase 5)

## Next Steps

**Completed:**

1. ✅ Phase 1: Research OpenCode SDK capabilities
2. ✅ Created `RESEARCH.md` documenting findings
3. ✅ Validated sisyphus pattern feasibility
4. ✅ Phase 2: Build agent loader
5. ✅ Created delegation tool implementation (orchestrator-specific)
6. ✅ Test with example skills
7. ✅ Write comprehensive documentation

**Ongoing (Phase 5):**

- Monitor usage patterns for optimization opportunities
- Evaluate performance as more skill-based agents are created
- Consider build-time validation for TypeScript agents
- Explore tool bundling capabilities for agents with custom tools
- Track performance metrics (<500ms delegation overhead threshold)

## Migration Notes

### For Existing Orchestrator Patterns

**Sisyphus Migration:**

- Previously: May have been part of a different module structure
- Now: Self-contained pattern in `src/orchestrator/sisyphus/`
- Contains: `SKILL.md` with orchestration logic and `agents/` directory with subagents
- Benefit: Clear module boundaries, easier testing, independent evolution

### For Skill Authors

**Adding Subagents to Skills:**

1. Create `agents/` directory in your skill
2. Add agent definitions as either `.md` (with frontmatter) or `.ts` (exporting AgentConfig)
3. Use `skill_agent` tool from orchestrator to spawn agents:
   ```typescript
   await skill_agent({
     skill_name: 'your-skill',
     agent_name: 'your-agent',
     prompt: 'Task description',
   });
   ```
4. Both orchestrator and opencode modules support the same delegation pattern

### For Module Maintainers

**Adding New Orchestration Patterns:**

1. Create new directory under `src/orchestrator/` (e.g., `your-pattern/`)
2. Add pattern implementation with `SKILL.md` and optional `agents/`
3. Optionally add pattern-specific tools in `src/orchestrator/tools.ts`
4. Export pattern through `src/orchestrator/index.ts` if needed
5. Follow module isolation principle (don't depend on `src/opencode/agent/` internals)
