---
name: opencode-plugin
description: Hybrid skill for OpenCode plugin development - behavioral patterns for agents and technical reference for humans
---

# OpenCode Plugin Development

A comprehensive guide to developing OpenCode plugins. This skill provides behavioral patterns for agents and technical reference for humans building event-driven plugins.

## Quick Start

### For Agents

When asked to create or modify an OpenCode plugin:

1. **Identify the goal**: What behavior does this plugin add?
2. **Select hooks**: Choose lifecycle events that match the goal
   - Validation: `tool.execute.before`
   - Logging: `tool.execute.after`
   - Notifications: `session.idle`
   - Context optimization: `experimental.session.compacting`
   - File post-processing: `file.edited`
3. **Create structure**: TypeScript module with `Plugin` type
4. **Implement hooks**: Mutate `output` parameter in-place
5. **Test manually**: Place in `.opencode/plugin/` and reload OpenCode

### For Humans

1. **Install types**: `bun add @opencode-ai/plugin`
2. **Create file**: `.opencode/plugin/my-plugin.ts`
3. **Import type**: `import type { Plugin } from "@opencode-ai/plugin"`
4. **Export plugin**: `export const MyPlugin: Plugin = async (ctx) => { ... }`
5. **Place hooks in return**: `return { "tool.execute.before": ... }`
6. **Reload OpenCode**: Plugin auto-discovers via Bun.Glob

---

## Plugin Structure

### Basic Template

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")

  return {
    // Hook implementations go here
  }
}
```

### Context Object Properties

| Property | Type | Usage |
|-----------|-------|--------|
| `project` | object | Current project metadata |
| `directory` | string | Current working directory |
| `worktree` | string | Git worktree path |
| `client` | SDKClient | Interact with OpenCode AI (API not documented) |
| `$` | Bun.$ | Execute shell commands cross-platform |

**Key Pattern:** Use `$` for OS-specific operations (e.g., `osascript` on macOS for notifications).

### Hook Return Pattern

```typescript
return {
  // Event-based hooks
  event: async ({ event }) => { ... },

  // Lifecycle hooks
  "tool.execute.before": async (input, output) => {
    // Mutate output object directly
    output.args = { ... }
  },

  // Custom tools
  tool: {
    myTool: tool({
      description: "...",
      args: { foo: tool.schema.string() },
      async execute(args, ctx) { return "..." }
    })
  }
}
```

**CRITICAL:** Hooks mutate `output` in-place. They do not return values.

---

## Event System

### Event Categories

#### Tool Events
- `tool.execute.before` - Intercept and validate tool arguments
- `tool.execute.after` - Log or post-process tool results

#### Session Events
- `session.created` - New session started
- `session.compacted` - Context optimized
- `session.idle` - Session inactive
- `session.updated` - Session state changed
- `session.deleted` - Session removed

#### File Events
- `file.edited` - File modified
- `file.watcher.updated` - File watcher triggered

#### Message Events
- `message.updated` - Message changed
- `message.removed` - Message deleted
- `message.part.updated` - Message part changed

#### Permission Events
- `permission.replied` - User responded to permission request
- `permission.updated` - Permission state changed

#### Experimental Events
- `experimental.session.compacting` - Before context compaction (inject context or replace prompt)

**Full list (20+ events):** See official docs or `knowledge/opencode-plugins.md`

---

## Common Patterns

### Pattern 1: Security Protection

**Use Case:** Prevent access to sensitive files or commands.

```typescript
export const SecurityPlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      // Block .env file reads
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }

      // Validate git operations
      if (input.tool === "bash" && output.args.command.includes("rm -rf")) {
        throw new Error("Dangerous command blocked")
      }
    },
  }
}
```

**Key Insight:** Throw errors to prevent execution.

---

### Pattern 2: Logging and Telemetry

**Use Case:** Track tool usage or session metrics.

```typescript
export const LoggingPlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.after": async (input, output) => {
      const timestamp = new Date().toISOString()
      const logEntry = `[${timestamp}] ${input.tool}: ${output.output?.substring(0, 50)}...`

      // Append to log file
      await ctx.$`echo ${logEntry} >> /tmp/opencode-tools.log`
    },

    session: async ({ event }) => {
      if (event.type === "session.created") {
        await ctx.$`echo "Session started: ${event.sessionID}" >> /tmp/opencode-sessions.log`
      }
    },
  }
}
```

**Key Insight:** Use `tool.execute.after` to capture results after execution completes.

---

### Pattern 3: Notifications

**Use Case:** Alert user of long-running task completion.

```typescript
export const NotificationPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await ctx.$`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

**Key Insight:** Use shell API for OS-specific operations (osascript on macOS).

---

### Pattern 4: Context Optimization

**Use Case:** Reduce token usage by caching tool results.

```typescript
const cache = new Map<string, any>()

