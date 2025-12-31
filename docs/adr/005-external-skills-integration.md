# ADR 005: EXTERNAL SKILLS INTEGRATION

## Status

Accepted

## Context

The current skill-based subagents operate in isolation within the `chief-of-staff` hierarchy, without leveraging the rich ecosystem of external skills available at `~/.claude/skills/`. These external skills provide battle-tested protocols for TDD, debugging, verification, and multi-agent coordination that can significantly enhance subagent capabilities.

## Decision

We integrate 27 external skills from `~/.claude/skills/` with orchestrator subagents using OpenCode's native `use skill <name>` syntax.

### Skill Categories

| Category | Skills |
|----------|--------|
| **Superpowers** | `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, `brainstorming`, `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, `finishing-a-development-branch`, `writing-skills`, `using-superpowers` |
| **Context Engineering** | `context-fundamentals`, `context-optimization`, `context-compression`, `context-degradation`, `multi-agent-patterns`, `memory-systems`, `tool-design`, `evaluation`, `advanced-evaluation`, `project-development`, `javascript-typescript`, `algorithmic-art`, `skill-creator` |

### Subagent → Skill Mapping

| Subagent | Recommended Skills |
|----------|-------------------|
| **executor** | `test-driven-development`, `systematic-debugging`, `verification-before-completion` |
| **validator** | `verification-before-completion`, `evaluation` |
| **planner** | `writing-plans`, `brainstorming` |
| **oracle** | `multi-agent-patterns`, `context-optimization` |
| **chief-of-staff** | `dispatching-parallel-agents`, `subagent-driven-development`, `multi-agent-patterns` |
| **workflow-architect** | `skill-creator` |
| **spec-reviewer** *(new)* | `verification-before-completion` |
| **code-quality-reviewer** *(new)* | `requesting-code-review`, `evaluation` |
| **debugger** *(new)* | `systematic-debugging` |

### New Subagents

1. **spec-reviewer**: Verifies implementation matches spec (nothing extra, nothing missing)
2. **code-quality-reviewer**: Reviews code quality after spec compliance confirmed
3. **debugger**: Enforces 4-phase root cause investigation before any fix

### Execution Workflow Change

```
BEFORE: executor → validator → complete
AFTER:  executor → spec-reviewer → code-quality-reviewer → complete
```

### Invocation Pattern

SKILL.md files include skill hints:
```markdown
## Recommended Skills

- `use skill test-driven-development` for TDD protocol
- `use skill verification-before-completion` before claiming done
- `use skill systematic-debugging with "test failure"` on failures
```

## Consequences

### Positive

- **Enhanced Protocols**: Subagents gain access to proven methodologies
- **Two-Stage Review**: Spec compliance separated from code quality
- **Root Cause Debugging**: Prevents blind fix attempts
- **No Code Changes**: Skills invoked via `use skill` in prompts

### Negative

- **Skill Availability**: Skills must be installed at `~/.claude/skills/`
- **Context Cost**: Each skill adds tokens to subagent prompts

## References

- [Superpowers (GitHub)](https://github.com/obra/superpowers)
- [Context Engineering Skills](~/.claude/skills/)
- ADR 004: ORCHESTRATOR SDD WORKFLOW IMPROVEMENTS
