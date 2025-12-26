# Spec: Integrate oh-my-opencode Subagents

## Overview

Integrate oh-my-opencode's curated subagent library with swarm-tools to expand agent capabilities while maintaining backward compatibility. The integration uses an adapter pattern to expose oh-my-opencode agents as swarm-tools-compatible subagents, enabling gradual adoption without breaking existing workflows.

**Source**: https://github.com/code-yeongyu/oh-my-opencode
**Track ID**: integrate-oh-my-opencode

## Context

### Current Swarm-Tools Agents

- **swarm/planner**: Task decomposition with Memory Lane optimization, strategy selection, and CellTree output
- **swarm/worker**: Subtask execution with 9-step survival checklist (init, memory query, skill load, file reservation, work, progress, checkpoint, memory store, complete)
- **swarm/researcher**: READ-ONLY research agent for tool discovery, lockfile analysis, and documentation fetching

### oh-my-opencode Agents Available

1. **Sisyphus**: Main orchestrator with Phase 0 intent gate, delegation-based workflows, frontend decision gate
2. **Oracle**: Architecture advisor with deep reasoning, pragmatic minimalism bias, Quick/Short/Medium/Large effort estimates
3. **Librarian**: Multi-repo analysis using GitHub CLI, Context7, web search, permalinks with SHA references
4. **Explore**: Contextual grep for codebases (semantic search, structural patterns, file discovery, git history)
5. **frontend-ui-ux-engineer**: UI/UX specialist with aesthetic guidelines, typography, color, motion principles
6. **document-writer**: Technical documentation specialist with verification-driven workflow
7. **multimodal-looker**: Media file interpretation (PDFs, images, diagrams)

## Requirements

### Functional Requirements

**FR1: Agent Registry**

- Register all 7 oh-my-opencode agents as swarm-tools-compatible subagents
- Maintain original agent capabilities and tool configurations
- Map oh-my-opencode agent names to swarm-tools naming convention

**FR2: Adapter Layer**

- Create adapter functions to convert oh-my-opencode `AgentConfig` to swarm-tools subagent format
- Handle tool configuration differences (background_task, write, edit permissions)
- Preserve model-specific settings (temperature, thinking, reasoningEffort)

**FR3: Backward Compatibility**

- Existing swarm-tools agents (planner, worker, researcher) remain functional
- No changes to existing agent prompts or workflows
- Existing swarms continue working without modification

**FR4: Configuration Integration**

- Load oh-my-opencode agent configurations from external dependency
- Support model overrides via `config.yaml` (consistent with existing swarm-tools agents)
- Allow per-agent model customization

**FR5: Tool Access**

- Ensure oh-my-opencode agents have access to required tools:
  - Librarian: gh CLI, context7, websearch, grep_app, repo-crawl
  - Explore: grep, ast-grep, lsp tools, git commands
  - Document-writer: read, glob, write tools
  - Multimodal-looker: read tool (media files)

**FR6: Skill Integration**

- Load oh-my-opencode agents as subagents, not skills
- Maintain separation between swarm-tools skills and oh-my-opencode agents
- Enable agents to load skills via `skills_use()` where applicable

**FR7: Memory Lane Integration**

- All integrated agents should use `memory-lane_find` before starting work
- Store learnings via `memory-lane_store` with appropriate taxonomy
- Follow swarm-tools memory-first patterns

### Non-Functional Requirements

**NFR1: Performance**

- Adapter overhead < 5ms per agent initialization
- No runtime performance degradation for existing agents
- Memory footprint increase < 20MB

**NFR2: Maintainability**

- Single source of truth for oh-my-opencode agent definitions (external package)
- Clear separation between adapter logic and agent configurations
- Type-safe agent registration (TypeScript strict mode)

**NFR3: Compatibility**

- Support Bun runtime (ES2021+) with existing dependencies
- No additional runtime dependencies required
- Works with current OpenCode SDK version

**NFR4: Documentation**

- Document each integrated agent with mapping to oh-my-opencode source
- Include usage examples for each agent
- Note behavioral differences vs. existing swarm-tools agents

**NFR5: Testing**

- Unit tests for adapter layer (100% coverage)
- Integration tests for agent registration
- Manual verification of agent tool access

## Acceptance Criteria

### AC1: Agent Registration (VERIFIED via test)

