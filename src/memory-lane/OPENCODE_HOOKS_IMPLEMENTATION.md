# Memory Lane OpenCode Hooks Implementation

## Summary

This document describes the implementation of OpenCode hooks-based automatic memory extraction for the Memory Lane system.

## Problem Statement

According to `.hive/analysis/memory-catcher-issues.md`, the `memory-catcher` skill runs too late - after work is complete via `swarm_record_outcome`. This means:

- Memory-catcher cannot influence tool selection during task execution
- Automatic learning extraction is not integrated into the workflow
- Workers must manually invoke memory-catcher after each task

## Solution: OpenCode Hooks Architecture

The solution uses OpenCode's `tool.execute.after` hook to automatically trigger memory extraction when `swarm_complete` is called.

### Architecture Flow

```
Worker completes task
    ↓
swarm_complete(bead_id, summary, evaluation, files_touched)
    ↓
tool.execute.after hook (index.ts) detects the call
    ↓
Immediate trigger via triggerMemoryExtraction()
    ↓
Memory-catcher skill spawns via CLI
    ↓
Learnings extracted and stored in Memory Lane
```

### Key Components

#### 1. Tool Execute After Hook (index.ts)

**Location:** `src/index.ts`

**Purpose:** Detect `swarm_complete` calls and trigger immediate memory extraction. `swarm_complete` is preferred over `swarm_record_outcome` because it contains the agent's qualitative `summary` and `evaluation` data.

**Implementation:**

```typescript
// In tool.execute.after hook handler
"tool.execute.after": async (input, output) => {
  if (input.tool === "swarm_complete") {
    try {
      const { triggerMemoryExtraction } = await import("./memory-lane/hooks");
      
      // Extract outcome data from tool arguments
      const outcomeData = {
        bead_id: input.args.bead_id,
        summary: input.args.summary,
        files_touched: input.args.files_touched || [],
        success: true, // swarm_complete implies success if it returned
        duration_ms: 0,
        agent_name: input.args.agent_name,
        evaluation: input.args.evaluation,
      };

      // Trigger extraction (non-blocking)
      triggerMemoryExtraction(projectPath, outcomeData, Bun.$);
    } catch (error) {
      console.warn("[memory-lane] Failed to trigger immediate extraction:", error);
    }
  }
}
```

#### 2. Memory Lane Hooks (hooks.ts)

**Location:** `src/memory-lane/hooks.ts`

**Purpose:** Provide synchronous and asynchronous mechanisms for memory extraction and context injection.

**Key Functions:**

- `triggerMemoryExtraction(projectPath, outcomeData, $)`: The core extraction engine. Spawns the `memory-catcher` skill via CLI. Called by both the `tool.execute.after` hook (immediate) and the event-driven listener (fail-safe).
- `createSwarmCompletionHook(projectPath, $)`: An event-driven listener that polls `swarm-mail` for `memory-catcher-extract` messages. This provides a durable background mechanism for extraction if the session hook fails or for long-running processes.
- `truncateTranscript(text, maxChars)`: Prevents Ollama context failures by shortening transcripts to ~16,000 characters before extraction.

### Why This Works

1. **Zero-Mod Integration:** Uses OpenCode's SDK hooks to enhance `opencode-swarm-plugin` behavior without modifying its source code.
2. **Qualitative Depth:** Hooks into `swarm_complete` to capture the agent's self-evaluation and work summary, enabling high-integrity learning.
3. **Robustness:** The dual-trigger architecture (Immediate Hook + Asynchronous Poller) ensures that extraction happens even if one mechanism is interrupted.
4. **Context Preservation:** Automatically injects "Memory Lane Guidance" during generic memory queries, steering the swarm toward more sophisticated retrieval patterns.

## Files Modified

1. **packages/opencode-swarm-plugin/src/index.ts**
   - Added import: `import { getSwarmMailLibSQL, closeSwarmMailLibSQL } from "swarm-mail";`
   - Added memory extraction logic in `tool.execute.after` hook

2. **packages/opencode-swarm-plugin/src/memory-lane/hooks.test.ts**
   - Comprehensive tests for message sending logic
   - Tests for valid/invalid messages, error handling, edge cases

## Testing

Tests are in `packages/opencode-swarm-plugin/src/memory-lane/hooks.test.ts`:

- Message processing with valid `memory-catcher-extract` subject
- Ignoring messages with different subjects
- Malformed JSON handling
- Missing required field warnings
- Invalid field type warnings
- Swarm-mail error handling
- Acknowledge error handling
- Hook lifecycle (start, stop, resume)

Run tests:
```bash
bun test packages/opencode-swarm-plugin/src/memory-lane/hooks.test.ts
```

## Backward Compatibility

This implementation is fully backward compatible:

- Existing `swarm_record_outcome` calls continue to work as before
- Memory-catcher skill can be manually invoked if desired
- The `tool.execute.after` hook adds automatic triggering without breaking existing workflows

## Integration with Swarm Coordination

The swarm-coordination skill (`.opencode/skill/swarm-coordination/SKILL.md`) does not need modification:

- Workers call `swarm_complete` as per the skill's workflow
- The new `tool.execute.after` hook detects these calls and triggers memory extraction automatically
- No changes to swarm-coordination are necessary

## Future Enhancements

Potential improvements:

1. **Tool Swap Detection:** Hook could detect `semantic-memory_find` and transparently swap to `memory-lane_find`
2. **Feedback Loop:** Hook could detect feedback patterns and adjust memory confidence scores
3. **Performance Monitoring:** Track memory extraction latency and success rates

## References

- `.hive/analysis/memory-catcher-issues.md` - Original problem statement
- `.opencode/skill/memory-catcher/SKILL.md` - Memory-catcher skill implementation
- `packages/opencode-swarm-plugin/src/memory-lane/hooks.ts` - Hook implementation
- `packages/opencode-swarm-plugin/src/memory-lane/tools.ts` - Memory Lane tool definitions
