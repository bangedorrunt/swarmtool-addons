# Workflow Patterns Guide

> Practical scenarios showing how to use skill-based agents independently and together, with and without swarm coordination.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Interactive Dialogue Mode](#interactive-dialogue-mode) ⭐ NEW
3. [Standalone Patterns](#standalone-patterns-no-swarm)
4. [Coordinated Patterns](#coordinated-patterns-with-swarm)
5. [Real-World Scenarios](#real-world-scenarios)

---

## Agent Interaction Patterns with Human-in-the-Loop

Understanding how agents collaborate and where human approval is required is critical for effective orchestration.

### Two Primary Workflow Patterns

#### Pattern A: Ask User Question (Interviewer-Led)

**Use Case**: User request is ambiguous or requires clarification.

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  USER   │     │ CHIEF-OF-    │     │ INTERVIEWER │     │  ORACLE  │
│         │     │    STAFF     │     │             │     │          │
└────┬────┘     └──────┬───────┘     └──────┬──────┘     └────┬─────┘
     │                 │                     │                 │
     │ "Build OAuth"   │                     │                 │
     ├────────────────►│                     │                 │
     │                 │                     │                 │
     │                 │ Analyze: Ambiguous! │                 │
     │                 │                     │                 │
     │                 │ skill_agent({       │                 │
     │                 │   interviewer,      │                 │
     │                 │   async: true       │                 │
     │                 │ })                  │                 │
     │                 ├────────────────────►│                 │
     │◄────────────────┴─────────────────────┤                 │
     │ HANDOFF                               │                 │
     │                                       │                 │
     │ "Before I proceed:                    │                 │
     │  1. OAuth providers?                  │                 │
     │  2. Session or JWT?"                  │                 │
     │  status: 'needs_input' ⭐             │                 │
     │◄──────────────────────────────────────┤                 │
     │                                       │                 │
     │ "Google + GitHub, JWT" ✅             │                 │
     ├──────────────────────────────────────►│                 │
     │                                       │                 │
     │ "Summary:                             │                 │
     │  - OAuth: Google + GitHub             │                 │
     │  - JWT tokens                         │                 │
     │  Ready to proceed?"                   │                 │
     │  status: 'needs_approval' ⭐          │                 │
     │◄──────────────────────────────────────┤                 │
     │                                       │                 │
     │ "Yes, proceed" ✅                     │                 │
     ├──────────────────────────────────────►│                 │
     │                                       │                 │
     │                 ◄─────────────────────┤                 │
     │                 │ approved            │                 │
     │                 │                     │                 │
     │                 │ skill_agent({       │                 │
     │                 │   oracle,           │                 │
     │                 │   async: false      │                 │
     │                 │ })                  │                 │
     │                 ├─────────────────────┴─────────────────►
     │                 │                                       │
     │                 │◄──────────────────────────────────────┤
     │                 │ Strategy: 3 phases                    │
     │                 │ Phase 1: Parallel (routes + middleware)
     │                 │ Phase 2: Sequential (integration)     │
```

**Human Checkpoints** ⭐:
1. **needs_input**: User answers clarifying questions
2. **needs_approval**: User confirms requirements summary

---

#### Pattern B: SDD (Spec-Driven Development)

**Use Case**: New feature development with formal specification.

```
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐
│  USER   │  │  CHIEF   │  │INTERVIEW │  │  SPEC  │  │ ORACLE  │
│         │  │OF-STAFF  │  │   -ER    │  │ WRITER │  │         │
└────┬────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  └────┬────┘
     │            │              │            │            │
     │ "Build     │              │            │            │
     │ dashboard" │              │            │            │
     ├───────────►│              │            │            │
     │            │              │            │            │
     │            │ PHASE 1: CLARIFICATION    │            │
     │            │              │            │            │
     │            │ skill_agent({│            │            │
     │            │   interviewer, async:true)│            │
     │            ├─────────────►│            │            │
     │◄───────────┴──────────────┤            │            │
     │ HANDOFF                   │            │            │
     │                           │            │            │
     │ "Questions:               │            │            │
     │  1. Data source?          │            │            │
     │  2. Primary users?"       │            │            │
     │  status: 'needs_input' ⭐ │            │            │
     │◄──────────────────────────┤            │            │
     │                           │            │            │
     │ "Internal API,            │            │            │
     │  Business users" ✅       │            │            │
     ├──────────────────────────►│            │            │
     │                           │            │            │
     │ "Summary: Dashboard for   │            │            │
     │  business users, API data.│            │            │
     │  Proceed?"                │            │            │
     │  status: 'needs_approval' ⭐           │            │
     │◄──────────────────────────┤            │            │
     │                           │            │            │
     │ "Yes" ✅                  │            │            │
     ├──────────────────────────►│            │            │
     │                           │            │            │
     │            ◄──────────────┤            │            │
     │            │ approved      │            │            │
     │            │               │            │            │
     │            │ PHASE 2: SPECIFICATION     │            │
     │            │               │            │            │
     │            │ skill_agent({ │            │            │
     │            │   spec-writer,│            │            │
     │            │   async:true) │            │            │
     │            ├───────────────┴───────────►│            │
     │◄───────────┴───────────────────────────┤            │
     │ HANDOFF                                │            │
     │                                        │            │
     │ "Spec Summary:                         │            │
     │  - 5 functional requirements           │            │
     │  - 2 non-functional requirements       │            │
     │  Approve spec?"                        │            │
     │  status: 'needs_approval' ⭐           │            │
     │◄───────────────────────────────────────┤            │
     │                                        │            │
     │ "Approved" ✅                          │            │
     ├────────────────────────────────────────►            │
     │                                        │            │
     │            ◄───────────────────────────┤            │
     │            │ spec.json saved           │            │
     │            │                           │            │
     │            │ PHASE 3: STRATEGY         │            │
     │            │                           │            │
     │            │ skill_agent({             │            │
     │            │   oracle,                 │            │
     │            │   async: false  // SYNC   │            │
     │            │ })                        │            │
     │            ├───────────────────────────┴────────────►
     │            │                                        │
     │            │◄───────────────────────────────────────┤
     │            │ Strategy: 2 phases                     │
     │            │ Phase 1: API (sequential)              │
     │            │ Phase 2: UI (parallel)                 │
```

**Human Checkpoints** ⭐:
1. **Interviewer needs_input**: User answers questions
2. **Interviewer needs_approval**: User confirms requirements
3. **Spec-Writer needs_approval**: User approves formal specification
4. **Planner needs_approval**: User approves implementation plan (not shown)

---

### Decision Tree: Which Pattern to Use?

```
                          User Request
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Is request clear?    │
                    │ (No ambiguity)       │
                    └──────────┬───────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
               NO                            YES
                │                             │
                ▼                             ▼
    ┌───────────────────────┐    ┌───────────────────────┐
    │ Ask User Question     │    │ Is it a new feature?  │
    │ Pattern               │    └──────────┬────────────┘
    │                       │               │
    │ 1. Interviewer        │    ┌──────────┴──────────┐
    │ 2. Oracle (optional)  │    │                     │
    │ 3. Planner            │   YES                   NO
    │ 4. Execute            │    │                     │
    └───────────────────────┘    ▼                     ▼
                      ┌───────────────────┐  ┌──────────────────┐
                      │ SDD Pattern       │  │ Direct Execution │
                      │                   │  │                  │
                      │ 1. Interviewer    │  │ 1. Oracle        │
                      │ 2. Spec-Writer    │  │ 2. Planner       │
                      │ 3. Oracle         │  │ 3. Execute       │
                      │ 4. Planner        │  └──────────────────┘
                      │ 5. Execute        │
                      └───────────────────┘
```

---

### Communication Modes: Async vs Sync

| Mode | async value | Visibility | Result | Use Case |
|------|-------------|------------|--------|----------|
| **Async (Handoff)** | `true` | User sees sub-agent | No result | Interviewer, Spec-Writer, Planner |
| **Sync (Background)** | `false` | Hidden from user | Text result | Oracle, Executor, Validator |

**When to use Async (Handoff)**:
- Agent needs user input (Interviewer)
- Agent needs user approval (Spec-Writer, Planner)
- Any agent operating in **DIALOGUE mode**

**When to use Sync (Background)**:
- Parent needs the result to continue (Oracle strategy)
- Automated execution (Executor)
- No user interaction required (Validator)

---

### Complete SDD Workflow with All Checkpoints

```
USER REQUEST
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: CLARIFICATION (Human-in-Loop)                         │
│ Agent: Interviewer (async: true, dialogue mode)                │
│ Checkpoints:                                                    │
│   ⭐ needs_input: User answers questions                        │
│   ⭐ needs_approval: User confirms requirements                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: SPECIFICATION (Human-in-Loop)                         │
│ Agent: Spec-Writer (async: true, dialogue mode)                │
│ Checkpoints:                                                    │
│   ⭐ needs_approval: User approves formal spec                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: STRATEGY (Automated)                                  │
│ Agent: Oracle (async: false, sync mode)                        │
│ Output: Task decomposition + parallelization strategy          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: PLANNING (Human-in-Loop)                              │
│ Agent: Planner (async: true, dialogue mode)                    │
│ Checkpoints:                                                    │
│   ⭐ needs_approval: User approves implementation plan          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: EXECUTION (Supervised)                                │
│ Agent: Executor (async: false, sync mode)                      │
│ Supervision: TaskRegistry + TaskSupervisor                     │
│ Monitoring: User can call task_status anytime                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 6: AGGREGATION (Automated)                               │
│ Tool: task_aggregate                                            │
│ Output: Summary of all task results                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
                    USER RECEIVES
                    FINAL SUMMARY
```

---

### Key Principles

1. **Human-in-the-Loop for Decisions**: Use `async: true` + DIALOGUE mode
2. **Automated for Execution**: Use `async: false` + TaskSupervisor
3. **Always Confirm Before Proceeding**: `needs_approval` status
4. **Transparent Supervision**: User can check `task_status` anytime
5. **Resilient Execution**: TaskSupervisor handles retries automatically

---

## Quick Reference

| Pattern | When to Use | Swarm Required | Interaction Mode |
|---------|------------|----------------|------------------|
| **Single Agent** | Simple, focused task | ❌ | one_shot |
| **Interview-First** | Unclear requirements | ❌ | **dialogue** ⭐ |
| **Sequential Coordination** | Multi-step with result dependencies | ❌ | **sync** ⭐ NEW |
| **SDD Pipeline** | New feature development | Optional | one_shot + dialogue |
| **Parallel Workers** | Independent subtasks | ✅ | one_shot |
| **Chief-of-Staff** | Complex multi-step work | ✅ | **dialogue** + **sync** ⭐ |
| **Self-Learning** | Cross-session memory | ❌ | one_shot |

---

## Interactive Dialogue Mode ⭐ NEW

The **dialogue mode** enables multi-turn conversations with user approval checkpoints.

### The Problem with One-Shot Mode

```
User: "Build auth"
    ↓
Agent assumes everything
    ↓
Returns result (may be wrong)
    ↓
User: "That's not what I wanted!"
```

### The Solution: Dialogue Mode

```
User: "Build auth"
    ↓
Agent: "I need to clarify:
       1. OAuth providers?
       2. Session or JWT?"
    ↓
User: "Google OAuth, JWT"
    ↓
Agent: "Summary: Google OAuth + JWT
       Ready to proceed?"
    ↓
User: "Yes"
    ↓
Agent proceeds with correct direction
```

### How to Use Dialogue Mode

```typescript
// Spawn agent in dialogue mode
const result = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'interviewer',
  interaction_mode: 'dialogue',  // ⭐ KEY!
  prompt: 'Clarify requirements for auth feature',
});

// Agent returns dialogue state
const state = result.output.dialogue_state;

if (state.status === 'needs_input') {
  // Show questions to user
  console.log(state.message_to_user);
  console.log(state.pending_questions);
  
  // Get user's answer
  const userAnswer = await getUserInput();
  
  // Continue dialogue with accumulated state
  const continued = await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'interviewer',
    interaction_mode: 'dialogue',
    prompt: userAnswer,
    context: {
      dialogue_state: state,  // Pass previous state!
    },
  });
}

if (state.status === 'approved') {
  // User approved! Get final output
  const explicitDirection = result.output.output.explicit_direction;
  // Continue to next phase...
}
```

### Dialogue Status Values

| Status | Meaning | What to Do |
|--------|---------|------------|
| `needs_input` | Agent has questions | Show to user, get answer |
| `needs_approval` | Agent has proposal | Show summary, ask "Ready?" |
| `needs_verification` | Agent made assumptions | Show assumptions, ask to verify |
| `approved` | User said "yes" | Continue pipeline |
| `rejected` | User said "no" | Ask what to change |
| `completed` | Dialogue finished | Process output |

### Agents That Support Dialogue Mode

| Agent | Use Case | Default Mode |
|-------|----------|--------------|
| **Interviewer** | Multi-turn clarification | dialogue |
| **Chief-of-Staff** | Checkpoints + assumption verification | dialogue |
| **Spec-Writer** | Spec confirmation (optional) | one_shot |

### Example: Interview → Spec → Plan with Dialogue

```typescript
// Phase 1: Interactive clarification
let interviewState = null;
let approved = false;

while (!approved) {
  const result = await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'interviewer',
    interaction_mode: 'dialogue',
    prompt: interviewState ? userInput : 'Clarify auth requirements',
    context: interviewState ? { dialogue_state: interviewState } : undefined,
  });
  
  interviewState = result.output.dialogue_state;
  
  if (interviewState.status === 'approved') {
    approved = true;
  } else {
    console.log(interviewState.message_to_user);
    userInput = await getUserInput();
  }
}

