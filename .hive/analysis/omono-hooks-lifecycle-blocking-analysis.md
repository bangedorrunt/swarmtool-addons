# OMO vs NOC Hooks Lifecycle & Blocking Analysis

## Executive Summary

This analysis compares **Oh-My-OpenCode (OMO)** hooks with **Native OpenCode (NOC)** hooks, mapping lifecycle events, blocking mechanisms, tool modification capabilities, and event granularity.

---

## 1. Lifecycle Mapping

### OMO Events → NOC Equivalents

| OMO Event            | NOC Equivalent                    | Mapping Notes                                                                                          |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **PreToolUse**       | `tool.execute.before`             | ✅ Direct equivalent - intercepts before tool execution                                                |
| **PostToolUse**      | `tool.execute.after`              | ✅ Direct equivalent - intercepts after tool execution                                                 |
| **UserPromptSubmit** | `session.created` (partial)       | ⚠️ Partial match - UserPromptSubmit fires on every user message; `session.created` only on new session |
| **Stop**             | `session.idle` (partial)          | ⚠️ Partial match - Stop fires on session end; `session.idle` fires on inactivity                       |
| **PreCompact**       | `experimental.session.compacting` | ✅ Equivalent - both intercept before context compaction                                               |
| **SubagentStop**     | ❌ No direct equivalent           | ⚠️ NOC has no dedicated subagent lifecycle events                                                      |
| **Notification**     | `tui.toast.show`                  | ✅ Equivalent - both handle UI notifications                                                           |

### NOC Events Missing from OMO

| NOC Event                  | Description                         | Impact if Missing                                     |
| -------------------------- | ----------------------------------- | ----------------------------------------------------- |
| **session.created**        | Fires when a new session is created | ⚠️ Cannot implement "first-run" initialization logic  |
| **session.deleted**        | Fires when session is deleted       | ⚠️ Cannot implement cleanup on session deletion       |
| **session.diff**           | Fires when session state changes    | ⚠️ Cannot track state transitions                     |
| **session.status**         | Fires when session status changes   | ⚠️ Cannot implement status-based triggers             |
| **session.error**          | Fires on session errors             | ⚠️ Cannot implement error recovery logic              |
| **message.part.removed**   | Fires when message part is removed  | ⚠️ Cannot implement audit trails                      |
| **message.part.updated**   | Fires when message part is updated  | ⚠️ Cannot implement real-time monitoring              |
| **message.removed**        | Fires when message is removed       | ⚠️ Cannot implement message-level cleanup             |
| **message.updated**        | Fires when message is updated       | ⚠️ Cannot implement message re-processing             |
| **file.edited**            | Fires when file is edited (direct)  | ⚠️ Cannot hook into direct file edits (outside tools) |
| **file.watcher.updated**   | Fires when file watcher updates     | ⚠️ Cannot implement live file monitoring              |
| **command.executed**       | Fires when any command executes     | ⚠️ Cannot implement command-level logging             |
| **installation.updated**   | Fires on installation changes       | ⚠️ Cannot implement installation-aware hooks          |
| **lsp.client.diagnostics** | Fires on LSP diagnostic updates     | ⚠️ Cannot implement IDE-level diagnostics hooks       |
| **lsp.updated**            | Fires on LSP updates                | ⚠️ Cannot implement LSP-aware features                |
| **permission.replied**     | Fires on permission responses       | ⚠️ Cannot implement permission tracking               |
| **permission.updated**     | Fires on permission updates         | ⚠️ Cannot implement permission management             |
| **server.connected**       | Fires when server connects          | ⚠️ Cannot implement connection-aware hooks            |
| **todo.updated**           | Fires when todo items update        | ⚠️ Cannot implement todo-driven workflows             |
| **tui.prompt.append**      | Fires on TUI prompt updates         | ⚠️ Cannot implement TUI customization                 |
| **tui.command.execute**    | Fires on TUI command execution      | ⚠️ Cannot implement TUI-level extensions              |

### OMO Events Missing from NOC

| OMO Event                    | Description                                | Impact if Missing                                                 |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| **UserPromptSubmit** (exact) | Fires before processing every user message | ⚠️ Cannot implement memory injection BEFORE user sees response    |
| **Stop** (exact session end) | Fires on explicit session termination      | ⚠️ Cannot distinguish between user-initiated stop vs idle timeout |

