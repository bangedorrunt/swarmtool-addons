# Skill-Based Subagents

_Last Updated: 2025-12-28_

A guide to creating and using custom skill-based subagents via the `skill_agent` tool in OpenCode.

## Overview

Skill-based subagents enable you to package specialized AI expertise as reusable, on-demand workers that can be spawned by any agent through a unified tool interface. This follows the **Hybrid Delegator Pattern** from Phil Schmid's Context Engineering principles.

```
┌─────────────────────────────────────────────────────────────────┐
│                  Main Agent Session                        │
│                                                          │
│  Task: "Analyze code quality and security"              │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  skill_agent tool call                            │   │
│  │  { skill_name: "code-reviewer",              │   │
│  │    agent_name: "security-auditor",              │   │
│  │    prompt: "Analyze this file..." }            │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                        │
│                 ▼                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Subagent Session (Isolated)                     │   │
│  │  - Own context window                            │   │
│  │  - Specialized instructions                      │   │
│  │  - Tool permissions from SKILL.md               │   │
│  │  - Returns structured output                      │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                        │
│                 ▼                                        │
│  Structured result (JSON) → Main agent continues          │
└─────────────────────────────────────────────────────────────────┘
```

**Key Benefits:**

- **Context Partitioning**: Subagents get isolated contexts, reducing noise in coordinator
- **On-Demand Loading**: Instructions loaded only when needed (lazy evaluation)
- **API Cleanliness**: Single `skill_agent` tool interface for all subagents
- **Composability**: Combine multiple specialized agents for complex workflows

---

## The Hybrid Delegator Pattern

The `skill_agent` tool implements a **hybrid approach** that resolves agent definitions dynamically and spawns them via OpenCode's native `task` or `background_task` tools.

### Why "Hybrid"?

```
┌─────────────────────────────────────────────────────────────┐
│           Hybrid Delegator Architecture                 │
│                                                        │
│  ┌──────────────┐          ┌─────────────────┐     │
│  │  Discovery   │──────────▶│  Spawning      │     │
│  │  (Dynamic)   │          │  (Native)      │     │
│  └──────────────┘          └─────────────────┘     │
│         │                          │                   │
│         ▼                          ▼                   │
│  Load SKILL.md/.ts      Call task() or          │
│  from ~/.config/opencode/   background_task()        │
│  skill/<name>/agent/     via client             │
└─────────────────────────────────────────────────────────────┘
```

**Two-Layer Design:**

1. **Discovery Layer** (`loadSkillAgents`):
   - Scans `~/.config/opencode/skill/` directory
   - Parses both Markdown (`.md`) and TypeScript (`.ts`) agents
   - Builds registry of available `skill/agent` pairs

2. **Spawning Layer** (`skill_agent` tool):
   - Validates agent exists in registry
   - Calls OpenCode's native `task()` or `background_task()` tools
   - Returns structured JSON response (`{ success, output/taskId }`)

### Benefits Over Monolithic Agents

| Aspect                | Monolithic Agent                     | Skill-Based Subagent                       |
| --------------------- | ------------------------------------ | ------------------------------------------ |
| **Context Pollution** | All expertise mixed in one prompt    | Each subagent has minimal, focused context |
| **Maintenance**       | Change affects all functionality     | Isolated updates per skill                 |
| **Testability**       | Hard to test individual capabilities | Each agent testable independently          |
| **Parallelism**       | Sequential (one agent)               | Parallel spawns for independent tasks      |
| **Reusability**       | Hard to reuse across projects        | Drop-in skills via directory               |

---

## Directory Structure

Skill-based agents follow the OpenCode standard layout:

```
~/.config/opencode/skill/
└── <skill-name>/              # Top-level skill directory
    ├── SKILL.md             # Main skill instructions (optional)
    ├── agents/               # Agent definitions (preferred)
    │   └── <agent-name>/
    │       ├── SKILL.md     # Markdown agent definition
    │       └── index.ts     # TypeScript agent definition (optional)
    └── agent/               # Alternative singular directory name
        └── <agent-name>/
            └── SKILL.md     # Markdown agent definition
```

