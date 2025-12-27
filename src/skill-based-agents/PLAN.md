# Implementation Plan: Skill-Based Subagent Feature

## Overview

This plan outlines the implementation of a skill-based subagent system that allows skills to define and spawn their own specialized subagents. This bridges the gap between existing skill infrastructure and agent spawning capabilities.

## Context

Current state analysis:

- **OpenCode** has native skill support with automatic discovery from `~/.opencode/skill/` paths
- **Skills** can bundle resources (scripts, references, assets) but currently cannot define spawnable agents
- **oh-my-opencode** implements TypeScript agents registered via plugin system
- **swarmtool-addons** uses markdown-based agent definitions in `src/agent/` directory
- **sisyphus skill** exists with `agents/` subdirectory containing SKILL.md files (unclear if actually spawnable)

**Goal**: Enable skills to define subagents that can be discovered and spawned by OpenCode, supporting both markdown and TypeScript agent definitions.

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

### Approach 3: Hybrid Delegator Pattern (Recommended)

```typescript
// Tool-based delegation
tool({
  name: 'skill_agent',
  args: {
    skill_name: string, // "sisyphus"
    agent_name: string, // "oracle"
    prompt: string, // Task description
    run_in_background: boolean,
  },
  execute: async ({ skill_name, agent_name, prompt, run_in_background }) => {
    // 1. Resolve agent path
    const agentPath = resolveAgentPath(skill_name, agent_name);

    // 2. Load agent config (supports .md and .ts)
    const config = await loadAgentConfig(agentPath);

    // 3. Spawn agent via OpenCode SDK
    if (run_in_background) {
      return spawnBackgroundAgent(config, prompt, context);
    } else {
      return spawnSyncAgent(config, prompt, context);
    }
  },
});
```

```
skill-name/
├── SKILL.md                    # Main skill
├── agent/                        # Subagents (mixed formats)
│   ├── oracle.md                # Markdown agent
│   └── worker.ts                # TypeScript agent
└── references/
```

**Pros:**

- ✅ Loose coupling (delegation via tools)
- ✅ Supports both markdown and TypeScript agents
- ✅ Tool-based (leverages existing OpenCode patterns)
- ✅ Flexible (can ship incrementally)
- ✅ Context isolation (each agent gets fresh context)
- ✅ Skill-native (agents live in skill directories)

**Cons:**

- ❌ Indirection (extra delegation layer)
- ❌ Tool dependency (requires plugin with delegation tools)
- ❌ Runtime errors only (no build-time validation)
- ❌ Discovery complexity (custom logic to map skill+agent → config)

## Decision

**Recommended: Approach 3 (Hybrid Delegator Pattern)**

**Rationale:**

1. Aligns with OpenCode philosophy (tool-based delegation is native)
2. Lowest risk (doesn't require OpenCode core changes)
3. Flexibility (supports current agents AND new skill-based agents)
4. Progressive (can ship MVP, iterate based on usage)
5. Context isolation (each spawned agent gets fresh context via delegation)

**Fallback:** If research shows OpenCode supports automatic agent discovery from skill directories, pivot to Approach 1.

## Implementation Phases

### Phase 1: Research & Validation (Quick, <1h)

**Objective:** Verify OpenCode SDK capabilities and validate approach feasibility

**Tasks:**

1. [x] Research OpenCode SDK for agent registration APIs
   - Check `@opencode-ai/sdk` documentation
   - Verify if plugins can register subagents dynamically
   - Document all available AgentConfig options

2. [x] Analyze sisyphus pattern in depth
   - Test if OpenCode discovers agents in `skill/agents/` directories
   - Verify agent SKILL.md frontmatter parsing
   - Confirm if these agents are actually spawnable

3. [x] Review existing delegation mechanisms
   - Document `call-omo-agent` tool implementation
   - Analyze `background_task` vs `Task` tool patterns
   - Map swarm-coordination's spawning workflow

4. [x] Create validation prototype
   - Test skill with `agent/` directory
   - Verify agent discovery and spawning
   - Document any limitations found

**Deliverable:** Research findings report in `RESEARCH.md` (Completed)

### Phase 2: Core Implementation (Short, 1-2h)

**Objective:** Build delegation infrastructure and agent loading

**Tasks:**

1. [x] Create agent loader module (Completed)
2. [x] Implement skill-to-agent resolution (Completed)
3. [x] Create `skill_agent` delegation tool (Completed)
4. [x] Extend skill discovery (Completed)

**Deliverable:**

- `src/agent/loader.ts` (agent loading infrastructure)
- `src/tools/skill-agent.ts` (delegation tool)
- Updated `src/skill/loader.ts` (skill discovery with agent support)

**Success Criteria:**

- Tool can spawn agents from skill directories
- Both markdown and TypeScript agents work
- Error messages clear and actionable
- Performance acceptable (<500ms delegation overhead)

### Phase 3: Integration & Testing (Short, 1-2h)

**Objective:** Integrate with swarmtool-addons and test functionality

**Tasks:**

1. [ ] Register delegation tool in plugin
   - Export from `src/index.ts`
   - Update tool list documentation
   - Verify tool discovery by agents

2. [ ] Create example skill with agents

   ```
   skill-based-agents-demo/
   ├── SKILL.md
   ├── agent/
   │   ├── oracle.md
   │   ├── worker.md
   │   └── researcher.ts
   └── references/
   ```

3. [ ] Write comprehensive tests
   - Agent discovery from skills
   - Agent spawning delegation
   - Error handling (missing agents, invalid configs)
   - Multi-agent coordination scenarios

4. [ ] Test with real use cases
   - Spawn markdown agent from skill
   - Spawn TypeScript agent from skill
   - Test background vs sync spawning
   - Verify context isolation

**Deliverable:**

- Working example skill
- Test suite with >80% coverage
- Integration tests verifying end-to-end flows

**Success Criteria:**

- All tests passing
- Example agents spawnable and functional
- Performance meets requirements
- Error paths tested

### Phase 4: Documentation (Quick, <1h)

**Objective:** Create user-facing documentation and guides

**Tasks:**

1. [ ] Write implementation guide
   - How to create skill-based agents
   - Markdown vs TypeScript agent patterns
   - Best practices for agent design
   - Migration guide from existing agents

2. [ ] Create API reference
   - `skill_agent` tool documentation
   - Agent frontmatter schema
   - Error codes and troubleshooting

3. [ ] Write architecture documentation
   - Design decisions and trade-offs
   - Context isolation patterns
   - Delegation flow diagrams
   - ASCII art diagrams for clarity

4. [ ] Create migration examples
   - Converting existing agents to skill-based
   - From oh-my-opencode pattern to hybrid
   - From swarmtool-addons pattern to skill-based

**Deliverable:**

- `IMPLEMENTATION_GUIDE.md`
- `API_REFERENCE.md`
- `ARCHITECTURE.md`
- Example migrations in documentation

**Success Criteria:**

- Documentation complete and actionable
- Examples tested and working
- Clear upgrade paths documented
- Troubleshooting guide comprehensive

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

- **Phase 1:** Today (research & validation)
- **Phase 2:** Tomorrow (core implementation)
- **Phase 3:** Tomorrow (integration & testing)
- **Phase 4:** Tomorrow (documentation)
- **Phase 5:** As needed (iteration)

Total estimated time: **1-2 days** (phases 1-4) + ongoing (phase 5)

## Next Steps

1. Start Phase 1: Research OpenCode SDK capabilities
2. Create `RESEARCH.md` documenting findings
3. Validate sisyphus pattern feasibility
4. Begin Phase 2: Build agent loader
5. Create delegation tool implementation
6. Test with example skills