**Test**: `bun test src/oh-my-opencode/adapter.test.ts`

```typescript
describe('Agent Registry', () => {
  it('registers all 7 oh-my-opencode agents', () => {
    const agents = registerOhMyOpenCodeAgents();
    expect(agents).toHaveProperty('sisyphus');
    expect(agents).toHaveProperty('oracle');
    expect(agents).toHaveProperty('librarian');
    expect(agents).toHaveProperty('explore');
    expect(agents).toHaveProperty('frontend-ui-ux-engineer');
    expect(agents).toHaveProperty('document-writer');
    expect(agents).toHaveProperty('multimodal-looker');
  });

  it('preserves agent descriptions', () => {
    const agents = registerOhMyOpenCodeAgents();
    expect(agents.sisyphus.description).toContain('orchestration');
    expect(agents.librarian.description).toContain('multi-repository');
  });

  it('maps to swarm-tools compatible format', () => {
    const agents = registerOhMyOpenCodeAgents();
    expect(agents.sisyphus.mode).toBe('subagent');
    expect(typeof agents.sisyphus.prompt).toBe('string');
    expect(typeof agents.sisyphus.model).toBe('string');
  });
});
```

### AC2: Backward Compatibility (VERIFIED via manual test)

**Test**: Create a new swarm using existing planner, worker, researcher

```bash
# Pre-integration baseline
swarm init "test task"
swarm spawn planner
swarm spawn worker
swarm spawn researcher

# Verify:
# 1. No errors or warnings
# 2. All 3 agents function identically to pre-integration
# 3. No tool access issues
```

**Success Criteria**:

- ✅ Existing agents spawn without errors
- ✅ Existing workflows complete successfully
- ✅ No breaking changes to agent prompts

### AC3: New Agent Functionality (VERIFIED via manual test)

**Test**: Spawn each oh-my-opencode agent and verify tool access

```bash
# Test each agent
swarm spawn sisyphus --task "delegate work to explore"
swarm spawn librarian --task "find React hooks examples"
swarm spawn explore --task "find auth implementations"
swarm spawn oracle --task "review architecture"
swarm spawn frontend-ui-ux-engineer --task "style button component"
swarm spawn document-writer --task "write README"
swarm spawn multimodal-looker --task "analyze screenshot.png"
```

**Success Criteria**:

- ✅ All 7 agents spawn without errors
- ✅ Agents can access required tools
- ✅ Agents complete test tasks successfully

### AC4: Model Configuration (VERIFIED via config test)

**Test**: Override agent models via config.yaml

```yaml
# config.yaml
models:
  sisyphus:
    model: 'anthropic/claude-sonnet-4-5'
  oracle:
    model: 'openai/gpt-5.2'
  librarian:
    model: 'opencode/grok-code'
```

**Verification**:

```bash
# Verify model overrides applied
swarm spawn oracle --model-check
# Output should show: openai/gpt-5.2
```

**Success Criteria**:

- ✅ Config file model overrides work
- ✅ Default models used when no override
- ✅ Invalid model names raise clear error

### AC5: Memory Lane Integration (VERIFIED via test)

**Test**: Verify agents use memory-lane tools

```typescript
describe('Memory Lane Integration', () => {
  it('agents query memory before starting work', async () => {
    // Mock memory-lane_find calls
    // Spawn agent with task
    // Verify memory-lane_find was called
  });

  it('agents store learnings after completion', async () => {
    // Mock memory-lane_store calls
    // Execute agent task
    // Verify memory-lane_store was called with correct taxonomy
  });
});
```

**Success Criteria**:

- ✅ Memory query logs found in agent execution
- ✅ Learning storage logs found after agent completion
- ✅ Correct entity tags used in memory storage

### AC6: Tool Access Verification (VERIFIED via test matrix)

| Agent             | Required Tools                                | Test Result |
| ----------------- | --------------------------------------------- | ----------- |
| Sisyphus          | background_task, task, write, edit            | ✅/❌       |
| Oracle            | (read-only)                                   | ✅/❌       |
| Librarian         | gh, context7, websearch, grep_app, repo-crawl | ✅/❌       |
| Explore           | grep, ast-grep, lsp tools, git commands       | ✅/❌       |
| Frontend          | write, edit                                   | ✅/❌       |
| Document-writer   | read, glob, write                             | ✅/❌       |
| Multimodal-looker | read (media files)                            | ✅/❌       |

