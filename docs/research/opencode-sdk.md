# OpenCode SDK Research Findings

## Overview

This document details the architectural findings of the `@opencode-ai/sdk` and `@opencode-ai/plugin` packages, specifically how they handle session management, agent orchestration, and plugin extensibility. These findings are based on deep codebase analysis of `node_modules` and the implementation of `swarmtool-addons`.

## 1. Core Architecture: Minimalist & Extensible

The SDK relies on a generated API client (`sdk.gen.d.ts`) that exposes core namespaces rather than a monolithic framework.

- **Client Core**: The `OpencodeClient` acts as the primary entry point.
- **Key Namespaces**:
  - `session`: Managing the graph of conversation threads.
  - `app`: System-wide resources and agent registry.
  - `tool`: Tool registration and discovery.
  - `mcp`: Native support for Model Context Protocol.

## 2. Session Management: The Recursive Tree

OpenCode sessions are **not flat**. They are structured as a recursive directory tree (Graph), enabling efficient context isolation.

- **Structure**:
  A `Session` object contains a `parentID` field:

  ```typescript
  export type Session = {
    id: string;
    parentID?: string; // The lineage link
    title: string;
    // ...
  };
  ```

- **Mechanism**:
  - **Root Session**: The main user chat window (`parentID` is undefined).
  - **Sub-Session (Thread)**: When a sub-task is required, a new session is created pointing to the current session as its parent.
  - **Isolation**: This architecture ensures that the "thinking steps" or tool executions of a sub-agent do not pollute the context of the parent session.

## 3. Agent "Communication" Protocol

Agents in OpenCode do not communicate via a direct Agent-to-Agent protocol. Instead, they utilize a **Proxy User Pattern** mediated by the `branching` session architecture.

### Interaction Flow

When Parent Agent A wants to delegate a task to Child Agent B:

1.  **The Call**: Parent A calls a tool (e.g., `skill_agent`).
2.  **The Bridge (Tool Logic)**:
    - The tool creates a new **Child Session** (`client.session.create`).
    - The tool injects Parent A's prompt into this session as a **User Message** (`client.session.prompt`).
3.  **The Execution**:
    - Child Agent B receives the message. It perceives it as a standard user request.
    - Agent B thinks, runs tools, and posts a final response.
4.  **The Return**:
    - The tool (watching the child session) reads the final response.
    - The tool returns this text as the **Function Result** to Parent A.

### Benefits

- **Context Purity**: The parent only sees the input (prompt) and output (result).
- **Recursion**: Child sessions can spawn their own children, enabling arbitrarily deep agent hierarchies.
- **Observability**: Developers can inspect the child session "threads" to debug the logic of specific sub-agents.

## 4. Execution Model: The State Machine

OpenCode sessions operate on a defined state machine, which necessitates polling for synchronous agent orchestration.

- **States**:

  ```typescript
  type SessionStatus =
    | { type: 'idle' } // Ready for input / Finished processing
    | { type: 'busy' } // Agent is thinking/acting
    | { type: 'retry' }; // Recoverable error state
  ```

- **Orchestration Pattern**:
  To implement a synchronous sub-agent call (blocking execution):
  1.  Send Prompt -> Session enters `busy`.
  2.  Start Polling -> Check `client.session.status()` periodically.
  3.  Wait for `idle` -> Indicates the agent has completed its chain of thought.
  4.  Extract Result -> Read the last assistant message.

## 5. Agent Configuration & Visibility

The SDK allows for dynamic agent definition and visibility control, enabling "hidden" system agents.

- **Visibility Control**:
  The `Agent` type includes a `mode` field:

  ```typescript
  export type Agent = {
    name: string;
    mode: 'subagent' | 'primary' | 'all';
    // ...
  };
  ```

  - **`subagent`**: Hides the agent from the primary UI selection (dropdowns), reserving it for programmatic invocation (e.g., via `chief-of-staff`).
  - **`primary`**: Standard user-facing agents.

- **Dynamic Loading**:
  Plugins can scan the filesystem (e.g., `.opencode/skill/*.md`) and inject agent configurations at runtime via the `config` hook, allowing for project-specific skill definitions.

## 6. Native MCP Support

The SDK includes a `client.mcp` namespace, confirming that Model Context Protocol support is native to the platform.

- **Implication**: Developers can choose between **Agentic Delegation** (spawning a sub-brain via `skill_agent`) or **Tool Delegation** (connecting an MCP server via `client.mcp`), depending on whether the task requires reasoning or just capability exposition.