const explicitDirection = result.output.output.explicit_direction;

// Phase 2: Create spec with confirmed direction
const spec = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'spec-writer',
  prompt: 'Create auth spec',
  context: { explicit_direction: explicitDirection },
});

// Phase 3: Plan (one-shot, no dialogue needed)
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Create implementation plan',
  context: { spec: spec.output },
});
```

### Chief-of-Staff Checkpoint Pattern

```typescript
// Chief-of-Staff uses dialogue for checkpoints
const chief = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'chief-of-staff',
  interaction_mode: 'dialogue',
  prompt: 'Manage auth implementation',
});

// Chief returns checkpoint after planning
// { status: 'needs_approval', proposal: { type: 'checkpoint', summary: 'Planning complete...' } }

// User: "Yes, proceed to execution"

// Chief returns assumption verification
// { status: 'needs_verification', pending_assumptions: [{ assumed: 'JWT in httpOnly cookie', ... }] }

// User: "Use localStorage instead"

// Chief updates and continues with correction
```

---

## Standalone Patterns (No Swarm)

These patterns work with just `skill_agent` - no swarm infrastructure needed.

### Pattern 1: Single Expert Consultation

**Scenario:** You need architectural advice on database choice.

```typescript
// Just spawn the oracle agent directly
const result = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'oracle',
  prompt: `
    We're building a real-time analytics dashboard.
    Requirements:
    - 10M events/day ingestion
    - Sub-second query response
    - Time-series aggregations
    
    Should we use PostgreSQL, ClickHouse, or TimescaleDB?
  `,
});

