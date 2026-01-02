---
description: Ask for expert advice using Strategic Polling with Multi-Turn Dialogue (v5.1)
model: google/gemini-2.5-flash
agent: chief-of-staff
---

# AMA (/ama) — Strategic Polling with Multi‑Turn Dialogue (v5.1)

Handle `/ama $ARGUMENTS` as a **consultative** human-in-the-loop interaction.

## Multi-turn contract

- Start or continue a dialogue tracked in `LEDGER.md` under **Active Dialogue**.
- The user replies **normally in chat** (e.g. `1`, `2`, or free-text). A plugin hook will route replies back to you while `activeDialogue` is present.

## Required behavior

1. Call `ledger_set_active_dialogue({ agent: 'chief-of-staff', command: '/ama' })` if there is no active dialogue for `/ama` yet.
2. Answer the user’s question. If you need clarification, ask via a **Strategic Poll**:

```
POLL: <Topic>
Based on context, I recommend:

(1) <Option A> - <brief reason>
(2) <Option B> - <brief reason>
(3) Or describe your preference

Reply with 1/2/3 or your own answer.
```

3. When you ask for more input:
   - Call `ledger_update_active_dialogue({ status: 'needs_input', pendingQuestions: [...], decisions: [...] })`.
   - Respond with the poll text and explicitly say: **“Reply directly in chat (don’t re-run /ama).”**
4. When resolved:
   - Log any decisions as Directives (as you already do).
   - Call `ledger_clear_active_dialogue({})`.
   - Respond with a concise summary and next steps.
