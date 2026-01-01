# ADR 002: Hook-Based Async Handoff with Settlement Delay

## Status
Done

## Context

Calling `promptAsync` directly within a tool execution causes a deadlock in the OpenCode AI SDK because the SDK expects the current turn to finish before processing a new prompt.

## Decision

We implement a two-stage handoff:

1. The tool returns a `HANDOFF_INTENT` metadata.
2. A global `tool.execute.after` hook detects this intent and triggers `promptAsync` after a fixed delay (800ms).

## Status

Accepted

## Consequences

- **Deadlock Prevention**: Allows the current turn to settle and commit its result to history before the next agent starts.
- **Reliability**: Ensures that the session state is stable.
- **Latency**: Adds a mandatory 800ms delay to interactive transitions.
