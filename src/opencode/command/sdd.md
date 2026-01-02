---
description: Spec-Driven Development workflow with Multi-Turn Dialogue (v5.1)
model: google/gemini-2.5-pro
agent: chief-of-staff
---

# SDD (/sdd) — Spec‑Driven Development (v5.1)

Execute SDD for: **$ARGUMENTS**.

## Hard rules (do not violate)

1. This command is **approval-gated**:
   - Do **CLARIFY**, then stop and wait for the user’s approval.
   - Do **PLAN**, then stop and wait for the user’s approval.
   - Only then proceed to EXECUTE/REVIEW/COMPLETE.

2. **Never** proceed from CLARIFY → PLAN or PLAN → EXECUTE in the same turn.

3. Multi-turn contract:
   - Track state in `LEDGER.md` under **Active Dialogue**.
   - The user replies normally in chat; a plugin hook routes replies back while `activeDialogue` is present.
   - Always tell the user: **“Reply directly in chat (don’t re-run /sdd).”**

## State markers

Store these markers in `activeDialogue.accumulatedDirection.decisions`:
- `SDD_SPEC_APPROVED`
- `SDD_PLAN_APPROVED`

## Protocol

### Step 0: Ensure dialogue exists

If there is no active dialogue for `/sdd`, call:

`ledger_set_active_dialogue({ agent: 'chief-of-staff', command: '/sdd' })`

### Step 1: CLARIFY (interviewer) — always requires approval

If `SDD_SPEC_APPROVED` is **not** present:

1) Call `skill_agent` for `interviewer` to produce a spec for **$ARGUMENTS**.
2) Summarize the spec for the user.
3) Ask:

**Question:** “Approve this specification? Reply `yes` to proceed, or describe changes.”

4) Call:

`ledger_update_active_dialogue({ status: 'needs_approval', pendingQuestions: ['Approve spec?'], lastPollMessage: '<paste your spec summary + question>' })`

5) STOP. Do not call `skill_agent` again in this turn.

### Step 2: PLAN (architect) — always requires approval

If `SDD_SPEC_APPROVED` is present and `SDD_PLAN_APPROVED` is **not** present:

1) Call `skill_agent` for `architect` to produce an implementation plan.
2) Summarize the plan.
3) Ask:

**Question:** “Approve this plan? Reply `yes` to begin execution, or describe changes.”

4) Call:

`ledger_update_active_dialogue({ status: 'needs_approval', pendingQuestions: ['Approve plan?'], lastPollMessage: '<paste your plan summary + question>' })`

5) STOP. Do not start execution in this turn.

### Step 3: EXECUTE → REVIEW → COMPLETE

If `SDD_PLAN_APPROVED` is present:

1) Call `ledger_clear_active_dialogue({})`.
2) Run `skill_agent` sequentially:
   - executor → reviewer → validator
3) Archive epic and extract learnings.

## Continuation handling

When you receive a DIALOGUE CONTINUATION message:
- If the user approved the last question, call:
  - `ledger_update_active_dialogue({ decisions: ['SDD_SPEC_APPROVED'] })` or `ledger_update_active_dialogue({ decisions: ['SDD_PLAN_APPROVED'] })` accordingly.
- If the user requested changes, keep the dialogue active with:
  - `ledger_update_active_dialogue({ status: 'needs_input', pendingQuestions: [...] })`
  - then re-run the relevant phase (interviewer/architect) and re-ask for approval.
  • Consider adding refresh token flow
  • Add rate limiting to auth endpoints

Epic archived to LEDGER.md
```

---

## LEDGER Active Dialogue Structure

```markdown
## Active Dialogue

agent: chief-of-staff
command: /sdd
turn: 3
status: needs_input

### Goals

- User Authentication System
- JWT-based login/register

### Decisions

- Database: PostgreSQL
- Auth: JWT with RS256
- Password hashing: bcrypt (cost=12)

### Pending Questions

- Plan approval (3 tasks remaining)
```

---

## Quality Gates

Before marking any task complete:

- [ ] All tests pass
- [ ] Code coverage meets requirements (>80%)
- [ ] Code follows project style guides
- [ ] All public functions documented
- [ ] Type safety enforced
- [ ] No linting errors
- [ ] Security review passed
- [ ] Spec compliance verified

---

## Post-Execution

After SDD completes, verify:

1. **Outcome**: SUCCEEDED/PARTIAL/FAILED
2. **Assumptions**: Review `assumptions_made` list
3. **Learnings**: Patterns extracted to Memory Lane

---

## Notes

- Multi-turn dialogue leverages OpenCode's natural session continuity
- Active dialogue state persists in LEDGER across turns
- Spec and Plan approval are checkpoints (multi-turn)
- Execution phase runs without HITL for efficiency
- Do NOT micromanage sub-agents - Chief-of-Staff handles delegation
- Assumptions are logged for implicit approval or explicit rejection
- TDD is enforced: Write test -> Fail -> Implement -> Pass
