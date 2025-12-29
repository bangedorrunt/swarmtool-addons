---
description: Interactive Spec-Driven Development workflow with dialogue mode
---

# SDD (Spec-Driven Development) - Interactive Workflow

## Your Task

Orchestrate the Spec-Driven Development pipeline for: **$ARGUMENTS**

## Workflow Steps

Follow these phases **in order**, using the `skill_agent` tool:

### Phase 1: Interview (Dialogue Mode - REQUIRED)

**Use dialogue mode to clarify requirements:**

```
skill_agent({
  skill_name: "sisyphus",
  agent_name: "interviewer",
  interaction_mode: "dialogue",
  prompt: "Clarify requirements for: $ARGUMENTS"
})
```

**IMPORTANT:** This returns a `dialogue_state` object. You MUST:
1. Check `dialogue_state.status`
2. If `needs_input`:
   - Show `dialogue_state.message_to_user` to the user
   - Show `dialogue_state.pending_questions`
   - **WAIT** for user response
   - Call skill_agent again with user's answer and previous `dialogue_state` in context
3. If `needs_approval`:
   - Show summary to user
   - Ask "Ready to proceed?"
   - **WAIT** for user confirmation
4. Only when status is `approved`:
   - Extract `dialogue_state.output.explicit_direction`
   - Proceed to Phase 2

**DO NOT skip the dialogue loop. DO NOT assume. WAIT for user approval.**

### Phase 2: Create Specification

**Create structured requirements document.**

```javascript
const specResult = await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'spec-writer',
  prompt: 'Create detailed specification',
  context: {
    explicit_direction: interviewResult.output.output.explicit_direction
  }
});
```

**Checkpoint (Optional):**
- Display spec summary
- Ask: "Approve spec before planning?"
- If user wants to review, show key requirements

---

## Phase 3: Implementation Planning

**Create step-by-step implementation blueprint.**

```javascript
const planResult = await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'planner',
  prompt: 'Create implementation plan',
  context: {
    spec: specResult.output
  }
});
```

**Display plan summary:**
- Phases identified
- Files to modify/create
- Dependencies

---

## Phase 4: Plan Validation

**Quality gate: Check against best practices.**

```javascript
const validationResult = await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'validator',
  prompt: 'Validate implementation plan',
  context: {
    plan: planResult.output
  }
});
```

**Check verdict:**
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

**Files affected:**
- [List files]

**Estimated effort:**
- [From plan]

Proceed with implementation?
```

**WAIT for explicit "yes" before proceeding.**

---

## Phase 6: Phased Execution

**Execute plan in phases, tracking assumptions.**

```javascript
// Initialize Chief-of-Staff for coordination
const chiefResult = await skill_agent({
  skill_name: 'sisyphus',
  agent_name: 'chief-of-staff',
  interaction_mode: 'dialogue',  // ⭐ For checkpoints
  prompt: `Execute SDD plan: ${planResult.output.title}`,
  context: {
    explicit_direction: interviewResult.output.output.explicit_direction,
    plan: planResult.output
  }
});
```

**Chief-of-Staff handles:**
- Spawning executors for each phase
- Tracking assumptions made during implementation
- Surfacing assumptions for verification every 5 completions
- Checkpoint after each phase completion

**Dialogue checkpoints:**
1. After phase completion: `needs_approval` → User: "Continue to next phase?"
2. After assumptions accumulate: `needs_verification` → User verifies or corrects
3. Before risky changes: `needs_approval` → User confirms approach

---

## Phase 7: Completion Summary

**Show what was accomplished:**

```
## ✅ SDD Pipeline Complete

**Specification:** [spec title]
**Phases Executed:** [count]
**Files Modified:** [list]
**Assumptions Verified:** [count]

**Next Steps:**
- Run tests to verify implementation
- Review changed files
- Deploy when ready
```

---

## Key Principles

### Always Use Dialogue Mode For:
- **Interviewer** - Never assume, always clarify
- **Chief-of-Staff** - Checkpoints before each phase

### Checkpoints Required:
1. ✅ After interview clarification
2. ✅ Before planning (optional but recommended)
3. ✅ Before execution (MANDATORY)
4. ✅ After each implementation phase
5. ✅ When assumptions need verification

### Never Proceed Without:
- Explicit user approval on direction
- User confirmation before code changes
- User verification of assumptions

---

## Example Invocation

```bash
sdd "Build user authentication with OAuth"
```

**Flow:**
1. Interviewer asks: "Which OAuth providers? Google, GitHub, or both?"
2. User: "Google and GitHub"
3. Interviewer asks: "Session management: JWT or server-side?"
4. User: "JWT in httpOnly cookies"
5. Interviewer summarizes → User approves
6. Spec created
7. Plan created
8. Validator checks → PASS
9. User confirms execution
10. Chief-of-Staff coordinates implementation
11. Checkpoint after each phase
12. Done ✅

---

*Built with interactive dialogue mode for maximum accuracy and user control.*
