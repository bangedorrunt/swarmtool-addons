# WORKFLOW GUIDE

## Chief-of-Staff Multi-Agent Orchestration v5.0

This guide walks you through using the Chief-of-Staff system for structured software development.

---

## Quick Start

```bash
# Ask a question with structured options
/ama How should I structure my API?

# Start a full development workflow
/sdd Add user authentication with JWT
```

---

## Available Commands

| Command           | Purpose                                | When to Use                             |
| ----------------- | -------------------------------------- | --------------------------------------- |
| `/ama <question>` | Ask for advice with structured options | Quick questions, architecture decisions |
| `/sdd <feature>`  | Full spec-driven development workflow  | New features, bug fixes, refactoring    |

---

## Workflow 1: AMA (Ask Me Anything)

Use `/ama` for quick questions where you want structured recommendations.

### Example: Database Selection

```
User: /ama What database should I use for this project?
```

**Agent Response:**

```
I checked LEDGER and found no existing database Directive.
Analyzing your project... (TypeScript, Next.js, moderate scale)

POLL: Database Selection
Based on your project context:

(1) PostgreSQL - Scalable, great TypeScript support, pgvector for AI
(2) SQLite - Simple, file-based, good for prototypes
(3) MongoDB - Flexible schema, good for rapid iteration

Reply '1', '2', '3', or describe your preference.
```

**User replies:** `1`

**Agent continues:**

```
Logged Directive: Database: PostgreSQL

RECOMMENDATION:
For your Next.js TypeScript project, PostgreSQL is a solid choice.

Next steps:
1. Install: `bun add pg drizzle-orm`
2. Set up connection in `src/db/index.ts`
3. Create your first migration

Would you like me to set this up? (/sdd Set up PostgreSQL with Drizzle)
```

---

## Workflow 2: SDD (Spec-Driven Development)

Use `/sdd` for complete features that need planning and implementation.

### Example: Adding User Authentication

```
User: /sdd Add user authentication with email/password login
```

### Phase 1: CLARIFY

The `interviewer` agent asks clarifying questions:

```
I'll help you build user authentication. Let me clarify a few things:

POLL: Authentication Method
(1) Email/Password only - Simple, straightforward
(2) Email/Password + OAuth (Google, GitHub) - More options for users
(3) Magic Link (passwordless) - Modern, no password to remember

Reply '1', '2', '3', or describe your preference.
```

**User replies:** `1`

```
POLL: Session Management
(1) JWT tokens - Stateless, good for APIs
(2) Session cookies - Server-side, traditional
(3) JWT with refresh tokens - Best of both

Reply '1', '2', '3', or your choice.
```

**User replies:** `3`

```
SPECIFICATION SUMMARY

Title: User Authentication System
Version: 1.0.0

FUNCTIONAL REQUIREMENTS
  • FR-001 [must-have]: User registration with email/password
  • FR-002 [must-have]: User login with JWT + refresh tokens
  • FR-003 [must-have]: Token refresh endpoint
  • FR-004 [should-have]: Password reset via email

NON-FUNCTIONAL REQUIREMENTS
  • NFR-001 [security]: Passwords hashed with bcrypt (cost=12)
  • NFR-002 [performance]: Login response < 200ms

CONSTRAINTS
  • Use existing PostgreSQL database
  • TypeScript with strict mode

OUT OF SCOPE
  • OAuth providers
  • Two-factor authentication
  • Mobile app support

Ready to proceed with this specification?
Reply "yes" to confirm, or describe changes.
```

**User replies:** `yes`

### Phase 2: PLAN

The `architect` agent creates the implementation plan:

```
IMPLEMENTATION PLAN: User Authentication

GOAL
Implement JWT-based authentication with refresh token flow

EPIC INFO
  • Epic ID: auth_20260102
  • Complexity: medium
  • Execution: sequential (shared dependencies)

FILE IMPACT ANALYSIS

| File | Action | Purpose |
|------|--------|---------|
| src/db/schema/user.ts | Create | User table schema |
| src/routes/auth.ts | Create | Auth endpoints |
| src/lib/jwt.ts | Create | JWT utilities |
| src/middleware/auth.ts | Create | Auth middleware |
| src/routes/auth.test.ts | Create | Auth tests |

PHASED APPROACH

Phase 1: Database Setup
  • Task 1.1: Create User schema with Drizzle
  • Task 1.2: Run migration
  • Checkpoint: Verify schema

Phase 2: Core Auth
  • Task 2.1: POST /auth/register
  • Task 2.2: POST /auth/login (returns access + refresh)
  • Task 2.3: POST /auth/refresh
  • Checkpoint: Test all endpoints

Phase 3: Middleware
  • Task 3.1: JWT validation middleware
  • Task 3.2: Add to protected routes
  • Checkpoint: Complete flow test

VERIFICATION PLAN
  • Tests: `bun test src/routes/auth.test.ts`
  • Manual: curl commands for each endpoint

Ready to proceed with this plan?
Reply "yes" to approve, or suggest changes.
```

**User replies:** `yes`

### Phase 3: EXECUTE

The `executor` agent implements each task:

```
[PHASE 1: Database Setup]

[Task 1.1] Create User schema
  • Writing test: src/db/schema/user.test.ts
  • Test status: RED (failing as expected)
  • Implementing: src/db/schema/user.ts
  • Test status: GREEN (passing)
  • Files created: user.ts, user.test.ts

[Task 1.2] Run migration
  • Executing: bunx drizzle-kit push
  • Migration applied successfully

[CHECKPOINT] Phase 1 Complete
Automated tests: PASSED (2/2)

Please verify the database schema is correct:
  • Run: `bunx drizzle-kit studio` to inspect
  • Confirm user table exists with correct columns

Reply "yes" to continue or describe issues.
```

**User replies:** `yes`

```
[PHASE 2: Core Auth]

[Task 2.1] POST /auth/register
  • Writing test for registration endpoint
  • Test: RED
  • Implementing endpoint with bcrypt hashing
  • Test: GREEN

[Task 2.2] POST /auth/login
  • Writing test for login with JWT response
  • Test: RED
  • Implementing with access + refresh tokens
  • Test: GREEN

[Task 2.3] POST /auth/refresh
  • Writing test for token refresh
  • Test: RED
  • Implementing refresh logic
  • Test: GREEN

[CHECKPOINT] Phase 2 Complete
Automated tests: PASSED (6/6)

Manual verification steps:
1. Start server: `bun run dev`
2. Register: `curl -X POST localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"secret123"}'`
3. Login: `curl -X POST localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"secret123"}'`
4. Verify you receive access and refresh tokens

Does this work correctly? Reply "yes" or describe issues.
```

### Phase 4: REVIEW

The `reviewer` agent verifies the implementation:

```
REVIEW RESULTS

Phase 1: Spec Compliance
  • FR-001 Register: PASS (POST /auth/register works)
  • FR-002 Login: PASS (Returns JWT + refresh)
  • FR-003 Refresh: PASS (POST /auth/refresh works)
  • FR-004 Password Reset: SKIPPED (should-have)
  • NFR-001 Security: PASS (bcrypt cost=12 verified)
  • NFR-002 Performance: PASS (login <200ms)

Phase 2: Code Quality
  • TypeScript: PASS (no errors)
  • Test Coverage: 87% (target: 80%)
  • Documentation: PASS (JSDoc on public functions)
  • Security: PASS (no hardcoded secrets)

Verdict: APPROVED

Minor suggestions:
  • Line 42: Consider extracting JWT_SECRET to config
  • Line 78: Add rate limiting in future iteration
```

### Phase 5: COMPLETE

```
EPIC COMPLETE: auth_20260102

Outcome: SUCCEEDED

Summary:
  • 6 tasks completed
  • 8 tests added
  • 87% coverage
  • 4 files created, 1 modified

Learnings Extracted:
  • [Pattern] Separate access/refresh token logic for clarity
  • [Pattern] Use transaction for user creation + token generation
  • [Decision] bcrypt cost=12 balances security/performance

Assumptions Made (for review):
  • Access token expiry: 15 minutes
  • Refresh token expiry: 7 days
  • JWT algorithm: HS256

