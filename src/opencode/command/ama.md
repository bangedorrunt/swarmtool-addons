---
description: Ask for expert advice using Strategic Polling with Multi-Turn Dialogue (v5.1)
model: google/gemini-2.5-flash
---

# Ask Me Anything (AMA) - Multi-Turn Dialogue v5.1

## Overview

This command enables **Human-in-the-Loop** consultation with **multi-turn dialogue** support. Agents proactively present structured polls and continue the conversation until resolution.

## v5.1 CHANGES

- **Multi-Turn Support**: ROOT agent handles dialogue continuation
- **LEDGER Integration**: Active dialogue state persisted across turns
- **Natural Flow**: User replies in same session, agent continues

---

## Your Task

Handle the `/ama` command with multi-turn dialogue support.

### Step 1: Check for Active Dialogue

First, check LEDGER for an existing active dialogue:

```javascript
const ledger = await ledger_status({});

if (ledger.activeDialogue && ledger.activeDialogue.command === '/ama') {
  // CONTINUATION: User is responding to a previous poll
  // The user's message ($ARGUMENTS) is their response
  goto Step 3;
}
```

### Step 2: Start New Dialogue

If no active dialogue, start a new one:

```javascript
// Store dialogue state in LEDGER
await ledger_set_active_dialogue({
  agent: 'chief-of-staff',
  command: '/ama',
});

// Delegate to Chief-of-Staff
const result = await skill_agent({
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

4. Return dialogue_state with status:
   - needs_input: More questions needed
   - approved: Question resolved
5. Store any decisions as Directives in LEDGER`,
  async: false,
  timeout_ms: 120000,
  complexity: 'medium',
});

goto Step 4;
```

### Step 3: Continue Existing Dialogue

If active dialogue exists, continue it:

```javascript
const result = await skill_agent({
  agent_name: 'chief-of-staff',
  prompt: `AMA Continuation

User responded: $ARGUMENTS

Active Dialogue Context:
- Turn: ${ledger.activeDialogue.turn + 1}
- Previous decisions: ${JSON.stringify(ledger.activeDialogue.accumulatedDirection.decisions)}
- Pending questions: ${ledger.activeDialogue.pendingQuestions}

Instructions:
1. Process user's response
2. If response is a poll selection (1, 2, 3), extract the decision
3. Log the decision as a Directive in LEDGER
4. If more clarification needed, generate next poll
5. If question resolved, return dialogue_state.status = 'approved'`,
  async: false,
  timeout_ms: 120000,
  complexity: 'medium',
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
    status: 'needs_input',
    decisions: dialogue_state.accumulated_direction?.decisions,
    pendingQuestions: dialogue_state.pending_questions,
  });

  // Display poll to user - they will respond naturally
  displayToUser(dialogue_state.message_to_user);

  // DON'T clear dialogue - wait for user's next message
} else if (dialogue_state.status === 'approved') {
  // Clear active dialogue
  await ledger_clear_active_dialogue({});

  // Display final response
  displayToUser(dialogue_state.message_to_user);
}
```

---

## Multi-Turn Flow Example

```
SESSION TURN 1:
  User: /ama How should I structure my API?

  [ROOT checks LEDGER - no active dialogue]
  [ROOT calls skill_agent(chief-of-staff)]
  [Chief-of-Staff returns: dialogue_state.status = 'needs_input']
  [ROOT saves to LEDGER.activeDialogue]

  Bot: POLL: API Architecture
       Based on your TypeScript codebase:

       (1) REST with Express - Simple, well-documented
       (2) tRPC - Type-safe, great DX
       (3) Or describe your preference

       Reply '1', '2', '3', or your choice.

SESSION TURN 2:
  User: 2

  [ROOT checks LEDGER - active dialogue exists for /ama]
  [ROOT calls skill_agent with continuation context]
  [Chief-of-Staff logs Directive: "API: tRPC"]
  [Chief-of-Staff returns: dialogue_state.status = 'approved']
  [ROOT clears LEDGER.activeDialogue]

  Bot: Great choice! I've recorded:
       - Directive: API Architecture = tRPC

       tRPC provides excellent type safety between your
       frontend and backend. Let me know if you need help
       setting it up!
```

---

## Strategic Polling Protocol

### When Agent Needs Clarification

Instead of open-ended questions, generate a **Poll**:

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

## LEDGER Active Dialogue Structure

```markdown
## Active Dialogue

agent: chief-of-staff
command: /ama
turn: 2
status: needs_input

### Decisions

- API: tRPC (from poll response)

### Pending Questions

- Data layer selection
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

- Multi-turn dialogue leverages OpenCode's natural session continuity
- Active dialogue state persists in LEDGER across turns
- For complex multi-turn clarification, agent may spawn `interviewer` agent
- All responses become Directives for future reference
- Polls always include "describe your preference" as final option
