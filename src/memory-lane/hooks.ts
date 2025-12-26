/**
 * Memory Lane Injection Hooks
 *
 * Automatically injects relevant memories into the OpenCode session
 * during compaction or initialization.
 */

import { getSwarmMailLibSQL } from "swarm-mail";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Swarm completion hook data structure
 */
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
 * Hook listener return type
 */
export type HookListener = () => void;

/**
 * Helper to log events to a file for debugging/verification
 */
function logToFile(projectPath: string, message: string) {
  try {
    const logDir = join(projectPath, ".hive");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const logFile = join(logDir, "memory-lane.log");
    const timestamp = new Date().toISOString();
    appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (error) {
    console.warn("[swarm-completion-hook] Failed to write to log file:", error);
  }
}

/**
 * Creates a hook that listens for swarm-mail messages and spawns memory-catcher skill
 *
 * ## Event-Driven Architecture
 *
 * This hook implements event-driven memory extraction:
 * 1. Initialize swarm-mail adapter to listen for incoming messages
 * 2. Listen for messages with subject 'memory-catcher-extract'
 * 3. Parse message body to extract outcome data
 * 4. Spawn memory-catcher skill as Task subagent with data
 * 5. Graceful error handling - never throws, log warnings only
 *
 * ## Usage
 *
 * ```typescript
 * const hook = await createSwarmCompletionHook("/path/to/project");
 * // Hook now listening for messages
 * // When message with subject 'memory-catcher-extract' arrives,
 * // it automatically parses and spawns memory-catcher
 * ```
 *
 * @param projectPath - Project directory path
 * @param $ - Shell execution helper (from plugin context)
 * @returns Hook listener function (call to stop listening)
 */
export async function createSwarmCompletionHook(
  projectPath: string,
  $: any,
  pollInterval: number = 5000
): Promise<HookListener> {
  let swarmMail: any = null;
  let isRunning = false;
  let pollTimeout: NodeJS.Timeout | null = null;
  const processingMessageIds = new Set<string>();
  const processedMessageIds = new Set<string>();

  try {
    // Initialize swarm-mail adapter
    swarmMail = await getSwarmMailLibSQL(projectPath);
    console.log(`[swarm-completion-hook] Initialized for project: ${projectPath}`);
    logToFile(projectPath, `Hook initialized and listening for project: ${projectPath}`);

    // Register memory-catcher as an agent to receive messages
    try {
      await swarmMail.registerAgent(
        projectPath,
        "memory-catcher"
      );
      console.log("[swarm-completion-hook] Registered memory-catcher agent");
    } catch (error) {
      console.warn("[swarm-completion-hook] Failed to register agent:", error);
      // Continue anyway - agent might already be registered
    }

    isRunning = true;
    let pollCount = 0;

    // Define polling function
    const poll = async () => {
      if (!isRunning) return;
      pollCount++;
      
      // Log heartbeat every minute (12 polls of 5s)
      if (pollCount % 12 === 0) {
        logToFile(projectPath, `Hook heartbeat: still polling ${projectPath}`);
      }

      try {
        // Check inbox for memory-catcher-extract messages
        const inbox = await swarmMail.getInbox(projectPath, "memory-catcher", {
          limit: 10,
          includeBodies: true
        });

        for (const message of inbox) {
          // Process only messages with matching subject that aren't already being processed
          if (message.subject === "memory-catcher-extract" && 
              !processingMessageIds.has(message.id) && 
              !processedMessageIds.has(message.id)) {
            processingMessageIds.add(message.id);
            try {
              // We process messages sequentially within a poll to avoid resource exhaustion
              // but you could use Promise.all for parallelism with a limit if needed.
              await processMessage(swarmMail, projectPath, message, $);
              processedMessageIds.add(message.id);
            } finally {
              processingMessageIds.delete(message.id);
            }
          }
        }
      } catch (error) {
        console.warn("[swarm-completion-hook] Polling error:", error);
      }

      // Schedule next poll only after current poll is finished
      if (isRunning) {
        pollTimeout = setTimeout(poll, pollInterval);
      }
    };

    // Start first poll
    poll();

    console.log("[swarm-completion-hook] Listening for 'memory-catcher-extract' messages");

  } catch (error) {
    console.warn("[swarm-completion-hook] Initialization failed:", error);
    logToFile(projectPath, `Initialization failed: ${error}`);
  }

  // Return function to stop the hook
  const stopListener = () => {
    isRunning = false;
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }
    console.log("[swarm-completion-hook] Stopped listening");
    logToFile(projectPath, "Hook stopped listening");
  };

  return stopListener;
}

/**
 * Truncate a transcript to roughly 4000 tokens (approx 16000 characters)
 * to prevent context window failures in local LLMs like Ollama.
 * 
 * @param text - The full transcript text
 * @param maxChars - Maximum characters (default: 16000)
 * @returns Truncated text with an indicator
 */
function truncateTranscript(text: string, maxChars: number = 16000): string {
  if (!text || text.length <= maxChars) return text;
  
  const truncated = text.slice(0, maxChars);
  return `${truncated}\n\n[... TRANSCRIPT TRUNCATED TO ${maxChars} CHARACTERS TO PREVENT CONTEXT ROT ...]`;
}

/**
 * Process a single message and spawn memory-catcher task
 *
 * @param swarmMail - Swarm mail adapter
 * @param projectPath - Project path
 * @param message - Message to process
 * @param $ - Shell execution helper
 */
