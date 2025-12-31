# ADR 007: RALPH LOOP INTEGRATION

## Status

Pending

## Context

We identified a need to automate "mechanical" iteration loops where an agent performs a task, verifies it (e.g., via `npm test`), and retries upon failure without human intervention. Currently, `executor` agent halts on validation failure to request human guidance, which creates a bottleneck for tasks like large-scale refactoring, dependency updates, or test fixing.

The "Ralph Wiggum" pattern (Autonomous Loops) addresses this by re-injecting failure context (stderr) into the agent's prompt in a loop until a completion criteria is met or a maximum iteration count is reached.

## Analysis

### Ralph Loop Mechanics

- **Core Concept**: A "while loop" that feeds prompt + previous error output back to the model.
- **Original Implementation**: Uses a "Stop Hook" to intercept CLI's exit code (Exit 2) and restart the process.
- **Plugin Constraint**: As a plugin, we cannot control the parent CLI process restart.
- **Adaptation**: We will implement the loop _inside_ a Tool (`ralph_loop`). The tool itself manages iterations, calling the agent repeatedly within a single CLI session/turn, or using recursive tool calls (though recursion depth might be limited). A better approach for the OpenCode architecture is an async loop managed by the tool execution logic.

### Components Required

1.  **Ralph Executor Agent**: A variation of `executor` that is "shameless" about errors—it simply reports them structuredly rather than apologizing.
2.  **Loop Controller**: Logic to handle `max_iterations`, `completion_criteria` execution, and context hydration.
3.  **User Interface**: A simple command `/ralph` to initiate the loop.

## Decision

We will **INTEGRATE** the Ralph Loop pattern using a Tool-Driven approach to simulate autonomous loops within the existing Orchestrator architecture.

### Architecture

1.  **Agent: `ralph-executor`**
    - **Role**: Specialized execution agent.
    - **Behavior**: Optimized for "Edit -> Verify -> Report" cycle.
    - **Output**: Structured JSON indicating `status` (PASS/FAIL) and `error_log`.

2.  **Tool: `ralph_loop`**
    - **Input**: `objective`, `verification_command`, `max_iterations`.
    - **Logic**:
      ```typescript
      while (iteration < max_iterations) {
        result = await agent.execute(objective + last_error);
        verification = await bash.execute(verification_command);
        if (verification.exitCode === 0) return SUCCESS;
        last_error = verification.stderr;
        iteration++;
      }
      ```
    - **State**: Updates `LEDGER.md` to track iterations and prevent context loss if the session actually crashes.

3.  **Command: `/ralph`**
    - **Syntax**: `/ralph "Fix tests in src/utils" --max 10 --criteria "npm test src/utils"`
    - **Implementation**: Maps to `ralph_loop` tool call.

### Implementation Actions

1.  **Define Agent**: Create `src/orchestrator/chief-of-staff/agents/ralph-executor/SKILL.md`.
2.  **Implement Tool**: Add `ralph_loop` to `src/orchestrator/tools.ts`.
3.  **Create Command**: Add `src/opencode/command/ralph.md`.
4.  **Update Ledger**: Ensure `Task` schema can store `iteration_count` metadata.

## Consequences

### Positive

- **Efficiency**: Unblocks "fire and forget" workflows for test fixing and refactoring.
- **Resilience**: Leverages the model's ability to self-correct over multiple attempts.
- **Native Feel**: Integrated as a standard Slash Command.

### Negative

- **Cost**: High risk of token consumption if the loop gets stuck.
- **Safety**: "Infinite loop" risk if `max_iterations` is not strictly enforced.
- **Git Noise**: May generate messy git history (mitigated by squashing at the end).

## References

- [Official Ralph Wiggum Plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-wiggum)
- [Ralph Wiggum: Autonomous Loops for Claude Code](https://paddo.dev/blog/ralph-wiggum-autonomous-loops)
- [Ralph Loop Workflow (Claude Superpowers)](https://github.com/mjohnson518/claude_superpowers/tree/main/workflows/ralph-loop)
- [Ralph Orchestrator](https://github.com/mikeyobrien/ralph-orchstrator)
- [Original Concept Discussion (Twitter)](https://x.com/zeroxBigBoss/status/2006213831471530097?s=20)
- [Autonomous Loop Discussion (Twitter)](https://x.com/bcherny/status/2004916410687050167?s=20)
