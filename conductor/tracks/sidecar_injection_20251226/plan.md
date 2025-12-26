# Track Plan: Sidecar Context Injection & Entity Resolution

## Phase 1: Hook Verification
- [ ] Task: Create a verification script `scripts/verify-hooks.ts` that simulates tool calls and checks context injection.
- [ ] Task: Run `verify-hooks.ts` and ensure `tool.execute.before` correctly appends Memory Lane guidance.
- [ ] Task: Manually call `swarm_complete` via OpenCode CLI and verify `memory-lane.log` for successful extraction trigger.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Hook Verification' (Protocol in workflow.md)

## Phase 2: Entity Resolver Integration
- [ ] Task: Update `memory-catcher` skill prompt in `src/memory-lane/hooks.ts` to emphasize the use of `EntityResolver.extractFromPath`.
- [ ] Task: Verify that `memory-catcher` correctly identifies features from `docs/` and `.hive/analysis/` paths.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Entity Resolver Integration' (Protocol in workflow.md)

## Phase 3: Finalization
- [ ] Task: Update project `README.md` to document the sidecar plugin integration and OpenCode hook usage.
- [ ] Task: Perform a final build check (`mise run build`).
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Finalization' (Protocol in workflow.md)
