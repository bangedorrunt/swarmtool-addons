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
  payload: { title: 'Refactor Auth' }
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
