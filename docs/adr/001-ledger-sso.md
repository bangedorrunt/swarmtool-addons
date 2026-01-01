# ADR 001: LEDGER.md as Single Source of Truth

## Status
Done

## Context

In multi-agent systems, maintaining state continuity across session clears (`/clear`) and context wipes is challenging. Standard in-memory registries are volatile.

## Decision

We utilize a physical file, `.opencode/LEDGER.md`, to persist the state of the orchestration.

## Status

Accepted

## Consequences

- **Continuity**: Agents can resume work after a context wipe by reading the LEDGER.
- **Observability**: Users can inspect the current state of the "Swarm" in a human-readable format.
- **Portability**: The state follows the codebase across different machines.
- **Latency**: File I/O adds slight overhead compared to in-memory, mitigated by asynchronous writes.
