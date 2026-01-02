---
description: Spec-Driven Development workflow with Multi-Turn Dialogue (v5.1)
model: google/gemini-2.5-pro
---

# SDD (Spec-Driven Development) - Multi-Turn Dialogue v5.1

**Measure twice, code once.**

SDD is a structured workflow inspired by [Conductor](https://github.com/gemini-cli-extensions/conductor) that ensures every feature follows: **Context -> Spec & Plan -> Implement -> Review** with multi-turn dialogue support.

## v5.1 CHANGES

- **Multi-Turn Support**: ROOT agent handles dialogue continuation
- **LEDGER Integration**: Active dialogue state persisted across turns
- **Natural Flow**: User approves specs and plans in same session

---

## Philosophy

Control your code. By treating context as a managed artifact alongside your code, you transform your repository into a single source of truth that drives every agent interaction.

---

## Your Task

Delegate the SDD process to the **Chief-of-Staff** for: **$ARGUMENTS**

The Chief-of-Staff orchestrates the complete lifecycle with multi-turn dialogue:

1. **CLARIFY**: Generate specification via `interviewer` agent (may require multiple polls)
2. **PLAN**: Decompose into Epic/Tasks via `architect` agent
3. **EXECUTE**: Implement via `executor` agent(s)
4. **REVIEW**: Verify via `reviewer` agent
5. **COMPLETE**: Archive and extract learnings

---

## Multi-Turn Execution Flow

### Step 1: Check for Active Dialogue

First, check LEDGER for an existing active dialogue:

```javascript
const ledger = await ledger_status({});

if (ledger.activeDialogue && ledger.activeDialogue.command === '/sdd') {
  // CONTINUATION: User is responding to a previous poll/checkpoint
  // The user's message ($ARGUMENTS) is their response
  goto Step 3;
}
```

### Step 2: Start New SDD Workflow

If no active dialogue, start the full SDD workflow:

```javascript
// Store dialogue state in LEDGER
await ledger_set_active_dialogue({
  agent: 'chief-of-staff',
  command: '/sdd',
});

// Begin SDD with Chief-of-Staff
const result = await skill_agent({
  agent_name: 'chief-of-staff',
  prompt: `Execute SDD Workflow for: $ARGUMENTS

MODE: CONSULTATIVE (Human-in-the-Loop)

## PHASE 1: CLARIFY (interviewer)
- Generate structured specification
- Use Strategic Polls for clarification
- Return dialogue_state.status = 'needs_input' for more questions
- Return dialogue_state.status = 'approved' when spec confirmed

## PHASE 2: PLAN (architect)
- Decompose into Epic with max 5 Tasks
- Analyze execution strategy (parallel/sequential)
- Return dialogue_state.status = 'needs_input' for plan approval
- Return dialogue_state.status = 'approved' when plan confirmed

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
- After PLAN: User must approve implementation plan`,
  async: false,
  timeout_ms: 600000,
  complexity: 'high',
});

goto Step 4;
```

### Step 3: Continue Existing Dialogue

If active dialogue exists, continue it:

```javascript
const result = await skill_agent({
  agent_name: 'chief-of-staff',
  prompt: `SDD Continuation

User responded: $ARGUMENTS

Active Dialogue Context:
- Turn: ${ledger.activeDialogue.turn + 1}
- Phase: ${ledger.activeDialogue.status}
- Previous decisions: ${JSON.stringify(ledger.activeDialogue.accumulatedDirection.decisions)}

Instructions:
1. Process user's response (approval, rejection, or modification)
2. If approval received and phase is CLARIFY:
   - Proceed to PHASE 2: PLAN
3. If approval received and phase is PLAN:
   - Proceed to PHASE 3: EXECUTE
4. If rejection/modification:
   - Revise spec/plan and return dialogue_state.status = 'needs_input'
5. Update LEDGER with new state`,
  async: false,
  timeout_ms: 600000,
  complexity: 'high',
});
```

### Step 4: Handle Result

```javascript
// Extract dialogue state from result
const dialogue_state = extractDialogueState(result);

if (dialogue_state.status === 'needs_input') {
  // Update LEDGER with new state
  await ledger_update_active_dialogue({
    turn: dialogue_state.turn,
    status: dialogue_state.status,
    decisions: dialogue_state.accumulated_direction?.decisions,
    pendingQuestions: dialogue_state.pending_questions,
  });

  // Display poll/checkpoint to user
  displayToUser(dialogue_state.message_to_user);
} else if (dialogue_state.status === 'approved') {
  // Clear active dialogue only when entire SDD is complete
  // (NOT when spec or plan is approved - those are checkpoints)
  if (dialogue_state.turn === 5) {
    // Phase 5: COMPLETE
    await ledger_clear_active_dialogue({});
  }

  // Display final response
  displayToUser(dialogue_state.message_to_user);
}
```

---

## Multi-Turn Flow Example

```
SESSION TURN 1:
  User: /sdd Build a user authentication system

  [ROOT checks LEDGER - no active dialogue]
  [ROOT calls skill_agent(chief-of-staff)]
  [Chief-of-Staff calls interviewer, generates spec]
  [Chief-of-Staff returns: dialogue_state.status = 'needs_input']
  [ROOT saves to LEDGER.activeDialogue]

  Bot: SPECIFICATION SUMMARY

   Title: User Authentication System
   Version: 1.0.0

   FUNCTIONAL REQUIREMENTS
   • FR-001: User can register with email/password
   • FR-002: User can login and receive JWT token

   Ready to proceed with this specification?
   Reply "yes" to confirm, or describe changes.

SESSION TURN 2:
  User: yes, but add password reset feature

  [ROOT checks LEDGER - active dialogue exists for /sdd]
  [ROOT calls skill_agent with continuation context]
  [Chief-of-Staff updates spec with password reset]
  [Chief-of-Staff returns: dialogue_state.status = 'needs_input']

  Bot: SPECIFICATION UPDATED

   FUNCTIONAL REQUIREMENTS
   • FR-001: User can register with email/password
   • FR-002: User can login and receive JWT token
   • FR-003: User can reset password via email

   Ready to proceed with this specification?
   Reply "yes" to confirm.

SESSION TURN 3:
  User: yes

  [Chief-of-Staff proceeds to PHASE 2: PLAN]
  [Chief-of-Staff generates implementation plan]
  [Chief-of-Staff returns: dialogue_state.status = 'needs_input']

  Bot: IMPLEMENTATION PLAN

   Epic ID: auth_20260102

   Task 1: Create User model with bcrypt
   Task 2: Add database migration
   Task 3: Implement POST /auth/register
   Task 4: Implement POST /auth/login
   Task 5: Create JWT validation middleware

   Execution Strategy: sequential

   Ready to proceed with implementation?
   Reply "yes" to confirm.

SESSION TURN 4:
  User: yes

  [Chief-of-Staff proceeds to PHASE 3: EXECUTE]
  [Chief-of-Staff clears active dialogue (execution doesn't need HITL)]
  [executor runs with progress updates]

  Bot: [TASK 1.1] Create User model with bcrypt
       Status: completed ✅

       [TASK 1.2] Add database migration
       Status: in_progress...
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
