# Memory Management (v5.1)

This document describes memory management strategies and limits implemented in the OpenCode Addons plugin.

## Overview

The plugin implements several memory management patterns to prevent unbounded memory growth during long-running sessions:

- Bounded event history caches
- Timer cleanup mechanisms
- Graceful shutdown procedures
- Session state cleanup

## Memory Limits

### Event History (DurableStream)

- **Location:** `src/durable-stream/orchestrator.ts`
- **Limit:** 100,000 events (~100MB-200MB)
- **Behavior:** Oldest events are removed when limit is reached

### Event Cache (JsonlStore)

- **Location:** `src/durable-stream/store.ts`
- **Limit:** 50,000 events (~50MB-100MB)
- **Behavior:** Oldest cache entries are removed when limit is reached

### Memory Estimates

| Component     | Limit                    | Estimated Memory |
| ------------- | ------------------------ | ---------------- |
| Event History | 100,000 events           | 100-200 MB       |
| Event Cache   | 50,000 events            | 50-100 MB        |
| Task Registry | Unlimited (auto-cleanup) | Variable         |
| Session State | Per-session              | 1-10 KB/session  |

## Cleanup Mechanisms

### Session State Cleanup

Session state is automatically cleaned up on:

1. `session.deleted` event - Session was explicitly deleted
2. `plugin.shutdown` event - Plugin is shutting down
3. `session.end` event - Session ended gracefully

### Timer Cleanup

Pending timers (for captures, checkpoints, observers) are cleaned up:

- **Captures:** `pendingCaptures` Map cleared on shutdown
- **Checkpoints:** Automatic cleanup via `cleanup()` when resolved
- **Observer:** `clearTimeout` in `stop()` method

## Graceful Shutdown

Call `shutdownAll()` from the orchestrator module to cleanly shutdown all components:

```typescript
import { shutdownAll } from './orchestrator';

await shutdownAll();
```

This shuts down in order:

1. Task Observer
2. Task Registry
3. Checkpoint Manager
4. Learning Extractor
5. Event-Driven Ledger
6. Durable Stream
7. Memory Lane Store

## Memory Monitoring

### Key Metrics to Watch

- `eventHistory.length` - Current event count in DurableStream
- `eventCache.length` - Current cache size in JsonlStore
- `tasks.size` - Active tasks in TaskRegistry
- `pendingCaptures.size` - Pending learning captures

### Health Checks

Run the following to check memory health:

```typescript
import { getTaskObserver } from './orchestrator/observer';
import { getDurableStream } from './durable-stream';

const observer = getTaskObserver(client);
console.log('Observer stats:', observer.getStats());

const stream = getDurableStream();
console.log('Event history size:', stream.getEventHistory().length);
```

## Configuration

Memory limits can be configured by modifying the constants in source files:

| File              | Constant          | Default | Description           |
| ----------------- | ----------------- | ------- | --------------------- |
| `orchestrator.ts` | `maxEventHistory` | 100000  | Max events in history |
| `store.ts`        | `maxCacheSize`    | 50000   | Max events in cache   |

## Troubleshooting

### Memory Growth Issues

1. Check if `shutdownAll()` is called on plugin unload
2. Verify session events are being emitted correctly
3. Monitor `eventHistory.length` for unexpected growth

### Timer Leaks

1. Check if `session.deleted` events are firing
2. Verify `stopTaskObservation()` is called on cleanup
3. Ensure checkpoints are being resolved or timed out

## Changelog

### v5.1

- Added bounded event history (100,000 limit)
- Added bounded event cache (50,000 limit)
- Added plugin shutdown handler for pending captures
- Added protected recursive loop in observer with error handling
- Added `shutdownAll()` function for graceful cleanup