## 7. Deep Dive: Agent Spawning Mechanics

"Spawning" an agent is conceptually an abstraction. In the low-level SDK, it is implemented as **Prompting with Attribution**.

- **The Trigger**: `SessionPromptData`
  The endpoint `POST /session/{id}/message` (or `client.session.prompt()`) accepts a payload that defines _who_ should reply.

  ```typescript
  export type SessionPromptData = {
    body?: {
      agent?: string; // <--- The Spawn Trigger
      parts: Array<TextPartInput | FilePartInput>;
      // ...
    };
  };
  ```

  - If `agent` is omitted, the default or currently selected agent for that session replies.
  - If `agent` is provided (e.g., `"chief-of-staff/oracle"`), the backend loads that specific agent's configuration (prompt, tools, model) to process the request.

- **Asynchronous Handoffs**:
  The SDK exposes a specialized endpoints for non-blocking operations:

  ```typescript
  export type SessionPromptAsyncData = {
    body?: {
      agent?: string;
      // ...
    };
  };
  ```

  - **Return Type**: `204 Void`.
  - **Use Case**: This confirms the architecture used in `src/index.ts` for "Fire and Forget" handoffs. The client sends the signal and immediately disconnects, leaving the backend to manage the agent's lifecycle.

## 8. Plugin Hook System: Event Interception & Extension

The `@opencode-ai/plugin` package provides a powerful hooks system that allows plugins to intercept and modify OpenCode's core lifecycle events.

### Hook Architecture

```typescript
export interface OpenCodePlugin {
  // Global event subscription (SSE-based)
  event?: (event: OpenCodeEvent) => void;

  // Chat lifecycle hooks
  chat?: {
    message?: (params: ChatParams) => void;
    params?: (params: LLMSessionParams) => void;
  };

  // Tool execution hooks
  tool?: {
    execute?: {
      before?: (tool: ToolCall) => void;
      after?: (tool: ToolCall, result: ToolResult) => void;
    };
  };

  // Permission handling
  permission?: {
    ask?: (permission: PermissionRequest) => void;
  };

  // Configuration & Auth
  config?: (config: RuntimeConfig) => void;
  auth?: (auth: AuthContext) => void;
}
```

### Event Types (30+ events)

| Category       | Events                                                      |
| -------------- | ----------------------------------------------------------- |
| **Message**    | `message.created`, `message.updated`, `message.deleted`     |
| **Session**    | `session.status`, `session.created`, `session.ended`        |
| **Tool**       | `tool.execute.before`, `tool.execute.after`, `tool.result`  |
| **Permission** | `permission.ask`, `permission.granted`, `permission.denied` |
| **LLM**        | `chat.params`, `model.response`, `stream.chunk`             |

### Real-Time Event Subscription

```typescript
import { Global } from '@opencode-ai/sdk';

Global.event((event) => {
  switch (event.type) {
    case 'message.created':
      console.log('New message:', event.data);
      break;
    case 'session.status':
      console.log('Session state:', event.data.status);
      break;
    case 'tool.execute.after':
      console.log('Tool result:', event.data.result);
      break;
  }
});
```

### Plugin Usage in swarmtool-addons

The `swarmtool-addons` plugin demonstrates several hooks:

1. **Session Learning Hook** (`src/orchestrator/hooks/session-learning.ts`):
   - Intercepts `session.status` events
   - Extracts learnings from completed sessions
   - Stores patterns for future reference

2. **Tool Execution Hook** (`src/index.ts`):
   - Uses `tool.execute.after` to capture tool results
   - Enables automatic learning from agent interactions

3. **Message Interception**:
   - `chat.message` hook processes new messages
   - Enables context injection and message modification

### Event-Driven Communication Pattern

```
┌─────────────────────────────────────────────────────┐
│              OpenCode Runtime                       │
│                                                      │
│  ┌─────────┐    ┌──────────┐    ┌──────────────┐   │
│  │ Session │───►│  Event   │───►│  Plugin Hook │   │
│  │ Update  │    │   Bus    │    │  Processing  │   │
│  └─────────┘    └──────────┘    └──────────────┘   │
│                                              │      │
│                                              ▼      │
│  ┌─────────────────────────────────────────────────┐
│  │              Event Subscribers                   │
│  │  - Global.event() callbacks                     │
│  │  - Plugin hooks (chat, tool, permission)        │
│  │  - Session learning systems                     │
│  └─────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────┘
```

