---
description: Ask for expert advice using Strategic Polling (v5.0)
model: google/gemini-2.5-flash
---

# Ask Me Anything (AMA) - Strategic Polling v5.0

## Overview

This command enables **Human-in-the-Loop** consultation where agents proactively present structured options instead of open-ended questions.

## Your Task

Delegate the request to the **Chief-of-Staff** in **CONSULTATIVE** mode.

The Chief-of-Staff will:

1. Check **LEDGER/Memory Lane** for existing context (Fast path)
2. Generate a **Strategic Poll** if clarification needed (A/B/C options)
3. Provide recommendations with structured choices

## Execution

```javascript
skill_agent({
  agent_name: 'chief-of-staff',
  prompt: `AMA Request: $ARGUMENTS

MODE: CONSULTATIVE

Instructions:
1. Check LEDGER for relevant Directives and past decisions
2. Query Memory Lane for related patterns/learnings
3. If clarification needed, use Strategic Poll format:

POLL: <Topic>
Based on context, I recommend:

(1) <Option A> - <brief reason>
(2) <Option B> - <brief reason>
(3) Or describe your preference

Reply '1', '2', or your own answer.

4. Provide actionable recommendations
5. Store any new decisions as Directives in LEDGER`,
  async: false,
  timeout_ms: 120000,
  complexity: 'medium',
});
```

---

## Strategic Polling Protocol

### When Agent Needs Clarification

Instead of open-ended questions like "What database?", the agent generates a **Poll**:

```
POLL: Database Selection
No existing Directive found. Based on project analysis:

(1) Postgres - scalable, pgvector for embeddings
(2) SQLite - simple, file-based, good for prototypes
(3) Or describe your preference

Reply '1', '2', or your choice (e.g., "MySQL because we have existing infra").
```

### Handling User Response

| Response          | Action                              |
| ----------------- | ----------------------------------- |
| User replies "1"  | Log Directive: "Database: Postgres" |
| User replies "2"  | Log Directive: "Database: SQLite"   |
| User types custom | Log Directive with their reasoning  |

---

## Handling Yields (Pop-Up Questions)

If the agent needs additional clarification mid-process:

```javascript
// 1. Detect yield
if (result.status === 'HANDOFF_INTENT') {
  const poll = result.metadata.handoff;

  // 2. Display poll to user
  console.log(poll.summary);
  console.log(poll.options);

  // 3. Get user selection
  const userChoice = await getUserInput();

  // 4. Resume agent
  agent_resume({
    session_id: poll.session_id,
    signal_data: userChoice,
  });
}
```

---

## Example Interactions

### Example 1: Architecture Question

**User**: `/ama How should I structure my API?`

**Agent Response**:

```
I checked LEDGER and found no existing API architecture Directive.

POLL: API Architecture
Based on your TypeScript codebase:

(1) REST with Express - Simple, well-documented, familiar
(2) tRPC - Type-safe, great DX, Next.js integration
(3) GraphQL - Flexible queries, good for complex data

Reply '1', '2', '3', or describe your preference.
```

### Example 2: With Existing Context

**User**: `/ama Should I add caching?`

**Agent Response**:

```
Based on LEDGER Directives:
- Database: PostgreSQL
- Framework: Next.js 14

And Memory Lane patterns:
- Previous project used Redis for session caching

RECOMMENDATION:
Yes, add Redis caching. It integrates well with your existing
PostgreSQL setup and matches patterns from your past projects.

POLL: Caching Strategy
(1) Redis - In-memory, fast, you've used it before
(2) Upstash Redis - Serverless, good for Next.js
(3) Skip caching for now

Reply '1', '2', '3', or your choice.
```

---

## Integration with LEDGER

All decisions from AMA sessions are stored:

```markdown
## Governance

### Directives (The Law)

- Database: PostgreSQL (from AMA 2026-01-02)
- API: REST with Express (from AMA 2026-01-02)
- Caching: Redis (from AMA 2026-01-02)
```

---

## Notes

- This replaces the legacy "Interviewer" pattern for simple questions
- For complex multi-turn clarification, agent may spawn `interviewer` agent
- All responses become Directives for future reference
- Polls always include "describe your preference" as final option