---

## 2. Synchronous Blocking Mechanisms

### OMO Blocking Mechanism

**Shell Exit Codes:**

```typescript
// OMO hook returns exit code to signal block
if (shouldBlock) {
  process.exit(1); // Block execution
} else {
  process.exit(0); // Allow execution
}
```

**Characteristics:**

- **Blocking:** Synchronous - tool execution halts until hook completes
- **Control:** Exit code determines allow/block (0 = allow, non-zero = block)
- **Message:** STDERR/STDOUT contains blocking reason
- **Timeouts:** Configurable timeout (default: 10s, can override)
- **Granularity:** Can block specific tools via regex matcher

**Example OMO Block:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx ruv-swarm hook pre-edit --file '${tool.params.file_path}'"
          }
        ]
      }
    ]
  }
}
```

### NOC Blocking Mechanism

**Async JavaScript Returns:**

```typescript
// NOC hook returns modified output or throws to block
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath.includes(".env")) {
    throw new Error("Do not read .env files"); // Block execution
  }
  // Allow execution
  return { output }; // or modify: { output: { args: modifiedArgs } }
}
```

**Characteristics:**

- **Non-blocking by default:** Async hooks don't halt execution unless they throw
- **Control:** Throw error to block, modify `output` object to redirect/modify
- **Granularity:** Can intercept specific tools or all tools
- **Timeouts:** No explicit timeout mechanism (relies on async function timeout)
- **Event-based:** Hooks are event listeners, not synchronous gatekeepers

**Example NOC Block:**

```typescript
export const EnvProtection = async ({ project, client, $, directory, worktree }) => {
  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool === 'read' && output.args.filePath.includes('.env')) {
        throw new Error('Do not read .env files'); // Block
      }
    },
  };
};
```

### Blocking Comparison

| Aspect                   | OMO                                 | NOC                         | Winner              |
| ------------------------ | ----------------------------------- | --------------------------- | ------------------- |
| **Synchronous vs Async** | Synchronous (exit code)             | Async (throw/return)        | NOC (more flexible) |
| **Blocking Guarantee**   | ✅ Guaranteed block (non-zero exit) | ✅ Guaranteed block (throw) | Tie                 |
| **Timeout Control**      | ✅ Configurable timeout             | ❌ No explicit timeout      | OMO (safer)         |
| **Blocking Reason**      | STDERR/STDOUT output                | Error message object        | NOC (structured)    |
| **Performance Impact**   | ⚠️ Process spawn overhead           | ✅ In-memory throw/return   | NOC (faster)        |
| **Error Handling**       | Process exit (fatal)                | Async error (catchable)     | NOC (graceful)      |

---

## 3. Tool Modification Capabilities

### Can Both Systems Cancel Tool Calls?

**OMO: Yes (via exit code)**

```bash
# PreToolUse hook
if [[ "$CLAUDE_TOOL" =~ ^(Write|Edit|MultiEdit)$ ]]; then
  if ! check_compliance "$CLAUDE_FILE_PATH"; then
    echo "ERROR: File violates style guide" >&2
    exit 1  # Block tool execution
  fi
fi
```

**NOC: Yes (via throw error)**

```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === "write" && violatesStyle(output.args.filePath)) {
    throw new Error("File violates style guide"); // Block tool
  }
}
```

### Can Both Systems Redirect Tool Calls?

**OMO: Limited (via environment variable injection)**

```bash
# PostToolUse hook
# Can modify context for NEXT tool, but cannot redirect CURRENT tool
export CUSTOM_TOOL_ARGS="--modified"
```

**NOC: Yes (via output modification)**

```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === "search") {
    // Modify search query
    output.args.query = `${output.args.query} site:github.com`;
    return { output }; // Redirect/modify
  }
}
```

### Comparison

| Capability                       | OMO                    | NOC                            | Notes                      |
| -------------------------------- | ---------------------- | ------------------------------ | -------------------------- |
| **Cancel execution**             | ✅ Exit code 1         | ✅ Throw error                 | Both support               |
| **Redirect tool**                | ⚠️ Indirect (env vars) | ✅ Direct (modify output.args) | NOC superior               |
| **Modify tool params**           | ⚠️ Indirect            | ✅ Direct                      | NOC superior               |
| **Chain multiple modifications** | ❌ No                  | ✅ Yes (async pipeline)        | NOC superior               |
| **Conditional modification**     | ✅ Bash scripting      | ✅ TypeScript logic            | Tie (different approaches) |

---

## 4. Event Granularity Analysis

### NOC: 25+ Events Across 8 Categories

```
Command Events:
  - command.executed