### Benefits

- **Loose Coupling**: Plugins don't need direct imports from core modules
- **Real-Time Processing**: SSE ensures immediate event delivery
- **Extensibility**: New plugins can subscribe to any event type
- **Observability**: Full audit trail of session events

## 9. Part-Based Message System

Messages in OpenCode are composed of "parts" - modular content blocks that enable rich communication between sessions.

### Part Types

```typescript
type Part =
  | { type: 'text'; content: string }
  | { type: 'agent'; name: string } // Agent invocation
  | { type: 'tool'; name: string; input: any } // Tool call
  | { type: 'tool_result'; name: string; result: any }
  | {
      type: 'subtask'; // Subtask delegation
      prompt: string;
      description?: string;
      agent?: string;
      command?: string;
    }
  | { type: 'file'; path: string; content: string }
  | { type: 'image'; url: string; alt?: string };
```

### Usage in Session Prompt

```typescript
const session = await client.session.create({
  parentID: parentSessionID,
});

await session.prompt({
  parts: [
    { type: 'text', content: 'Analyze this code:' },
    { type: 'file', path: 'src/main.ts', content: code },
    {
      type: 'subtask',
      prompt: 'Review code for security issues',
      agent: 'chief-of-staff/security-auditor',
    },
  ],
});
```

### Benefits

- **Rich Content**: Mix text, files, images, and agent invocations
- **Structured Delegation**: `subtask` parts enable clean sub-agent handoffs
- **Type Safety**: Each part has explicit schema validation

## 10. V2 SDK: Enhanced Session Management

The V2 SDK (`@opencode-ai/sdk/v2`) introduces additional capabilities for session hierarchy and event handling.

### Session Parent Field

```typescript
interface Session {
  session_parent?: string; // Explicit parent reference
  id: string;
  title: string;
  // ...
}
```

### Session Fork Operations

```typescript
interface SessionForkData {
  messageID: string; // Fork point (message index)
  sessionID: string;
  createdAt: string;
}

// Fork at specific message point
const fork = await session.fork({ messageID: 'msg-123' });

// Get all child sessions
const children = await session.children();
```

### Enhanced Event Types

V2 adds specialized event types:

- `session.fork.created`
- `session.children.updated`
- `agent.mode_changed`
- `context.invalidated`

---

## 8. Plugin Hook System: Event Interception & Extension

The `@opencode-ai/plugin` package provides a powerful hooks system that allows plugins to intercept and modify OpenCode's core lifecycle events.

### Hook Architecture

```typescript
export type Plugin = (input: PluginInput) => Promise<Hooks>;

export interface PluginInput {
  client: OpencodeClient;
  project?: string;
  directory: string;
  worktree?: string;
  $: BunShell; // Shell execution via Bun
}

export interface Hooks {
  event?: (input: Event, output: void) => Promise<void>;
  'chat.message'?: (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
  'chat.params'?: (input: ChatParamsInput, output: ChatParamsOutput) => Promise<void>;
  'tool.execute.before'?: (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput
  ) => Promise<void>;
  'tool.execute.after'?: (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput
  ) => Promise<void>;
  'permission.ask'?: (input: Permission, output: PermissionOutput) => Promise<void>;
  'experimental.session.compacting'?: (
    input: SessionCompactingInput,
    output: SessionCompactingOutput
  ) => Promise<void>;
  'experimental.chat.messages.transform'?: (
    input: MessagesTransformInput,
    output: MessagesTransformOutput
  ) => Promise<void>;
  'experimental.chat.system.transform'?: (
    input: SystemTransformInput,
    output: SystemTransformOutput
  ) => Promise<void>;
}
```

### Hook Input/Output Pattern

Each hook receives an **input** object (read-only data) and an **output** object (mutable for modifications):

```typescript
// Example: Modifying LLM parameters at runtime
"chat.params": async ({ sessionID, agent, model, provider, message }, output) => {
  output.temperature = 0.7;
  output.topP = 0.9;
  output.options = { ...output.options, maxTokens: 4000 };
}
```

### Core Hooks Detail

