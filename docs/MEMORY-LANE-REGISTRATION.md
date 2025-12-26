# Memory Lane Hook Registration Guide

This guide explains how the Memory Lane system integrates with OpenCode Swarm workflows via an event-driven hook.

## Architecture

Memory Lane uses a "Fire-and-Forget" event pattern to decouple the swarm coordinator from the memory extraction process.

### The "Trigger" (Hook) vs. The "Brain" (memory-catcher Skill)

The integration uses a decoupled architecture where the **Trigger** (Hook) handles the "when" and the **Brain** (Skill) handles the "how."

#### The Trigger: `createSwarmCompletionHook`
- **Role:** Orchestration and Isolation.
- **Function:** Listens for swarm completion events in `swarm-mail`. When a task finishes, it spawns a separate `opencode run` process.
- **Why:** 
  - **Isolation:** Extraction runs in a clean environment, preventing memory-catcher from getting confused by the large context of the active swarm.
  - **Stability:** If extraction hangs or crashes, it doesn't affect the main swarm's progress.
  - **Non-blocking:** The swarm can move to the next task while the hook processes the previous one in the background.

#### The Brain: `memory-catcher` Skill
- **Role:** Intelligence and Decision-making.
- **Function:** This is a specialized agent defined in `.opencode/skill/memory-catcher/SKILL.md`. It contains the deep logic for analyzing transcripts.
- **Why:**
  - **Pattern Recognition:** It decides if a bug fix was a one-off or a permanent architectural preference.
  - **Entity Resolution:** It identifies who was involved and what projects were affected.
  - **Decoupled Logic:** We can improve the agent's "Learning IQ" by simply updating its Markdown instructions without needing to recompile or redeploy the plugin.

### The Workflow

1. **Trigger:** Swarm Coordinator completes a task/epic.
2. **Event:** Coordinator sends a `memory-catcher-extract` message via Swarm Mail.
3. **Listener:** The Swarm Plugin's background hook detects this message.
4. **Action:** The hook spawns a new CLI process calling the **Brain**.
5. **Extraction:** The **Brain** (agent) analyzes the transcript and stores learnings using the **Tools** (`semantic-memory_store`).

## Hook Implementation

The hook is implemented in `packages/opencode-swarm-plugin/src/memory-lane/hooks.ts`.

It is automatically initialized when the Swarm Plugin loads (`src/index.ts`):

```typescript
// src/index.ts
export const SwarmPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { $, directory } = input;
  
  // Initialize hook with shell access ($)
  await createSwarmCompletionHook(directory, $);
  
  // ...
}
```

### Critical Implementation Details

**1. Shell Access ($)**
The hook requires access to the OpenCode shell helper (`$`) to spawn new agent processes. This is passed from the plugin input.

**2. CLI Spawning**
Due to plugin architecture limitations (plugins cannot directly invoke the `Task` tool), the hook spawns a new independent process using the CLI:

```bash
opencode run --agent "swarm/worker" "SYSTEM: Memory Lane Extraction..."
```

**3. Safety & Stability (Controlled Polling)**
The hook uses a controlled `setTimeout` loop and `AbortController` to ensure system stability:
- **Sequential Processing:** Messages are processed one at a time to prevent "process explosion" (fork bombs) during high-volume swarm activity.
- **Process Timeouts:** All spawned CLI processes have a strict 5-minute timeout to prevent zombie processes from leaking resources.
- **Deduplication:** An in-memory set tracks in-flight message IDs to ensure the same event isn't processed multiple times simultaneously.

**4. Non-Blocking**
The hook runs in the background and spawning is asynchronous. It does not block the main plugin or the user's session.

## Verification & Debugging

### Log File
The hook writes detailed logs to `.hive/memory-lane.log` in your project directory. This is the first place to check if you suspect issues.

Logs include:
- Hook initialization
- Message detection
- CLI spawn attempts (and exit codes)
- Stdout/Stderr from the spawned agent process

### Verification Script
You can run the included script to check the log file and database content:

```bash
cd packages/opencode-swarm-plugin
bun run scripts/check-memory-lane.ts ../..
```

## Troubleshooting

### "Shell helper not available" Warning
If you see this warning, the plugin failed to receive the `$` helper. This usually means an older version of the OpenCode plugin host. Update OpenCode.

### "Failed to spawn memory-catcher"
Ensure the `opencode` CLI is available in your system PATH. The hook relies on the `opencode` command being executable.

### No Extraction Happening
1. Check Swarm Mail health: `swarmmail_health()`
2. Verify `memory-catcher` agent is registered: `swarmmail_list_agents()`
3. Check `.hive/memory-lane.log`.

## Manual Invocation

If the automatic hook fails, you can manually trigger extraction:

```typescript
// In your agent session
skills_use(name="memory-catcher")
// Then ask it to extract learnings from the specific bead/epic
```

## Retrieval Flow: How Agents Access Memory Lane

Memory Lane is not just about recording; it's about providing high-value context during critical decision points, like task decomposition.

### 1. The Trigger (Instruction-Based)
When running the `/swarm` command, the `swarm_delegate_planning` tool generates a **mandatory instruction** for the agent:

```ts 
// From packages/opencode-swarm-plugin/src/swarm-decompose.ts
return JSON.stringify({
  prompt: fullPrompt,
  subagent_type: "swarm/planner",
  // ...
  memory_query: formatMemoryQueryForDecomposition(args.task, 3), // <--- Instruction here
}, null, 2);
```

```json
"memory_query": {
  "query": "<task description>",
  "limit": 3,
  "instruction": "Query semantic-memory for relevant past learnings about similar tasks before decomposition"
}
```

Historically, this was semantic-memory_find, but with the introduction of the Memory Lane System, the agents are instructed (via their system prompt or specialized skills like memory-catcher) to use the more advanced memory-lane_find tool for architectural context.

This instruction guides the Coordinator or Planner Agent to check the Memory Lane before breaking down the task.

### 2. The Retrieval Pipeline (`memory-lane_find`)
The agent invokes the `memory-lane_find` tool, which triggers a specialized retrieval pipeline:
- **Intent Detection:** Scans the query for keywords (e.g., "mistake", "decided") to boost relevant memory types like `correction` or `decision`.
- **Base Vector Search:** Executes a search against the `memory-lane` collection in LibSQL.
- **Smart Re-Ranking:** Applies `PRIORITY_WEIGHTS` (Taxonomy) and `feedback_score` (Adaptive Learning) to ensure the most helpful architectural insights appear first.

### 3. Context Injection
The top results are injected into the agent's reasoning context, allowing it to avoid documented anti-patterns and follow established project decisions.

## Database Robustness & Date Parsing

To ensure stability across different environments and storage formats, the system implements robust date parsing:
- **Diagnostic Scripts:** `check-memory-lane.ts` automatically detects and handles numeric Unix timestamps (e.g., `1766633392418.0`) that may be stored in LibSQL.
- **Memory Store:** The `parseMemoryRow` function in `MemoryStore` uses a defensive parsing strategy to prevent `RangeError: Invalid Date` crashes.
- **Normalization:** The sync process (`syncMemories`) automatically normalizes all timestamps to ISO 8601 strings when exporting to `.hive/memories.jsonl`.
