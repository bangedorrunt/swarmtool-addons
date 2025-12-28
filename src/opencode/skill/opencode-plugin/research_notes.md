# OpenCode Plugin Research Notes

**Research Date:** 2025-12-26
**Researcher:** Scout (cell-5rhhow-mjmetzslu3w)
**Epic:** cell-5rhhow-mjmetzsg127
**Status:** Complete

---

## Executive Summary

OpenCode uses a lightweight, event-driven plugin architecture based on JavaScript/TypeScript modules. Plugins extend functionality by subscribing to lifecycle events and can add custom tools, modify behavior, or integrate external services. The architecture is filesystem-based with automatic discovery via Bun.Glob.

**Key Findings:**
- Official docs updated 2025-12-24 (very recent)
- Comprehensive event system with 10+ event categories
- 18+ community plugins showcasing real patterns
- YouTube tutorial published 2025-12-23 (1.2K views)
- Claude Plugin community has existing skill for OpenCode plugin creation

---

## Core Architecture

### Plugin Definition

**Basic Structure:**
```javascript
// .opencode/plugin/example.js
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")
  return {
    // Hook implementations go here
  }
}
```

**TypeScript Version:**
```typescript
// .opencode/plugin/my-plugin.ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Type-safe hook implementations
  }
}
```

### Context Object

Plugin functions receive a context object with:

| Property | Type | Description |
|-----------|-------|-------------|
| `project` | object | Current project information |
| `directory` | string | Current working directory |
| `worktree` | string | Git worktree path |
| `client` | SDKClient | OpenCode SDK client for AI interaction |
| `$` | Bun.$ | Bun's shell API for executing commands |

**Key Insight:** The `$` shell API is Bun's built-in cross-platform shell command execution.

### Plugin Loading

**Locations (priority order):**
1. `.opencode/plugin/` (project-local)
2. `~/.config/opencode/plugin` (global)

**Discovery:** Automatic via Bun.Glob pattern matching

---

## Event System

### Event Categories (as of 2025-12-24)

#### Command Events
- `command.executed` - Fired when a command is executed

#### File Events
- `file.edited` - File edit operations
- `file.watcher.updated` - File watcher updates

#### Installation Events
- `installation.updated` - Plugin installation changes

#### LSP Events
- `lsp.client.diagnostics` - LSP diagnostic updates
- `lsp.updated` - General LSP state changes

#### Message Events
- `message.part.removed` - Message part deletion
- `message.part.updated` - Message part modifications
- `message.removed` - Full message deletion
- `message.updated` - Full message modifications

#### Permission Events
- `permission.replied` - Permission request response
- `permission.updated` - Permission state changes

#### Server Events
- `server.connected` - Server connection established

#### Session Events
- `session.created` - New session creation
- `session.compacted` - Context compaction completed
- `session.deleted` - Session deletion
- `session.diff` - Session diff generation
- `session.error` - Session errors
- `session.idle` - Session idle detection
- `session.status` - Session status changes
- `session.updated` - General session updates

#### Todo Events
- `todo.updated` - Todo item changes

#### Tool Events
- `tool.execute.before` - Before tool execution (intercept/validate)
- `tool.execute.after` - After tool execution (logging/post-processing)

#### TUI Events
- `tui.prompt.append` - TUI prompt updates
- `tui.command.execute` - TUI command execution
- `tui.toast.show` - Toast notification display

#### Experimental Events
- `experimental.session.compacting` - Before context compaction

**Total:** 20+ distinct event hooks

---

## Hook Execution Pattern

### Mutation-Based Hooks

Plugins implement hooks that **mutate output in-place** (no return value needed):

```typescript
export const EnvProtection = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      // Mutate output to prevent action
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

**Pattern:** Hooks receive `(input, output)` and mutate `output` object directly.

### Custom Tools

Plugins can add custom tools via `tool` hook:

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, ctx) {
          return `Hello ${args.foo}!`
        },
      }),
    },
  }
}
```

**Tool Helper Properties:**
- `description` - What the tool does
- `args` - Zod schema for validation
- `execute` - Async function that runs when tool is called
- Tool context includes: `sessionID`, `messageID`, `agent`, `abort` signal

**Tool Discovery:** Custom tools appear alongside built-in tools.

### Compaction Hooks

