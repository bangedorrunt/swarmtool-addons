# Conductor Module

The Conductor module implements a spec-driven development (SDD) framework that brings structure and process discipline to development workflows. It converts ad-hoc development into tracked, test-driven work using tracks, plans, and specs.

## Overview

The Conductor module is responsible for:

- **Track Management**: Creating, reading, and updating development tracks
- **Markdown Parsing**: Parsing track specs and plans with task checkboxes
- **Quality Gates**: Running verification before phase completion
- **Checkpointing**: Creating git commits with phase-prefixed messages
- **OpenCode Integration**: Exporting tools and hooks for swarm-tools coordination

A track is a unit of work that follows a disciplined workflow from inception through completion. Each track contains:

- **`metadata.json`**: Track metadata (type, status, description)
- **`spec.md`**: Specification of what needs to be built
- **`plan.md`**: Execution plan with tasks organized by phases

## Module Structure

```
src/conductor/
├── tools.ts               # Conductor tool implementations
├── parser.ts              # Markdown and checkbox parsing
├── parser.test.ts         # Parser tests
├── index.ts              # Module exports
└── README.md             # This file

Note: Track files (metadata.json, spec.md, plan.md) are stored
in a tracks/ directory at project root (outside src/conductor/).
```

### Track Types

Conductor supports the following track types:

| Type       | Priority   | Description                   |
| ---------- | ---------- | ----------------------------- |
| `bug`      | 0 (high)   | Bug fixes and critical issues |
| `feature`  | 1 (medium) | New feature development       |
| `refactor` | 1 (medium) | Code refactoring and cleanup  |
| `chore`    | 2 (low)    | Maintenance and cleanup tasks |
| `docs`     | 2 (low)    | Documentation updates         |

### Track Status

Each track moves through these states:

- `new`: Newly created, not started
- `in_progress`: Currently being implemented
- `completed`: All tasks completed
- `cancelled`: Track was cancelled

## Workflow

The Conductor workflow follows a strict **TDD lifecycle**:

### Phase 1: Inception

1. Define product vision in `product.md`
2. Establish product guidelines
3. Choose tech stack
4. Define code style guides
5. Set up workflow protocols

### Phase 2: Planning

1. Generate initial track from context
2. Write specification in `spec.md`
3. Create execution plan in `plan.md` with tasks organized by phases
4. Track setup progress in `setup_state.json`

### Phase 3: Execution (TDD Cycle)

For each task in `plan.md`:

1. **Select Task**: Choose next task from `plan.md`
2. **Mark In Progress**: Change `[ ]` to `[~]`
3. **Write Failing Tests** (Red Phase): Create tests that define expected behavior
4. **Implement to Pass Tests** (Green Phase): Write minimal code to pass tests
5. **Refactor**: Clean up code while tests stay green
6. **Verify Coverage**: Ensure >80% code coverage
7. **Commit**: Commit changes with proper message
8. **Update Plan**: Mark task as complete `[x]` and attach commit SHA
9. **Repeat**: Move to next task

### Phase 4: Phase Completion & Checkpointing

When a phase is complete:

1. Verify test coverage for all code files changed in the phase
2. Execute automated tests
3. Propose detailed manual verification plan
4. Await user confirmation
5. Create checkpoint commit
6. Attach verification report as git note
7. Record checkpoint SHA in `plan.md`

## OpenCode Sidecar Integration

Conductor is being ported to an **OpenCode sidecar module** that integrates with swarm-tools' Hive system.

### Integration Architecture

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
│  │  Conductor      │           │   swarm-tools│                 │
│  │  (Sidecar)      │           │  (Core)      │                 │
│  │  ┌───────────┐  │           │              │                 │
│  │  │   Hooks   │◄─┴───────────┤   Hive       │                 │
│  │  │ (Tool/Msg)│              │   System     │                 │
│  │  └───────────┘              └──────────────┘                 │
│  │                                                         ││
│  │  ┌─────────────┐                                         ││
│  │  │ Conductor   │ Track metadata (metadata.json)             ││
│  │  │ Storage     │ - track_id                               ││
│  │  │ (TOML)      │ - type, status                          ││
│  │  └─────────────┘ - created_at, updated_at                ││
│  │                 - description                            ││
│  │  ┌─────────────┐                                         ││
│  │  │ Conductor   │ Execution plans (plan.md)                 ││
│  │  │ Plans       │ - Tasks organized by phases               ││
│  │  │ (Markdown)  │ - Task status tracking                  ││
│  │  └─────────────┘ - Commit SHA attachments                ││
│  │                                                         ││
│  │  ┌─────────────┐                                         ││
│  │  │ Conductor   │ Specifications (spec.md)                   ││
│  │  │ Specs       │ - Feature specifications                   ││
│  │  │ (Markdown)  │ - Requirements                         ││
│  │  └─────────────┘ - Acceptance criteria                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Integration Strategy