export const CachePlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      const cacheKey = JSON.stringify(input)

      if (cache.has(cacheKey)) {
        // Return cached result immediately
        output.output = JSON.stringify(cache.get(cacheKey))
        // Skip execution by throwing special error or setting flag
        throw new Error("__CACHED__")
      }
    },

    "tool.execute.after": async (input, output) => {
      const cacheKey = JSON.stringify(input)
      try {
        const result = JSON.parse(output.output)
        cache.set(cacheKey, result)
      } catch {
        // Non-JSON output, skip caching
      }
    },
  }
}
```

**Key Insight:** Cache keys based on input parameters to detect unchanged inputs.

---

### Pattern 5: Custom Tools

**Use Case:** Add project-specific functionality.

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      deploy: tool({
        description: "Deploy current project to staging",
        args: {
          environment: tool.schema.enum(["staging", "production"])
        },
        async execute(args, { sessionID }) {
          const env = args.environment
          const deployCmd = `./scripts/deploy.sh ${env}`
          const result = await ctx.$`${deployCmd}`

          return `Deployed to ${env}:\n${result.stdout}`
        }
      }),

      test: tool({
        description: "Run project tests",
        args: {},
        async execute(args, ctx) {
          const result = await ctx.$`bun test`
          return `Test results:\n${result.stdout}`
        }
      })
    }
  }
}
```

**Key Insight:** Tools appear alongside built-ins. Use descriptive names and Zod validation.

---

### Pattern 6: Compaction Hooks

