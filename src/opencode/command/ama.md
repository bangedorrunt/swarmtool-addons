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

```
skill_agent({
  agent_name: "chief-of-staff",
  prompt: "$ARGUMENTS",
  async: false
})
```

## Step 2: Handle Clarification (Ask User Question Pattern)

If the Oracle returns a response structured as:
**"Before I can recommend, I need to clarify:"**

You MUST activate the **interviewer** to resolve ambiguities before getting the final recommendation.

### 2a: Start Clarification Dialogue
```
skill_agent({
  agent_name: "chief-of-staff/interviewer",
  prompt: "Clarify these points for the Oracle: <paste Oracle's questions here>",
  async: false
})
```

### 2b: Dialogue Loop
If `dialogue_state.status === "needs_input"` or `"needs_approval"`:
1. Present the questions/summary to the user.
2. Wait for user response.
3. Continue with the SAME session_id:

```
skill_agent({
  agent_name: "chief-of-staff/interviewer", 
  prompt: "<user's answer>",
  session_id: "<session_id from previous response>",
  async: false
})
```

Repeat until `dialogue_state.status === "approved"`.

## Step 3: Final Recommendation

Once clarified (or if no clarification was needed), present the Oracle's expert advice to the user. 

If clarification occurred, invoke the Oracle one last time with the **accumulated direction**:

```
skill_agent({
  agent_name: "chief-of-staff/oracle",
  prompt: "Based on these clarified requirements: <paste accumulated_direction here>, provide final recommendation for: $ARGUMENTS",
  async: false
})
```

The Oracle will analyze and return expert advice. Display the final response to the user.
