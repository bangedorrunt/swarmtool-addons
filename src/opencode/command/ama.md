---
description: Quick technical consultation with Oracle expert
---

# AMA (Ask Me Anything) - Oracle Consultation

## Your Task

Provide expert technical advice using the Oracle agent.

**User Question:** $ARGUMENTS

## Instructions

**Use the `skill_agent` tool to consult the Oracle:**

```
skill_agent({
  skill_name: "sisyphus",
  agent_name: "oracle",
  prompt: "$ARGUMENTS"
})
```

**Then display the Oracle's response to the user.**

That's it - one tool call, one response. Fast expert advice.

Oracle returns structured advice with:

### 1. Bottom Line (Essential)
- **Recommendation:** Clear, actionable answer
- **Rationale:** Why this approach makes sense
- **Effort Estimate:** Quick/Short/Medium/Large

### 2. Action Plan (If Applicable)
- Numbered implementation steps
- Or decision checklist

### 3. Trade-offs (When Relevant)
- Key advantages
- Key disadvantages
- When to reconsider

## Example Invocations

### Technology Decision
```bash
ama "Should I use PostgreSQL or MongoDB for real-time analytics?"
```

**Oracle Response:**
```
## Recommendation: PostgreSQL with TimescaleDB extension

**Rationale:**
- Native time-series support via TimescaleDB
- SQL for complex aggregations
- Better for structured analytical queries

**Trade-offs:**
- Setup: Medium (2-3 days)
- Write throughput: Good but not MongoDB-level
- Query flexibility: Excellent (SQL)

**When to reconsider:**
If you need >100k writes/sec, consider ClickHouse instead.
```

### Architecture Question
```bash
ama "Best way to implement caching in Next.js 15 App Router?"
```

### Library Comparison
```bash
ama "Zod vs Yup vs io-ts for runtime validation?"
```

### Code Review
```bash
ama "Review this authentication flow: [paste code]"
```

### Debugging Strategy
```bash
ama "My API response time jumped from 50ms to 500ms. Where to start investigating?"
```

## When to Use AMA vs Other Commands

| Use Case | Command | Why |
|----------|---------|-----|
| Quick tech question | `ama` | Fast expert opinion |
| Need implementation | `sdd` | Full pipeline with code |
| Research needed | Spawn librarian | Deep dive into docs |
| Explore codebase | Spawn explore | Find existing patterns |

## Key Differences vs SDD

| Feature | AMA (Oracle) | SDD |
|---------|--------------|-----|
| **Mode** | One-shot | Interactive dialogue |
| **Output** | Advice | Working code |
| **Duration** | ~10-30 seconds | ~5-30 minutes |
| **User Input** | Single question | Multiple checkpoints |
| **Agents Used** | 1 (Oracle) | 5+ (Interview, Spec, Plan, Execute) |

## Tips for Better Questions

### ✅ Good Questions
- Specific: "PostgreSQL vs MongoDB for analytics"
- Context-aware: "In Next.js 15 App Router, how to..."
- Decision-focused: "Should I use X or Y for Z?"

### ❌ Vague Questions
- Too broad: "How do I build a web app?"
- No context: "What's the best database?"
- Implementation-heavy: "Write me a complete auth system"
  (Use `sdd` for this instead)

## Oracle's Expertise Areas

- **Architecture:** System design, patterns, trade-offs
- **Technology Selection:** Database, framework, library choices
- **Performance:** Optimization strategies, bottleneck diagnosis
- **Security:** Best practices, vulnerability analysis
- **Code Quality:** Review, refactoring recommendations
- **Debugging:** Investigation strategies

## Response Time

- Simple questions: ~10 seconds
- Complex analysis: ~30 seconds
- Deep architectural questions: ~1 minute

## Follow-up Pattern

If Oracle's answer leads to implementation:

```bash
# 1. Get advice
ama "Best approach for user session management?"

# 2. Oracle recommends JWT in httpOnly cookies

# 3. Implement it
sdd "Implement JWT session management with httpOnly cookies"
```

---

*AMA: Your on-demand expert advisor for quick technical decisions.*