// Oracle returns structured advice
// {
//   recommendation: "TimescaleDB",
//   rationale: "Best of both worlds - PostgreSQL compatibility + time-series optimization",
//   tradeoffs: ["Steeper learning curve", "Compression overhead"],
//   effort_estimate: "2 days setup"
// }
```

**When to use:**
- Quick technical questions
- Expert opinion needed
- No implementation required

---

### Pattern 2: Interview-First Clarification

**Scenario:** User says "build a dashboard" but requirements are vague.

```typescript
// Step 1: Clarify with interviewer
const clarification = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'interviewer',
  prompt: 'User wants to "build a dashboard". Clarify requirements.',
});

// Interviewer asks user:
// "Before I proceed:
//  1. What data sources? (DB, API, real-time)
//  2. Who are the users? (devs, business, execs)
//  3. Match existing stack or new?"

// User answers: "API data, business users, match existing"

// Step 2: Now proceed with clear direction
const spec = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'spec-writer',
  prompt: 'Create spec for business analytics dashboard',
  context: {
    explicit_direction: clarification.output.explicit_direction,
  },
});
```

**When to use:**
- Vague user requests
- Multiple valid interpretations
- High-impact decisions ahead

---

### Pattern 3: Spec-Driven Development (Sequential)

**Scenario:** Build user authentication system from scratch.

```typescript
// Phase 1: Create specification
const spec = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'spec-writer',
  prompt: 'Create spec for email/password auth with OAuth support',
});