**Naming Rules:**

- **Skill name**: Use kebab-case (e.g., `code-reviewer`, `data-analyzer`)
- **Agent name**: Use kebab-case within skill (e.g., `security-auditor`, `performance-profiler`)
- **Full agent path**: `skill_name/agent_name` (e.g., `code-reviewer/security-auditor`)

### Supported Agent Formats

The loader discovers agents in three ways:

| Format                   | Location                    | File           | Example                                                                   |
| ------------------------ | --------------------------- | -------------- | ------------------------------------------------------------------------- |
| **Structured Directory** | `<skill>/agents/<agent>/`   | `SKILL.md`     | `~/.config/opencode/skill/code-reviewer/agents/security-auditor/SKILL.md` |
| **Flattened Markdown**   | `<skill>/agents/<agent>.md` | Direct file    | `~/.config/opencode/skill/code-reviewer/agents/quick-check.md`            |
| **TypeScript Module**    | `<skill>/agents/<agent>.ts` | Dynamic import | `~/.config/opencode/skill/code-reviewer/agents/advanced.ts`               |

**Priority:**

1. Directory + `SKILL.md` (preferred for organization)
2. Direct `.md` file (quick prototypes)
3. `.ts` module (complex logic)

---

## Creating a Markdown Agent

Markdown agents provide a low-barrier authoring experience using YAML frontmatter and plain instructions.

### Example: Code Security Auditor

```markdown
---
name: security-auditor
description: Analyzes code for security vulnerabilities and compliance issues
model: opencode/grok-code
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

You are a security expert specializing in code vulnerability analysis.

## Your Mission

Analyze the provided code for security issues and provide actionable recommendations.

## What You Must Deliver

Every analysis MUST include:

### 1. Executive Summary

Brief overview (2-3 sentences) of security posture:

- Overall risk level: Critical/High/Medium/Low/None
- Most severe vulnerability found

### 2. Vulnerabilities Found

<issues>
**Severity: [CRITICAL/HIGH/MEDIUM/LOW]**
- **Type**: [OWASP category]
- **Location**: [File:line or description]
- **Impact**: [What could happen if exploited]
- **Remediation**: [Concrete fix steps]

**Severity: [CRITICAL/HIGH/MEDIUM/LOW]**
...
</issues>

### 3. Compliance Checklist

<compliance>
- [ ] Input validation present
- [ ] Output encoding correct
- [ ] Auth/authorization checks exist
- [ ] SQL injection protected
- [ ] XSS prevention present
</compliance>

## Success Criteria

- All vulnerabilities are real and actionable
- False positives are minimized
- Remediation steps are concrete and tested
- Severity assessment matches industry standards

## Constraints

- **Read-only**: Cannot create/modify files
- **Evidence-based**: Every claim references actual code
- **Prioritize**: Critical > High > Medium > Low
```

**File Location:** `~/.config/opencode/skill/code-reviewer/agents/security-auditor/SKILL.md`

### YAML Frontmatter Fields

| Field         | Required                      | Description                                                           | Example |
| ------------- | ----------------------------- | --------------------------------------------------------------------- | ------- |
| `name`        | ✓ (required in SKILL.md body) | Agent identifier (`security-auditor`)                                 |
| `description` | ✗                             | Human-readable summary (`Analyzes code for security vulnerabilities`) |
| `model`       | ✗                             | Preferred OpenCode model (`opencode/grok-code`)                       |
| `temperature` | ✗                             | Sampling parameter, 0.0-1.0 (`0.1` for precise tasks)                 |
| `tools`       | ✗                             | Tool access control map (`{ write: false, edit: true }`)              |

---

## Creating a TypeScript Agent

TypeScript agents provide full programmatic control for complex workflows.

### Example: Advanced Data Processor

