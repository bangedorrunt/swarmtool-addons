# Orchestrator Module (Sisyphus v2)

The Orchestrator module provides high-fidelity coordination patterns, research capabilities, and skill-based agent definitions. Its flagship pattern, **Sisyphus v2**, merges the background lifecycle of `oh-my-opencode` with the `swarm-tools` durable actor model.

## Core Architecture: The Durable Actor Pattern

Sisyphus v2 operates on the **Durable Actor Pattern**, separating the agent's physical lifecycle (Launcher) from its coordination state (Radio).

### 1. The Durable Stream (The Immutable Backbone)

Every state transition is stored as an immutable event in a PGLite log. This allows for perfect "Context Death" recovery.

```text
DURABLE STREAM (PGLite / SQL Event Log)
+-----------------------------------------------------------------------+
|                           EVENT_LOG TABLE                             |
+-----------------------------------------------------------------------+
| Offset: 0 | Offset: 1 | Offset: 2 | Offset: 3 |       ...             |
+-----------+-----------+-----------+-----------+-----------------------+
| TASK_INIT | PLAN_INIT | FILE_EDIT | TEST_PASS | [Next Write Head] ->  |
+-----------+-----------+-----------+-----------+-----------------------+
      │           │               │           │               │
      └───────────┴───────┬───────┴───────────┴───────────────┘
                          ▼
              MATERIALIZED VIEW (Ledger)
       [ SISYPHUS_LEDGER.md is the human-readable Projection ]
```

### 2. The Actor Model (The Radio)

Agents are independent units that communicate exclusively via append-only durable inboxes (SwarmMail).

```text
      [Sisyphus Kernel]               [Executor Actor (Sub-agent)]
            │                                     │
            │ 1. skill_agent(executor)            │
            ├────────────────────────────────────>│
            │                                     │ 2. swarmmail_init()
            │ 3. swarmmail_send(task_payload)     │
            ├────────────────────────────────────>│
            │                                     │ 4. processInbox()
            │                                     │ (Reads from stream)
            │                                     │
            │           5. STATUS_UPDATE          │
            │<────────────────────────────────────┤
            │      (Appended to Durable Log)      │
```

## TypeScript Implementation Patterns

### Durable Stream Primitive

```typescript
export interface SisyphusEvent<T = any> {
  offset: number;
  type: string;
  payload: T;
  timestamp: number;
}

export class DurableSisyphusStream {
  async append<T>(type: string, payload: T): Promise<number> {
    // Appends to centralized PGLite log
    const offset = await db.insert('events').values({ type, payload });
    return offset;
  }
}
```

### Sisyphus Actor Base

```typescript
export abstract class SisyphusActor {
  private cursor: number = 0;
  constructor(protected agentName: string) {}

  async boot() {
    await swarmmail_init(this.agentName);
    await this.processInbox();
  }

  async processInbox() {
    const messages = await swarmmail_inbox({ from_offset: this.cursor });
    for (const msg of messages) {
      await this.onMessage(msg);
      this.cursor = msg.offset + 1; // Checkpoint progress
    }
  }

  abstract onMessage(msg: any): Promise<void>;
}
```

## Features

### Coordination Patterns

1. **Sisyphus v2**: Phased continuity loop (Plan → Validate → Execute) with file-based ledgers.
2. **Conductor Pattern**: Spec-driven development with quality gates.

### Skill-Based Agent Spawning

Provides the `skill_agent` tool for delegating to specialized subagents with OMO "Thinking Mode" support.

```typescript
await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'planner',
  prompt: 'Initialize ledger for database refactor',
  run_in_background: true,
});
```

## Resilience Example: Database Refactor

1. **The Planner** creates a `SISYPHUS_LEDGER.md` and retrieves precedents via `memory-lane`.
2. **The Validator** peer-reviews the plan using its own isolated context.
3. **The Executor** performs TDD. If a context wipe (`/clear`) occurs, the Executor re-reads the Durable Stream and Ledger to resume implementation from its last successful checkpoint.

## Testing

```bash
# Run all orchestrator tests
bun test src/orchestrator
```
