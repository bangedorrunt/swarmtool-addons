# Conductor Architecture Redesign: Markdown & Skill-Driven

## 1. System Architecture

The redesigned Conductor framework moves away from TOML-based configurations to a "Prompts as Code" model using Markdown and OpenCode Skills.

### 1.1 Core Components

- **Commands (`src/command/*.md`)**: Entry points for user-facing actions.
- **Skills (`src/opencode/skill/**/SKILL.md`)\*\*: Reusable agent behaviors and orchestration logic.
- **Hive beads**: Persistent state for individual tasks.
- **Markdown State**: Files in the repository (`tracks/`) for human visibility and audit.

## 2. File Structure & Conventions

### 2.1 Project Layout

```
/
├── src/
│   ├── command/          # Markdown commands (YAML frontmatter)
│   │   ├── new-track.md
│   │   └── track-status.md
│   ├── skill/            # Domain-specific skills
│   │   ├── conductor-core/
│   │   │   └── SKILL.md  # Core lifecycle management
│   │   └── tdd-cycle/
│   │       └── SKILL.md  # Red-Green-Refactor logic
├── tracks/               # Workspace for active development
│   └── <track-id>/
│       ├── spec.md       # Requirements & Acceptance Criteria
│       ├── plan.md       # Execution plan with Hive cell mappings
│       └── status.md     # Progress, checkpoints, and quality gates
```

### 2.2 Command Schema

Commands use YAML frontmatter for metadata:

```markdown
---
name: <command-name>
description: <description>
tools: [<list-of-tools>]
---

# Prompt

Instructions for the agent...
```

### 2.3 Skill Schema

Skills follow the OpenCode SKILL.md format:

- **Metadata**: Name, description, tags, tools.
- **Instructions**: Detailed behavioral guidelines for the agent.

## 3. Workflow Implementation

### 3.1 Lifecycle States

The `conductor-core` skill manages the transitions:

1. **Inception**: `new-track` command creates `tracks/<id>/`.
2. **Definition**: Spec-gen skill populates `spec.md`.
3. **Planning**: Plan-gen skill creates `plan.md` and Hive cells.
4. **Execution**: `tdd-cycle` skill guides workers through tasks.
5. **Verification**: Quality gates checked via `verify-gate` skill.

### 3.2 State Synchronization

- **Primary State**: Hive database (libSQL) via `swarm-mail`.
- **Secondary State**: Markdown files in `tracks/` synced by agents.
- **Audit Trail**: Git commits and notes.

## 4. Migration Path

1. Implement the Markdown parser tool to read YAML frontmatter.
2. Port existing TOML prompts to Markdown command files.
3. Create the `conductor-core` skill to handle orchestration.
4. Update the Hive adapter to sync between libSQL and Markdown files.
