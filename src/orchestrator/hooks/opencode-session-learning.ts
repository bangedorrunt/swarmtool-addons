/**
 * OpenCode Session Learning Hooks
 *
 * Wires the self-learning workflow into actual OpenCode lifecycle events.
 * Connects to real Memory Lane database for persistent cross-session learning.
 *
 * Events used:
 * - session.created: Initialize learning context
 * - message.created (first user message): Inject relevant learnings
 * - session.idle: Trigger learning capture
 * - session.deleted: Cleanup
 */

import type { PluginInput } from '@opencode-ai/plugin';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryLaneStore } from '../../memory-lane/memory-store';
import type { MemoryType } from '../../memory-lane/taxonomy';
import { getLearningExtractor } from '../learning-extractor';
import { getEventDrivenLedger } from '../event-driven-ledger';
import { createModuleLogger } from '../../utils/logger';

const log = createModuleLogger('SessionLearning');

// Re-export for compatibility with standalone usage
export {
  trackAssumption,
  getTrackedAssumptions,
  clearTrackedAssumptions,
  verifyAssumption,
  type TrackedAssumption,
} from './session-learning';

interface SessionLearningConfig {
  /** Max memories to inject at session start. Default: 10 */
  maxMemories?: number;
  /** Path to project ledger relative to cwd. Default: .opencode/LEDGER.md */
  ledgerPath?: string;
  /** Enable learning capture at session end. Default: true */
  captureEnabled?: boolean;
  /** Delay before capturing (allows user to continue). Default: 2000ms */
  captureDelay?: number;
  /** skill_agent function for spawning memory-catcher */
  skillAgent?: (_: unknown) => Promise<any>;
}

interface Memory {
  id: string;
  type: string;
  information: string;
  confidence?: number;
  entities?: string[];
}

/**
 * Extract keywords from user's first message for Memory Lane query
 */
function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'and',
    'but',
    'if',
    'or',
    'because',
    'until',
    'while',
    'this',
    'that',
    'these',
    'those',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'him',
    'she',
    'her',
    'it',
    'its',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'whom',
    'please',
    'help',
    'want',
    'need',
    'like',
  ]);

  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 10);
}

/**
 * Build context injection string from memories and ledger
 */
function buildLearningContext(memories: Memory[], ledger: string | null): string {
  const sections: string[] = [];

  if (memories.length > 0) {
    sections.push('\n## 📚 Relevant Past Learnings\n');
    sections.push('The following insights from previous sessions may help:\n');

    const typeOrder = [
      'correction',
      'decision',
      'preference',
      'anti_pattern',
      'pattern',
      'insight',
    ];
    const byType: Record<string, Memory[]> = {};

    for (const m of memories) {
      const type = m.type || 'insight';
      if (!byType[type]) byType[type] = [];
      byType[type].push(m);
    }

    for (const type of typeOrder) {
      if (byType[type]?.length) {
        for (const m of byType[type]) {
          const confidenceNote = m.confidence && m.confidence < 0.5 ? ' ⚠️ (low confidence)' : '';
          sections.push(`- **[${type}]**: ${m.information}${confidenceNote}`);
        }
      }
    }

    sections.push('');
  }

  if (ledger) {
    sections.push('\n## 📋 Continuity State\n');
    sections.push('Previous work detected. Resume from LEDGER.md.\n');
  }

  return sections.join('\n');
}

/**
 * Truncate a transcript to prevent context window failures
 */
