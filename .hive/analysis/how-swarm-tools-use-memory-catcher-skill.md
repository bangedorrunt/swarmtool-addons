## Complete Trigger-to-Storage Flow

```
┌────────────────────────────────────────────────────────────────────┐
│           Memory-Catcher Invocation Flow                  │
└────────────────────────────────────────────────────────────────────┘
Worker Completes → swarm_complete()
                     ↓
              swarm_record_outcome() stores data
                     ↓
         Coordinator sends event via swarmmail_send()
                     ↓
         Swarm Mail Queue (persists message)
                     ↓
   createSwarmCompletionHook() polls every 5s
                     ↓
     Finds "memory-catcher-extract" message
                     ↓
         Parses outcome data from message body
                     ↓
         Spawns memory-catcher skill via Task()
                     ↓
    Memory-catcher extracts learnings
                     ↓
         Calls memory-lane_store() for each
                     ↓
    Acknowledges message (retry-safe)
```

---
## Code References

1. Trigger Point: swarm-coordination (Phase 6)

```ts
File: packages/opencode-swarm-plugin/global-skills/swarm-coordination/SKILL.md (lines 462-473)
// After a worker successfully completes, coordinator sends event
await swarmmail_send({
  to: ["memory-catcher"],  // Target memory-catcher agent
  subject: "memory-catcher-extract",  // Magic subject for hook
  body: JSON.stringify({
    transcript: fullWorkerConversation,
    summary: "OAuth login flow implemented",
    evaluation: "Implemented with proper token refresh",
    files_touched: ["src/auth/service.ts", "src/auth/schema.ts"],
    duration_ms: 180000,
    error_count: 0,
    retry_count: 0,
    success: true,
    bead_id: "bd-123.4",
    agent_name: "BlueLake",
    project_key: "/Users/bangedorrunt/workspace/swarm-tools"
  }),
  importance: "normal",
  ack_required: false  // Non-blocking - doesn't halt swarm
});
```

2. Hook Listener: hooks.ts (createSwarmCompletionHook)

```ts 
File: packages/opencode-swarm-plugin/src/memory-lane/hooks.ts (lines 55-120)
export async function createSwarmCompletionHook(
  projectPath: string
): Promise<HookListener> {
  let swarmMail: any = null;
  let pollInterval: NodeJS.Timeout | null = null;
  let isRunning = false;
  try {
    // Initialize swarm-mail adapter
    swarmMail = await getSwarmMailLibSQL(projectPath);
    
    // Register memory-catcher as agent
    await swarmMail.registerAgent(projectPath, "memory-catcher");
    
    isRunning = true;
    // Start polling for messages (every 5 seconds)
    pollInterval = setInterval(async () => {
      if (!isRunning) return;
      
      // Check inbox for memory-catcher-extract messages
      const inbox = await swarmMail.getInbox(
        projectPath, 
        "memory-catcher",  // Check memory-catcher's inbox
        { limit: 10, includeBodies: true }
      );
      for (const message of inbox) {
        // Process only messages with matching subject
        if (message.subject === "memory-catcher-extract") {
          await processMessage(swarmMail, projectPath, message);
        }
      }
    }, 5000);  // 5-second polling interval
    
    // Return cleanup function
    return () => {
      isRunning = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  } catch (error) {
    console.warn("[swarm-completion-hook] Initialization failed:", error);
  }
}
```

3. Message Processing: processMessage()

```ts
File: packages/opencode-swarm-plugin/src/memory-lane/hooks.ts (lines 129-188)
async function processMessage(
  swarmMail: any,
  projectPath: string,
  message: any
): Promise<void> {
  try {
    // Parse message body to extract outcome data
    const outcomeData = parseMessageBody(message.body);
    
    if (!outcomeData) {
      console.warn(`Failed to parse message body: ${message.id}`);
      return;
    }
    console.log(`Processing extraction for ${outcomeData.bead_id || "unknown"}`);
    // Spawn memory-catcher skill as Task subagent
    // Note: Currently logs what would happen (TODO: actual Task)
    console.log(
      `Would spawn memory-catcher with data:`,
      {
        transcript_length: outcomeData.transcript?.length || 0,
        summary: outcomeData.summary,
        files_touched: outcomeData.files_touched.length,
        success: outcomeData.success,
        duration_ms: outcomeData.duration_ms
      }
    );
    // TODO: Implement actual Task subagent spawn
    // This would use:
    // 1. skills_use(name="memory-catcher") to load skill
    // 2. Task(subagent_type="swarm/worker", prompt=outcomeData)
    // 3. Pass outcomeData as context
    // Acknowledge message as processed
    await swarmMail.acknowledgeMessage(
      projectPath,
      message.id,
      "memory-catcher"
    );
  } catch (error) {
    console.warn(`Error processing message ${message.id}:`, error);
    // Never throw - hook must continue processing
  }
}
```