| Hook                              | Input                                      | Output                           | Purpose                          |
| --------------------------------- | ------------------------------------------ | -------------------------------- | -------------------------------- |
| `event`                           | Full Event object                          | void                             | Subscribe to all events (SSE)    |
| `chat.message`                    | sessionID, agent, model, messageID         | message, parts                   | Modify message before processing |
| `chat.params`                     | sessionID, agent, model, provider, message | temperature, topP, topK, options | Tune LLM parameters              |
| `tool.execute.before`             | tool, sessionID, callID                    | args                             | Validate/modify tool arguments   |
| `tool.execute.after`              | tool, sessionID, callID                    | title, output, metadata          | Process tool results             |
| `permission.ask`                  | Permission request                         | status                           | Handle permission prompts        |
| `experimental.session.compacting` | sessionID                                  | context, prompt                  | Customize context compression    |

### Real-Time Event Subscription

```typescript
export const myPlugin: Plugin = async ({ client }) => {
  return {
    event: async (event, _) => {
      switch (event.type) {
        case 'message.created':
          console.log('New message:', event.data);
          break;
        case 'session.status':
          console.log('Session state:', event.data.status);
          break;
        case 'tool.execute.after':
          console.log('Tool result:', event.data.result);
          break;
      }
    },
  };
};
```

### Plugin Usage in swarmtool-addons

The `swarmtool-addons` plugin demonstrates several hooks:

1. **Session Learning Hook** (`src/orchestrator/hooks/session-learning.ts`):
   - Intercepts `session.status` events
   - Extracts learnings from completed sessions
   - Stores patterns for future reference

2. **Tool Execution Hook** (`src/index.ts`):
   - Uses `tool.execute.after` to capture tool results
   - Enables automatic learning from agent interactions

3. **Message Interception**:
   - `chat.message` hook processes new messages
   - Enables context injection and message modification

### Event-Driven Communication Pattern

```
+----------------------------------------------------------+
|                   OpenCode Runtime                        |
|                                                           |
|  +---------+    +----------+    +---------------------+   |
|  | Session | --> |  Event   | --> |  Plugin Hook Chain |   |
|  | Update  |    |   Bus    |    |  (hook1 -> hook2)   |   |
|  +---------+    +----------+    +---------------------+   |
|                                          |                |
|                                          v                |
|  +----------------------------------------------------------+
|  |              Event Subscribers                            |
|  |   - Global.event() callbacks                              |
|  |   - Plugin hooks (chat, tool, permission)                 |
|  |   - Session learning systems                              |
|  +----------------------------------------------------------+
+----------------------------------------------------------+
```

### Benefits

- **Loose Coupling**: Plugins don't need direct imports from core modules
- **Real-Time Processing**: SSE ensures immediate event delivery
- **Extensibility**: New plugins can subscribe to any event type
- **Observability**: Full audit trail of session events

---

## 9. Part-Based Message System

Messages in OpenCode are composed of "parts" - modular content blocks that enable rich communication between sessions.

### Part Types

```typescript
type Part =
  | { type: 'text'; content: string }
  | { type: 'agent'; name: string } // Agent invocation
  | { type: 'tool'; name: string; input: unknown } // Tool call
  | { type: 'tool_result'; name: string; result: unknown }
  | {
      type: 'subtask'; // Subtask delegation
      prompt: string;
      description?: string;
      agent?: string;
      command?: string;
    }
  | { type: 'file'; path: string; content: string }
  | { type: 'image'; url: string; alt?: string };
```

### Usage in Session Prompt

```typescript
const session = await client.session.create({
  parentID: parentSessionID,
});

await session.prompt({
  parts: [
    { type: 'text', content: 'Analyze this code:' },
    { type: 'file', path: 'src/main.ts', content: code },
    {
      type: 'subtask',
      prompt: 'Review code for security issues',
      agent: 'chief-of-staff/security-auditor',
    },
  ],
});
```

### Benefits

- **Rich Content**: Mix text, files, images, and agent invocations
- **Structured Delegation**: `subtask` parts enable clean sub-agent handoffs
- **Type Safety**: Each part has explicit schema validation

---

## 10. V2 SDK: Enhanced Session Management

The V2 SDK (`@opencode-ai/sdk/v2`) introduces additional capabilities for session hierarchy and event handling.

### Session Parent Field

```typescript
interface Session {
  session_parent?: string; // Explicit parent reference
  id: string;
  title: string;
  // ...
}
```

### Session Fork Operations

```typescript
interface SessionForkData {
  messageID: string; // Fork point (message index)
  sessionID: string;
  createdAt: string;
}

// Fork at specific message point
const fork = await session.fork({ messageID: 'msg-123' });

// Get all child sessions
const children = await session.children();
```