// Phase 2: Create implementation plan
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Create implementation plan for auth system',
  context: { spec: spec.output },
});

// Phase 3: Validate plan against precedents
const validation = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'validator',
  prompt: 'Validate auth implementation plan',
  context: { plan: plan.output },
});

// Phase 4: Execute (if validated)
if (validation.output.verdict === 'PASS') {
  for (const phase of plan.output.phases) {
    await skill_agent({
      skill_name: 'chief-of-staff',
      agent_name: 'executor',
      prompt: `Implement: ${phase.title}`,
      context: { files_assigned: phase.files },
    });
  }
}
```

**When to use:**
- New feature development
- Clear scope, complex implementation
- Quality gates important

---

### Pattern 4: Research + Implementation

**Scenario:** Need to integrate a library you're unfamiliar with.

```typescript
// Step 1: Research the library
const research = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'librarian',
  prompt: `
    Research Drizzle ORM for PostgreSQL:
    - Setup and configuration
    - Migration patterns
    - Type-safety features
    - Comparison with Prisma
  `,
});

// Step 2: Explore existing codebase for patterns
const codebase = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: 'Find existing database patterns in this project',
});

// Step 3: Plan integration
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Plan Drizzle ORM integration',
  context: {
    research: research.output,
    existing_patterns: codebase.output,
  },
});
```

**When to use:**
- New technology integration
- Unfamiliar codebase
- Need to match existing patterns

---

### Pattern 5: Sequential Coordination (Durable Stream) ⭐ NEW

**Scenario:** Parent agent needs the result of a sub-agent to decide next steps.

```typescript
// User: "Plan the auth system, then implement it based on the plan"

