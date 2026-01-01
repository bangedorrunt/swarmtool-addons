---
name: sdd-workflow
description: Spec-Driven Development phased workflow
trigger: ['build', 'implement', 'feature', 'create']
entry_agent: chief-of-staff/interviewer
---

# Phases

## Phase 1: Context & Requirements

- Agent: chief-of-staff/interviewer
- Prompt: "Clarify requirements for: {{task}}"
- Checkpoint: true

## Phase 2: Specification

- Agent: chief-of-staff/spec-writer
- Prompt: "Create a formal specification based on the clarified requirements for: {{task}}"
- Wait: true

## Phase 3: Planning

- Agent: chief-of-staff/planner
- Prompt: "Create a detailed implementation plan for the specification."
- Checkpoint: true

## Phase 4: Execution

- Agent: chief-of-staff/executor
- Prompt: "Implement the planned feature using TDD."
- Wait: true

## Phase 5: Validation

- Agent: chief-of-staff/validator
- Prompt: "Verify the implementation against the original specification."
- Wait: true
