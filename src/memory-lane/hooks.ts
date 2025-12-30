/**
 * Memory Lane Injection Hooks
 *
 * Automatically injects relevant memories into the OpenCode session
 * during compaction or initialization.
 *
 * Architecture:
 * - Primary: tool.execute.after (swarm_complete) - immediate, no polling
 * - No swarm-mail dependencies - pure tool-based interception
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const TRANSCRIPT_MAX_CHARS = 16000;
export const MEMORY_CATCHER_TIMEOUT_MS = 300000;
export const HANDOFF_SETTLE_DELAY_MS = 800;

export interface SwarmCompletionData {
  transcript?: string;
  summary: string;
  files_touched: string[];
  success: boolean;
  duration_ms: number;
  error_count?: number;
  bead_id?: string;
  epic_id?: string;
  agent_name?: string;
  evaluation?: string;
}

/**
 * Helper to log events to a file for debugging/verification
 */
function logToFile(projectPath: string, message: string) {
  try {
    const logDir = join(projectPath, '.hive');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const logFile = join(logDir, 'memory-lane.log');
    const timestamp = new Date().toISOString();
    appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[memory-lane] Failed to write to log file:', error);
  }
}

/**
 * Truncate a transcript to roughly 4000 tokens (approx 16000 characters)
 * to prevent context window failures in local LLMs like Ollama.
 *
 * @param text - The full transcript text
 * @param maxChars - Maximum characters (default: TRANSCRIPT_MAX_CHARS)
 * @returns Truncated text with an indicator
 */
export function truncateTranscript(text: string, maxChars: number = TRANSCRIPT_MAX_CHARS): string {
  if (!text || text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  return `${truncated}\n\n[... TRANSCRIPT TRUNCATED TO ${maxChars} CHARACTERS TO PREVENT CONTEXT ROT ...]`;
}

/**
 * Triggers the memory extraction process by spawning a memory-catcher subagent.
 * Called from tool.execute.after hook when swarm_complete is intercepted.
 *
 * @param projectPath - Project directory path
 * @param outcomeData - Data about the completed task
 * @param shellHelper - Shell execution helper ($)
 */
export async function triggerMemoryExtraction(
  projectPath: string,
  outcomeData: SwarmCompletionData,
  shellHelper:
    | ((
      cmd: TemplateStringsArray,
      ...args: string[]
    ) => {
      quiet(): unknown;
      nothrow(): unknown;
      signal(signal: AbortSignal): unknown;
      then(onfulfilled?: (value: unknown) => unknown): unknown;
    })
    | null
): Promise<void> {
  logToFile(projectPath, `Triggering extraction for task ${outcomeData.bead_id || 'unknown'}`);

  const safeTranscript = outcomeData.transcript
    ? truncateTranscript(outcomeData.transcript)
    : 'Not provided in immediate outcome.';

  if (shellHelper) {
    const instruction = `SYSTEM: Memory Lane Extraction
CONTEXT: Task ${outcomeData.bead_id || 'unknown'} completed (Epic: ${outcomeData.epic_id || 'unknown'}).
SUMMARY: ${outcomeData.summary}
FILES: ${outcomeData.files_touched.join(', ')}
TRANSCRIPT (TRUNCATED):
${safeTranscript}

INSTRUCTION:
1. skills_use(name="memory-catcher")
2. Extract valuable learnings from the outcome summary and the provided truncated transcript.
3. Resolve entities from the touched files.
4. Store learnings using memory-lane_store (NOT semantic-memory_store).
5. Exit when done.`;

    logToFile(projectPath, 'Spawning opencode CLI for memory-catcher...');

    const controller = new globalThis.AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      logToFile(projectPath, `Timeout: aborting process for ${outcomeData.bead_id}`);
      controller.abort();
    }, MEMORY_CATCHER_TIMEOUT_MS);

    try {
      const shell = shellHelper`opencode run --agent "chief-of-staff/memory-catcher" ${instruction}`;
      const quietShell = (shell as { quiet(): unknown }).quiet();
      const nothrowShell = (quietShell as { nothrow(): unknown }).nothrow();

      const shellResult = await nothrowShell;

      const result = shellResult as { exitCode: number };
      logToFile(projectPath, `CLI process exited with code ${result.exitCode}`);
    } catch (spawnError) {
      const errorMessage = spawnError instanceof Error ? spawnError.toString() : String(spawnError);
      logToFile(projectPath, `Spawn error: ${errorMessage}`);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  } else {
    logToFile(projectPath, 'Shell helper unavailable - skipping spawn');
  }
}
