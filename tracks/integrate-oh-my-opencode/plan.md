# Plan: Integrate oh-my-opencode Subagents

**Track ID**: integrate-oh-my-opencode
**Strategy**: TDD-driven decomposition with atomic tasks (15-30 min each)

---

## Phase 1: Setup & Infrastructure

**Goal**: Establish directory structure, types, and test scaffolding

- [ ] Task: Install oh-my-opencode dependency
  - Add to package.json dependencies
  - Install via bun install
  - Verify version compatibility

- [ ] Task: Create directory structure
  - Create src/oh-my-opencode/
  - Create adapter.ts, types.ts, registry.ts, config.ts, hooks.ts
  - Create adapter.test.ts, registry.test.ts, config.test.ts

- [ ] Task: Write failing test for adapter types
  - Test: define OhMyOpenCodeConfig interface
  - Test: AgentConfig type compatibility
  - Test: ToolConfig mapping structure

- [ ] Task: Implement adapter types
  - Define OhMyOpenCodeConfig interface
  - Define AgentConfig type for swarm-tools compatibility
  - Define ToolConfig mapping types
  - Export types

- [ ] Task: Refactor adapter types
  - Ensure type safety with TypeScript strict mode
  - Add JSDoc comments for clarity
  - Validate against oh-my-opencode source types

- [ ] Task: Conductor checkpoint (Phase 1 complete)
  - commit: Phase 1: Setup and infrastructure complete

---

## Phase 2: Core Adapter Logic

**Goal**: Implement agent registry and adapter layer with full test coverage

- [ ] Task: Write failing test for agent registration (AC1)
  - Test: registerOhMyOpenCodeAgents() returns all 7 agents
  - Test: agent descriptions preserved
  - Test: swarm-tools compatible format (mode, prompt, model)

- [ ] Task: Implement agent registration
  - Create registerOhMyOpenCodeAgents() function
  - Map oh-my-opencode agents to swarm-tools format
  - Register all 7 agents (sisyphus, oracle, librarian, explore, frontend-ui-ux-engineer, document-writer, multimodal-looker)

- [ ] Task: Refactor agent registration
  - Extract agent mapping constants
  - Add error handling for missing agents
  - Optimize for performance (< 5ms overhead)

- [ ] Task: Write failing test for adapter conversion
  - Test: convert AgentConfig to swarm-tools format
  - Test: tool configuration handling
  - Test: model-specific settings preservation (temperature, thinking, reasoningEffort)

- [ ] Task: Implement adapter conversion
  - Create adaptAgentConfig() function
  - Handle background_task vs standard task tools
  - Map write/edit permissions correctly
  - Preserve model settings

- [ ] Task: Refactor adapter conversion
  - Ensure idempotency
  - Add validation for required fields
  - Optimize for minimal overhead

- [ ] Task: Write failing test for configuration loading
  - Test: load config from oh-my-opencode package
  - Test: handle missing config gracefully
  - Test: validate config structure

- [ ] Task: Implement configuration loading
  - Create loadOhMyOpenCodeConfig() function
  - Load from external dependency
  - Validate configuration structure
  - Provide fallback defaults

- [ ] Task: Refactor configuration loading
  - Add caching to avoid repeated loads
  - Clear error messages for missing dependency
  - Type-safe config access

- [ ] Task: Write failing test for backward compatibility (AC2)
  - Test: swarm/planner, worker, researcher still registered
  - Test: existing agent prompts unchanged
  - Test: existing workflows complete without errors

- [ ] Task: Verify backward compatibility
  - Ensure adapter doesn't modify existing agents
  - Verify swarm-tools agents remain accessible
  - Test existing swarm creation still works

- [ ] Task: Refactor backward compatibility verification
  - Add integration tests for existing agent workflows
  - Document compatibility guarantees
  - Add regression tests

