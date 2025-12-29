---
description: Ask the Oracle questions for expert advice
model: opencode/grok-code
---

# Ask the Oracle

You have access to the **skill_agent** tool which can spawn chief-of-staff subagents.

For the question: **$ARGUMENTS**

Use the skill_agent tool to invoke chief-of-staff/oracle **synchronously** to get the answer:

```
skill_agent({
  agent_name: "oracle",
  prompt: "$ARGUMENTS",
  async: false
})
```

The Oracle will analyze and return expert advice. Display the response to the user.