These assumptions are now Directives unless you reject them.

Epic archived to LEDGER.md
```

---

## Understanding Polls

Polls are the primary HITL mechanism. Instead of open questions, agents present structured options:

### Anatomy of a Poll

```
POLL: <Topic>
<Context about why this decision matters>

(1) <Option A> - <brief explanation>
(2) <Option B> - <brief explanation>
(3) Or describe your preference

Reply '1', '2', or your choice.
```

### Responding to Polls

| Response Type | Example                             | Result                |
| ------------- | ----------------------------------- | --------------------- |
| Number        | `1`                                 | Selects option 1      |
| Letter        | `A`                                 | Selects option A      |
| Custom        | `MongoDB because we use it at work` | Custom with reasoning |

All responses become **Directives** stored in LEDGER for future reference.

---

## Understanding Checkpoints

Checkpoints are mandatory approval points in the workflow:

### Specification Checkpoint (Phase 1)

```
Ready to proceed with this specification?
Reply "yes" to confirm, or describe changes.
```

- Review all requirements
- Verify nothing is missing
- Confirm scope is correct

### Plan Checkpoint (Phase 2)

```
Ready to proceed with this plan?
Reply "yes" to approve, or suggest changes.
```

- Review file impact
- Verify task breakdown
- Check execution strategy

### Phase Checkpoints (Phase 3)

```
[CHECKPOINT] Phase 1 Complete
Automated tests: PASSED

Please verify...
Reply "yes" to continue or describe issues.
```

- Run verification steps
- Confirm behavior is correct
- Report any issues

---

## LEDGER.md: Your Project Memory

All decisions and progress are stored in `.opencode/LEDGER.md`:

```markdown
# LEDGER

## Governance

### Directives (User Decisions)

- Database: PostgreSQL
- Auth: JWT with refresh tokens
- ORM: Drizzle

### Assumptions (Agent Choices)

- JWT expiry: 15 minutes (pending approval)

## Epic: auth_20260102

**Title**: User Authentication
**Status**: completed
**Outcome**: SUCCEEDED

| Task              | Agent    | Status | Outcome |
| ----------------- | -------- | ------ | ------- |
| User schema       | executor | done   | SUCCESS |
| Register endpoint | executor | done   | SUCCESS |
| Login endpoint    | executor | done   | SUCCESS |

## Learnings

### Patterns

- Separate access/refresh token logic
- Use transactions for atomic operations

### Anti-Patterns

- Avoid storing JWT secret in code
```

---

## Tips for Best Results

### 1. Be Specific in Initial Request

```
# Good
/sdd Add user authentication with email/password, JWT tokens, and password reset

# Less Good
/sdd Add auth
```

### 2. Review Specifications Carefully

The spec defines what gets built. Missing something here means missing it in implementation.

### 3. Test at Each Checkpoint

Don't skip manual verification - it catches issues early.

### 4. Review Assumptions

Assumptions become Directives by default. Reject any you disagree with.

### 5. Use Memory Lane

Past decisions inform future recommendations:

```
/ama How should I handle this new API endpoint?
# Agent will check past patterns and suggest consistent approach
```

---

## Troubleshooting

### Agent Stuck or Not Responding

```javascript
// Check for pending checkpoints
checkpoint_pending({});

// Resume if needed
agent_resume({ session_id: '<id>', signal_data: 'continue' });
```

### Want to Change Direction Mid-Workflow

```
Reply "stop" or "cancel" at any checkpoint to halt.
Then start fresh with updated requirements.
```

### Need More Context

```
/ama What decisions have we made so far?
# Shows all Directives from LEDGER
```

---

## Quick Reference

| Situation               | Command/Response                       |
| ----------------------- | -------------------------------------- |
| Quick question          | `/ama <question>`                      |
| New feature             | `/sdd <description>`                   |
| Approve poll/checkpoint | `yes` or number                        |
| Reject/change           | Describe what you want                 |
| Cancel workflow         | `cancel` or `stop`                     |
| Check status            | `/ama What's the current Epic status?` |

---

_Version 5.0 - Chief-of-Staff Multi-Agent Orchestration_