// Coordinator (e.g., Chief-of-Staff or custom orchestrator)
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Create detailed implementation plan for OAuth authentication',
  async: false,  // ⭐ SYNC MODE - Coordinator waits for result
});

// `plan` is now a TEXT string containing the planner's output
// Example: "Phase 1: Setup OAuth routes\nPhase 2: Add middleware\n..."

console.log('Received plan:', plan);

// Coordinator can now use this result to make decisions
const phases = parsePlan(plan);

for (const phase of phases) {
  // Execute each phase sequentially, waiting for results
  const result = await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'executor',
    prompt: `Implement: ${phase.description}`,
    async: false,  // ⭐ SYNC MODE
    context: { files_assigned: phase.files },
  });
  
  console.log(`Phase ${phase.id} complete:`, result);
  
  // Validate before continuing
  const validation = await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'validator',
    prompt: `Validate phase ${phase.id} implementation`,
    async: false,
  });
  
  if (validation.includes('FAIL')) {
    console.error('Validation failed, stopping execution');
    break;
  }
}
```

**Key Differences from Async Mode:**

| Aspect | Async (Parallel) | Sync (Sequential) |
|--------|------------------|-------------------|
| **Parent Turn** | Ends immediately | Blocks until sub-agent finishes |
| **Session** | Same session (UI visible) | New isolated session (background) |
| **Result** | No result returned | Text result returned |
| **Use Case** | User interaction | Logic coordination |

**When to use:**
- Multi-step workflows where each step depends on the previous result
- Chief-of-Staff coordinating multiple specialists
- Plan → Validate → Execute pipelines
- Research → Decide → Implement flows
- Any scenario where the parent needs to process the sub-agent's output

**Anti-Pattern (Don't do this):**
```typescript
// ❌ BAD: Using async when you need the result
const plan = await skill_agent({
  agent_name: 'planner',
  prompt: 'Create plan',
  async: true,  // ❌ This will handoff to user, not return result!
});

// `plan` will be metadata, not the actual plan text!
// Your coordinator will not get the plan content.
```

---

### Pattern 6: Self-Learning Session

**Scenario:** You want the agent to remember your preferences across sessions.

```typescript
// At session start - inject past learnings
const injector = createSessionLearningInjector({
  memoryLaneFind: myMemoryLaneFind,
});

