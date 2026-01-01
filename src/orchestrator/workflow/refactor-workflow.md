---
name: refactor-workflow
description: Systematic code refactoring with impact analysis
trigger: ['refactor', 'cleanup', 'improve']
entry_agent: chief-of-staff/oracle
---

# Phases

## Phase 1: Impact Analysis

- Agent: chief-of-staff/oracle
- Prompt: "Analyze the impact of refactoring: {{task}}"
- Wait: true

## Phase 2: Planning

- Agent: chief-of-staff/planner
- Prompt: "Create a safe refactoring plan based on the impact analysis."
- Checkpoint: true

## Phase 3: Execution

- Agent: chief-of-staff/executor
- Prompt: "Execute the refactoring plan step-by-step."
- Wait: true

## Phase 4: Regression Testing

- Agent: chief-of-staff/validator
- Prompt: "Run tests to ensure no regressions after refactoring."
- Wait: true
