---
description: Spec-Driven Development workflow with Multi-Turn Dialogue (v5.1)
model: google/gemini-2.5-pro
agent: chief-of-staff
---

# SDD (/sdd) — Spec‑Driven Development (v5.1)

Execute SDD for: **$ARGUMENTS**.

## Multi-turn contract

- Track interactive checkpoints in `LEDGER.md` under **Active Dialogue**.
- The user replies **normally in chat** (e.g. `yes`, `no`, or requested changes). A plugin hook will route replies back to you while `activeDialogue` is present.

## Required behavior

1. If there is no active dialogue for `/sdd`, call:
   - `ledger_set_active_dialogue({ agent: 'chief-of-staff', command: '/sdd' })`

2. Run the workflow:
   - **CLARIFY** via `skill_agent` (interviewer)
   - **PLAN** via `skill_agent` (architect)
   - **EXECUTE** via `skill_agent` (executor)
   - **REVIEW** via `skill_agent` (reviewer)
   - **COMPLETE** via `ledger_archive_epic` + learnings

3. Checkpoints (multi-turn):
   - After **CLARIFY**: ask the user to approve the spec.
   - After **PLAN**: ask the user to approve the plan.
   - When you are waiting for approval, call:
     - `ledger_update_active_dialogue({ status: 'needs_approval', pendingQuestions: [...] })`
     - Respond with the spec/plan summary + the exact question.
     - Say: **“Reply directly in chat (don’t re-run /sdd).”**

4. When the user approves the plan and you proceed to execution:
   - Call `ledger_clear_active_dialogue({})`.
   - Begin execution and stream progress as usual.

---

## Workflow Phases

### PHASE 1: CLARIFY (interviewer)

The `interviewer` agent generates a structured specification:

```
SPECIFICATION SUMMARY

Title: User Authentication System
Version: 1.0.0

FUNCTIONAL REQUIREMENTS
  • FR-001 [must-have]: User can register with email/password
  • FR-002 [must-have]: User can login and receive JWT token
  • FR-003 [should-have]: User can reset password via email

NON-FUNCTIONAL REQUIREMENTS
  • NFR-001 [performance]: Response time < 200ms (95th percentile)
  • NFR-002 [security]: Passwords hashed with bcrypt

CONSTRAINTS
  • Must use TypeScript
  • Must integrate with existing PostgreSQL

OUT OF SCOPE
  • Social login (OAuth)
  • Mobile app support

ACCEPTANCE CRITERIA
  • GIVEN a valid user WHEN they login THEN they receive JWT
  • GIVEN invalid credentials WHEN login attempted THEN 401 error

Ready to proceed with this specification?
Reply "yes" to confirm, or describe changes.
```

**User must approve before proceeding.** This is handled via multi-turn dialogue.

---

### PHASE 2: PLAN (architect)

The `architect` agent creates an implementation plan:

```markdown
# IMPLEMENTATION PLAN: User Authentication

## GOAL

Implement JWT-based authentication with login/register endpoints

## TRACK INFO

• Epic ID: auth_20260102
• Complexity: medium
• Execution Strategy: sequential (shared user model)

## CURRENT STATE ANALYSIS

• What Exists: PostgreSQL setup, Express server
• What's Missing: Auth routes, User model, JWT handling

## FILE IMPACT ANALYSIS

| File Path             | Action | Purpose                   |
| --------------------- | ------ | ------------------------- |
| src/models/user.ts    | Create | User entity with bcrypt   |
| src/routes/auth.ts    | Create | Login/register endpoints  |
| src/middleware/jwt.ts | Create | JWT validation middleware |
| src/index.ts          | Modify | Register auth routes      |

## PROPOSED CHANGES (PHASED)

### Phase 1: Database Schema

• Task 1.1: Create User model with bcrypt
• Task 1.2: Add database migration
• Checkpoint: Schema verified

### Phase 2: Auth Endpoints

• Task 2.1: Implement POST /auth/register
• Task 2.2: Implement POST /auth/login
• Task 2.3: Add JWT generation
• Checkpoint: Endpoints working

### Phase 3: Middleware

• Task 3.1: Create JWT validation middleware
• Task 3.2: Add to protected routes
• Checkpoint: Auth flow complete

## VERIFICATION PLAN

### Automated Tests

• Test Command: `bun test src/routes/auth.test.ts`
• Coverage Target: >80%

### Manual Verification

1. Start server: `bun run dev`
2. Register: `curl -X POST localhost:3000/auth/register -d '{"email":"test@test.com","password":"secret"}'`
3. Login: `curl -X POST localhost:3000/auth/login -d '{"email":"test@test.com","password":"secret"}'`
4. Verify JWT in response

## RISK MITIGATION

| Risk          | Severity | Mitigation                      |
| ------------- | -------- | ------------------------------- |
| Password leak | High     | Use bcrypt, never log passwords |
| JWT theft     | Medium   | Short expiry, refresh tokens    |
```

**User must approve before execution.** This is handled via multi-turn dialogue.

---

### PHASE 3: EXECUTE (executor)

The `executor` agent implements each task:

```
[PHASE START] Executing: auth_20260102

[TASK 1.1] Create User model with bcrypt
  • Status: in_progress
  • Following TDD: Write test -> Fail -> Implement -> Pass
  • Files: src/models/user.ts, src/models/user.test.ts
  • [HEARTBEAT] Created User model with email, passwordHash
  • [HEARTBEAT] Added bcrypt hashing in pre-save hook
  • Status: completed

[TASK 1.2] Add database migration
  • Status: in_progress
  • [HEARTBEAT] Created migration file
  • Status: completed

[PHASE CHECKPOINT] Phase 1 Complete
  • Automated tests: PASSED (3/3)
  • Manual verification needed: Check database schema

  Please verify and confirm: "yes" to continue or describe issues.
```

---

### PHASE 4: REVIEW (reviewer)

The `reviewer` agent performs two-phase review:

```
REVIEW RESULTS

## Phase 1: Spec Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| FR-001 Register | ✅ PASS | POST /auth/register implemented |
| FR-002 Login | ✅ PASS | POST /auth/login with JWT |
| FR-003 Password Reset | ❌ MISSING | Not implemented |

Verdict: NEEDS_CHANGES
  • Missing: Password reset endpoint

## Phase 2: Code Quality (skipped - spec not met)

RECOMMENDATION: Return to executor for FR-003 implementation
```

---

### PHASE 5: COMPLETE

After all reviews pass:

```
EPIC COMPLETE: auth_20260102

Outcome: SUCCEEDED

## Summary
  • Tasks completed: 6/6
  • Tests added: 12
  • Coverage: 87%

## Files Modified
  • src/models/user.ts (created)
  • src/routes/auth.ts (created)
  • src/middleware/jwt.ts (created)
  • src/index.ts (modified)

## Learnings Extracted
  • [Pattern] bcrypt cost=12 provides good security/performance balance
  • [Pattern] Separate auth middleware for reusability
  • [Decision] RS256 for JWT - allows public key verification

## Next Steps
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