const context = await injector.execute({
  messages: [{ role: 'user', content: 'Help me with auth implementation' }],
});

// context.systemPromptAddition contains:
// "## Relevant Past Learnings
//  - [preference]: User prefers Zod over io-ts
//  - [decision]: PostgreSQL for all new projects
//  - [anti_pattern]: Don't use bcrypt.hashSync in async handlers"

// Agent now has this context automatically!

// At session end - capture new learnings
const capture = createSessionLearningCapture({
  skillAgent: mySkillAgent,
});

await capture.execute({
  messages: conversationHistory,
  modifiedFiles: ['src/auth/login.ts'],
});
```

**When to use:**
- Repeat collaborators
- Project-specific conventions
- Avoid repeating mistakes

---

## Coordinated Patterns (With Swarm)

These patterns leverage SwarmMail for inter-agent communication.

### Pattern 6: Parallel Worker Fleet

**Scenario:** Refactor 5 independent modules simultaneously.

```typescript
// Spawn parallel workers
const { task_ids } = await skill_spawn_batch({
  tasks: [
    { skill: 'chief-of-staff', agent: 'executor', prompt: 'Refactor auth module' },
    { skill: 'chief-of-staff', agent: 'executor', prompt: 'Refactor user module' },
    { skill: 'chief-of-staff', agent: 'executor', prompt: 'Refactor billing module' },
    { skill: 'chief-of-staff', agent: 'executor', prompt: 'Refactor notifications' },
    { skill: 'chief-of-staff', agent: 'executor', prompt: 'Update shared utilities' },
  ],
  wait: false, // Non-blocking
});

console.log('Workers spawned:', task_ids);

// Each worker operates in isolation with SwarmMail inbox
// Workers don't share context - clean separation

// Poll for completion
let results;
do {
  await sleep(10000); // Check every 10s
  results = await skill_gather({ task_ids, partial: true });
  
  console.log(`Progress: ${results.completed.length}/${task_ids.length}`);
  
  // Handle completed workers
  for (const r of results.completed) {
    console.log(`✅ ${r.agent} done:`, r.output.files_touched);
  }
} while (results.pending.length > 0);

console.log('All workers complete!');
```

**When to use:**
- Independent subtasks
- Speed is critical
- No file conflicts between workers

---

### Pattern 7: Chief-of-Staff Coordination

**Scenario:** Complex project requiring multi-phase work with user checkpoints.

```typescript
// Chief-of-Staff manages the entire flow
const chief = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'chief-of-staff',
  prompt: `
    User request: "Build complete e-commerce checkout flow"
    
    Your job:
    1. Capture explicit direction (goals, constraints)
    2. Spawn interviewer if requirements unclear
    3. Coordinate SDD pipeline (spec → plan → validate → execute)
    4. Track assumptions from workers
    5. Surface assumptions to user every 5 completions
    6. Handle blockers by pausing and asking user
  `,
});

// Chief internally:
//
// 1. Calls interviewer for clarification
//    → "Which payment providers? Stripe only or multiple?"
//    → "Guest checkout or account required?"
//
// 2. Stores explicit direction:
//    { goals: ["Stripe checkout"], constraints: ["Guest checkout allowed"] }
//
// 3. Spawns spec-writer with direction
//
// 4. Spawns planner with spec
//
// 5. Spawns parallel executors:
//    - executor-cart: Cart management
//    - executor-checkout: Checkout flow
//    - executor-payment: Stripe integration
//
// 6. Tracks assumptions:
//    - "Using Stripe Checkout (not Elements)" confidence: 0.7
//    - "Storing card last 4 digits" confidence: 0.8
//
// 7. Surfaces to user:
//    "I've made 2 assumptions:
//     1. Using Stripe Checkout (simpler) vs Elements (customizable)
//     2. Storing card last 4 digits for receipts
//     
//     Continue with these, or clarify?"
```

**When to use:**
- Complex multi-day projects
- User wants oversight without micromanaging
- Assumptions need verification

---

### Pattern 8: Swarm Mail Coordination

**Scenario:** Workers need to communicate with each other.

```typescript
// Worker A discovers shared utility needed
await swarmmail_send({
  to: 'coordinator',
  event_type: 'WORKER_BLOCKED',
  body: {
    worker: 'executor-auth',
    reason: 'Need shared validation utility',
    suggestion: 'Create src/utils/validation.ts first',
  },
});

