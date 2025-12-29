---
description: Interactive Spec-Driven Development workflow with dialogue mode
---

# SDD (Spec-Driven Development) - Interactive Workflow

## Your Task

Orchestrate the Spec-Driven Development pipeline for: **$ARGUMENTS**

> [!IMPORTANT]
> All `skill_agent` calls use `async: false` for synchronous execution.
> For dialogue agents (interviewer), use the returned `session_id` to continue the conversation.

## Phase 1: Interview & Discovery

**Start the interview:**
```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "interviewer",
  prompt: "Interview the user to clarify requirements for: $ARGUMENTS",
  async: false
})
```

**The response will include:**
- `dialogue_state.status` - current state ("needs_input", "needs_approval", "approved")
- `session_id` - use this for continuation
- `continuation_hint` - tells you how to continue

**DIALOGUE LOOP:** If `dialogue_state.status === "needs_input"`:
1. Present the questions to the user
2. Wait for user response
3. Continue with the SAME session_id:

```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "interviewer", 
  prompt: "<user's answer>",
  session_id: "<session_id from previous response>",
  async: false
})
```

Repeat until `dialogue_state.status === "approved"`.

---

## Phase 2: Create Specification

```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "spec-writer",
  prompt: "Create detailed specification based on interview results.",
  async: false
})
```

---

## Phase 3: Implementation Planning

```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "planner",
  prompt: "Create implementation plan based on the specification.",
  async: false
})
```

---

## Phase 4: Plan Validation

```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "validator",
  prompt: "Validate the implementation plan against best practices.",
  async: false
})
```

- If `PASS`: Proceed to execution
- If `FAIL`: Show required pivots, ask user to revise

---

## Phase 5: Execution Checkpoint

**MANDATORY: Get user approval before execution.**

Show:
```
## 📋 Ready to Execute

**What will be done:**
- [List phases from plan]

Proceed with implementation?
```

**WAIT for explicit "yes" before proceeding.**

---

## Phase 6: Phased Execution

```
skill_agent({
  skill_name: "chief-of-staff",
  agent_name: "chief-of-staff",
  prompt: "Coordinate phased execution with checkpoints.",
  async: false
})
```

---

## Key Principles

- **All calls use `async: false`** for sequential execution
- **Use `session_id`** for dialogue continuation
- **Never proceed without user approval**
