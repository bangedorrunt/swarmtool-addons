---
description: Spec-Driven Development workflow with interactive dialogue
agent: build
model: google/gemini-3-flash
---

# SDD (Spec-Driven Development)

Interactive workflow: Interview → Spec → Plan → Validate → Execute

**Feature to build:** $ARGUMENTS

## Workflow

Orchestrate the SDD pipeline using `skill_agent` tool:

### Phase 1: Interview (DIALOGUE MODE - Required)

```
skill_agent({
  skill_name: "sisyphus/interviewer",
  interaction_mode: "dialogue",
  prompt: "Clarify requirements for: $ARGUMENTS"
})
```

**CRITICAL:** This returns `dialogue_state`:
- If `status: "needs_input"` → Show questions, WAIT for user answer, call again with their response
- If `status: "needs_approval"` → Show summary, WAIT for user "yes"
- If `status: "approved"` → Extract `explicit_direction`, proceed to Phase 2

**DO NOT skip the dialogue loop. WAIT for user approval.**

### Phase 2: Specification

```
skill_agent({
  skill_name: "sisyphus/spec-writer",
  prompt: "Create specification",
  context: { explicit_direction: <from interview> }
})
```

### Phase 3: Planning

```
skill_agent({
  skill_name: "sisyphus/planner",
  prompt: "Create implementation plan",
  context: { spec: <from Phase 2> }
})
```

### Phase 4: Validation

```
skill_agent({
  skill_name: "sisyphus/validator",
  prompt: "Validate plan",
  context: { plan: <from Phase 3> }
})
```

If `verdict: "FAIL"` →show required pivots, ask user to revise.

### Phase 5: Execution Checkpoint

**Show user:**
- What will be implemented (phases from plan)
- Files that will be modified
- Estimated effort

**WAIT** for explicit "yes" before proceeding.

### Phase 6: Execute (with Chief-of-Staff)

```
skill_agent({
  skill_name: "sisyphus/chief-of-staff",
  interaction_mode: "dialogue",
  prompt: "Execute plan: <plan title>",
  context: {
    explicit_direction: <from interview>,
    plan: <from Phase 3>
  }
})
```

Chief-of-Staff will:
- Spawn parallel executors
- Return checkpoints: `status: "needs_approval"` after each phase
- Surface assumptions: `status: "needs_verification"` every 5 completions
- **WAIT** for your approval before proceeding

---

## Key Principles

1. **Always use dialogue mode** for Interviewer and Chief-of-Staff
2. **Never assume** - wait for explicit user approval
3. **Checkpoint before execution** - show what will change
4. **Surface assumptions** - verify before proceeding

---

## Example Flow

```
/sdd "Build user authentication"

→ Interviewer asks: "Which OAuth providers?"
→ You answer: "Google and GitHub"
→ Interviewer asks: "Session management?"
→ You answer: "JWT in httpOnly cookies"
→ Interviewer shows summary → You approve
→ Spec created
→ Plan created
→ Validator checks → PASS
→ You confirm execution
→ Chief coordinates implementation
→ Checkpoint after each phase
→ Done!
```
