# AGENTS.md

## Module Implementation Guide

### OpenCode Hooks Integration Pattern

Swarm-tool modules integrate as **non-invasive sidecars** on top of swarm-tools, using OpenCode hooks for event-driven coordination:

```
┌─────────────────────────────────────────────────────────────────┐
│                   OpenCode Runtime                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Swarm-Mail Event Bus                           ││
│  │  (async, decoupled message passing between agents)          ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                              │                        │
│         ▼                              ▼                        │
│  ┌─────────────────┐           ┌──────────────┐                 │
│  │  Your Module    │           │   swarm-tools│                 │
│  │  (Sidecar)      │           │  (Core)      │                 │
│  │  ┌───────────┐  │           │              │                 │
│  │  │   Hooks   │◄─┴───────────┤   Agents     │                 │
│  │  │ (Tool/Msg)│              │              │                 │
│  │  └───────────┘              └──────────────┘                 │
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Key Integration Points:**

1. **Tool Hooks** (`src/index.ts`):
   - Module exports tools that agents can call directly
   - Example: `semantic-memory_store` tool available to all agents
   - Tools should be idempotent and handle errors gracefully

2. **Message Hooks** (`src/memory-lane/hooks.ts`):
   - Module listens to swarm-mail messages via `swarmmail_inbox`
   - Subscribe to relevant events (e.g., `swarm_complete`, `swarm_progress`)
   - Process asynchronously, non-blocking to main agent workflow

3. **Storage**:
   - Use libSQL via PGlite for persistent storage (see `src/memory-lane/index.ts`)
   - Follow schema patterns in documentation
   - Design for decoupled operation (module works even if swarm-mail unavailable)

### Module Structure Template

```
src/
  module-name/
    index.ts              # Main entry, exports tools
    hooks.ts              # Message event handlers
    adapter.ts            # External service adapters
    tools.ts              # Tool implementations
    taxonomy.ts           # Type definitions
    resolver.ts           # Query/computation logic
  index.ts                # Plugin bootstrap, registers all modules
```

### Core Principles

**Non-Invasive Sidecar Design:**

- Modules should NOT modify swarm-tools core behavior
- Use hooks to observe/react to events, not to block/interrupt
- Modules operate independently and degrade gracefully if dependencies fail

**Event-Driven Architecture:**

- Prefer asynchronous processing over synchronous blocking
- Use swarm-mail for inter-agent communication (never direct imports)
- Design for eventual consistency

**Minimal Complexity:**

- Question if harness/scaffolding is needed (The Bitter Lesson principle)
- Prefer direct tool calls over complex orchestration layers
- Keep documentation grounded in reality, avoid over-engineering

## Build & Test Commands

- **Build**: `mise run build` or `bun build ./src/index.ts --outdir dist --target bun`
- **Test**: `mise run test` or `bun test`
- **Single Test**: `bun test BackgroundTask.test.ts` (use file glob pattern)
- **Watch Mode**: `bun test --watch`
- **Lint**: `mise run lint` (eslint)
- **Fix Lint**: `mise run lint:fix` (eslint --fix)
- **Format**: `mise run format` (prettier)

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
- **Status strings**: use union types (e.g., `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`)
- **Explicit types**: prefer explicit type annotations over inference for complex types
- **Return types**: optional (not required but recommended for public methods)
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

## Testing

- Framework: **vitest** with `describe` & `it` blocks
- Style: Descriptive nested test cases with clear expectations
- Assertion library: `expect()` (vitest)
- Test hooks/integration points with mock swarm-mail events

## Documentation Standards

### Required Documentation

Every module MUST include:

1. **`MODULE_DEEP_DIVE.md`** (or `DEEP_DIVE.md` in module directory):
   - Architecture Decision Records (ADRs) for non-obvious design choices
   - Reference material and research that informed implementation
   - "Why" behind the implementation, not just "what"

2. **Visual Architecture**:
   - **ASCII diagrams** for flowcharts, sequence diagrams, state machines
   - Show integration points with swarm-mail, tools, hooks
   - Consistent entity styling across diagrams (Agents, Stores, Hooks)
   - Example: Lifecycle diagrams, event flow patterns

3. **SKILL.md** (for skill-based modules):
   - High-level orchestration logic
   - How it adheres to "Agent-as-Tool" pattern
   - Design philosophy and minimal complexity rationale
   - Context engineering contributions (raw > compaction > summarization)

### Documentation Tone

- **Professional & Precise**: Use industry-standard terminology (Event Sourcing, Actor Model, Durable Streams)
- **Direct & Grounded**: Avoid fluff; focus on actionable technical insights
- **No Redundancy**: Comments must add information, not restate code

## Project Context

- **Type**: ES Module package for OpenCode plugin system
- **Target**: Bun runtime, ES2021+
- **Purpose**: Non-invasive sidecar modules for swarm-tools via OpenCode hooks
