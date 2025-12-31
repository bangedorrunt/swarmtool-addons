# AGENTS.md

## Module Implementation Guide

### Skill-Based Agent Architecture

This plugin implements a **Skill-Based Subagent** architecture where domain expertise is packaged into specialized, on-demand workers coordinated by a `chief-of-staff` agent.

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenCode Runtime                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Tool & Message Hooks Event Bus                    ││
│  │       (async, decoupled event processing)                   ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                              │                        │
│         ▼                              ▼                        │
│  ┌─────────────────┐           ┌──────────────────────┐         │
│  │ swarmtool-addons│           │    Chief-of-Staff    │         │
│  │  (This Plugin)  │           │    (Coordinator)     │         │
│  │  ┌───────────┐  │           │  ┌───────────────┐   │         │
│  │  │  Tools &  │◄─┴───────────┤  │  Sub-Agents   │   │         │
│  │  │   Hooks   │              │  │ (oracle, etc) │   │         │
│  │  └───────────┘              │  └───────────────┘   │         │
│  └─────────────────┬───────────┴──────────────────────┘         │
│                    │                                            │
│           ┌────────┴────────┐                                   │
│           ▼                 ▼                                   │
│   ┌──────────────┐  ┌──────────────┐                            │
│   │  LEDGER.md   │  │  Memory Lane │                            │
│   │ (Persistence)│  │  (Vector DB) │                            │
│   └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

**Key Integration Points:**

1. **Tool Hooks** (`src/index.ts`):
   - Module exports tools that agents can call directly
   - Example: `skill_agent`, `skill_list`, `memory-lane_store`
   - Tools should be idempotent and handle errors gracefully

2. **Tool Execution Hooks** (`src/index.ts`):
   - Uses `tool.execute.after` to intercept tool completions
   - Processes events for session learning and state persistence
   - Captures learnings from agent interactions

3. **Storage**:
   - `LEDGER.md` for durable state persistence and crash recovery
   - SQLite/libSQL for Memory Lane semantic storage
   - Agent definitions in `~/.config/opencode/skill/`

4. **Access Control**:
   - Protected sub-agents (`oracle`, `executor`, `planner`, etc.) only respond to `chief-of-staff`
   - Hierarchical naming: `chief-of-staff/oracle`, `chief-of-staff/planner`

5. **External Skills**:
   - Integration with `~/.claude/skills/` via `use skill <name>`
   - Supports 27+ external protocols (TDD, debugging, etc.)
   - Dynamic skill routing via Chief-of-Staff

---

### Module Structure

```
src/
  index.ts                    # Plugin bootstrap, registers all modules
  agent-spawn.ts              # skill_agent tool implementation
  event-log.ts                # Event logging utilities

  memory-lane/
    index.ts                  # Memory Lane entry, exports tools
    hooks.ts                  # Session learning hooks
    adapter.ts                # External service adapters
    memory-store.ts           # SQLite storage implementation
    resolver.ts               # Semantic query logic
    taxonomy.ts               # Type definitions

  opencode/
    index.ts                  # OpenCode integration entry
    loader.ts                 # Agent discovery & loading
    skill/                    # Built-in skill definitions
    config/                   # Configuration management

  orchestrator/
    index.ts                  # Orchestrator entry
    ledger.ts                 # LEDGER.md persistence
    session-coordination.ts   # Session state management
    hooks/                    # Orchestration event hooks
    chief-of-staff/           # Chief-of-Staff agent definition
```

---

### Core Principles

**Skill-Based Subagent Design:**

- Each agent is a specialist with focused expertise
- `chief-of-staff` coordinates complex multi-step workflows
- Agents communicate via structured results, not shared state
- 16x context reduction through partitioned agent contexts

**LEDGER.md Persistence:**

- Single source of truth for workflow state
- Survives session clears and crashes
- Tracks Epic progress, learnings, and handoffs
- Located at `.opencode/LEDGER.md`

**Access Control:**

- Protected agents only respond to coordinator patterns
- Prevents direct invocation of internal agents
- Ensures proper state management and coordination

**Event-Driven Architecture:**

