---
description: Ask the Oracle questions for expert advice with interactive clarification
model: google/gemini-3-flash
---

# Ask the Oracle

You have access to the **skill_agent** tool which can spawn chief-of-staff subagents. 

## Your Task

Get expert advice for: **$ARGUMENTS**

> [!IMPORTANT]
> All `skill_agent` calls use `async: false` for synchronous execution.
> If the response indicates a need for clarification, follow the **Ask User Question** pattern.

## Step 1: Initial Consultation

Use the skill_agent tool to invoke chief-of-staff/oracle **synchronously**:

```javascript
skill_agent({
  agent_name: "chief-of-staff",
  prompt: "$ARGUMENTS",
  async: false
})
```

## Step 2: Handle Clarification (Upward Instruction Pattern)

The Oracle may **yield** with an instruction (e.g., "Ask user for database preference").
The system will detect this `HANDOFF_INTENT` and the `skill_agent` tool will return a `status: "HANDOFF_INTENT"`.

**You MUST process this signal:**

```javascript
// Example re-entry loop
let current_session_id = null; // Track session

function runOracle(input_prompt, session_id) {
    const response = skill_agent({
      agent_name: "chief-of-staff/oracle",
      prompt: input_prompt,
      session_id: session_id,
      async: false
    });
    
    // Parse response (OpenCode tools return JSON in strings)
    const result = JSON.parse(response);

    // CASE A: Subagent Yielded (Upward Instruction)
    if (result.status === "HANDOFF_INTENT" && result.metadata?.handoff?.type === "UPWARD_SIGNAL") {
        const signal = result.metadata.handoff;
        
        // 1. Perform the requested instruction (e.g., Ask User)
        // In a real slash command, we might print the question and return, 
        // asking the user to re-run with the answer, OR use an interactive prompt if available.
        
        // "Signal: Need user database preference"
        const userAnswer = ask_user(signal.reason); // Hypothetical interactive function or stop & return
        
        // 2. Resume the agent
        return agent_resume({
            session_id: signal.session_id,
            signal_data: userAnswer
        });
    }

    // CASE B: Standard Success
    return result;
}
```

> [!NOTE]
> In this interactive /slash command environment, the `UPWARD_SIGNAL` might simply output the question to you.
> You will then need to **Resume** manually or via a helper command.

**Manual Resume Pattern:**
If the Oracle stops and asks a question:
1. Answer the question.
2. Run: `/resume <session_id> <your_answer>` (or equivalent logic).

2. **If `status === "needs_approval"`**:
   - Present the summary/plan to the user.
   - If user approves, send "I approve" or similar to the interviewer.

### 2c: Error Handling & Edge Cases
- **Timeout/Failure**: If the agent fails to respond or errors, inform the user and ask if they want to retry or abort.
- **User Cancellation**: If the user wants to stop, exit the loop gracefully.
- **Context Loss**: If `session_id` is missing or invalid, restart the dialogue from Step 2a with the last known context.

## Step 3: Final Recommendation

Once `dialogue_state.status === "approved"`, invoke the Oracle with the **accumulated direction**:

```javascript
skill_agent({
  agent_name: "chief-of-staff/oracle",
  prompt: "Based on these clarified requirements: <paste dialogue_state.accumulated_direction here>, provide final recommendation for: $ARGUMENTS",
  async: false
})
```

The Oracle will return expert advice. Display the final response to the user.