### Enhanced Event Types

V2 adds specialized event types:

- `session.fork.created`
- `session.children.updated`
- `agent.mode_changed`
- `context.invalidated`

---

## 11. Tool Definition System

Plugins can define custom tools using the Zod-based schema builder.

### Tool Definition Pattern

```typescript
import { tool } from '@opencode-ai/plugin';

export const myTool = tool({
  name: 'my_custom_tool',
  description: 'A custom tool for my plugin',
  parameters: z.object({
    input: z.string().describe('Input string'),
    count: z.number().optional().default(1),
  }),
  execute: async (args, context) => {
    // args: { input: string; count?: number }
    // context: { sessionID, messageID, agent, signal }
    return `Result: ${args.input} x${args.count}`;
  },
});
```

### ToolContext Interface

```typescript
interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  signal: AbortSignal;
}
```

---

## 12. Authentication Hook System

Plugins can implement authentication providers for external services.

### OAuth Flow

```typescript
export const oauthAuth: AuthHook = {
  oauth: {
    auto: {
      clientID: '...',
      clientSecret: '...',
      authorizeURL: '...',
      tokenURL: '...',
      scopes: ['read', 'write'],
    },
  },
};
```

### API Key Flow

```typescript
export const apiAuth: AuthHook = {
  api: {
    prompts: [
      {
        name: 'apiKey',
        type: 'text',
        message: 'Enter your API key',
        validate: (value) => (value.length > 0 ? null : 'Required'),
      },
    ],
    authorize: async (answers) => {
      return { Authorization: `Bearer ${answers.apiKey}` };
    },
  },
};
```

---

## 13. Complete Plugin Example

```typescript
import { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

export const myPlugin: Plugin = async ({ client, directory, $ }) => {
  // Define custom tool
  const analyzeCode = tool({
    name: 'analyze_code',
    description: 'Analyze code for patterns',
    parameters: z.object({
      path: z.string(),
    }),
    execute: async ({ path }, context) => {
      const content = await Bun.file(path).text();
      return `Analyzed ${path}: ${content.length} chars`;
    },
  });

  return {
    'tool.execute.after': async ({ tool: toolCall }, output) => {
      if (toolCall.name === 'skill_agent') {
        console.log('Agent spawned:', output.output);
      }
    },
    'chat.params': async ({ agent }, output) => {
      if (agent === 'chief-of-staff/oracle') {
        output.temperature = 0.2; // More focused responses
      }
    },
  };
};
```

---

## 14. Plugin Hook Implementation: Deep Dive

The plugin hook system is the backbone of OpenCode's extensibility. This section provides implementation details, patterns, and real-world examples from `swarmtool-addons`.

### 14.1 Hook Architecture Overview

Hooks follow an **input-output pattern** where plugins receive context and can modify behavior by returning values through the output object:

```typescript
type HookFunction = (input: HookInput, output: HookOutput) => Promise<void> | void;
```

### 14.2 Hooks Interface Reference

From `index.d.ts:105-192`, here is the complete hooks interface:

```typescript
interface Hooks {
  // Global event subscription
  event?: (input: { event: Event }) => Promise<void>;

  // Configuration
  config?: (input: Config) => Promise<void>;

  // Custom tools
  tool?: { [key: string]: ToolDefinition };

  // Authentication
  auth?: AuthHook;

  // Chat lifecycle
  'chat.message'?: (
    input: { sessionID: string; agent?: string; model?: string; messageID?: string },
    output: { message: UserMessage; parts: Part[] }
  ) => Promise<void>;

  'chat.params'?: (
    input: {
      sessionID: string;
      agent: string;
      model: string;
      provider: string;
      message?: UserMessage;
    },
    output: {
      temperature?: number;
      topP?: number;
      topK?: number;
      options?: Record<string, unknown>;
    }
  ) => Promise<void>;

  // Tool execution lifecycle
  'tool.execute.before'?: (
    input: { tool: ToolCall; sessionID: string; callID: string },
    output: { args: Record<string, unknown> }
  ) => Promise<void>;

  'tool.execute.after'?: (
    input: { tool: ToolCall; sessionID: string; callID: string },
    output: { title: string; output: string; metadata?: Record<string, unknown> }
  ) => Promise<void>;

  // Permission handling
  'permission.ask'?: (
    input: Permission,
    output: { status: 'ask' | 'deny' | 'allow' }
  ) => Promise<void>;

  // Experimental hooks
  'experimental.session.compacting'?: (
    input: { sessionID: string },
    output: { context: string; prompt: string }
  ) => Promise<void>;

  'experimental.chat.messages.transform'?: (
    input: { messages: Array<{ role: string; content: string }> },
    output: { messages: Array<{ role: string; content: string }> }
  ) => Promise<void>;

  'experimental.chat.system.transform'?: (
    input: { systemPrompt: string },
    output: { systemPrompt: string }
  ) => Promise<void>;

  'experimental.text.complete'?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string }
  ) => Promise<void>;
}
```