```typescript
// ~/.config/opencode/skill/data-processor/agents/advanced.ts
export interface AgentConfig {
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  tools?: Record<string, boolean>;
  prompt: string;
}

const advancedAgent: AgentConfig = {
  name: 'data-processor/advanced',
  description: 'Processes complex datasets with statistical analysis',
  model: 'opencode/grok-code',
  temperature: 0.3,
  tools: {
    write: true,
    edit: true,
    bash: true,
  },
  prompt: `
You are an advanced data analyst with expertise in statistical processing.

## Your Workflow

1. **Input Validation**: Verify data format and structure
2. **Statistical Analysis**: Calculate mean, median, std dev, outliers
3. **Trend Detection**: Identify patterns and anomalies
4. **Report Generation**: Create visual summaries and recommendations

## Output Format

Always return JSON:
\`\`\`json
{
  "summary": "...",
  "statistics": { ... },
  "outliers": [ ... ],
  "recommendations": [ ... ]
}
\`\`\`
`,
};

export default advancedAgent;
export { advancedAgent as agent };
```

**File Location:** `~/.config/opencode/skill/data-processor/agents/advanced.ts`

**Discovery:** Loader uses dynamic `import()` to resolve `default` or named `agent` export.

### When to Use TypeScript vs Markdown

| Scenario                            | Recommended Format | Why                              |
| ----------------------------------- | ------------------ | -------------------------------- |
| Simple prompts, linear instructions | Markdown           | Low barrier, easy to edit        |
| Requires conditional logic          | TypeScript         | Full programming capability      |
| Dynamic behavior based on input     | TypeScript         | Can compute at runtime           |
| Complex multi-step workflows        | TypeScript         | Better code organization         |
| Quick prototype                     | Markdown           | No compilation, faster iteration |
| Production-grade reliability        | TypeScript         | Type safety, testable            |

---

## Using the skill_agent Tool

### Tool Signature

```typescript
skill_agent({
  skill_name: string,      // e.g., "code-reviewer"
  agent_name: string,      // e.g., "security-auditor"
  prompt: string,         // Task description for subagent
  run_in_background?: boolean // Optional: spawn in background (default: false)
})
```

### Returns

**Success (foreground):**

```json
{
  "success": true,
  "output": "Agent response here..."
}
```

**Success (background):**

```json
{
  "success": true,
  "taskId": "task-123-abc-456"
}
```

**Error (agent not found):**

```json
{
  "success": false,
  "error": "AGENT_NOT_FOUND",
  "message": "Agent 'nonexistent' not found in skill 'code-reviewer'. Available agents in this skill: security-auditor, performance-profiler"
}
```

**Error (spawn failed):**

```json
{
  "success": false,
  "error": "SPAWN_FAILED",
  "message": "Network error: Could not contact agent service"
}
```

### Usage Examples

#### Example 1: Foreground Execution (Blocking)

```
Agent: I need a security audit of this authentication code.

Tool Call:
skill_agent({
  skill_name: "code-reviewer",
  agent_name: "security-auditor",
  prompt: "Analyze the authentication module in src/auth.ts for vulnerabilities. Focus on SQL injection, XSS, and auth bypass vectors."
})

// Blocks until subagent completes, then returns output
```

#### Example 2: Background Execution (Non-Blocking)

```
Agent: Kick off multiple analyses in parallel.

Tool Call 1:
skill_agent({
  skill_name: "code-reviewer",
  agent_name: "security-auditor",
  prompt: "Audit auth.ts for security issues",
  run_in_background: true
})
// Returns: { success: true, taskId: "task-abc123" }

Tool Call 2:
skill_agent({
  skill_name: "code-reviewer",
  agent_name: "performance-profiler",
  prompt: "Profile db.ts for bottlenecks",
  run_in_background: true
})
// Returns: { success: true, taskId: "task-def456" }

// Both run concurrently; agent can check status later
```

#### Example 3: Error Handling

```
Agent: I need to validate this API design.

Tool Call:
skill_agent({
  skill_name: "api-designer",
  agent_name: "nonexistent-validator",
  prompt: "Validate the REST API specification"
})

// Error response provides available agents for correction
Response:
{
  "success": false,
  "error": "AGENT_NOT_FOUND",
  "message": "Agent 'nonexistent-validator' not found in skill 'api-designer'. Available agents in this skill: spec-validator, schema-generator"
}

