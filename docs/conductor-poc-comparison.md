# Comparison Analysis: Gemini CLI POC vs. Markdown/Skill-Driven Conductor

This document evaluates the existing "Gemini CLI POC" for Conductor against the proposed "Markdown/Skill-Driven" architecture.

## 1. Overview of Implementations

### 1.1 Gemini CLI POC (Current)

- **Logic Location**: Primarily in `src/agent/conductor/` as standalone Markdown files for `specifier.md` and `planner.md`.
- **Execution Model**: Task-based subagents. The coordinator calls `Task(subagent="specifier")`.
- **Tools**: Hardcoded TypeScript tools in `src/conductor/tools.ts`.
- **State**: Filesystem-based tracking in the `tracks/` directory.
- **Tone**: Socratic and TDD-focused.

### 1.2 Markdown/Skill-Driven (Proposed)

- **Logic Location**: Reusable Skills in `src/skill/` (e.g., `conductor-core`, `tdd-workflow`) and Slash Commands in `src/command/`.
- **Execution Model**: Skill injection. Any agent (Planner, Worker, Researcher) can be augmented with Conductor-specific behaviors.
- **Tools**: Modular tools with a robust Markdown parser (`src/conductor/parser.ts`) to automate metadata and task extraction.
- **State**: Hybrid. Markdown files for human visibility, Hive beads for agentic orchestration and swarm synchronization.
- **Tone**: Collaborative, event-driven, and swarm-native.

## 2. Key Differences

| Feature                | Gemini CLI POC                            | Markdown/Skill-Driven                                |
| :--------------------- | :---------------------------------------- | :--------------------------------------------------- |
| **Encapsulation**      | Siloed subagents (`specifier`, `planner`) | Modular behaviors (Skills) injected into any agent   |
| **Command Definition** | Fixed plugin registration                 | "Prompts as Code" via Markdown + YAML frontmatter    |
| **State Sync**         | Manual/Template-based                     | Automated "Checkbox-to-Hive" sync via parser + hooks |
| **Flexibility**        | Rigid workflow (Spec -> Plan)             | Composable swarm workflows via `swarm-coordination`  |
| **Auditability**       | Markdown files in `tracks/`               | Git Notes + Hive Beads + Markdown Files              |

## 3. Analysis & Insights

### 3.1 From Subagents to Skills

The POC uses a "Specialist" model where only certain agents can handle Conductor tasks. The new architecture moves to a "Skill" model. This is superior because it allows a `swarm-worker` to become "Conductor-aware" simply by loading the skill, reducing the need for spawning specific subagents and preserving context.

### 3.2 Slash Commands as First-Class Citizens

By moving command definitions to `src/command/*.md`, we treat prompts as code. This makes the system more maintainable for developers (no TOML parsing) and more discoverable for the LLM (clear metadata in YAML).

### 3.3 Automated Orchestration

The POC relies on agents manually editing templates. The new architecture uses a dedicated Markdown parser to "read" the state of a track (e.g., how many checkboxes are checked) and automatically update Hive beads. This enables real-time status reporting and automated dependency management without human intervention.

## 4. Conclusion

The Gemini CLI POC served as a great validation of the "Spec-Driven Development" (SDD) workflow. However, the **Markdown/Skill-Driven** approach is the necessary evolution for a swarm-based ecosystem. It replaces silos with reusable behaviors, TOML with natural language prompts, and manual state tracking with automated Hive synchronization.
