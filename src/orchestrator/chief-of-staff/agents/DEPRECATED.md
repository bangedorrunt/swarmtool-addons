# DEPRECATED AGENTS

The following agents have been deprecated in v5.0 and merged into consolidated agents.

## Merged Into `interviewer` (v5.0)

- `spec-writer` - Requirements extraction now part of interviewer workflow

## Merged Into `architect` (v5.0)

- `oracle` - Task decomposition now part of architect workflow
- `planner` - Implementation blueprinting now part of architect workflow

## Merged Into `reviewer` (v5.0)

- `spec-reviewer` - Spec compliance check now Phase 1 of reviewer
- `code-quality-reviewer` - Code quality check now Phase 2 of reviewer

## Removed (v5.0)

- `frontend-ui-ux-engineer` - Specialized frontend role, use executor instead
- `workflow-architect` - Meta-agent functionality absorbed by chief-of-staff
- `context-loader` - Context loading now done inline by chief-of-staff
- `memory-catcher` - Learning extraction now handled by event-driven hooks

## Migration Guide

| Old Agent                                | New Agent        | Notes                        |
| ---------------------------------------- | ---------------- | ---------------------------- |
| `chief-of-staff/spec-writer`             | `interviewer`    | Merged: clarification + spec |
| `chief-of-staff/oracle`                  | `architect`      | Merged: decomposition        |
| `chief-of-staff/planner`                 | `architect`      | Merged: blueprinting         |
| `chief-of-staff/spec-reviewer`           | `reviewer`       | Merged: Phase 1              |
| `chief-of-staff/code-quality-reviewer`   | `reviewer`       | Merged: Phase 2              |
| `chief-of-staff/frontend-ui-ux-engineer` | `executor`       | Use executor with UI context |
| `chief-of-staff/workflow-architect`      | `chief-of-staff` | Absorbed                     |
| `chief-of-staff/context-loader`          | `chief-of-staff` | Inline                       |
| `chief-of-staff/memory-catcher`          | Hooks            | Event-driven                 |

## New Agent Roster (v5.0)

1. **interviewer** - Clarification + Specification (inline)
2. **architect** - Decomposition + Planning (inline)
3. **executor** - TDD Implementation (child)
4. **reviewer** - Spec Compliance + Code Quality (inline)
5. **validator** - Quality Gate (inline)
6. **debugger** - Root Cause Analysis (inline)
7. **explore** - Codebase Search (inline)
8. **librarian** - External Documentation (child)

---

_Last Updated: 2026-01-02_
