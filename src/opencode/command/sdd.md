---
description: Spec-Driven Development workflow with Governance-First v5.0
model: google/gemini-2.5-pro
---

# SDD (Spec-Driven Development) - Governance-First v5.0

**Measure twice, code once.**

SDD is a structured workflow inspired by [Conductor](https://github.com/gemini-cli-extensions/conductor) that ensures every feature follows: **Context -> Spec & Plan -> Implement -> Review**.

## Philosophy

Control your code. By treating context as a managed artifact alongside your code, you transform your repository into a single source of truth that drives every agent interaction.

---

## Your Task

Delegate the SDD process to the **Chief-of-Staff** for: **$ARGUMENTS**

The Chief-of-Staff orchestrates the complete lifecycle:

1. **CLARIFY**: Generate specification via `interviewer` agent
2. **PLAN**: Decompose into Epic/Tasks via `architect` agent
3. **EXECUTE**: Implement via `executor` agent(s)
4. **REVIEW**: Verify via `reviewer` agent
5. **COMPLETE**: Archive and extract learnings

---

## Execution

```javascript
skill_agent({
  agent_name: 'chief-of-staff',
  prompt: `Execute SDD Workflow for: $ARGUMENTS

MODE: CONSULTATIVE (Human-in-the-Loop)

## PHASE 1: CLARIFY (interviewer)
- Generate structured specification
- Use Strategic Polls for clarification
- Output: spec.md equivalent in LEDGER context

## PHASE 2: PLAN (architect)  
- Decompose into Epic with max 5 Tasks
- Analyze execution strategy (parallel/sequential)
- Output: plan.md with file impact analysis

## PHASE 3: EXECUTE (executor)
- Follow TDD: Red -> Green -> Refactor
- Track files modified for conflict detection
- Report progress via heartbeats

## PHASE 4: REVIEW (reviewer)
- Phase 1: Spec compliance (nothing extra, nothing missing)
- Phase 2: Code quality check

## PHASE 5: COMPLETE
- Archive Epic with outcome
- Extract learnings to LEDGER and Memory Lane

CHECKPOINTS REQUIRED:
- After CLARIFY: User must approve specification
- After PLAN: User must approve implementation plan
- After EXECUTE: User verifies each phase completion`,
  async: false,
  timeout_ms: 600000,
  complexity: 'high',
});
```

---

## Generated Artifacts

| Artifact      | Location                      | Purpose                              |
| ------------- | ----------------------------- | ------------------------------------ |
| Specification | LEDGER.md -> Epic -> Context  | Requirements and acceptance criteria |
| Plan          | LEDGER.md -> Epic -> Tasks    | Implementation roadmap               |
| Progress Log  | LEDGER.md -> Epic -> Progress | Execution tracking                   |
| Learnings     | LEDGER.md -> Learnings        | Patterns and anti-patterns           |

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

**User must approve before proceeding.**

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

## GOVERNANCE

### Assumptions

• Using RS256 for JWT (no Directive found)
• 24h token expiry (no Directive found)

### Decision Log

• Chose bcrypt over argon2 for wider support
```

**User must approve before execution.**

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

## Handling Yields (HITL Checkpoints)

```javascript
// Chief-of-Staff yields for approval
if (result.status === 'HANDOFF_INTENT') {
  const checkpoint = result.metadata.handoff;

  // Display checkpoint to user
  console.log(`CHECKPOINT: ${checkpoint.reason}`);
  console.log(checkpoint.summary);

  // Get user approval
  const userResponse = await getUserInput();

  // Resume with approval
  agent_resume({
    session_id: checkpoint.session_id,
    signal_data: userResponse,
  });
}
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

- Do NOT micromanage sub-agents - Chief-of-Staff handles delegation
- Each phase has mandatory user checkpoint
- Assumptions are logged for implicit approval or explicit rejection
- TDD is enforced: Write test -> Fail -> Implement -> Pass