- Prefer asynchronous processing over synchronous blocking
- Use hooks for event observation (non-blocking)
- Design for eventual consistency

---

## Build & Test Commands

- **Build**: `mise run build` or `bun build ./src/index.ts --outdir dist --target bun`
- **Test**: `mise run test` or `bun test`
- **Single Test**: `bun test BackgroundTask.test.ts` (use file glob pattern)
- **Watch Mode**: `bun test --watch`
- **Lint**: `mise run lint` (eslint)
- **Fix Lint**: `mise run lint:fix` (eslint --fix)
- **Format**: `mise run format` (prettier)

---

## Code Style Guidelines

### Imports & Module System

- Use ES6 `import`/`export` syntax (module: "ESNext", type: "module")
- **Named exports only** (`export { MyClass }`), **no default exports**
- Group imports: external libraries first, then internal modules
- Use explicit file extensions (`.ts`) for internal imports

### Formatting (Prettier)

- **Single quotes** (`singleQuote: true`)
- **Line width**: 100 characters
- **Tab width**: 2 spaces
- **Trailing commas**: ES5 (no trailing commas in function parameters)
- **Semicolons**: enabled

### TypeScript & Naming

- **NeverNesters**: avoid deeply nested structures. Always exit early
- **Strict mode**: enforced (`"strict": true`)
- **Classes**: PascalCase (e.g., `MemoryLane`, `MemoryAdapter`)
- **Methods/properties**: camelCase
- **Status strings**: use union types (e.g., `'pending' | 'running' | 'completed' | 'failed'`)
- **Explicit types**: prefer explicit type annotations over inference for complex types
- **Avoid `any`**: use `unknown` or more specific types

### Type System Rules

- **Avoid type assertions** (`x as SomeType`) unless justified
- **No `#private` fields**: use TypeScript `private` visibility
- **Prefer `readonly`** for properties never reassigned outside constructor
- **Optional params**: use `?` instead of `| undefined`
- **Array types**: use `T[]` for simple types, `Array<T>` for complex unions
- **Never use `{}`**: prefer `unknown` or `Record<string, unknown>`

### Error Handling

- Check error type before accessing: `error instanceof Error ? error.toString() : String(error)`
- Log errors with `[ERROR]` prefix for consistency
- Always provide error context when recording output
- Use union types for status (never strings)

### Linting Rules

- `@typescript-eslint/no-explicit-any`: warn (avoid `any` type)
- `no-console`: error (minimize console logs)
- `prettier/prettier`: error (formatting violations are errors)

---

## Testing

- Framework: **vitest** with `describe` & `it` blocks
- Style: Descriptive nested test cases with clear expectations
- Assertion library: `expect()` (vitest)
- Test files: `*.test.ts` adjacent to source files
- Mock patterns: Use vitest mocking for external dependencies

---

## Documentation Standards

### Required Documentation

Every module MUST include:

1. **`SPEC.md`** (in module directory):
   - Technical specification and architecture
   - ADRs for non-obvious design choices
   - Integration points and dependencies

2. **`README.md`** (for user-facing modules):
   - Quick start and usage examples
   - Available agents/tools and their purposes
   - Workflow patterns with examples

3. **`SKILL.md`** (for skill-based agents):
   - Agent identity and role
   - Available tools and capabilities
   - Response format and communication style

### Automatic Documentation Updates

Agents are responsible for keeping documentation in sync with the codebase:

1. **Proactive Updates**:
   - Update `docs/adrs/` when making architectural decisions
   - Update `src/{module}/SPEC.md` when internal design changes
   - Update `README.md` files if public APIs change

2. **Context Awareness**:
   - Verify documentation before completing major work
   - Update existing docs rather than leaving stale information

### Documentation Tone

- **Professional & Precise**: Use industry-standard terminology
- **Direct & Grounded**: Avoid fluff; focus on actionable insights
- **No Redundancy**: Comments must add information, not restate code

---

## Project Context

- **Type**: ES Module package for OpenCode plugin system
- **Target**: Bun runtime, ES2021+
- **Purpose**: Skill-based multi-agent orchestration with durable state

---

_Last Updated: 2025-12-31_