File Events:
  - file.edited
  - file.watcher.updated

Installation Events:
  - installation.updated

LSP Events:
  - lsp.client.diagnostics
  - lsp.updated

Message Events:
  - message.part.removed
  - message.part.updated
  - message.removed
  - message.updated

Permission Events:
  - permission.replied
  - permission.updated

Server Events:
  - server.connected

Session Events:
  - session.created
  - session.compacted
  - session.deleted
  - session.diff
  - session.error
  - session.idle
  - session.status
  - session.updated

Todo Events:
  - todo.updated

Tool Events:
  - tool.execute.after
  - tool.execute.before

TUI Events:
  - tui.prompt.append
  - tui.command.execute
  - tui.toast.show
```

**Total NOC Events:** ~25 events

### OMO: ~6-8 Events (based on GitHub references)

```
Core Events:
  - PreToolUse
  - PostToolUse
  - UserPromptSubmit
  - Stop
  - PreCompact
  - Idle
  - SubagentStop
  - Notification
```

**Total OMO Events:** ~6-8 events

### Missing Events Impact

| Category              | NOC Events       | OMO Coverage                  | Gap Analysis                                     |
| --------------------- | ---------------- | ----------------------------- | ------------------------------------------------ |
| **Tool lifecycle**    | 2 (before/after) | ✅ 2 (PreToolUse/PostToolUse) | ✅ **Full coverage**                             |
| **Session lifecycle** | 6                | ⚠️ 2-3 (Stop/Idle)            | ⚠️ **Partial - missing created/deleted/error**   |
| **Message lifecycle** | 4                | ❌ 0                          | ❌ **Critical gap** - no message-level events    |
| **File operations**   | 2                | ❌ 0                          | ❌ **Critical gap** - no direct file event hooks |
| **LSP integration**   | 2                | ❌ 0                          | ⚠️ **Feature gap** - no IDE-level hooks          |
| **Permission system** | 2                | ❌ 0                          | ⚠️ **Feature gap** - no permission tracking      |
| **UI/TUI events**     | 3                | ⚠️ 1 (Notification)           | ⚠️ **Partial** - missing prompt/command hooks    |

### Critical Missing Events for Developers

1. **`message.updated` / `message.removed`**
   - **Use Case:** Implementing audit trails, compliance logging
   - **Impact:** Cannot track message-level state changes

2. **`session.error`**
   - **Use Case:** Implementing error recovery, fallback mechanisms
   - **Impact:** Cannot detect and handle session failures

3. **`session.created`**
   - **Use Case:** First-run initialization, context setup
   - **Impact:** Cannot distinguish initialization events from ongoing session

4. **`lsp.updated` / `lsp.client.diagnostics`**
   - **Use Case:** IDE-level integration, real-time diagnostics
   - **Impact:** Cannot build IDE-aware features

---

## 5. Architectural Implications

### OMO Philosophy: Command-Line Hook Layer

```
┌─────────────────────────────────────────────────────────┐
│              Claude Code Core                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Tool Execution                         │  │
│  │   ↓                                   │  │
│  └──────────────────────────────────────────────┘  │
│         │                                       │
│         ▼                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │    OMO Hook Layer (Shell)            │  │
│  │  - PreToolUse script                   │  │
│  │  - PostToolUse script                  │  │
│  │  - Exit code = block/allow            │  │
│  └──────────────────────────────────────────────┘  │
│         │                                       │
│         ▼                                       │
└─────────────────────────────────────────────────────────┘
```

**Strengths:**

- **Decoupled:** Hooks run as separate processes
- **Language-agnostic:** Can write hooks in any language
- **Simplicity:** Exit code model is easy to understand

**Weaknesses:**

- **Overhead:** Process spawning for every hook execution
- **Limited communication:** JSON over stdin/stdout only
- **No async chaining:** Cannot chain multiple hook modifications
- **Coarse-grained:** Limited event set

### NOC Philosophy: In-Memory Plugin System

```
┌─────────────────────────────────────────────────────────┐
│              OpenCode Core                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Event System (25+ events)              │  │
│  │   ↓                                   │  │
│  └──────────────────────────────────────────────┘  │
│         │                                       │
│         ▼                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │  Plugin Module (TypeScript)            │  │
│  │  - tool.execute.before handler             │  │
│  │  - tool.execute.after handler              │  │
│  │  - 25+ other event handlers            │  │
│  │  - Async/throw-based blocking           │  │
│  │  - Output modification support            │  │
│  └──────────────────────────────────────────────┘  │
│         │                                       │
│         ▼                                       │
└─────────────────────────────────────────────────────────┘
```

**Strengths:**

- **Zero overhead:** In-memory function calls
- **Rich communication:** Full TypeScript objects, async/await
- **Fine-grained:** 25+ events across 8 categories
- **Composable:** Can chain multiple plugins

**Weaknesses:**

- **TypeScript required:** Must write in TS/JS (no shell scripts)
- **Learning curve:** Async/throw model more complex than exit codes

---

## 6. Recommendations

### For Migrating from OMO to NOC

1. **Replace shell exit codes with async throws:**

   ```typescript
   // OMO (old)
   if (shouldBlock) process.exit(1);

   // NOC (new)
   if (shouldBlock) throw new Error('Blocking reason');
   ```

2. **Map OMO events to NOC equivalents:**
   - `PreToolUse` → `tool.execute.before`
   - `PostToolUse` → `tool.execute.after`
   - `Stop` → `session.idle`
   - `PreCompact` → `experimental.session.compacting`

3. **Leverage NOC-only events:**
   - Use `session.created` for initialization
   - Use `message.updated` for audit trails
   - Use `lsp.client.diagnostics` for IDE integration

### For OMO Maintainers

1. **Add missing lifecycle events:**
   - Implement `session.error` for error recovery
   - Implement `message.updated` for audit trails
   - Implement `session.created` for first-run setup

2. **Consider async plugin model:**
   - Reduce process spawning overhead
   - Enable hook chaining
   - Improve TypeScript interop

3. **Document blocking semantics:**
   - Clarify which events support blocking
   - Document timeout handling
   - Provide migration guide from NOC hooks

---

## 7. Summary Table

| Aspect                   | OMO                    | NOC                                    | Assessment                 |
| ------------------------ | ---------------------- | -------------------------------------- | -------------------------- |
| **Total Events**         | ~6-8                   | 25+                                    | NOC 3x more events         |
| **Event Categories**     | ~3 (Tool/Session/UI)   | 8 (Tool/Session/Message/File/LSP/etc.) | NOC richer taxonomy        |
| **Blocking Mechanism**   | Exit code (sync)       | Async throw (async)                    | Tie - different approaches |
| **Tool Cancellation**    | ✅ Yes                 | ✅ Yes                                 | Tie                        |
| **Tool Redirection**     | ⚠️ Limited (env vars)  | ✅ Full (modify output)                | NOC superior               |
| **Timeout Control**      | ✅ Configurable        | ❌ No explicit                         | OMO safer                  |
| **Process Overhead**     | ⚠️ Spawn per hook      | ✅ In-memory                           | NOC superior               |
| **Language Support**     | Any (shell scripts)    | TypeScript/JS only                     | OMO more flexible          |
| **Async Chaining**       | ❌ No                  | ✅ Yes                                 | NOC superior               |
| **Session-Level Events** | ⚠️ Partial (Stop/Idle) | ✅ Full (created/error/deleted)        | NOC superior               |
| **Message-Level Events** | ❌ None                | ✅ Full (updated/removed)              | NOC superior               |
| **LSP Integration**      | ❌ None                | ✅ Full (diagnostics/updated)          | NOC superior               |
| **File-Level Events**    | ❌ None                | ✅ Full (edited/watcher)               | NOC superior               |

**Overall Verdict:** NOC provides significantly more granular events, better composability, and superior tool modification capabilities. OMO offers simpler blocking semantics and language flexibility but lags in event coverage.

---

## References

- **NOC Plugin Documentation:** https://opencode.ai/docs/plugins/
- **OMO Repository:** https://github.com/code-yeongyu/oh-my-opencode
- **Claude Code Hooks Reference:** https://code.claude.com/docs/en/hooks
- **Related Analysis:** `/Users/bangedorrunt/workspace/swarm-tool-addon/.hive/analysis/codebase-pattern-alignment.md`