**Use Case:** Inject domain-specific context during session compaction.

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Append custom context to default compaction
      output.context.push(`
## Current Project Context

Project: ${ctx.project.name}
Framework: Next.js with TypeScript
Database: PostgreSQL via Prisma
Deploy target: Vercel

## Active Task

Currently working on: User authentication flow
Files modified: auth/*.ts
 blockers: None
`)
    },
  }
}
```

**Advanced Pattern:** Replace entire compaction prompt:

```typescript
export const CustomCompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Completely replace default prompt
      output.prompt = `You are generating a continuation prompt for a multi-agent swarm session.

Summarize:
1. The current task and its status
2. Which files are being modified and by whom
3. Any blockers or dependencies between agents
4. The next steps to complete work

Format as a structured prompt that a new agent can use to resume work.`
    },
  }
}
```

**Key Insight:** When `output.prompt` is set, `output.context` is ignored.

---

## Agent Behavioral Guidelines

### Hook Selection Strategy

**Ask yourself:**

1. **When does this behavior need to trigger?**
   - Before action → `tool.execute.before`
   - After action → `tool.execute.after`
   - On session change → `session.*`
   - On file change → `file.*`

2. **What needs to happen?**
   - Block/validate → throw error or modify args
   - Log/track → write to file or external service
   - Modify behavior → mutate output
   - Add capability → implement in `tool` object

3. **Is this a one-time or ongoing operation?**
   - One-time → Hook into `session.created`
   - Ongoing → Hook into tool execution or file events

### Error Handling

**Pattern:** Wrap hook execution in try-catch for graceful degradation:

```typescript
return {
  "tool.execute.before": async (input, output) => {
    try {
      // Validate or modify
      if (shouldBlock(input)) {
        throw new Error("Operation blocked")
      }
    } catch (error) {
      console.error("Hook error:", error)
      // Continue execution (let OpenCode handle original error)
      // OR set output.error = "Custom error message"
    }
  }
}
```

**Unknown:** How hook errors affect event pipeline (research gap).

### Performance Optimization

**Strategies:**

1. **Cache results** (Pattern 4)
2. **Batch shell commands:** Combine multiple operations
3. **Async processing:** Use `Promise.all` for parallel operations
4. **Avoid redundant hooks:** Check if behavior already implemented by another plugin

### Tool Creation Best Practices

1. **Single responsibility:** Each tool does one thing well
2. **Descriptive names:** `deploy-staging` not `ds`
3. **Zod validation:** Always validate arguments
4. **Clear error messages:** Help LLM understand failures
5. **Use abort signal:** Support cancellation for long operations

```typescript
async execute(args, { abort }) {
  if (abort.aborted) throw new Error("Operation cancelled")

  // Long operation with abort check
  for (const item of items) {
    if (abort.aborted) throw new Error("Operation cancelled")
    await processItem(item)
  }

  return "Completed"
}
```

---

## Human Technical Reference

### File Locations

- **Project plugins:** `.opencode/plugin/*.ts`
- **Global plugins:** `~/.config/opencode/plugin/*.ts`
- **Discovery:** Automatic via Bun.Glob on OpenCode startup

### TypeScript Types

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

// Plugin type ensures correct structure
export const MyPlugin: Plugin = async (ctx) => {
  // Type-safe context access
  const { project, client, $, directory, worktree } = ctx

  // Type-safe hook definitions
  return {
    "tool.execute.before": async (input, output) => {
      // input: { tool: string, ... }
      // output: { args: any, ... }
    }
  }
}

// Tool helper provides Zod schema
tool.schema = z  // Zod instance for validation
```

### Testing

**Current State:** No official testing framework.

**Manual Testing:**
1. Place plugin in `.opencode/plugin/`
2. Reload OpenCode (auto-discovers via Bun.Glob)
3. Trigger events (run commands, edit files, etc.)
4. Check console logs for plugin initialization
5. Monitor behavior to verify hook execution

**Recommended:** Apply `testing-patterns` skill for:
- Characterization tests to document behavior
- Mock OpenCode events for unit testing
- Integration testing with real OpenCode instance

### Debugging

**Techniques:**

1. **Console logging in plugin function:**
   ```typescript
   export const DebugPlugin: Plugin = async (ctx) => {
     console.log("Plugin loaded!", ctx.project)
     return { ... }
   }
   ```

2. **Log hook parameters:**
   ```typescript
   "tool.execute.before": async (input, output) => {
     console.log("Tool before:", JSON.stringify(input, null, 2))
   }
   ```

3. **Test shell commands:**
   ```typescript
   const result = await ctx.$`echo "test"`
   console.log("Shell result:", result.stdout, result.stderr, result.exitCode)
   ```

4. **Simplify configuration:**
   - Disable other plugins
   - Use minimal agent configuration
   - Test with built-in tools only

### Distribution

**Not documented.** Inferred patterns:

1. **npm package:**
   ```json
   {
     "name": "opencode-my-plugin",
     "version": "1.0.0",
     "main": "plugin.ts"
   }
   ```
   Install via `opencode.json` → `plugin: ["opencode-my-plugin@1.0.0"]`

2. **Filesystem:** Copy `.opencode/plugin/` directory

3. **Git repository:** Clone into project

---

## Advanced Topics

### Multiple Plugins

Multiple plugins can hook into the same event. Execution order is not documented (research gap).

**Pattern:** Use descriptive plugin names and unique hook implementations.

```typescript
export const Plugin1: Plugin = async (ctx) => ({
  "tool.execute.before": async (input, output) => {
    console.log("Plugin1 before:", input.tool)
  }
})

export const Plugin2: Plugin = async (ctx) => ({
  "tool.execute.before": async (input, output) => {
    console.log("Plugin2 before:", input.tool)
  }
})
```

### Plugin Communication

**No direct plugin-to-plugin API documented.** Workarounds:

1. **File-based communication:** Write to shared file
2. **SDK client:** (API not documented)
3. **External service:** Use database or message queue

### SDK Client Usage

**Gap:** Client API methods are not documented in official docs.

**Inferred from examples:**
- May support sending messages
- May support session management
- May support configuration access

**Recommendation:** Inspect `packages/opencode/src/plugin/index.ts` in main repo for API details.

---

## Known Gaps and Limitations

### Documentation Gaps

1. **SDK client API** - Methods unknown, limits AI interaction
2. **Error handling** - How hook errors affect pipeline unclear
3. **Event ordering** - Synchronous or asynchronous execution?
4. **Hook ordering** - Multiple plugins, same event - which runs first?
5. **Performance** - Overhead of multiple plugins?
6. **Testing** - No test framework or utilities
7. **Debugging** - No event inspector or mock generators

### System Limitations

1. **No plugin sandboxing** - Plugins run in same process
2. **No hot reload** - Not documented, unclear if supported
3. **No plugin isolation** - One plugin crash could affect OpenCode
4. **Limited event context** - Some events have sparse input data

### Security Considerations

1. **Shell access:** `$` API allows arbitrary command execution
2. **File access:** No built-in file system restrictions
3. **Network access:** SDK client may make network calls
4. **Plugin trust:** Installing npm packages requires trust

**Best Practices:**
- Validate all inputs
- Restrict file paths (whitelist directories)
- Audit shell commands
- Review npm package source code

---

## Resources

### Official Documentation
- **Plugins:** https://opencode.ai/docs/plugins/ (updated 2025-12-24)
- **Ecosystem:** https://opencode.ai/docs/ecosystem/
- **Custom Tools:** https://opencode.ai/docs/custom-tools/
- **Main Repo:** https://github.com/sst/opencode

### Community Resources
- **Plugin Template:** https://github.com/zenobi-us/opencode-plugin-template/
- **YouTube Tutorial:** https://www.youtube.com/watch?v=Wu3G1QwM81M (11:25, 1.2K views)
- **Dev.to Article:** "Does OpenCode Support Hooks?" (2025-10-10)
- **Discord:** https://opencode.ai/discord

### Notable Plugins (16+ examples)
- `opencode-helicone-session` - Request grouping headers
- `opencode-skills` - Skill management
- `opencode-dynamic-context-pruning` - Token optimization
- `opencode-websearch-cited` - Native websearch
- `opencode-pty` - Background process support
- `opencode-wakatime` - Usage tracking
- `opencode-md-table-formatter` - MD table cleanup
- `opencode-morph-fast-apply` - Fast code editing

### Related Skills
- `skill-creator` - Plugin scaffolding
- `system-design` - Architecture principles
- `testing-patterns` - Testing strategies
- `context-optimization` - Token management

---

## Research Notes

Comprehensive research findings available in `research_notes.md`:
- 350+ lines of detailed analysis
- Event system documentation (20+ hooks)
- Real-world plugin patterns (6+ examples)
- Community ecosystem analysis (16+ plugins)
- Documentation gaps and recommendations
- Latest developments (Q4 2024 - Q4 2025)

**Last Updated:** 2025-12-26