// Agent can retry with correct agent name
```

---

## Context Partitioning Benefits

The Hybrid Delegator Pattern enables massive context savings by isolating subagent sessions.

### Without Skill-Based Agents (Monolithic)

```
┌────────────────────────────────────────────────────────────┐
│         Monolithic Agent Context (128k tokens)        │
│                                                      │
│  [General coding] [Security expertise] [Performance]    │
│  [Testing] [Documentation] [Review skills] ...        │
│                                                      │
│  → Context dilutes each capability                      │
│  → Hard to maintain all expertise in one prompt        │
│  → Re-prompting for complex tasks                   │
└────────────────────────────────────────────────────────────┘
```

### With Skill-Based Subagents (Partitioned)

```
┌────────────────────────────────────────────────────────────┐
│              Main Agent (32k tokens)                │
│                                                      │
│  [Task orchestration] [Result aggregation]              │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │ Subagent 1  │  │ Subagent 2  │  │ Subagent 3│  │
│  │ 8k tokens   │  │ 8k tokens   │  │ 8k tokens │  │
│  │ (Security)   │  │ (Performance) │  │ (Testing)  │  │
│  └─────────────┘  └─────────────┘  └──────────┘  │
│                                                      │
│  → Each subagent gets minimal, focused context          │
│  → Main agent coordinates, doesn't do expertise        │
│  → 4x parallel execution possible                     │
└────────────────────────────────────────────────────────────┘
```

**Quantitative Benefits:**

| Metric                 | Monolithic       | Skill-Based    | Improvement      |
| ---------------------- | ---------------- | -------------- | ---------------- |
| **Context per agent**  | 128k tokens      | 8k tokens      | 16x reduction    |
| **Expertise dilution** | High (mixed)     | None (focused) | 100% elimination |
| **Maintenance scope**  | All capabilities | Single agent   | Targeted updates |
| **Parallel potential** | Sequential       | Concurrent     | Nx speedup       |

---

## API Cleanliness (System Design Principles)

The `skill_agent` tool follows deep module design principles from the `system-design` skill:

### Deep Module Interface

**Simple interface, rich functionality:**

```typescript
// Surface: Single tool with 4 parameters
skill_agent(skill_name, agent_name, prompt, run_in_background?)

// Hidden: Discovery, validation, spawning, error handling
```

**Benefits:**

- **Small surface area**: Easy to remember, hard to misuse
- **Encapsulated complexity**: Users don't need to know about loader internals
- **Progressive disclosure**: Basic usage works immediately, optional params available

### Information Hiding

Users interact with a single tool interface. Implementation details are hidden:

| Hidden Complexity               | Handled Internally          |
| ------------------------------- | --------------------------- | ------------------- |
| Agent discovery from filesystem | `loadSkillAgents()`         |
| YAML frontmatter parsing        | `parseFrontmatter()`        |
| TypeScript dynamic imports      | `import()`                  |
| Native tool selection           | `client.call('task'         | 'background_task')` |
| Error message formatting        | Consolidated JSON responses |

**Result:** Changing loader internals doesn't break agent code.

### Define Errors Away

Tool eliminates common error conditions by design:

| Potential Error       | How It's Avoided                            |
| --------------------- | ------------------------------------------- |
| Typing wrong path     | Explicit `skill_name/agent_name` syntax     |
| Ambiguous agent names | Discovery provides available agents list    |
| Blocking workflow     | `run_in_background` option for non-blocking |
| Unclear failures      | Structured JSON with error codes            |

---

## Best Practices

### 1. Keep Agents Focused

✅ **Good:** One clear mission per agent

```markdown
You analyze code for security vulnerabilities only.
```

❌ **Bad:** Mixed responsibilities

```markdown
You analyze security, write tests, generate docs, and refactor code.
```

### 2. Use Explicit Success Criteria

Define concrete deliverables that can be validated.

✅ **Good:**

```markdown
## Success Criteria

