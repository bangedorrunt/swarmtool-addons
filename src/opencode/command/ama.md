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

## Step 2: Handle Clarification (Ask User Question Pattern)

If the Oracle returns a response structured as:
**"Before I can recommend, I need to clarify:"**

You MUST activate the **interviewer** to resolve ambiguities.

### 2a: Start Clarification Dialogue
```javascript
skill_agent({
  agent_name: "chief-of-staff/interviewer",
  prompt: "Clarify these points for the Oracle: <paste Oracle's questions here>",
  async: false
})
```

### 2b: Dialogue Loop
Monitor `dialogue_state.status` and repeat until it is `"approved"`.

1. **If `status === "needs_input"`**:
   - Present the questions to the user.
   - Capture user input.
   - Continue with the SAME `session_id`.

```javascript
skill_agent({
  agent_name: "chief-of-staff/interviewer", 
  prompt: "<user's answer>",
  session_id: "<session_id from previous response>",
  async: false
})
```

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
