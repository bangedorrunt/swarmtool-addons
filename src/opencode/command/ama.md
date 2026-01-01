---
description: Ask for expert advice using Governance-First Strategic Polling
model: google/gemini-3-flash
---

# Ask the Oracle (Governance-First)

## Your Task

Delegate the request to the **Chief-of-Staff**. It will determine if:
- It can answer from **LEDGER/Memory Lane** (Fast path).
- It needs to consult the **Oracle** (Deep path).
- It needs **Strategic Polling** (Clarification path).

## Execution

```javascript
skill_agent({
  agent_name: "chief-of-staff",
  prompt: "Consult on: $ARGUMENTS. Use Strategic Polling if Directives are missing.",
  async: false
})
```

---

## Handling "Strategic Polling" (Yields)

If the agent needs clarification, it will **Yield** with a Poll (A/B/C options).

1.  **Detect**: `result.status === "HANDOFF_INTENT"`
2.  **Act**: Display the Poll options to the user.
3.  **Resume**:
    ```javascript
    agent_resume({
      session_id: result.metadata.handoff.session_id,
      signal_data: "<User's Selection>"
    })
    ```

> [!NOTE]
> This replaces the legacy "Interviewer" pattern. The system generates structured options to minimize user effort.