4. Memory-Catcher Skill Execution

```ts
File: .opencode/skill/memory-catcher/SKILL.md (lines 1-481)
When spawned, the memory-catcher skill receives the swarm_record_outcome data and executes:
// Memory-catcher analyzes outcome
// 1. Determine memory type from outcome
let memoryType;
if (outcome.error_count > 0 && outcome.success) {
  memoryType = "correction";  // Error → fix recovery
} else if (outcome.files_touched.some(f => f.includes("config"))) {
  memoryType = "decision";  // Architectural choice
} else if (outcome.evaluation.includes("unexpected")) {
  memoryType = "insight";  // Non-obvious discovery
}
// 2. Extract entities from file paths
const entities = EntityResolver.extractFromPaths(outcome.files_touched);
// "src/auth/service.ts" → ["feature:auth", "project:swarm-tools"]
// 3. Calculate confidence based on evidence
let confidence = 70;  // Base
if (outcome.duration_ms < 30000) confidence += 10;  // Quick success
if (outcome.error_count > 0 && outcome.success) confidence += 15;
confidence = Math.max(0, Math.min(100, confidence));
// 4. Check for duplicates
const existing = await memory-lane_find({
  query: learning.description,
  limit: 3
});
if (existing.count > 0 && existing.results[0].score > 0.85) {
  // Skip duplicate
  return { skipped: true, reason: "Duplicate found" };
}
// 5. Store each extracted memory
await memory-lane_store({
  information: learning.description,
  type: memoryType,
  entities: entities,
  tags: learning.tags,
  confidence_score: confidence
});
```

5. Extraction Patterns (from memory-catcher/SKILL.md)

Pattern 1: Error Recovery → correction

```js
Trigger: error_count > 0 AND success: true
// Example outcome:
{
  "error_count": 3,
  "success": true,
  "evaluation": "Build failed with missing types. Added @types/node and succeeded."
}
// Extracted memory:
await memory-lane_store({
  information: "TypeScript build failures in swarm-mail require @types/node package",
  type: "correction",
  entities: ["project:swarm-mail"],
  confidence_score: 90
});
```

Pattern 2: Architectural Choice → decision

```js
Trigger: files_touched includes "config" or "setup"
// Example outcome:
{
  "files_touched": ["docs/ARCHITECTURE.md", "package.json"],
  "evaluation": "Chose SQLite over PostgreSQL for local dev"
}
// Extracted memory:
await memory-lane_store({
  information: "For local development, SQLite provides better DX than PostgreSQL",
  type: "decision",
  entities: ["feature:database", "project:swarm-tools"],
  confidence_score: 85
});
```

Pattern 3: Unexpected Discovery → insight

```js
Trigger: evaluation contains "unexpected", "discovered", "surprising"
// Example outcome:
{
  "evaluation": "Discovered that async/await performs 3x better"
}
// Extracted memory:
await memory-lane_store({
  information: "Bun's async file operations using async/await perform 3x better",
  type: "insight",
  entities: ["project:swarm-mail"],
  confidence_score: 70
});
```

Pattern 4: User Preference → commitment

```js
Trigger: evaluation contains "always", "never", "prefer"
// Example outcome:
{
  "evaluation": "User feedback: always use CSS Grid for responsive layouts"
}
// Extracted memory:
await memory-lane_store({
  information: "User prefers CSS Grid over Flexbox for responsive layouts",
  type: "commitment",
  entities: ["project:web"],
  confidence_score: 90
});
```

Pattern 5: Missing Capability → gap

