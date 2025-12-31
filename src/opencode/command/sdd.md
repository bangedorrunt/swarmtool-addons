---
description: Interactive Spec-Driven Development workflow with dialogue mode
---

# SDD (Spec-Driven Development) - Interactive Workflow

## Your Task

Orchestrate the Spec-Driven Development pipeline for: **$ARGUMENTS**

> [!IMPORTANT]
> All `skill_agent` calls use `async: false` for synchronous execution.
> For dialogue agents (interviewer), use the returned `session_id` to continue the conversation.

## Phase 0: Context Hydration

**Objective:** Retrieve relevant patterns and constraints.

```
skill_agent({
  agent_name: "chief-of-staff/context-loader",
  prompt: "Find architectural decisions and similar implementations for: $ARGUMENTS",
  async: false
})
```

---

## Phase 1: Interview & Discovery

**Start the interview:**
```
skill_agent({
  agent_name: "chief-of-staff/interviewer",
  prompt: "Interview the user to clarify requirements for: $ARGUMENTS. Use context from Phase 0.",
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
  agent_name: "chief-of-staff/interviewer", 
  prompt: "<user's answer>",
  session_id: "<session_id from previous response>",
  async: false
})
```

Repeat until `dialogue_state.status === "approved"`.

---

## Phase 2: Strategic Decomposition (Oracle-First)

**Objective:** Analyze interview results and break down into Epics/Tasks.

```
skill_agent({
  agent_name: "chief-of-staff/oracle",
  prompt: "Analyze the interview results. Decompose into an Epic with maximum 3 atomic Tasks. Return structured JSON.",
  async: false
})
```

> [!IMPORTANT]
> **Update LEDGER:** Record the new Epic and Tasks in `.opencode/LEDGER.md`.

---

## Phase 3: Create Specification

```
skill_agent({
  agent_name: "chief-of-staff/spec-writer",
  prompt: "Create detailed specification based on the Oracle's decomposition.",
  async: false
})
```

---

## Phase 4: Implementation Planning

```
skill_agent({
  agent_name: "chief-of-staff/planner",
  prompt: "Create detailed blueprint for each task defined by Oracle.",
  async: false
})
```

---

## Phase 5: Validation & Execution

**0. Approval Checkpoint:**
> Present the Plan and Oracle Decomposition to the user.
> **WAIT for explicit "yes" before proceeding.**

**Loop through each Task:**

1. **Hydrate Task Context:**
   ```
   skill_agent({
     agent_name: "chief-of-staff/context-loader",
     prompt: "Load context for Task <ID>",
     async: false
   })
   ```

2. **Execute Task (Atomic):**
   ```
   skill_agent({
     agent_name: "chief-of-staff/executor",
     prompt: "Execute Task <ID>. duration: 2-5 mins.",
     async: false
   })
   ```

3. **Update LEDGER:**
   - Mark task as `[x] Completed` in `.opencode/LEDGER.md`.
   - Log any specific learnings or decisions.

3. **Verify:**
   ```
   skill_agent({
     agent_name: "chief-of-staff/validator",
     prompt: "Verify output of Task <ID>",
     async: false
   })
   ```

### Handling "Upward Instructions" (Yields)

If an agent yields (e.g., "Missing API Key", "Need Approval"):

1. **Detect**: `result.status === "HANDOFF_INTENT"`
2. **Act**: Perform the requested action (Ask User, Check System)
3. **Resume**:
   ```javascript
   agent_resume({
     session_id: result.metadata.handoff.session_id,
     signal_data: "Here is the API Key: sk-..."
   })
   ```

---

## Key Principles

- **All calls use `async: false`** for sequential execution
- **Use `session_id`** for dialogue continuation
- **Never proceed without user approval**