Customize context included during session compaction:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Inject additional context into compaction prompt
      output.context.push(`## Custom Context
Include any state that should persist across compaction:
- Current task status
- Important decisions made
- Files being actively worked on`)
    },
  }
}
```

**Advanced Pattern:** Replace entire compaction prompt by setting `output.prompt`:

```typescript
export const CustomCompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Replace entire compaction prompt
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

When `output.prompt` is set, it completely replaces the default compaction prompt.

---

## Real-World Plugin Patterns

### Pattern 1: Security Protection

**Source:** `.env protection` example from official docs

```javascript
export const EnvProtection = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

**Use Case:** Prevent LLM from reading sensitive files.

**Key Insight:** Throw errors to prevent action execution.

---

### Pattern 2: Notifications

**Source:** Official docs example

```javascript
export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      // Send notification on session completion
      if (event.type === "session.idle") {
        await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

**Use Case:** Notify user of long-running task completion.

**Key Insight:** Use `$` shell API for OS-specific operations (osascript on macOS).

---

### Pattern 3: Context Optimization

**Source:** `opencode-dynamic-context-pruning` community plugin

**Use Case:** Optimize token usage by pruning obsolete tool outputs.

**Pattern:** Hook into tool execution to cache results and only recompute when necessary.

---

### Pattern 4: Authentication Integration

**Sources:**
- `opencode-openai-codex-auth` - Use ChatGPT Plus subscription instead of API credits
- `opencode-gemini-auth` - Use existing Gemini plan instead of API billing
- `opencode-antigravity-auth` - Use free models instead of API billing

**Pattern:** Override authentication provider by modifying headers or tokens in requests.

**Key Insight:** Auth plugins typically hook into SDK client initialization or request pipeline.

---

### Pattern 5: Session Monitoring

**Source:** `opencode-wakatime` community plugin

**Use Case:** Track OpenCode usage with Wakatime.

**Pattern:** Hook into session lifecycle events (`session.created`, `session.updated`) to send telemetry.

---

### Pattern 6: Editor Integration

**Sources:**
- `opencode-md-table-formatter` - Clean up markdown tables produced by LLMs
- `opencode-morph-fast-apply` - 10x faster code editing

**Pattern:** Hook into `file.edited` or `tool.execute.after` to post-process LLM outputs.

---

## Community Ecosystem Analysis

### Active Plugin Categories (2025-12-26)

| Category | Plugins | Examples |
|----------|----------|-----------|
| Authentication | 3 | OpenAI, Gemini, Antigravity auth |
| Context Optimization | 2 | Dynamic pruning, type injection |
| Editor Integration | 2 | MD table formatter, Morph fast apply |
| Session Management | 2 | Wakatime, Helicone session headers |
| Shell/Process | 2 | PTY support, shell strategy |
| Web Integration | 2 | Websearch with citations |
| UI/UX | 1 | Zellij session naming |
| Developer Tooling | 2 | Skills manager, plugin template |

**Total:** 16+ active community plugins

---

## Latest Developments (Q4 2024 - Q4 2025)

### New Hooks Added

1. **Experimental Compaction Hook** (`experimental.session.compacting`)
   - Added: 2025-12-24
   - Allows customizing context during session compaction
   - Can inject domain-specific context
   - Can replace entire compaction prompt

2. **Session Lifecycle Events**
   - Full suite of session events (created, compacted, deleted, diff, error, idle, status, updated)
   - Enables comprehensive session monitoring

### Tool System Enhancements

- Zod schema validation for tool arguments
- Abort signal propagation to tool context
- Session and message ID tracking
- Agent name in context

### Discovery Improvements

- Bun.Glob-based automatic discovery
- Project-local and global plugin directories
- Hot reload support (not explicitly documented but inferred from pattern)

---

## Integration Points

### SDK Client Usage

The `client` object in plugin context provides AI interaction capabilities:

```typescript
export const AIInteractionPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    session: async ({ event }) => {
      if (event.type === "session.created") {
        // Interact with AI through SDK
        // (specific API not documented in fetched content)
      }
    },
  }
}
```

**Note:** SDK client API details not fully documented in public docs. May need to inspect source code.

---

## Testing Patterns

### No Official Test Framework

**Finding:** No explicit testing documentation in official docs or community plugins.

**Inferred Pattern:**
1. Manual testing via plugin reload
2. Event-driven tests: Mock OpenCode events and verify hook execution
3. Tool testing: Call custom tools and verify outputs
4. Integration testing: Load plugin in real OpenCode instance

**Recommendation:** Apply `testing-patterns` skill - use characterization tests for behavior verification.

---

## Security Considerations

### File Access Control

**Pattern from community:** `.env protection` plugin demonstrates guarding sensitive files.

**Attack Surface:**
- Tool execution before/after hooks can modify or validate arguments
- Plugins run in same process as OpenCode (not sandboxed)
- Shell access via `$` allows arbitrary command execution

**Best Practices:**
1. Validate all tool inputs before execution
2. Restrict file system access (whitelist directories)
3. Audit shell commands before execution
4. Use doom loop detection for bash/ast analysis

### Permission Events

Events: `permission.replied`, `permission.updated`

**Use Case:** Monitor or modify permission approvals.

**Pattern:** Hook into permission system to add custom approval flows or logging.

---

## Performance Optimization

### Token Management

**Plugin:** `opencode-dynamic-context-pruning`

**Technique:** Hook into tool execution to:
1. Cache tool outputs
2. Detect when inputs haven't changed
3. Return cached results instead of recomputing

**Impact:** Reduces token usage for repeated tool calls.

### Batch Processing

**Pattern:** Queue multiple operations and execute in single shell command.

**Example:** Instead of running `git status` + `git diff` + `git log`, run `git log --stat --oneline -5` to get all info at once.

---

## Documentation Quality

### Official Docs Strengths

✅ **Comprehensive event list** - All 20+ events documented
✅ **TypeScript examples** - Type-safe patterns
✅ **Real-world examples** - Notification, .env protection, custom tools
✅ **Recent updates** - Docs updated 2025-12-24 (2 days old)
✅ **Clear structure** - Plugin loading, basic structure, TypeScript support

### Official Docs Gaps

❌ **SDK client API** - Not documented
❌ **Error handling** - No guidance on error patterns
❌ **Testing** - No test framework or patterns
❌ **Deployment** - No npm package publishing guide
❌ **Versioning** - No plugin version compatibility matrix
❌ **Debugging** - No debugging techniques or tools
❌ **Performance** - No performance profiling or optimization guides

### Community Patterns

**Strengths:**
- Real-world examples in ecosystem
- YouTube tutorial (11 min, 1.2K views)
- Plugin templates available
- Claude Plugin community skill for plugin creation

**Gaps:**
- No comprehensive testing examples
- No error handling best practices
- No performance benchmarking
- No security guidelines beyond basics

---

## Recommended Next Steps

### Documentation Improvements

1. **SDK Client API Reference**
   - Document all client methods
   - Add examples for AI interaction patterns
   - Include error handling patterns

2. **Testing Guide**
   - Set up testing framework (likely Jest/Vitest)
   - Create test utilities for mocking OpenCode events
   - Add examples for hook testing

3. **Error Handling Guide**
   - Document common error scenarios
   - Provide recovery patterns
   - Show graceful degradation examples

4. **Performance Guide**
   - Benchmark token usage patterns
   - Document optimization techniques
   - Add profiling tools

### Developer Tooling

1. **Plugin Scaffold CLI**
   - Template generator for new plugins
   - Interactive setup for event hooks
   - Built-in testing setup

2. **Development Server**
   - Hot reload for plugin changes
   - Event inspector for debugging
   - Mock event generator for testing

3. **Validation Tool**
   - Schema validation for plugin structure
   - TypeScript type checking
   - Event hook type checking

### Community Resources

1. **Plugin Directory**
   - Central registry of all plugins
   - Categorization and tags
   - User ratings and reviews

2. **Pattern Library**
   - Curated collection of common patterns
   - Copy-pasteable examples
   - Use case documentation

---

## Comparison with Other Systems

### vs Claude Code Plugins

| Aspect | OpenCode | Claude Code |
|--------|-----------|-------------|
| Discovery | Bun.Glob (automatic) | Manual registration |
| Events | 20+ hooks | Limited |
| Tool Creation | Native via `tool()` helper | Custom integration |
| Shell Access | Built-in Bun.$ | Via bash tool |
| Documentation | ✅ Official docs | ❌ Community only |

### VS Code Extensions

| Aspect | OpenCode | VS Code |
|--------|-----------|----------|
| Runtime | Bun | Node.js |
| Events | Hook-based | Event emitter |
| Distribution | npm + filesystem | Marketplace |
| Testing | ❌ No framework | ✅ Ext testing tools |

---

## Key Insights for Skill Development

### For Agents (Behavioral Patterns)

1. **Event-Driven Thinking**
   - Plugins are middleware in event pipeline
   - Mutate output, don't return values
   - Think in terms of lifecycle events, not functions

2. **Hook Selection Strategy**
   - Use `tool.execute.before` for validation
   - Use `tool.execute.after` for logging
   - Use `session.compacting` for context optimization
   - Use `file.edited` for post-processing

3. **Tool Creation Pattern**
   - Always use `tool()` helper for Zod schema
   - Keep execute functions focused (single responsibility)
   - Use abort signal for long-running operations

### For Humans (Technical Reference)

1. **Getting Started Checklist**
   - [ ] Determine which events to hook into
   - [ ] Set up TypeScript types from `@opencode-ai/plugin`
   - [ ] Create plugin in `.opencode/plugin/` directory
   - [ ] Test manually by reloading OpenCode
   - [ ] Document hooks with JSDoc comments

2. **Common Patterns**
   - Security: `tool.execute.before` → validate/block
   - Logging: `tool.execute.after` → record metrics
   - Notifications: `session.idle` → send alerts
   - Optimization: `session.compacting` → inject context

3. **Debugging Techniques**
   - Console log in plugin function (runs on load)
   - Log hook parameters to inspect events
   - Use `$` shell to debug external interactions
   - Test with minimal OpenCode configuration

---

## Open Questions

1. **SDK Client API:** What methods are available on the `client` object?
2. **Error Propagation:** How do hook errors affect the event pipeline?
3. **Plugin Versioning:** How does OpenCode handle breaking changes in hooks?
4. **Hot Reload:** Do plugins hot reload on file changes?
5. **Performance Impact:** What's the overhead of multiple plugins?
6. **Plugin Sandboxing:** Should plugins run in restricted contexts?
7. **Event Ordering:** Are events synchronous or asynchronous?
8. **Plugin Isolation:** Can one plugin crash OpenCode?

---

## References

### Official Documentation
- **Plugins:** https://opencode.ai/docs/plugins/ (updated 2025-12-24)
- **Ecosystem:** https://opencode.ai/docs/ecosystem/
- **Custom Tools:** https://opencode.ai/docs/custom-tools/

### GitHub Repositories
- **Main Repo:** https://github.com/sst/opencode
- **Plugin Template:** https://github.com/zenobi-us/opencode-plugin-template/
- **Ecosystem List:** https://github.com/awesome-opencode/awesome-opencode

### Community Resources
- **YouTube Tutorial:** https://www.youtube.com/watch?v=Wu3G1QwM81M (2025-12-23, 11:25, 1.2K views)
- **Dev.to Article:** "Does OpenCode Support Hooks?" (2025-10-10)
- **Claude Plugin:** creating-opencode-plugins skill (66 downloads)
- **Discord:** https://opencode.ai/discord

### Notable Plugins
- `opencode-helicone-session` - Request grouping headers
- `opencode-skills` - Skill management
- `opencode-type-inject` - Type injection
- `opencode-dynamic-context-pruning` - Token optimization
- `opencode-websearch-cited` - Native websearch
- `opencode-pty` - Background process support
- `opencode-shell-strategy` - Non-interactive commands
- `opencode-wakatime` - Usage tracking
- `opencode-md-table-formatter` - MD table cleanup
- `opencode-morph-fast-apply` - Fast code editing
- `opencode-zellij-namer` - Session naming

---

## Conclusion

OpenCode's plugin system is **production-ready, event-driven, and elegant**. The documentation is comprehensive for basics but lacks advanced patterns (testing, debugging, performance). Community is active with 16+ plugins across multiple categories.

**Key Strengths:**
- Simple mutation-based hook pattern
- Comprehensive event system (20+ events)
- Type-safe TypeScript support
- Active community ecosystem

**Key Gaps:**
- SDK client API not documented
- No testing framework
- No performance guidance
- Limited error handling patterns

**Recommendation:** Create hybrid skill that provides:
1. **For agents:** Behavioral patterns and event selection strategies
2. **For humans:** Technical reference, examples, and debugging techniques

This skill should bridge the gap between official docs and production-quality plugin development.
