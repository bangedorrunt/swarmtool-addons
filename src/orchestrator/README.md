# Orchestrator Module

> **Smart AI agents that remember, learn, and work together.**

The Orchestrator module provides skill-based agents that can be composed into powerful workflows. Each agent is a specialist that focuses on one thing and does it well.

---

## 🚀 Quick Start

### Get Expert Advice
```
"Ask the oracle: Should I use PostgreSQL or MongoDB for a real-time analytics app?"
```

### Research a Library
```
"Ask the librarian about Drizzle ORM migration patterns"
```

### Plan a Feature
```
"Create a plan for implementing user authentication with OAuth"
```

---

## 📦 Available Agents

| Agent | What It Does | When to Use |
|-------|-------------|-------------|
| **🔮 Oracle** | Expert technical advisor | Architecture questions, technology choices |
| **📚 Librarian** | Library research specialist | Learning new libraries, finding examples |
| **🔍 Explore** | Codebase search expert | Finding code, understanding project structure |
| **🎤 Interviewer** | Requirement clarifier | When your request is unclear |
| **📋 Spec-Writer** | Requirements documenter | Before starting new features |
| **📐 Planner** | Implementation strategist | Creating step-by-step plans |
| **✅ Validator** | Quality gate checker | Reviewing plans against best practices |
| **🔨 Executor** | TDD implementer | Actual code implementation |
| **🧠 Memory-Catcher** | Learning extractor | Automatically captures what you prefer |
| **👔 Chief-of-Staff** | Team coordinator | Complex multi-step projects |
| **🏗️ Workflow-Architect** | Pattern designer | Creating new workflow patterns |

---

## 🎯 Workflow Patterns

### Pattern 1: Quick Expert Consultation

**When to use:** You need a quick answer to a technical question.

**Example prompts:**
```
"Oracle, what's the best way to handle file uploads in Next.js?"

"Oracle, compare React Query vs SWR for data fetching"

"Oracle, how should I structure a monorepo with Turborepo?"
```

**What happens:**
1. Oracle analyzes your question
2. Provides structured recommendation with trade-offs
3. Includes effort estimate

---

### Pattern 2: Library Research

**When to use:** You need to learn about an unfamiliar library.

**Example prompts:**
```
"Librarian, research Zod for schema validation - show me common patterns"

"Librarian, how do I set up Prisma with PostgreSQL?"

"Librarian, find examples of testing React components with Vitest"
```

**What happens:**
1. Librarian searches documentation and GitHub
2. Finds relevant examples
3. Returns with code snippets and permalinks

---

### Pattern 3: Codebase Exploration

**When to use:** You need to find something in a codebase you don't know well.

**Example prompts:**
```
"Explore: where is authentication handled in this project?"

"Explore: find all API routes that use the database"

"Explore: what's the folder structure for this project?"
```

**What happens:**
1. Explore searches with grep, LSP, and git
2. Maps relevant files and patterns
3. Returns with explanations and file paths

---

### Pattern 4: Feature Planning (Single Agent)

**When to use:** You want a plan before implementing a feature.

**Example prompts:**
```
"Plan: add dark mode toggle to the settings page"

"Plan: implement email notification system"

"Plan: create REST API for user management"
```

**What happens:**
1. Planner researches your codebase
2. Creates implementation blueprint
3. Lists affected files and phases

---

### Pattern 5: Spec-Driven Development (Multi-Agent)

**When to use:** You want a thorough, validated approach for important features.

**Example prompts:**
```
"Build user authentication with email/password and OAuth"

"Create a real-time chat feature with WebSocket"

"Implement a billing system with Stripe integration"
```

**What happens:**
1. **Interviewer** clarifies requirements if needed
2. **Spec-Writer** creates detailed specification
3. **Planner** creates implementation plan
4. **Validator** checks plan against best practices
5. **Executor** implements with TDD

---

### Pattern 6: Parallel Work

**When to use:** You have multiple independent tasks that can run simultaneously.

**Example prompts:**
```
"Refactor these 5 utility files to TypeScript:
- utils/date.js
- utils/string.js
- utils/format.js
- utils/validation.js
- utils/crypto.js"
```

**What happens:**
1. Each file is assigned to a separate executor
2. All run in parallel
3. Results are gathered and reported

---

### Pattern 7: Interactive Clarification ⭐ DIALOGUE MODE

**When to use:** You have a vague idea but need help defining it.

**Example prompts:**
```
"I want to improve the user experience of our checkout flow"

"Help me figure out how to structure our API"

"I need to make our app faster but I'm not sure where to start"
```

**What happens (DIALOGUE loop):**
1. **Interviewer** asks targeted questions → Returns `needs_input`
2. You answer → Agent processes
3. More questions if needed → Returns `needs_input` again
4. Summary presented → Returns `needs_approval`
5. You say "**Yes**" → Returns `approved`
6. Pipeline continues with clear requirements

**Key:** Agent does NOT proceed until you explicitly approve!

---

### Pattern 8: Chief-of-Staff Coordination ⭐ DIALOGUE MODE

**When to use:** Complex projects spanning multiple areas that need oversight.

**Example prompts:**
```
"Manage the implementation of our new e-commerce checkout:
- Need payment processing
- Need order confirmation emails
- Need inventory updates
- Need admin dashboard updates"
```

**What happens (DIALOGUE checkpoints):**
1. **Chief-of-Staff** captures your goals and constraints
2. Spawns workers for each area
3. **CHECKPOINT**: After planning → Returns `needs_approval`
4. You approve → Execution begins
5. **CHECKPOINT**: After 5 workers → Returns `needs_verification`
6. You verify assumptions → Chief updates direction
7. **CHECKPOINT**: Before each phase transition
8. Nothing proceeds without your explicit "**Yes**"

