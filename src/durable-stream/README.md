# Durable Stream Module

A robust, event-sourced persistence layer for OpenCode plugins, providing crash recovery, human-in-the-loop checkpoints, and linearizable event logs.

## 🚀 Quick Start

```typescript
import { getDurableStream } from './durable-stream';

// 1. Get the singleton instance
const stream = getDurableStream();

// 2. Initialize (ensures storage is ready)
await stream.initialize();

// 3. Append an event (e.g., creating a task)
await stream.append({
  type: 'task.created',
  actor: 'agent/planner',
  payload: { title: 'Refactor Auth' },
});

// 4. Subscribe to events (real-time)
stream.on('task.completed', (event) => {
  console.log('Task done:', event.payload.result);
});

// 5. Query history
const history = await stream.query({ actor: 'agent/planner' });
```

## 🔑 Key Concepts

- **Streams**: Every event belongs to a `stream_id` (usually a session ID or task ID).
- **Correlation ID**: Tracks causality across distributed components.
- **Checkpoints**: Pause execution and wait for human approval (HITL).
- **Intents**: Long-running workflows tracked by the system (e.g., "Review PR").

## 🛠️ API Reference

### `getDurableStream(config?)`

Returns the global singleton instance.

### `stream.append(event)`

Persists an event to the `jsonl` store and emits it to subscribers.

### `stream.requestCheckpoint(id, options)`

Creates a blocking checkpoint that requires human intervention to resolve.

### `stream.resume()`

Replays history from disk to restore in-memory state (pending checkpoints, active intents).

## 📂 Configuration

Default location: `.opencode/durable_stream.jsonl`

Configure via `DurableStreamConfig` passed to `initializeDurableStream`.

## 📋 Supported Event Types

### Lifecycle Events

- `lifecycle.session.created` - New session started
- `lifecycle.session.idle` - Session became idle
- `lifecycle.session.compacted` - Session context compacted
- `lifecycle.session.error` - Session error occurred

### Execution Events

- `execution.step_start` - Step execution started
- `execution.step_finish` - Step execution completed
- `execution.tool_start` - Tool execution started
- `execution.tool_finish` - Tool execution completed

### Agent Events

- `agent.spawned` - Agent task started
- `agent.completed` - Agent task completed successfully
- `agent.failed` - Agent task failed
- `agent.aborted` - Agent task was aborted
- `agent.handoff` - Task handed off to another agent

### Checkpoint Events (HITL)

- `checkpoint.requested` - Human approval requested
- `checkpoint.approved` - Checkpoint approved
- `checkpoint.rejected` - Checkpoint rejected

### File Events

- `files.changed` - File modified
- `files.patched` - File patched

### Learning Events

- `learning.extracted` - Learning pattern extracted

### Ledger Events (v4.1)

- `ledger.epic.created` - New epic created
- `ledger.epic.started` - Epic execution started
- `ledger.epic.completed` - Epic completed successfully
- `ledger.epic.failed` - Epic failed
- `ledger.epic.archived` - Epic archived
- `ledger.task.created` - New task created
- `ledger.task.started` - Task execution started
- `ledger.task.completed` - Task completed
- `ledger.task.failed` - Task failed
- `ledger.task.yielded` - Task yielded control
- `ledger.governance.directive_added` - New directive established
- `ledger.governance.assumption_added` - New assumption recorded
- `ledger.learning.extracted` - Learning extracted from session