```js
Trigger: evaluation contains "missing", "lacking", "no support"
// Example outcome:
{
  "evaluation": "swarm-tools lacks native Git worktree support"
}
// Extracted memory:
await memory-lane_store({
  information: "swarm-tools lacks native Git worktree support",
  type: "gap",
  entities: ["feature:git"],
  confidence_score: 80
});
```

---
## Key Integration Points
Tool Access (from memory-catcher/SKILL.md line 11-14)
metadata:
  tool_access:
    memory-lane_store: true    # ✅ Can store learnings
    memory-lane_find: true     # ✅ Can check for duplicates
    memory-lane_feedback: false # ❌ Cannot record feedback
When to Trigger (lines 31-37)
Memory-catcher is called when:
1. Subtask completes with swarm_record_outcome data
2. Outcome includes notable learnings (corrections, decisions, insights)
3. High-impact work finishes (success after multiple failures)
4. User explicitly requests memory extraction

---
## Full Example: OAuth Implementation Epic

```
┌──────────────────────────────────────────────────────────────────┐
│ EPIC: Add OAuth Authentication                                │
└──────────────────────────────────────────────────────────────────┘
Worker 1 (BlueLake) completes backend auth:
  ↓
swarm_complete({
  summary: "OAuth login flow implemented with JWT",
  evaluation: "Used 5min refresh buffer to prevent race conditions",
  files_touched: ["src/auth/service.ts"],
  error_count: 2,
  success: true,
  duration_ms: 180000
})
  ↓
swarm_record_outcome() stores in Hive
  ↓
Coordinator sends event:
await swarmmail_send({
  to: ["memory-catcher"],
  subject: "memory-catcher-extract",
  body: JSON.stringify({ outcomeData }),
  ack_required: false
})
  ↓
Swarm Mail Queue (message persists)
  ↓
createSwarmCompletionHook() polls (5s interval)
  ↓
Finds "memory-catcher-extract" message
  ↓
processMessage() parses outcome
  ↓
Spawns memory-catcher skill (currently TODO)
  ↓
Memory-catcher analyzes:
  1. Type: "correction" (2 errors → success)
  2. Entities: ["feature:auth", "project:swarm-tools"]
  3. Confidence: 85 (errors + clean recovery)
  4. Duplicates: None found
  ↓
Calls memory-lane_store({
  information: "OAuth login requires JWT tokens with 5min refresh buffer",
  type: "correction",
  entities: ["feature:auth"],
  confidence_score: 85
})
  ↓
Acknowledges message ✓
  ↓
Learning stored in Memory Lane ✓
  ↓
Available to future workers via memory-lane_find() ✓
```

---
## Current Status

✅ Implemented
1. Hook system - createSwarmCompletionHook() polls every 5s
2. Message parsing - parseMessageBody() validates outcome data
3. Memory-catcher skill - Full extraction logic with 5 patterns
4. Memory Lane tools - memory-lane_find/store/feedback ready
5. Entity resolution - EntityResolver.extractFromPaths() works

⏳ TODO (from hooks.ts line 64)
1. Actual Task spawn - Currently logs, needs:

```ts
      // Implementation needed:
   const taskResult = await Task({
     subagent_type: "swarm/worker",
     description: "Extract learnings from outcome",
     prompt: `
       You are memory-catcher. Extract learnings from this outcome:
       ${JSON.stringify(outcomeData)}
       
       Use memory-catcher skill for guidance.
     `
   });
```   
2. 🔒 Blocking the Flow
```ts
The hook currently logs instead of spawning memory-catcher (line 64-68):
// TODO: Implement actual Task subagent spawn
// This requires access to OpenCode Task tool which is not available
// in plugin code.
console.log(`Would spawn memory-catcher...`);
```

---
## Summary
The memory-catcher skill is used via an event-driven workflow:
1. Worker completes → swarm_complete()
2. Coordinator sends event → swarmmail_send("memory-catcher-extract")
3. Hook receives message → createSwarmCompletionHook() polls every 5s
4. Spawn memory-catcher → Task subagent (TODO: actual implementation)
5. Extract learnings → Analyze outcome using 5 patterns
6. Store in Memory Lane → memory-lane_store() with taxonomy
7. Future retrieval → Next workers query via memory-lane_find()
The system is architecturally complete with a single TODO: implementing the actual Task() spawn in the hook (currently logs what would happen).