### AC7: Performance Benchmarks (VERIFIED via test)

**Test**: Measure adapter overhead and runtime performance

```bash
# Baseline: existing swarm-tools agents
time swarm spawn worker --task "simple task"
# Record: T_baseline

# Integration: oh-my-opencode agents
time swarm spawn explore --task "find auth"
# Record: T_explore

# Calculate overhead
overhead = T_explore - T_baseline

# Memory usage
memory_profiler swarm spawn librarian --task "search docs"
# Record: memory_increase
```

**Success Criteria**:

- ✅ Adapter initialization overhead < 5ms
- ✅ Runtime performance within 10% of baseline
- ✅ Memory footprint increase < 20MB

### AC8: Code Quality (VERIFIED via linter)

```bash
# Run full test suite
bun test

# Run type checking
bun run typecheck

# Run linter
bun run lint

# Run formatter check
bun run format
```

**Success Criteria**:

- ✅ All tests pass (100% unit test coverage for adapter)
- ✅ No TypeScript errors
- ✅ No ESLint errors
- ✅ Prettier formatting passes

### AC9: Documentation Completeness (VERIFIED via review)

**Required Documentation**:

1. **`src/oh-my-opencode/README.md`**
   - Overview of integrated agents
   - Mapping table: oh-my-opencode name → swarm-tools name
   - Tool access requirements per agent
   - Usage examples for each agent

2. **`src/oh-my-opencode/ARCHITECTURE.md`**
   - Adapter layer design (ADRs)
   - Agent lifecycle: load → configure → spawn → execute
   - Integration points with swarm-tools
   - Error handling and fallback strategies

3. **`AGENTS.md` updates**
   - Add section "oh-my-opencode Integration"
   - Document agent naming conventions
   - Include usage examples
   - Note compatibility requirements

**Success Criteria**:

- ✅ All required docs present
- ✅ Docs contain code examples
- ✅ ASCII diagrams for architecture
- ✅ Links to oh-my-opencode source files

### AC10: Error Handling (VERIFIED via test)

```typescript
describe('Error Handling', () => {
  it('handles missing oh-my-opencode dependency', () => {
    // Remove dependency from package.json
    // Attempt to register agents
    // Expect: Clear error message with install instructions
  });

  it('handles invalid agent configuration', () => {
    // Provide malformed AgentConfig
    // Expect: Validation error with details
  });

  it('handles tool access failures', () => {
    // Mock tool unavailability
    // Spawn agent requiring that tool
    // Expect: Graceful degradation with helpful error
  });
});
```

**Success Criteria**:

- ✅ Missing dependency error includes install command
- ✅ Invalid config error points to specific issue
- ✅ Tool access failure suggests alternative

## Implementation Plan (OUT OF SCOPE)

This spec defines requirements. Implementation is tracked separately.

## Dependencies

- oh-my-opencode package (external dependency)
- Existing swarm-tools infrastructure
- Memory Lane system (already implemented)
- Tool hooks system (already implemented)

## Out of Scope

- Modifications to oh-my-opencode agent prompts
- Replacing existing swarm-tools agents
- Changes to swarm-tools core orchestration
- Performance optimization of oh-my-opencode agents
- Additional tools beyond what oh-my-opencode agents require

## Risk Mitigation

| Risk                                   | Impact | Mitigation                                                  |
| -------------------------------------- | ------ | ----------------------------------------------------------- |
| oh-my-opencode package incompatible    | HIGH   | Verify compatibility during implementation, version pinning |
| Breaking changes in oh-my-opencode API | MEDIUM | Adapter layer provides isolation, semantic versioning       |
| Tool conflicts between agents          | LOW    | Tool configuration preserved from source, no modifications  |
| Increased complexity for users         | LOW    | Documentation, examples, gradual adoption option            |

## Success Metrics

- **Functional**: 7/7 agents successfully registered and functional
- **Compatibility**: 0 breaking changes to existing workflows
- **Performance**: Adapter overhead < 5ms, runtime within 10% of baseline
- **Quality**: 100% unit test coverage for adapter layer, 0 lint errors
- **Documentation**: All required docs present with examples