// Coordinator receives and re-prioritizes
const inbox = await swarmmail_inbox({ agent: 'coordinator' });
for (const msg of inbox.messages) {
  if (msg.event_type === 'WORKER_BLOCKED') {
    // Spawn utility worker first
    await skill_agent({
      skill_name: 'chief-of-staff',
      agent_name: 'executor',
      prompt: `Create shared utility: ${msg.body.suggestion}`,
    });
    
    // Notify blocked worker to continue
    await swarmmail_send({
      to: msg.body.worker,
      event_type: 'DEPENDENCY_RESOLVED',
      body: { file: 'src/utils/validation.ts' },
    });
  }
}
```

**When to use:**
- Workers have dependencies
- Dynamic task reordering needed
- Real-time coordination

---

## Real-World Scenarios

### Scenario A: New Developer Onboarding

**Context:** New developer needs to add a feature but doesn't know the codebase.

```typescript
// 1. Explore codebase structure
const structure = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: 'Map the project architecture: key directories, patterns, conventions',
});

// 2. Find similar features for reference
const examples = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: 'Find examples of API endpoints with authentication',
});

// 3. Get oracle advice on approach
const advice = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'oracle',
  prompt: `
    New feature: Add user preferences API
    Existing patterns: ${JSON.stringify(examples.output)}
    
    What's the recommended approach to match existing style?
  `,
});

// 4. Create plan based on patterns
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Plan user preferences API implementation',
  context: {
    existing_patterns: examples.output,
    oracle_advice: advice.output,
  },
});
```

**Result:** New developer gets oriented quickly, follows existing patterns.

---

### Scenario B: Legacy Code Refactor

**Context:** Refactor old JavaScript codebase to TypeScript.

```typescript
// 1. Analyze current state
const analysis = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: `
    Analyze JavaScript files for TypeScript migration:
    - Total files
    - Complexity distribution
    - External dependencies
    - Test coverage
  `,
});

// 2. Create migration spec
const spec = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'spec-writer',
  prompt: 'Create TypeScript migration spec',
  context: { analysis: analysis.output },
});

// 3. Plan phased migration
const plan = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'planner',
  prompt: 'Plan phased TS migration (leaf nodes first)',
  context: { spec: spec.output },
});

// 4. Execute in parallel (files don't conflict)
const { task_ids } = await skill_spawn_batch({
  tasks: plan.output.phases[0].files.map(file => ({
    skill: 'chief-of-staff',
    agent: 'executor',
    prompt: `Convert to TypeScript: ${file}`,
  })),
  wait: true,
});

// 5. Validate and continue to next phase
const validation = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'validator',
  prompt: 'Validate TypeScript migration phase 1',
});
```

**Result:** Systematic migration with parallel execution for speed.

---

### Scenario C: Bug Investigation

**Context:** Production bug reported, need to find root cause.

```typescript
// 1. Gather context from error
const explore = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: `
    Bug: "Payment fails for amounts > $999"
    
    Find:
    - Payment processing code
    - Amount validation logic
    - Recent changes to payment module
  `,
});

// 2. Get expert analysis
const analysis = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'oracle',
  prompt: `
    Bug context: ${JSON.stringify(explore.output)}
    
    What are likely causes for payment failure > $999?
    Check for:
    - Integer overflow
    - String/number conversion
    - Validation regex
    - Third-party API limits
  `,
});

// 3. Verify hypothesis with targeted search
const verification = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'explore',
  prompt: `
    Hypothesis: ${analysis.output.likely_cause}
    
    Find code that confirms or refutes this hypothesis.
  `,
});