---

## 🧠 Self-Learning

The system learns from your interactions automatically:

### What It Remembers
- ✅ Your corrections ("No, use Zod instead of io-ts")
- ✅ Your preferences ("I prefer functional components")
- ✅ Architectural decisions ("We chose PostgreSQL for vector support")
- ✅ Anti-patterns that failed ("Don't use bcrypt.hashSync in async")

### How It Works
```
Session 1: You say "No, use Zod not io-ts"
    ↓
    Captured: "User prefers Zod over io-ts"

Session 2: You ask about schema validation
    ↓
    Agent automatically knows to use Zod
```

You don't need to repeat yourself across sessions!

---

## 📋 Real-World Examples

### Example 1: Starting a New Project

**Scenario:** You're starting a new Next.js project and need to set up authentication.

```
You: "I'm starting a new Next.js project. Help me plan the authentication system."

Agent: "Before I create a plan, I need to clarify a few things:

1. Authentication method?
   - [ ] Email/password only
   - [ ] OAuth (Google, GitHub, etc.)
   - [ ] Both

2. Session management?
   - [ ] JWT tokens
   - [ ] Server-side sessions

3. Any specific requirements?
   - MFA needed?
   - Password reset via email?"

You: "OAuth with Google and GitHub. JWT tokens. No MFA for now."

Agent: "Got it. Creating spec and plan..."

[Returns detailed plan with phases, files, and implementation steps]
```

---

### Example 2: Debugging a Performance Issue

**Scenario:** Your app is slow and you don't know why.

```
You: "My Next.js app is slow. Help me find the bottleneck."

Agent (Explore): "Searching for performance-related patterns..."

[Finds]
- Heavy computation in getServerSideProps
- No caching on API routes
- Large bundle in _app.tsx

Agent (Oracle): "Based on the analysis:

1. **Quick Win**: Add caching headers to /api/products
   - Impact: High
   - Effort: 10 minutes

2. **Medium Effort**: Move heavy computation to API route
   - Impact: High  
   - Effort: 1 hour

3. **Consider**: Implement Redis caching for database queries
   - Impact: High
   - Effort: Half day

Which would you like to tackle first?"
```

---

### Example 3: Learning a New Library

**Scenario:** You need to use Drizzle ORM but haven't used it before.

```
You: "I need to set up Drizzle ORM with PostgreSQL. I've never used it."

Agent (Librarian): "Here's what you need to know about Drizzle:

## Setup
1. Install: `npm i drizzle-orm postgres`
2. Create schema file: `src/db/schema.ts`
3. Configure connection: `src/db/index.ts`

## Quick Example
```typescript
// schema.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// usage
const allUsers = await db.select().from(users);
```

## Migrations
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

## Resources
- [Quick Start](https://orm.drizzle.team/docs/quick-start)
- [Insert Examples](https://github.com/drizzle-team/drizzle-orm/.../insert.ts)
- [Query Patterns](https://orm.drizzle.team/docs/select)

Would you like me to create a plan for integrating this into your project?"
```

---

### Example 4: Code Review

**Scenario:** You want feedback on your implementation.

```
You: "Review my implementation of the user service in src/services/user.ts"

Agent (Oracle): "Reviewing src/services/user.ts...

## Good ✅
- Clean separation of concerns
- Proper error handling
- TypeScript types are accurate

## Suggestions 💡
1. **Line 45**: Consider using transaction for user creation + profile
2. **Line 78**: Password comparison should use constant-time comparison
3. **Line 92**: Add rate limiting to prevent brute force

## Security ⚠️
- Line 23: Logging full user object - may expose sensitive data
- Line 56: Consider adding input validation with Zod

Would you like me to implement any of these suggestions?"
```

---

### Example 5: Refactoring Help

**Scenario:** You want to refactor JavaScript files to TypeScript.

```
You: "Refactor utils/*.js files to TypeScript"

Agent: "Found 5 files to refactor:
- utils/date.js (45 lines)
- utils/string.js (32 lines)
- utils/format.js (28 lines)
- utils/validation.js (67 lines)
- utils/crypto.js (23 lines)

Running parallel refactoring...

✅ date.ts - Complete (added 12 type annotations)
✅ string.ts - Complete (added 8 type annotations)
✅ format.ts - Complete (added 6 type annotations)
✅ validation.ts - Complete (added 15 type annotations)
✅ crypto.ts - Complete (added 5 type annotations)

All files refactored. TypeScript compiles with 0 errors.
Would you like me to run the tests?"
```

---

## 🔧 Configuration

The orchestrator works out of the box with no configuration needed.

### Optional: Model Override
In your project's `.opencode.json`:
```json
{
  "models": {
    "chief-of-staff/oracle": { "model": "openrouter/anthropic/claude-3.5-sonnet" }
  }
}
```

### Optional: Custom Agents
Create your own agents in `~/.config/opencode/skill/`:
```
~/.config/opencode/skill/
└── my-skill/
    └── agents/
        └── my-agent/
            └── SKILL.md
```

---

## 📚 Further Reading

- [PLAN.md](./PLAN.md) - Technical architecture
- [Workflow Patterns Guide](../docs/WORKFLOW_PATTERNS_GUIDE.md) - Detailed patterns with code
- [SKILL_BASED_AGENTS_SPEC.md](../docs/SKILL_BASED_AGENTS_SPEC.md) - Full specification
