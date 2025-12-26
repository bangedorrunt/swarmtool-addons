# Conductor Research: Markdown/Skill-Driven Orchestration

## 1. Overview

This document summarizes the research into replacing the existing TOML-based Conductor framework with a modern, Markdown/Skill-driven orchestration system within the OpenCode Swarm ecosystem.

## 2. Current Conductor State (TOML-Based)

- **Framework**: Spec-driven development using `tracks`, `plans`, and `specs`.
- **Definition**: Commands defined in TOML files (`gemini-extension/commands/*.toml`).
- **Prompt Composition**: Prompts are composed from TOML sections, defaults, and examples.
- **State Management**: Purely markdown-based "database" in `tracks/` directory.
- **Workflow**: Strictly sequential: Spec Generation -> Plan Creation -> TDD Cycle -> Checkpoint -> Completion.

## 3. The New Vision: Markdown & Skills

The goal is to move towards "Prompts as Code" where orchestration logic and command definitions live entirely in Markdown, leveraging OpenCode's native Skill architecture.

### 3.1 Prompts as First-Class Citizens (Markdown)

- **Command Definitions**: Instead of TOML, use Markdown files in `src/command/`. These files use YAML frontmatter for metadata and Markdown for the prompt body.
- **Skills**: Specialized behaviors (like memory extraction or TDD) are encapsulated as Skills in `src/skill/`.
- **Templates**: Use Markdown for all templates (spec.md, plan.md), allowing agents to easily read, modify, and act upon them.

### 3.2 Skill-Based Orchestration

- **Swarm Coordination**: Leverage the `swarm-coordination` skill to decompose complex tracks into parallelizable Hive beads.
- **Agent-as-Tool**: Use the native `Task()` tool to spawn workers with specific skill sets.
- **Event-Driven**: Use `swarm-mail` for asynchronous communication and tool hooks for non-invasive sidecar behavior.

### 3.3 State & Persistence

- **Hive**: Use Hive cells/beads for granular task tracking and status management.
- **Memory Lane**: Use `semantic-memory` to store and retrieve long-term learnings across different tracks and projects.
- **Git Sync**: Use Git as the ultimate source of truth for history, leveraging git notes for AI-generated summaries.

## 4. Key Implementation Patterns

1. **Markdown Commands**:
   ```markdown
   ---
   name: new-track
   description: Create a new feature track
   tools: [hive_create, markdown_writer]
   ---

   # New Track Prompt

   Decompose the user request into a spec...
   ```
2. **Skill Integration**:
   - `conductor-lifecycle` skill to manage the state machine (spec -> plan -> execute).
   - `tdd-workflow` skill to enforce the Red-Green-Refactor cycle.
3. **Hybrid State**: Markdown files in the repo provide visibility, while Hive/libSQL provide queryable, structured state for the agents.

## 5. Conclusion

Replacing Conductor with a Markdown/Skill-driven system aligns it with the rest of the OpenCode ecosystem, reduces complexity by removing the need for TOML parsing, and improves flexibility by allowing orchestration logic to be defined in natural language prompts within Markdown files.
