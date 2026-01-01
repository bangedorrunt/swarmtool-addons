---
description: Interactive Spec-Driven Development workflow with Governance-First v4.0
---

# SDD (Spec-Driven Development) - Governance-First

## Your Task

Delegate the SDD process to the **Chief-of-Staff** (the Governor) for: **$ARGUMENTS**

The Chief-of-Staff handles the **Governance Loop**:
1.  **State Check**: Verification of Directives vs Assumptions (uses Strategic Polling).
2.  **Delegation**: Orchestration of Oracle (Decomposition) and Executors (Parallel).
3.  **Audit**: Review of Assumptions made during execution.

## Execution

Invoke the Chief-of-Staff with the request.

```javascript
/* 
  Start the Governance Loop. 
  "async: false" allows interactive Polling via Yields.
*/
skill_agent({
  agent_name: "chief-of-staff",
  prompt: "Execute SDD Governance Loop for: $ARGUMENTS. MODE B: CONSULTATIVE. You MUST use 'checkpoint_request' for Requirements Confirmation (Phase 1) and Execution Plan Approval (Phase 3).",
  async: false
})
```

---

## Handling "Strategic Polling" (Yields)

The Chief-of-Staff (or sub-agents) may **Yield** to perform a Strategic Poll (ask the user to choose a path).

1.  **Detect**: `result.status === "HANDOFF_INTENT"`
2.  **Act**: Present the Poll/Question to the user.
3.  **Resume**:
    ```javascript
    agent_resume({
      session_id: result.metadata.handoff.session_id,
      signal_data: "<User's Selection>"
    })
    ```

---

## Post-Execution Check

Once the Chief-of-Staff completes, verify the output contains:
1.  **Outcome**: SUCCEEDED/FAILED
2.  **Assumptions**: A list of `assumptions_made` for user review.

> [!IMPORTANT]
> Do NOT micromanage sub-agents (Oracle, Interviewer, Executor). The Chief-of-Staff is the Governor and handles the delegation strategy.
