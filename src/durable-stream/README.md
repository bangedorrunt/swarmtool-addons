# Durable Stream Module

A robust, event-sourced persistence layer for OpenCode plugins.

Durable Stream bridges OpenCode hook events (including streaming `message.part.updated`) into an append-only JSONL log for crash recovery, HITL checkpoints, intent tracking, and execution telemetry.

## Quick Start (Plugin Integration)

```typescript
import { initializeDurableStream } from './durable-stream';

// 1. Initialize once (plugin startup)
const stream = await initializeDurableStream({
  storePath: '.opencode/durable_stream.jsonl',
});
await stream.resume();

// 2. Bridge OpenCode SDK events into Durable Stream (plugin event hook)
const bridge = stream.createBridgeHooks();

return {
  event: async (eventInput) => {
    await bridge.event?.(eventInput);
  },
};
```

## Common Usage

```typescript
import { getDurableStream } from './durable-stream';

const stream = getDurableStream();

// Append a domain event
await stream.append({
  type: 'ledger.task.created',
  stream_id: 'sess_abc123',
  correlation_id: 'sess_abc123',
  actor: 'chief-of-staff',
  payload: { taskId: 'task_1', title: 'Refactor Auth' },
});

// Subscribe to execution telemetry (bridged from message.part.updated)
stream.subscribe('execution.text_delta', (e) => {
  // e.payload: { sessionID, messageID, partID, delta }
});

// Query history
const history = await stream.query({
  stream_id: 'sess_abc123',
  type: ['execution.text_snapshot', 'execution.reasoning_snapshot'],
  limit: 50,
});
```

## Key Concepts

- **Streams**: Every event belongs to a `stream_id` (usually a session ID or task ID).
- **Correlation ID**: Tracks causality across distributed components.
- **Checkpoints**: Pause execution and wait for human approval (HITL).
- **Intents**: Long-running workflows tracked by the system (e.g., "Review PR").
- **Execution Telemetry**: Streaming text/reasoning/tool/agent parts captured as `execution.*` events.

## API Reference

### `initializeDurableStream(config?)`

Initializes the global singleton instance and returns it.

### `getDurableStream()`

Returns the global singleton instance.

### `stream.createBridgeHooks()`

Returns a `{ event }` hook that can be called from the plugin `event` handler to project OpenCode SDK events into Durable Stream.

### `stream.append(event)`

Persists an event to the `jsonl` store and emits it to subscribers.

### `stream.requestCheckpoint(streamId, decisionPoint, options, requestedBy)`

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
- `lifecycle.session.deleted` - Session deleted via `session.delete()`
- `lifecycle.session.aborted` - Session aborted via `session.abort()`

### Execution Events

- `execution.message.updated` - Message completion marker (used for intent correlation)
- `execution.step_start` - Step execution started
- `execution.step_finish` - Step execution completed
- `execution.tool_start` - Tool execution started
- `execution.tool_finish` - Tool execution completed
- `execution.agent` - Agent part observed
- `execution.text_delta` - Streaming text delta
- `execution.text_snapshot` - Final text snapshot
- `execution.reasoning_delta` - Streaming reasoning delta
- `execution.reasoning_snapshot` - Final reasoning snapshot
- `execution.snapshot` - Full message snapshot
- `execution.retry` - Retry marker

### Agent Events

- `agent.spawned` - Agent task started
- `agent.completed` - Agent task completed successfully
- `agent.failed` - Agent task failed
- `agent.aborted` - Agent task was aborted
- `agent.handoff` - Task handed off to another agent
- `agent.yield` - Agent yielded control
- `agent.resumed` - Agent resumed after yield

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
- `ledger.handoff.created` - Handoff created
- `ledger.handoff.resumed` - Handoff resumed
- `ledger.task.created` - New task created
- `ledger.task.started` - Task execution started
- `ledger.task.completed` - Task completed
- `ledger.task.failed` - Task failed
- `ledger.task.yielded` - Task yielded control
- `ledger.governance.directive_added` - New directive established
- `ledger.governance.assumption_added` - New assumption recorded
- `ledger.learning.extracted` - Learning extracted from session

### Progress Events (v5.0)

- `progress.phase_started` - Phase started
- `progress.phase_completed` - Phase completed
- `progress.status_update` - Status update
- `progress.user_action_needed` - User action required (HITL)
- `progress.context_handoff` - Context handoff emitted