### 14.3 PluginInput Context

Every plugin receives a `PluginInput` object providing access to OpenCode's runtime:

```typescript
interface PluginInput {
  client: OpencodeClient; // API client for session/agent operations
  project: Project; // Project metadata
  directory: string; // Project directory path
  worktree: string; // Git worktree path
  $: BunShell; // Shell execution utilities
}
```

The `BunShell` (`$`) provides shell execution capabilities using Bun's APIs:

```typescript
type BunShell = {
  run: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
  file: (path: string) => BunFile;
  write: (path: string, content: string) => Promise<void>;
  // ... other Bun APIs
};
```

### 14.4 ToolDefinition System

Custom tools are defined using a Zod-based schema builder:

```typescript
import { tool } from '@opencode-ai/plugin';

const myTool = tool({
  name: 'my_custom_tool',
  description: 'Does something useful',
  parameters: z.object({
    input: z.string().description('Input value'),
    options: z
      .object({
        verbose: z.boolean().default(false),
      })
      .optional(),
  }),
  execute: async (args, context) => {
    // args: Parsed arguments matching schema
    // context: ToolContext with sessionID, messageID, agent, abort signal
    const result = await doSomething(args.input);
    return JSON.stringify(result);
  },
});
```

**ToolContext Interface:**

```typescript
interface ToolContext {
  sessionID: string; // Current session ID
  messageID: string; // Message that triggered the tool
  agent: string; // Current agent name
  abort: AbortSignal; // Cancellation signal
}
```

### 14.5 Authentication Hook System

Plugins can implement authentication for external services:

```typescript
interface AuthHook {
  oauth?: {
    auto?: (input: { authId: string }) => Promise<AuthOAuthResult>;
    code?: (input: { authId: string; code: string }) => Promise<AuthOAuthResult>;
  };
  api?: {
    name: string;
    prompts: Array<{
      type: 'text' | 'select';
      name: string;
      message: string;
      validate?: (value: string) => Promise<boolean>;
      options?: Array<{ label: string; value: string }>;
      condition?: (ctx: AuthContext) => boolean;
    }>;
    authorize: (
      input: Record<string, string>,
      context: AuthContext
    ) => Promise<{ success: boolean; error?: string }>;
  };
}

interface AuthOAuthResult {
  url?: string;
  instructions?: string;
  status: 'pending' | 'success' | 'error';
}
```

### 14.6 Real-World Implementation: swarmtool-addons

The `swarmtool-addons` plugin demonstrates practical hook usage:

#### Tool.execute.before Hook

```typescript
'tool.execute.before': async ({ tool, sessionID, callID }, output) => {
  // Log tool calls for debugging
  console.log(`[${sessionID}] Tool called: ${tool.name}`);

  // Inject context for specific tools
  if (tool.name === 'skill_agent') {
    output.args = {
      ...output.args,
      context: await getSessionContext(sessionID),
    };
  }
}
```

#### Tool.execute.after Hook

```typescript
'tool.execute.after': async ({ tool, sessionID, callID }, output) => {
  // Handle handoffs with settlement delay
  if (tool.name === 'handoff' || output.metadata?.handoff) {
    await new Promise(resolve => setTimeout(resolve, 800));
    await input.client.session.promptAsync({
      sessionID,
      body: { agent: 'chief-of-staff', parts: parseHandoffParts(output.output) },
    });
  }
}
```

#### Session Learning Hook Pattern

From `src/orchestrator/hooks/opencode-session-learning.ts`:

```typescript
export function createOpenCodeSessionLearningHook() {
  const sessionFirstMessages = new Map<string, boolean>();
  const sessionUserMessages = new Map<string, string[]>();
  const sessionModifiedFiles = new Map<string, Set<string>>();
  const pendingCaptures = new Map<string, NodeJS.Timeout>();

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case 'session.created':
          sessionFirstMessages.set(event.data.sessionID, false);
          sessionUserMessages.set(event.data.sessionID, []);
          sessionModifiedFiles.set(event.data.sessionID, new Set());
          break;

        case 'message.created':
          if (event.data.role === 'user') {
            const sessionID = event.data.sessionID;
            const messages = sessionUserMessages.get(sessionID) || [];
            messages.push(event.data.content);
            sessionUserMessages.set(sessionID, messages);

            if (!sessionFirstMessages.get(sessionID)) {
              sessionFirstMessages.set(sessionID, true);
              const memories = await queryMemoryLane(extractKeywords(event.data.content));
              await injectLearnings(sessionID, memories);
            }
          }
          break;

        case 'tool.execute.after':
          if (['write', 'edit', 'patch'].includes(event.data.tool.name)) {
            const files = sessionModifiedFiles.get(event.data.sessionID) || new Set();
            files.add(event.data.output.file);
            sessionModifiedFiles.set(event.data.sessionID, files);
          }
          break;

        case 'session.idle':
          const captureDelay = 2000;
          const captureTimer = setTimeout(async () => {
            await captureSessionLearnings(event.data.sessionID);
          }, captureDelay);
          pendingCaptures.set(event.data.sessionID, captureTimer);
          break;
      }
    },
  };
}
```

### 14.7 Event-Driven Communication Pattern

The hook system enables powerful event-driven architectures:

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenCode Runtime                              │
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐    │
│  │   Session   │──►│  Event Bus  │──►│  Plugin Hooks       │    │
│  │   Update    │   │  (SSE)      │   │  - event            │    │
│  └─────────────┘   └─────────────┘   │  - tool.execute.*  │    │
│                                       │  - chat.message    │    │
│                                       │  - session.*       │    │
│                                       └─────────────────────┘    │
│                                                    │             │
│                     ┌──────────────────────────────┼──────────┐  │
│                     │                              ▼          │  │
│                     │     ┌───────────────────────────────┐   │  │
│                     │     │  Memory Lane / LEDGER         │   │  │
│                     │     │  - Query memories             │   │  │
│                     │     │  - Store learnings            │   │  │
│                     │     │  - Track session state        │   │  │
│                     │     └───────────────────────────────┘   │  │
│                     │                                      │  │
│                     ▼                                      ▼  │
│              ┌─────────────────────────────────────────────────┐ │
│              │            Plugin Output Effects                │ │
│              │  - Modified tool args                          │ │
│              │  - Injected context                            │ │
│              │  - Triggered handoffs                          │ │
│              │  - Stored learnings                            │ │
│              └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 14.8 Best Practices for Hook Implementation

1. **Async First**: All hooks are async-capable; use `await` for I/O operations
2. **Error Handling**: Wrap hook logic in try-catch to prevent crashes
3. **Performance**: Keep hooks fast; defer heavy processing to background tasks
4. **State Management**: Use closure-scoped Maps for session state (as shown above)
5. **Cleanup**: Handle `session.deleted` to clean up resources
6. **Metadata**: Use output.metadata for passing data between before/after hooks

### 14.9 Correction Detection Patterns

Real-world pattern matching from `opencode-session-learning.ts`:

```typescript
const CORRECTION_PATTERNS = [
  /no[,.]?\s+(do|use|try|make|don't|instead|actually)/i,
  /that's (wrong|incorrect|not right)/i,
  /not what i (asked|meant|wanted)/i,
  /instead[,.]?\s+(use|do|try)/i,
  /prefer[s]?\s+.+\s+(over|instead|rather)/i,
  /actually[,.]?\s+(i want|use|it should)/i,
];

function detectCorrection(message: string): string | null {
  for (const pattern of CORRECTION_PATTERNS) {
    const match = message.match(pattern);
    if (match) return match[0];
  }
  return null;
}
```

### 14.10 Learning Type Hierarchy

From `opencode-session-learning.ts`, learnings are stored in priority order:

```typescript
const LEARNING_TYPE_ORDER = [
  'correction', // User corrections (highest priority)
  'decision', // Architectural decisions
  'preference', // User preferences
  'anti_pattern', // What didn't work
  'pattern', // What worked well
  'insight', // General insights
];
```

This ensures critical information surfaces first in future context queries.
