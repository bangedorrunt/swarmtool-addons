---
name: sdd-conductor
description: Context-Driven Development with Conductor Patterns
trigger: ['implement', 'sdd', 'feature']
entry_agent: chief-of-staff/spec-writer
---

# SDD CONDUCTOR WORKFLOW

## Phase 1: Specification

- Agent: chief-of-staff/spec-writer
- Prompt: "Create a detailed specification for the following request: {{task}}. Use Strategic Polling to get my approval on the final spec."
- Wait: true

## Phase 2: Strategic Decomposition

- Agent: chief-of-staff/oracle
- Prompt: "Based on the specification provided, decompose this epic into tasks. Analyze for parallel execution. If there are strategic choices (library, architecture), use Strategic Polling."
- Wait: true

## Phase 3: Implementation Planning

- Agent: chief-of-staff/planner
- Prompt: "Create a detailed implementation blueprint for the tasks defined. Use the Merged Template. Yield for approval before starting implementation."
- Wait: true

## Phase 4: Execution

- Agent: chief-of-staff/executor
- Prompt: "Implement the planned tasks using TDD. Report progress to LEDGER."
- Wait: true