- [ ] Task: Conductor checkpoint (Phase 2 complete)
  - commit: Phase 2: Core adapter logic and backward compatibility verified

---

## Phase 3: Integration & Configuration

**Goal**: Implement model overrides, tool access validation, and manual agent testing

- [ ] Task: Write failing test for model configuration (AC4)
  - Test: config.yaml model overrides work
  - Test: default models used when no override
  - Test: invalid model names raise clear error

- [ ] Task: Implement model configuration system
  - Integrate with existing config.yaml loader
  - Apply model overrides at agent registration
  - Validate model names against available models
  - Provide helpful error messages

- [ ] Task: Refactor model configuration
  - Cache model configuration
  - Add hot-reload support for config changes
  - Document model override syntax

- [ ] Task: Write failing test for tool access validation (AC6)
  - Test: Sisyphus has background_task, task, write, edit tools
  - Test: Librarian has gh, context7, websearch, grep_app, repo-crawl
  - Test: Explore has grep, ast-grep, lsp, git tools
  - Test: other agents have required tools

- [ ] Task: Implement tool access validation
  - Create tool access matrix
  - Validate tool availability for each agent
  - Provide clear error for missing tools
  - Support tool configuration from oh-my-opencode source

- [ ] Task: Refactor tool access validation
  - Add tool availability checks
  - Document required tools per agent
  - Add warnings for optional tools

- [ ] Task: Manual test - spawn all new agents (AC3)
  - Test: swarm spawn sisyphus --task "delegate work"
  - Test: swarm spawn oracle --task "review architecture"
  - Test: swarm spawn librarian --task "find examples"
  - Test: swarm spawn explore --task "find implementations"
  - Test: swarm spawn frontend-ui-ux-engineer --task "style component"
  - Test: swarm spawn document-writer --task "write docs"
  - Test: swarm spawn multimodal-looker --task "analyze media"

- [ ] Task: Verify new agent functionality
  - Confirm all agents spawn without errors
  - Verify agents access required tools
  - Test agents complete simple tasks

- [ ] Task: Refactor new agent verification
  - Create automated smoke tests
  - Add test fixtures for common tasks
  - Document agent usage examples

- [ ] Task: Conductor checkpoint (Phase 3 complete)
  - commit: Phase 3: Model configuration and tool access integration

---

## Phase 4: Memory Integration & Testing

**Goal**: Implement Memory Lane hooks, performance validation, and comprehensive testing

- [ ] Task: Write failing test for Memory Lane integration (AC5)
  - Test: agents query memory before starting work
  - Test: agents store learnings after completion
  - Test: correct entity tags used in memory storage

- [ ] Task: Implement Memory Lane hooks
  - Add memory-lane_find call before agent execution
  - Add memory-lane_store call after agent completion
  - Map agent outputs to appropriate taxonomy
  - Use entity tags for context

- [ ] Task: Refactor Memory Lane integration
  - Ensure memory queries use task context
  - Add learning extraction patterns
  - Validate taxonomy alignment with swarm-tools

- [ ] Task: Write failing test for performance benchmarks (AC7)
  - Test: measure adapter initialization overhead (< 5ms)
  - Test: measure runtime performance vs baseline
  - Test: measure memory footprint increase (< 20MB)

- [ ] Task: Implement performance measurement
  - Add benchmarking utility functions
  - Create baseline measurement for swarm-tools agents
  - Measure oh-my-opencode agent performance
  - Calculate and report overhead

- [ ] Task: Measure and validate performance
  - Run benchmark suite
  - Compare adapter overhead to < 5ms target
  - Compare runtime to < 10% baseline target
  - Compare memory increase to < 20MB target

- [ ] Task: Refactor performance optimization
  - Optimize adapter initialization if needed
  - Cache frequently accessed data
  - Document performance characteristics

- [ ] Task: Conductor checkpoint (Phase 4 complete)
  - commit: Phase 4: Memory integration and performance validation

---