async function processMessage(
  swarmMail: any,
  projectPath: string,
  message: any,
  $: any
): Promise<void> {
  try {
    // Parse message body to extract outcome data
    const outcomeData = parseMessageBody(message.body);

    if (!outcomeData) {
      console.warn(
        `[swarm-completion-hook] Failed to parse message body: ${message.id}`
      );
      logToFile(projectPath, `Failed to parse body for message ${message.id}`);
      return;
    }

    // Trigger the extraction process
    await triggerMemoryExtraction(projectPath, outcomeData, $);

    // Acknowledge message as processed
    try {
      await swarmMail.acknowledgeMessage(
        projectPath,
        message.id,
        "memory-catcher"
      );
      logToFile(projectPath, `Acknowledged message ${message.id}`);
    } catch (error) {
      console.warn("[swarm-completion-hook] Failed to acknowledge message:", error);
      logToFile(projectPath, `Failed to acknowledge message: ${error}`);
    }

  } catch (error) {
    console.warn(
      `[swarm-completion-hook] Error processing message ${message.id}:`,
      error
    );
    logToFile(projectPath, `Error processing message: ${error}`);
    // Never throw - hook must continue processing
  }
}

/**
 * Triggers the memory extraction process by spawning a memory-catcher subagent.
 * Can be called from event-driven hooks or direct tool hooks.
 * 
 * @param projectPath - Project directory path
 * @param outcomeData - Data about the completed task
 * @param $ - Shell execution helper
 */
export async function triggerMemoryExtraction(
  projectPath: string,
  outcomeData: SwarmCompletionData,
  $: any
): Promise<void> {
  console.log(
    `[memory-lane] Triggering extraction for ${outcomeData.bead_id || "unknown"}`
  );
  logToFile(projectPath, `Triggering extraction for task ${outcomeData.bead_id || "unknown"}`);

  // Truncate transcript to prevent Ollama context failures
  const safeTranscript = outcomeData.transcript 
    ? truncateTranscript(outcomeData.transcript) 
    : "Not provided in immediate outcome. Memory-catcher will fetch from swarm-mail if needed.";

  // Spawn memory-catcher using opencode CLI
  if ($) {
    try {
      const instruction = `SYSTEM: Memory Lane Extraction
CONTEXT: Task ${outcomeData.bead_id || "unknown"} completed (Epic: ${outcomeData.epic_id || "unknown"}).
SUMMARY: ${outcomeData.summary}
FILES: ${outcomeData.files_touched.join(", ")}
TRANSCRIPT (TRUNCATED):
${safeTranscript}

INSTRUCTION:
1. skills_use(name="memory-catcher")
2. Extract valuable learnings from the outcome summary and the provided truncated transcript.
3. Resolve entities from the touched files.
4. Store learnings using memory-lane_store (NOT semantic-memory_store).
5. Exit when done.`;

      console.log(`[memory-lane] Spawning memory-catcher CLI process...`);
      logToFile(projectPath, "Spawning opencode CLI for memory-catcher...");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[memory-lane] Memory extraction timed out for ${outcomeData.bead_id}, aborting...`);
        logToFile(projectPath, `Timeout: aborting process for ${outcomeData.bead_id}`);
        controller.abort();
      }, 300000); // 5 minutes

      try {
        const result = await $`opencode run --agent "swarm/worker" ${instruction}`
          .quiet()
          .nothrow()
          .signal(controller.signal);
        
        console.log(`[memory-lane] Memory extraction process finished with code ${result.exitCode}`);
        logToFile(projectPath, `CLI process exited with code ${result.exitCode}`);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (spawnError) {
      console.warn(`[memory-lane] Failed to spawn memory-catcher process:`, spawnError);
      logToFile(projectPath, `Spawn error: ${spawnError}`);
    }
  } else {
    console.warn(`[memory-lane] Shell helper not available, skipping memory extraction spawn`);
    logToFile(projectPath, "Shell helper ($) unavailable - skipping spawn");
  }
}

/**
 * Parse message body to extract outcome data
 *
 * @param body - Message body (JSON string)
 * @returns Parsed outcome data or null if parsing fails
 */
function parseMessageBody(body: string): SwarmCompletionData | null {
  try {
    const parsed = JSON.parse(body);

    // Validate required fields
    if (!parsed.summary || typeof parsed.summary !== "string") {
      console.warn("[swarm-completion-hook] Missing or invalid summary field");
      return null;
    }

    if (!Array.isArray(parsed.files_touched)) {
      console.warn("[swarm-completion-hook] Invalid files_touched field");
      return null;
    }

    if (typeof parsed.success !== "boolean") {
      console.warn("[swarm-completion-hook] Invalid success field");
      return null;
    }

    if (typeof parsed.duration_ms !== "number") {
      console.warn("[swarm-completion-hook] Invalid duration_ms field");
      return null;
    }

    // Return validated data with defaults for optional fields
    return {
      transcript: parsed.transcript,
      summary: parsed.summary,
      files_touched: parsed.files_touched,
      success: parsed.success,
      duration_ms: parsed.duration_ms,
      error_count: parsed.error_count || 0,
      bead_id: parsed.bead_id,
      epic_id: parsed.epic_id,
      agent_name: parsed.agent_name,
      evaluation: parsed.evaluation
    };
  } catch (error) {
    console.warn("[swarm-completion-hook] JSON parse error:", error);
    return null;
  }
}