function truncateTranscript(text: string, maxChars: number = 16000): string {
  if (!text || text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  return `${truncated}\n\n[... TRANSCRIPT TRUNCATED TO ${maxChars} CHARACTERS TO PREVENT CONTEXT ROT ...]`;
}

/**
 * Create OpenCode Session Learning Hook
 *
 * Integrates with actual OpenCode lifecycle events:
 * - Injects relevant past learnings on first user message
 * - Captures learnings when session goes idle
 * - Connects to real Memory Lane database
 */
export function createOpenCodeSessionLearningHook(
  ctx: PluginInput,
  config: SessionLearningConfig = {}
) {
  const {
    maxMemories = 10,
    ledgerPath = '.opencode/LEDGER.md',
    captureEnabled = true,
    captureDelay = 2000,
    skillAgent,
  } = config;

  // Session state tracking
  const sessionFirstMessages = new Map<string, boolean>();
  const sessionInjectedContent = new Map<string, string>();
  const sessionUserMessages = new Map<string, string[]>();
  const sessionModifiedFiles = new Map<string, string[]>();
  const pendingCaptures = new Map<string, ReturnType<typeof setTimeout>>();

  // Memory Lane adapter (lazy initialized)
  let memoryAdapter: MemoryLaneStore | null = null;

  async function getAdapter(): Promise<MemoryLaneStore> {
    if (!memoryAdapter) {
      memoryAdapter = new MemoryLaneStore();
    }
    return memoryAdapter;
  }

  /**
   * Query Memory Lane for relevant learnings
   */
  async function queryMemoryLane(query: string): Promise<Memory[]> {
    const adapter = await getAdapter();
    const result = await adapter
      .smartFind({
        query,
        limit: maxMemories,
      })
      .catch(() => {
        return { results: [] };
      });

    return result.results.map((r: any) => ({
      id: r.id,
      type: r.metadata?.memory_type || 'insight',
      information: r.content,
      confidence: r.effective_confidence,
      entities: r.metadata?.entities,
    }));
  }

  /**
   * Store a learning to Memory Lane
   */
  async function storeToMemoryLane(
    information: string,
    type: MemoryType,
    entities?: string[]
  ): Promise<void> {
    const adapter = await getAdapter();
    await adapter
      .store({
        information,
        type,
        entities,
      })
      .catch(() => {});
  }

  /**
   * Load ledger if exists
   */
  async function loadLedger(): Promise<string | null> {
    const fullPath = join(process.cwd(), ledgerPath);
    if (existsSync(fullPath)) {
      return readFile(fullPath, 'utf-8');
    }
    return null;
  }

  /**
   * Capture learnings from session
   */
  async function captureLearnings(sessionID: string) {
    const userMessages = sessionUserMessages.get(sessionID) || [];
    const modifiedFiles = sessionModifiedFiles.get(sessionID) || [];

    if (userMessages.length === 0) return;

    const extractor = getLearningExtractor();
    const ledger = getEventDrivenLedger();

    // 1. Extract learnings using the advanced extractor
    const transcript = userMessages.join('\n---\n');
    const learnings = await extractor.extractFromEvents([
      {
        id: `session_${sessionID}_transcript`,
        type: 'agent.completed' as any,
        stream_id: 'session-learning',
        correlation_id: sessionID,
        actor: 'user',
        payload: { result: transcript },
        timestamp: Date.now(),
      },
    ]);

    // 2. Store extracted learnings to Memory Lane and Ledger Event Stream
    for (const learning of learnings) {
      await storeToMemoryLane(learning.information, learning.type as any, learning.entities);
      await ledger.emit('ledger.learning.extracted', {
        learningType: learning.type,
        learningContent: learning.information,
      });
    }

    // 3. Auto-update LEDGER.md progress for modified files
    if (modifiedFiles.length > 0) {
      // Auto-tracking: This ensures even built-in agents contribute to the project history.
      // We link this to the current session as a background task.
      await ledger.emit('ledger.task.completed', {
        epicId: 'auto-track-epic', // Generic epic for background work
        taskId: `auto-track-${sessionID.slice(-4)}-${Date.now().toString().slice(-4)}`,
        taskTitle: `Agent modified files: ${modifiedFiles.join(', ')}`,
        result: `Successfully modified ${modifiedFiles.length} files during session ${sessionID}`,
      });
    }

    // 4. Spawn memory-catcher for deeper extraction if needed
    if (skillAgent) {
      const transcriptSummary = truncateTranscript(transcript);

      await skillAgent({
        skill_name: 'chief-of-staff',
        agent_name: 'memory-catcher',
        prompt: 'Extract deep patterns and anti-patterns from this session.',
        context: {
          transcript_summary: transcriptSummary,
          files_touched: modifiedFiles,
          session_id: sessionID,
        },
      }).catch((e: any) => {
        log.error({ err: e }, 'memory-catcher failed');
      });
    }
  }

  /**
   * Handle first user message - inject learnings
   */
  async function handleFirstMessage(sessionID: string, content: string): Promise<string | null> {
    const keywords = extractKeywords(content);
    if (keywords.length === 0) {
      return null;
    }

    // Query Memory Lane
    const query = keywords.join(' ');
    const memories = await queryMemoryLane(query);

    // Check for ledger
    const ledger = await loadLedger();

    if (memories.length === 0 && !ledger) {
      return null;
    }

    const injection = buildLearningContext(memories, ledger);
    sessionInjectedContent.set(sessionID, injection);

    return injection;
  }

  /**
   * Main event handler
   */
  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined;

    // Helper to get session ID from various possible locations
    const getSessionID = (): string | undefined => {
      if (props?.sessionID) return props.sessionID as string;
      if (props?.sessionId) return props.sessionId as string;
      if (props?.id) return props.id as string;
      const info = props?.info as Record<string, unknown> | undefined;
      if (info?.sessionID) return info.sessionID as string;
      if (info?.sessionId) return info.sessionId as string;
      if (info?.id) return info.id as string;
      return undefined;
    };

    const sessionID = getSessionID();

    // Session created - initialize tracking
    if (event.type === 'session.created' && sessionID) {
      sessionFirstMessages.set(sessionID, false);
      sessionUserMessages.set(sessionID, []);
      sessionModifiedFiles.set(sessionID, []);
      return;
    }

    // Message created - check for first user message
    if (event.type === 'message.created' && sessionID) {
      const info = props?.info as Record<string, unknown> | undefined;
      const role = info?.role as string | undefined;
      const content = info?.content as string | undefined;

      if (!content) return;

      // Track user messages
      if (role === 'user') {
        const messages = sessionUserMessages.get(sessionID) || [];
        messages.push(content);
        sessionUserMessages.set(sessionID, messages);

        // First user message - inject learnings
        if (!sessionFirstMessages.get(sessionID)) {
          sessionFirstMessages.set(sessionID, true);
          const injection = await handleFirstMessage(sessionID, content);

          if (injection) {
            // Return injection to be added to system prompt
            return { systemPromptAddition: injection };
          }
        }

        // Cancel any pending capture if user is active
        const pending = pendingCaptures.get(sessionID);
        if (pending) {
          clearTimeout(pending);
          pendingCaptures.delete(sessionID);
        }
      }

      return;
    }

    // Tool executed - track file modifications
    if (event.type === 'tool.execute.after' && sessionID) {
      const toolName = props?.toolName as string | undefined;
      const result = props?.result as Record<string, unknown> | undefined;

      // Track file modifications from ANY tool that returns a path in its result
      // or from known write tools.
      const filePath =
        (result?.path as string) || (result?.filePath as string) || (props?.path as string);

      if (filePath) {
        const files = sessionModifiedFiles.get(sessionID) || [];
        if (!files.includes(filePath)) {
          files.push(filePath);
          sessionModifiedFiles.set(sessionID, files);
        }
      }

      return;
    }

    // Session idle - schedule learning capture
    if (event.type === 'session.idle' && captureEnabled && sessionID) {
      // Cancel any existing pending capture
      const existing = pendingCaptures.get(sessionID);
      if (existing) {
        clearTimeout(existing);
      }

      // Schedule capture with delay
      const timer = setTimeout(async () => {
        pendingCaptures.delete(sessionID);
        await captureLearnings(sessionID);
      }, captureDelay);

      pendingCaptures.set(sessionID, timer);
      return;
    }

    // Session deleted - cleanup
    if (event.type === 'session.deleted' && sessionID) {
      // Final capture before cleanup
      if (captureEnabled) {
        await captureLearnings(sessionID);
      }

      // Cleanup
      sessionFirstMessages.delete(sessionID);
      sessionInjectedContent.delete(sessionID);
      sessionUserMessages.delete(sessionID);
      sessionModifiedFiles.delete(sessionID);

      const pending = pendingCaptures.get(sessionID);
      if (pending) {
        clearTimeout(pending);
        pendingCaptures.delete(sessionID);
      }

      return;
    }

    // Plugin shutdown - cleanup all pending captures
    if (event.type === 'plugin.shutdown' || event.type === 'session.end') {
      // Clear all pending timers
      for (const [sessionId, timer] of pendingCaptures) {
        clearTimeout(timer);
      }
      pendingCaptures.clear();

      // Clear all session state
      sessionFirstMessages.clear();
      sessionInjectedContent.clear();
      sessionUserMessages.clear();
      sessionModifiedFiles.clear();

      return;
    }
  };
}

/**
 * Quick Memory Lane Query Tool
 *
 * Use this to manually query learnings without the full session hook.
 */
export async function queryLearnings(query: string, limit: number = 10): Promise<Memory[]> {
  const adapter = new MemoryLaneStore();
  const result = await adapter.smartFind({ query, limit }).finally(() => adapter.close());
  return result.results.map((r: any) => ({
    id: r.id,
    type: r.metadata?.memory_type || 'insight',
    information: r.content,
    confidence: r.effective_confidence,
    entities: r.metadata?.entities,
  }));
}

/**
 * Store Learning Tool
 *
 * Use this to manually store a learning.
 */
export async function storeLearning(
  information: string,
  type: MemoryType,
  entities?: string[]
): Promise<string> {
  const memory = new MemoryLaneStore();
  const result = await memory
    .store({
      information,
      type,
      entities,
    })
    .finally(() => memory.close());
  return result.id;
}