## Phase 5: Documentation & Final Verification

**Goal**: Complete documentation, error handling, and quality validation

- [ ] Task: Write failing test for error handling (AC10)
  - Test: handle missing oh-my-opencode dependency
  - Test: handle invalid agent configuration
  - Test: handle tool access failures

- [ ] Task: Implement error handling
  - Provide clear error messages with install instructions
  - Validate agent configuration before registration
  - Gracefully degrade when tools unavailable
  - Suggest alternatives for missing tools

- [ ] Task: Refactor error handling
  - Add error recovery mechanisms
  - Document error conditions
  - Add error logging

- [ ] Task: Create README.md (AC9)
  - Overview of integrated agents
  - Mapping table: oh-my-opencode name → swarm-tools name
  - Tool access requirements per agent
  - Usage examples for each agent

- [ ] Task: Create ARCHITECTURE.md (AC9)
  - Adapter layer design with ADRs
  - Agent lifecycle: load → configure → spawn → execute
  - Integration points with swarm-tools
  - Error handling and fallback strategies
  - ASCII diagrams for architecture

- [ ] Task: Update AGENTS.md (AC9)
  - Add "oh-my-opencode Integration" section
  - Document agent naming conventions
  - Include usage examples
  - Note compatibility requirements

- [ ] Task: Refactor documentation
  - Add code examples with syntax highlighting
  - Create ASCII diagrams for clarity
  - Add links to oh-my-opencode source files
  - Review for clarity and completeness

- [ ] Task: Run quality gate - unit tests (AC8)
  - bun test src/oh-my-opencode/\*.test.ts
  - Verify 100% coverage for adapter layer
  - Fix any failing tests

- [ ] Task: Run quality gate - type checking (AC8)
  - bun run typecheck
  - Fix any TypeScript errors
  - Ensure strict mode compliance

- [ ] Task: Run quality gate - linting (AC8)
  - bun run lint
  - Fix any ESLint errors
  - Ensure code follows style guidelines

- [ ] Task: Run quality gate - formatting (AC8)
  - bun run format
  - Ensure Prettier formatting passes
  - Check for any formatting issues

- [ ] Task: Manual verification - backward compatibility (AC2)
  - Create new swarm with existing planner, worker, researcher
  - Verify no errors or warnings
  - Verify workflows complete successfully
  - Verify no breaking changes to agent prompts

- [ ] Task: Manual verification - new agents (AC3)
  - Spawn each of 7 oh-my-opencode agents
  - Verify tool access works
  - Verify agents complete test tasks
  - Document any behavioral differences

- [ ] Task: Conductor checkpoint (Phase 5 complete)
  - commit: Phase 5: Documentation, error handling, and quality validation complete

---

## Success Verification

Run this checklist to verify all acceptance criteria:

- [ ] **AC1**: Agent Registration - `bun test src/oh-my-opencode/adapter.test.ts` passes
- [ ] **AC2**: Backward Compatibility - Manual test passes, existing agents work
- [ ] **AC3**: New Agent Functionality - All 7 agents spawn and complete tasks
- [ ] **AC4**: Model Configuration - config.yaml overrides work, defaults applied
- [ ] **AC5**: Memory Lane Integration - Agents query/store memory correctly
- [ ] **AC6**: Tool Access Verification - All tool access matrix tests pass
- [ ] **AC7**: Performance Benchmarks - < 5ms init, < 10% runtime, < 20MB memory
- [ ] **AC8**: Code Quality - All tests pass, no lint/type errors
- [ ] **AC9**: Documentation Completeness - README.md, ARCHITECTURE.md, AGENTS.md updates
- [ ] **AC10**: Error Handling - All error handling tests pass

---

## Notes

- All tasks follow TDD pattern: failing test → implementation → refactor
- Git checkpoints after each phase for rollback capability
- Manual tests documented for human verification
- Performance targets measured against baseline before integration
