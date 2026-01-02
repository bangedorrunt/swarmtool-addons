/**
 * File-Based Ledger Templates (v6.0)
 *
 * Templates for context and epic files.
 * Used when initializing new projects or creating new epics.
 */

// CONTEXT TEMPLATES

export const PRODUCT_TEMPLATE = `# Product Context

## Project Name
[Project name here]

## Description
[Brief description of what this project does]

## Target Users
- [User type 1]
- [User type 2]

## Goals
- [Goal 1]
- [Goal 2]

## Key Features
- [Feature 1]
- [Feature 2]

---
*Last updated: {{date}}*
`;

export const TECH_STACK_TEMPLATE = `# Tech Stack

## Language & Runtime
- **Language**: TypeScript
- **Runtime**: Bun

## Frameworks
- [Framework 1]
- [Framework 2]

## Database
- [Database choice]

## Key Dependencies
| Package | Purpose |
|---------|---------|
| package1 | Purpose |
| package2 | Purpose |

## Conventions
- Use ESM imports
- Prefer functional patterns
- [Other conventions]

## Development Tools
- Linter: ESLint/Biome
- Formatter: Prettier/Biome
- Test: Bun test

---
*Last updated: {{date}}*
`;

export const WORKFLOW_TEMPLATE = `# Workflow

## Methodology
**TDD (Test-Driven Development)**

1. Write failing test (Red)
2. Implement to pass (Green)
3. Refactor (Refactor)

## Quality Gates

Before marking any task complete:

- [ ] All tests pass
- [ ] Code coverage > 80%
- [ ] No linting errors
- [ ] Types are correct
- [ ] Public functions documented

## Commit Strategy
- Use conventional commits
- Format: \`type(scope): message\`
- Types: feat, fix, refactor, test, docs, chore

## Branching Model
- main: Production-ready
- feature/*: New features
- fix/*: Bug fixes

## Code Review
- Required before merge
- At least 1 approval

## Phase Checkpoints
Each SDD phase requires user approval:
1. CLARIFY: Approve specification
2. PLAN: Approve implementation plan
3. EXECUTE: Verify each phase completion
4. REVIEW: Accept or request changes

---
*Last updated: {{date}}*
`;

// EPIC TEMPLATES

export const SPEC_TEMPLATE = `# Specification: {{title}}

**Version**: 1.0.0
**Created**: {{date}}
**Status**: Draft

## Overview
{{overview}}

## Functional Requirements

| ID | Priority | Description |
|----|----------|-------------|
| FR-001 | must-have | [Requirement] |

## Non-Functional Requirements

| ID | Category | Description |
|----|----------|-------------|
| NFR-001 | performance | [Requirement] |

## Constraints
- [Constraint 1]

## Out of Scope
- [Item 1]

## Acceptance Criteria

### AC-001
- **Given**: [precondition]
- **When**: [action]
- **Then**: [expected result]

---
*Approved by: [pending]*
`;

export const PLAN_TEMPLATE = `# Implementation Plan: {{title}}

## Goal
{{goal}}

## Track Info
- **Epic ID**: {{epicId}}
- **Complexity**: medium
- **Execution Strategy**: sequential

## Current State Analysis

### What Exists
- [Existing component 1]

### What's Missing
- [Missing component 1]

## File Impact Analysis

| File Path | Action | Purpose |
|-----------|--------|---------|
| src/file.ts | create | Description |

## Proposed Changes (Phased)

### Phase 1: [Phase Name]

- [ ] Task 1.1: [Task description]
- [ ] Task 1.2: [Task description]
- Checkpoint: [Verification step]

### Phase 2: [Phase Name]

- [ ] Task 2.1: [Task description]
- Checkpoint: [Verification step]

## Verification Plan

### Automated Tests
- **Test Command**: \`bun test\`
- **Coverage Target**: >80%

### Manual Verification
1. [Step 1]
2. [Step 2]

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Risk 1 | medium | Mitigation |

## Assumptions
- [Assumption 1] (no Directive found)

---
*Approved by: [pending]*
`;

export const LOG_TEMPLATE = `# Execution Log: {{title}}

**Epic ID**: {{epicId}}
**Started**: {{date}}

## Progress

### Phase: CLARIFY
- [{{timestamp}}] interviewer: Started specification
- [{{timestamp}}] interviewer: Specification approved

### Phase: PLAN
- [{{timestamp}}] architect: Started planning
- [{{timestamp}}] architect: Plan approved

### Phase: EXECUTE
<!-- Execution entries will be appended here -->

### Phase: REVIEW
<!-- Review entries will be appended here -->

---
*Last updated: {{date}}*
`;

export const METADATA_TEMPLATE = {
  id: '',
  title: '',
  type: 'feature' as const,
  status: 'draft' as const,
  createdAt: '',
  updatedAt: '',
  tasksSummary: {
    total: 0,
    completed: 0,
    failed: 0,
  },
  filesModified: [],
};

// LEARNINGS TEMPLATES

export const PATTERNS_TEMPLATE = `# Patterns

Successful patterns discovered during development.

## Recent Patterns

<!-- Patterns will be appended here -->

---
*Auto-updated by OpenCode*
`;

export const DECISIONS_TEMPLATE = `# Decisions

Key architectural and design decisions.

## Recent Decisions

<!-- Decisions will be appended here -->

---
*Auto-updated by OpenCode*
`;

export const PREFERENCES_TEMPLATE = `# Preferences

User preferences and Directives.

## Active Preferences

<!-- Preferences will be appended here -->

---
*Auto-updated by OpenCode*
`;

// LEDGER INDEX TEMPLATE

export const LEDGER_INDEX_TEMPLATE = `# LEDGER (v6.0)

## Meta
- **Version**: 6.0
- **Session**: {{sessionId}}
- **Phase**: CLARIFY
- **Last Updated**: {{date}}

## Active Epic
*No active epic*

<!-- When epic is active:
**Epic**: [{{epicTitle}}](epics/{{epicId}}/)
**Status**: {{status}}
**Progress**: {{completed}}/{{total}} tasks
-->

## Recent Learnings
*No recent learnings*

## Handoff
*No pending handoff*

---

## Quick Reference

| Command | Description |
|---------|-------------|
| \`/sdd <task>\` | Start SDD workflow |
| \`/ama <question>\` | Ask with Strategic Polling |
| \`/status\` | Check current status |

## Context Files
- [Product](context/product.md)
- [Tech Stack](context/tech-stack.md)
- [Workflow](context/workflow.md)

## Learnings
- [Patterns](learnings/patterns.md)
- [Decisions](learnings/decisions.md)
- [Preferences](learnings/preferences.md)
`;

/**
 * Replace template placeholders
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  // Replace remaining date placeholders with current date
  const now = new Date().toISOString();
  result = result.replace(/{{date}}/g, now.split('T')[0]);
  result = result.replace(/{{timestamp}}/g, now);
  return result;
}
