---
description: Quick Oracle consultation for technical decisions
agent: general
model: google/gemini-3-flash
---

# AMA (Ask Me Anything)

Get expert technical advice from the Oracle.

**Your question:** $ARGUMENTS

## Instructions

Use OpenCode's native `skill()` tool to load the Oracle skill:

```
skill({ name: "sisyphus-oracle" })
```

The skill's instructions will be loaded into your context. Follow them to provide expert technical advice on: $ARGUMENTS

---

## What Oracle Provides

- **Bottom line**: Clear recommendation (2-3 sentences)
- **Action plan**: Numbered implementation steps
- **Effort estimate**: Quick/Short/Medium/Large
- **Trade-offs**: Key advantages and disadvantages (when relevant)

---

## Example Usage

```
/ama "PostgreSQL vs MongoDB for analytics?"
/ama "Best caching strategy for Next.js 15?"
/ama "Should I use Zod or Yup for validation?"
```

Fast expert advice in 10-30 seconds.