// 4. Fix with executor
if (verification.output.confirmed) {
  await skill_agent({
    skill_name: 'chief-of-staff',
    agent_name: 'executor',
    prompt: `
      Fix payment bug:
      - Root cause: ${analysis.output.likely_cause}
      - Location: ${verification.output.file}
      - Add test to prevent regression
    `,
  });
}
```

**Result:** Systematic debugging with expert guidance.

---

### Scenario D: Multi-Team Feature (Full Swarm)

**Context:** Large feature spanning multiple domains, needs coordination.

```typescript
// Chief-of-Staff orchestrates everything
const chief = await skill_agent({
  skill_name: 'chief-of-staff',
  agent_name: 'chief-of-staff',
  prompt: `
    Epic: "Add team collaboration features"
    
    Domains:
    - Backend API (new endpoints)
    - Frontend UI (new components)
    - Database (schema changes)
    - Notifications (email + push)
    
    Coordinate:
    1. Interview for requirements per domain
    2. Create specs for each domain
    3. Identify cross-domain dependencies
    4. Execute in dependency order
    5. Track assumptions across all workers
    6. Surface blockers immediately
  `,
});

// Chief creates work breakdown:
//
// Phase 1 (parallel - no dependencies):
//   - DB executor: Schema migrations
//   - Notification executor: Email templates
//
// Phase 2 (depends on Phase 1):
//   - Backend executor: API endpoints
//   - Notification executor: Push notifications
//
// Phase 3 (depends on Phase 2):
//   - Frontend executor: UI components
//
// Swarm coordination:
//   - Each executor has SwarmMail inbox
//   - Chief monitors for blockers
//   - Workers report assumptions
//   - Chief surfaces to user at checkpoints
```

**Result:** Complex multi-domain work coordinated automatically.

---

## Pattern Selection Guide

```
┌─────────────────────────────────────────────────────────────────┐
│                   WHICH PATTERN SHOULD I USE?                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Is the task a simple question?                                 │
│  ├── YES → Single Agent (oracle, librarian)                    │
│  │                                                              │
│  └── NO → Are requirements clear?                               │
│           ├── NO → Interview-First Pattern                      │
│           │                                                     │
│           └── YES → Is it a single focused task?                │
│                     ├── YES → Single Agent (executor, planner)  │
│                     │                                           │
│                     └── NO → Are subtasks independent?          │
│                               ├── YES → Parallel Workers        │
│                               │                                 │
│                               └── NO → Does it need checkpoints?│
│                                        ├── YES → Chief-of-Staff │
│                                        └── NO → SDD Pipeline    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Decision Factors

| Factor | Recommendation |
|--------|---------------|
| **Simple question** | Single agent (oracle/librarian) |
| **Unclear requirements** | Interview-first |
| **New feature** | SDD Pipeline |
| **Multiple independent tasks** | Parallel Workers |
| **Complex multi-step** | Chief-of-Staff |
| **Cross-session memory** | Self-Learning hooks |
| **Worker dependencies** | Swarm coordination |

---

## With vs Without Swarm

### Without Swarm (Simpler)

```typescript
// Sequential execution, no coordination overhead
const spec = await skill_agent({ ... });
const plan = await skill_agent({ ..., context: { spec } });
const result = await skill_agent({ ..., context: { plan } });
```

**Pros:**
- Simpler setup
- No infrastructure needed
- Good for single-person workflows

**Cons:**
- Sequential only
- No parallel execution
- No inter-agent communication

### With Swarm (Powerful)

```typescript
// Parallel execution with coordination
await swarmmail_init('coordinator');
const { task_ids } = await skill_spawn_batch({ tasks: [...] });
// Workers communicate via SwarmMail
const results = await skill_gather({ task_ids });
```

**Pros:**
- Parallel execution
- Worker coordination
- Real-time communication
- Assumption tracking

**Cons:**
- More complex setup
- Requires SwarmMail infrastructure
- Overhead for simple tasks

---

## Summary

| Use Case | Pattern | Swarm |
|----------|---------|-------|
| Quick advice | Single Agent | ❌ |
| Unclear request | Interview-First | ❌ |
| New feature | SDD Pipeline | Optional |
| Bug investigation | Explore → Oracle → Fix | ❌ |
| Parallel refactor | Worker Fleet | ✅ |
| Complex project | Chief-of-Staff | ✅ |
| Cross-session memory | Self-Learning | ❌ |
| Multi-domain epic | Full Swarm | ✅ |