**Non-Invasive Sidecar Design:**

1. **Track Storage**: Conductor continues using TOML/JSON for track metadata
2. **Hive Sync**: Track status synced to Hive cells via `ConductorAdapter`
3. **Taxonomy Mapping**: Track types/status map to Hive cell types/status
4. **Tool Hooks**: Export tools for track creation and management
5. **Message Hooks**: Listen to swarm-mail events for sync triggers

**Key Components:**

- **`ConductorAdapter`** (`src/conductor/adapter.ts`): Maps tracks to Hive cells
  - Creates Hive cells from track metadata
  - Syncs track status from Hive cells
  - Maintains track_id ↔ cell_id mappings

- **`TrackProgressResolver`** (`src/conductor/resolver.ts`): Calculates progress
  - Computes completion percentage from tasks
  - Determines state transitions
  - Resolves track state from Hive cell

- **`Taxonomy`** (`src/conductor/taxonomy.ts`): Type definitions
  - Track/Task types and status enums
  - Mapping functions (track → cell)
  - Type guards and validation

### Track ↔ Hive Mapping

| Conductor            | Hive          |
| -------------------- | ------------- |
| Track                | Cell          |
| `new` status         | `open`        |
| `in_progress` status | `in_progress` |
| `completed` status   | `closed`      |
| `bug` type           | `bug`         |
| `feature` type       | `feature`     |
| `refactor` type      | `task`        |
| `chore` type         | `chore`       |
| `docs` type          | `chore`       |

## Design Principles

**Deep Module:**

- Simple interface (`ConductorAdapter`, `TrackProgressResolver`)
- Rich functionality hidden behind clean APIs
- Information hiding: HiveAdapter implementation details encapsulated

**Event-Driven:**

- Prefer async processing over synchronous blocking
- Use swarm-mail for inter-agent communication
- Design for eventual consistency

**Minimal Complexity:**

- Avoid unnecessary orchestration layers
- Direct tool calls over complex workflows
- Ground documentation in reality, avoid over-engineering

## Usage

### Creating a New Track

```bash
# Via OpenCode CLI
gemini "Create a new feature track for user authentication"

# Track is created in conductor/tracks/<track_id>/
# With metadata.json, spec.md, and plan.md
```

### Syncing Track to Hive

```typescript
import { ConductorAdapter } from 'swarm-tool-addons';

const adapter = new ConductorAdapter(hiveAdapter, projectKey, projectPath);

// Create Hive cell from track
const cell = await adapter.createTrackCell(trackMetadata);

// Update track status
await adapter.updateTrackStatus(trackId, 'in_progress');
```

### Calculating Track Progress

```typescript
import { TrackProgressResolver } from 'swarm-tool-addons';

const resolver = new TrackProgressResolver();

// Calculate progress from tasks
const progress = resolver.calculateProgress(tasks);
// { percent: 50, completedCount: 3, totalCount: 6 }

// Determine next state
const nextState = resolver.resolveStateTransition(currentStatus, tasks);
```

## Future Work

- [ ] Implement tool hooks for track creation via CLI
- [ ] Add message hooks for automatic sync on Hive changes
- [ ] Integrate track progress into Hive cell status
- [ ] Support track dependencies (blocked/blocked_by)
- [ ] Add track visualization (Gantt chart, timeline)
- [ ] Implement track templates (common patterns)

## See Also

- **AGENTS.md**: Module implementation guide and integration patterns
- **workflow.md**: Detailed development workflow and protocols
- **taxonomy.ts**: Type definitions and mapping functions
- **adapter.ts**: Conductor-Hive integration implementation
