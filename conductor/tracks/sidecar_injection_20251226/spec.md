# Track Spec: Sidecar Context Injection & Entity Resolution

## Goal
Verify and stabilize the non-invasive sidecar architecture for Memory Lane. This ensures that the plugin can influence Swarm Tools behavior through OpenCode hooks and correctly extract entities from task outcomes.

## Requirements
- **Verification of Hooks:**
    - `tool.execute.before`: Must inject "Memory Lane Guidance" when `semantic-memory_find` is called.
    - `tool.execute.after`: Must trigger the `memory-catcher` extraction after `swarm_complete`.
- **Entity Resolution:**
    - The `memory-catcher` skill must leverage the enhanced `EntityResolver` to automatically tag memories with project, feature, and agent slugs derived from `files_touched`.
- **Zero-Mod Proof:**
    - Implementation must work without any changes to the `node_modules/opencode-swarm-plugin` source.

## Success Criteria
- [ ] Test script confirms context injection for memory tools.
- [ ] Log files confirm `memory-catcher` spawning upon `swarm_complete` execution.
- [ ] Extracted memories in the database contain correct entity slugs (e.g., `feature:auth-docs`).