- Returns 3 vulnerability categories with severity
- Provides line-specific remediation steps
- Completes in < 30 seconds for typical files
```

❌ **Bad:**

```markdown
## Success Criteria

- Do a good job analyzing the code
```

### 3. Set Tool Permissions

Restrict agent capabilities to prevent unintended actions.

```yaml
---
tools:
  write: false # Read-only analysis
  edit: false # Can't modify files
  bash: false # No shell access
---
```

### 4. Validate Agent Discovery

Before relying on an agent, verify it's discoverable:

```bash
# List all skill-based agents
ls -R ~/.config/opencode/skill/

# Check specific skill's agents
ls ~/.config/opencode/skill/code-reviewer/agents/
```

### 5. Test in Isolation

Test each subagent independently before integrating into workflows.

```typescript
// Test skill_agent tool call
const result = await skill_agent({
  skill_name: 'code-reviewer',
  agent_name: 'security-auditor',
  prompt: 'Analyze this simple function for XSS vulnerabilities...',
});

expect(result.success).toBe(true);
expect(JSON.parse(result.output).summary).toBeDefined();
```

---

## Troubleshooting

### Agent Not Found

**Error:**

```json
{
  "success": false,
  "error": "AGENT_NOT_FOUND",
  "message": "Agent 'my-agent' not found in skill 'my-skill'."
}
```

**Solutions:**

1. **Check directory structure:**

   ```bash
   ls -la ~/.config/opencode/skill/my-skill/agents/
   ```

2. **Verify agent name matches filename:**
   - Directory: `my-skill/agents/my-agent/`
   - Call: `skill_name="my-skill", agent_name="my-agent"`

3. **Ensure SKILL.md exists:**
   ```bash
   cat ~/.config/opencode/skill/my-skill/agents/my-agent/SKILL.md
   ```

### Spawn Failed

**Error:**

```json
{
  "success": false,
  "error": "SPAWN_FAILED",
  "message": "Network error..."
}
```

**Solutions:**

1. Check OpenCode agent service is running
2. Verify agent name syntax (hyphens/underscores)
3. Review agent `model` configuration (ensure model is available)

### Context Overflow

**Symptom:** Subagent fails with "context length exceeded"

**Solutions:**

1. **Split task:** Use multiple smaller agents
2. **Reduce prompt:** Remove unnecessary instructions
3. **Use background tasks:** Process in parallel with smaller contexts

---

## Reference Implementation

The `skill_agent` tool is implemented in:

- **Tool Definition:** `src/opencode/agent/tools.ts`
- **Loader Logic:** `src/opencode/agent/loader.ts`
- **Plugin Registration:** `src/index.ts` (lines 16, 30, 39, 46)

**Key Functions:**

| Function                  | Location                           | Purpose                           |
| ------------------------- | ---------------------------------- | --------------------------------- |
| `createSkillAgentTools()` | `src/opencode/agent/tools.ts:11`   | Tool factory, takes client        |
| `loadSkillAgents()`       | `src/opencode/agent/loader.ts:130` | Discovers agents from SKILL_DIR   |
| `parseFrontmatter()`      | `src/opencode/agent/loader.ts:22`  | Extracts YAML frontmatter         |
| `parseAgentMarkdown()`    | `src/opencode/agent/loader.ts:87`  | Creates AgentConfig from SKILL.md |

**Integration Tests:**

- `src/opencode/agent/integration.test.ts` - End-to-end workflow
- `src/opencode/agent/tools.test.ts` - Tool behavior (482 lines, 30 tests)
- `src/opencode/agent/loader.test.ts` - Discovery logic

---

## Further Reading

- **AGENTS.md** - Module implementation guide
- **system-design** skill - Deep module principles
- **PLAN.md** - Architectural decisions (Hybrid Delegator Pattern)
- **MEMORY-LANE-SYSTEM.md** - Context compaction strategies

---

_This documentation follows the system-design principle: "Working code isn't enough. The goal is a great design that also works." The skill_agent tool prioritizes API simplicity while hiding discovery complexity._
