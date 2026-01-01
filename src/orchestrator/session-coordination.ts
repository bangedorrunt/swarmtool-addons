/**
 * Session Coordination - Deadlock-Free Communication + Self-Learning
 *
 * Implements OpenCode native 3-way communication to avoid deadlocks:
 *
 * 1. Parent-Child Hierarchy: session.create({ parentID })
 * 2. Context Passing: Pass results via child session messages
 * 3. Event Stream: Use promptAsync + children() for coordination
 * 4. Self-Learning: Inject relevant past learnings into prompts
 *
 * Key Insight: The session.promptAsync pattern allows the parent to
 * register intent without blocking, then gather results later.
 */

import { loadActorState } from './actor/state';
import { processMessage } from './actor/core';
import { queryLearnings } from './hooks/opencode-session-learning';
import { getDurableStreamOrchestrator, StreamEvent } from './durable-stream';

/**
 * Result of spawning a child agent
 */
export interface SpawnResult {
  success: boolean;
  sessionId: string;
  agent: string;
  status: 'spawned' | 'completed' | 'failed';
  result?: string;
  error?: string;
  learningsInjected?: number;
  spawnEventId?: string;
  completionEventId?: string;
}

/**
 * Options for spawning with coordination
 */
export interface SpawnOptions {
  /** Parent session ID for hierarchy */
  parentSessionId?: string;
  /** Wait for completion (true) or fire-and-forget (false) */
  waitForCompletion?: boolean;
  /** Maximum wait time in ms (default: 60000) */
  timeoutMs?: number;
  /** Callback on status change */
  onStatusChange?: (_status: string) => void;
  /** Inject relevant learnings from Memory Lane (default: true) */
  injectLearnings?: boolean;
  /** Max learnings to inject (default: 5) */
  maxLearnings?: number;
}

/**
 * Extract keywords from prompt for learning query
 */
function extractKeywords(text: string): string {
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
    'please',
    'help',
    'want',
    'need',
    'like',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 8)
    .join(' ');
}

/**
 * Spawn a child agent with proper coordination + learning injection
 *
 * Uses the OpenCode native pattern:
 * 1. Query Memory Lane for relevant learnings
 * 2. Create child session with parentID
 * 3. Send prompt with injected learnings
 * 4. Monitor via session.children() + session.status()
 * 5. Gather result from session.messages()
 */
export async function spawnChildAgent(
  client: any,
  agent: string,
  prompt: string,
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  const {
    parentSessionId,
    waitForCompletion = true,
    timeoutMs = 60000,
    onStatusChange,
    injectLearnings = true,
    maxLearnings = 5,
  } = options;

  let finalPrompt = prompt;
  let learningsInjected = 0;
  let spawnEventId: string | undefined;
  let completionEventId: string | undefined;

  // 1. Query and inject learnings if enabled
  if (injectLearnings) {
    try {
      const keywords = extractKeywords(prompt);
      if (keywords.length > 0) {
        const learnings = await queryLearnings(keywords, maxLearnings);
        if (learnings.length > 0) {
          const learningContext = learnings.map((l) => `- [${l.type}] ${l.information}`).join('\n');

          finalPrompt = `## Relevant Past Learnings\n${learningContext}\n\n---\n\n${prompt}`;
          learningsInjected = learnings.length;
          onStatusChange?.(`injected ${learningsInjected} learnings`);
        }
      }
    } catch {
      // Learning injection failed - continue without learnings
    }
  }

  // 2. Create child session
  let childSessionId: string;
  try {
    const createResult = await client.session.create({
      body: {
        parentID: parentSessionId,
        title: `Child: ${agent}`,
      },
    });

    if (createResult.error) {
      throw new Error(JSON.stringify(createResult.error));
    }

    childSessionId = createResult.data.id;
    onStatusChange?.('created');

    const durableStream = getDurableStreamOrchestrator();
    const spawnEvent = await durableStream.spawnAgent(
      childSessionId,
      parentSessionId,
      agent,
      finalPrompt
    );
    spawnEventId = spawnEvent.id;
  } catch (err: any) {
    return {
      success: false,
      sessionId: '',
      agent,
      status: 'failed',
      error: `Failed to create child session: ${err.message}`,
    };
  }

  // 3. Track spawn in actor state (if initialized)
  const actorState = await loadActorState();
  if (actorState) {
    await processMessage(actorState, {
      type: 'subagent.spawn',
      payload: { agent, sessionId: childSessionId, prompt: finalPrompt },
    });
  }

  // 4. Send prompt to child (this triggers execution)
  try {
    await client.session.prompt({
      path: { id: childSessionId },
      body: {
        agent,
        parts: [{ type: 'text', text: finalPrompt }],
      },
    });
    onStatusChange?.('prompted');
  } catch (err: any) {
    // Track failure
    if (actorState) {
      await processMessage((await loadActorState()) || actorState, {
        type: 'subagent.failed',
        payload: { sessionId: childSessionId, agent, error: err.message },
      });
    }
    return {
      success: false,
      sessionId: childSessionId,
      agent,
      status: 'failed',
      error: `Failed to prompt child: ${err.message}`,
    };
  }

  // 5. If fire-and-forget, return immediately
  if (!waitForCompletion) {
    return {
      success: true,
      sessionId: childSessionId,
      agent,
      status: 'spawned',
      learningsInjected,
      spawnEventId,
    };
  }

  // 6. Wait for completion using event-driven approach
  const startTime = Date.now();
  const result = await waitForSessionCompletion(
    client,
    childSessionId,
    agent,
    timeoutMs,
    onStatusChange
  );
  completionEventId = result.completionEventId;

  // 7. Track completion/failure in actor state AND durable stream
  const durableStream = getDurableStreamOrchestrator();
  if (result.status === 'completed') {
    await durableStream.completeAgent(
      childSessionId,
      agent,
      result.result || '',
      Date.now() - startTime
    );
  } else {
    await durableStream.failAgent(childSessionId, agent, result.error || 'Unknown error');
  }

  if (actorState) {
    const currentState = await loadActorState();
    if (currentState) {
      const msg =
        result.status === 'completed'
          ? ({
              type: 'subagent.complete' as const,
              payload: { sessionId: childSessionId, agent, result: result.result?.slice(0, 500) },
            } as const)
          : ({
              type: 'subagent.failed' as const,
              payload: { sessionId: childSessionId, agent, error: result.error || 'Unknown error' },
            } as const);

      await processMessage(currentState, msg);
    }
  }

  return { ...result, learningsInjected, spawnEventId, completionEventId };
}

/**
 * Wait for a session to complete
 *
 * Uses Event-Driven Promise with DurableStream
 */
export async function waitForSessionCompletion(
  client: any,
  sessionId: string,
  agent: string,
  timeoutMs: number,
  onStatusChange?: (status: string) => void
): Promise<SpawnResult> {
  // 1. Check history for missed events (Race condition handling)
  // Check DurableStream history first to avoid deadlocks if event fired before subscription
  const durableStream = getDurableStreamOrchestrator();
  const history = durableStream.getEventHistory();

  // Find the LAST relevant event for this session
  const previousEvent = history.find(
    (e) => e.sessionId === sessionId && (e.type === 'agent.completed' || e.type === 'agent.failed')
  );

  if (previousEvent) {
    if (previousEvent.type === 'agent.completed') {
      return {
        success: true,
        sessionId,
        agent,
        status: 'completed',
        result: previousEvent.payload.result as string,
        completionEventId: previousEvent.id,
      };
    } else {
      return {
        success: false,
        sessionId,
        agent,
        status: 'failed',
        error: previousEvent.payload.error as string,
        completionEventId: previousEvent.id,
      };
    }
  }

  // 2. Setup Event-Driven Promise
  let cleanup: (() => void) | undefined;

  const eventPromise = new Promise<SpawnResult>((resolve) => {
    const handler = (event: StreamEvent) => {
      if (event.sessionId !== sessionId) return;

      if (event.type === 'agent.completed') {
        resolve({
          success: true,
          sessionId,
          agent,
          status: 'completed',
          result: event.payload.result as string,
          completionEventId: event.id,
        });
      } else if (event.type === 'agent.failed') {
        resolve({
          success: false,
          sessionId,
          agent,
          status: 'failed',
          error: event.payload.error as string,
          completionEventId: event.id,
        });
      }
    };

    const unsubCompleted = durableStream.subscribe('agent.completed', handler);
    const unsubFailed = durableStream.subscribe('agent.failed', handler);

    cleanup = () => {
      unsubCompleted();
      unsubFailed();
    };
  });

  const timeoutPromise = new Promise<SpawnResult>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  // 3. Execute Race
  try {
    return await Promise.race([eventPromise, timeoutPromise]);
  } catch (err: any) {
    return {
      success: false,
      sessionId,
      agent,
      status: 'failed',
      error: err.message,
      completionEventId: undefined,
    };
  } finally {
    if (cleanup) cleanup();
  }
}

async function fetchSessionResult(
  client: any,
  sessionId: string,
  agent: string
): Promise<SpawnResult> {
  try {
    const msgResult = await client.session.messages({
      path: { id: sessionId },
    });

    if (msgResult.error) {
      return {
        success: false,
        sessionId,
        agent,
        status: 'failed',
        error: JSON.stringify(msgResult.error),
      };
    }

    const messages = msgResult.data || [];
    const lastAssistantMsg = messages
      .filter((m: any) => m.info?.role === 'assistant')
      .sort((a: any, b: any) => (b.info?.time?.created || 0) - (a.info?.time?.created || 0))[0];

    if (!lastAssistantMsg) {
      return {
        success: false,
        sessionId,
        agent,
        status: 'failed',
        error: 'No response from agent',
        completionEventId: undefined,
      };
    }

    const responseText =
      lastAssistantMsg.parts
        ?.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n') || '';

    return {
      success: true,
      sessionId,
      agent,
      status: 'completed',
      result: responseText,
      completionEventId: undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      sessionId,
      agent,
      status: 'failed',
      error: `Failed to fetch result: ${err.message}`,
      completionEventId: undefined,
    };
  }
}

/**
 * Get all child sessions for a parent
 *
 * Uses session.children() to discover spawned agents
 */
export async function getChildSessions(
  client: any,
  parentSessionId: string
): Promise<Array<{ id: string; title?: string; status?: string }>> {
  try {
    const result = await client.session.children({
      path: { id: parentSessionId },
    });

    if (result.error) {
      return [];
    }

    return result.data || [];
  } catch {
    return [];
  }
}

/**
 * Gather results from all child sessions
 *
 * Useful for parallel spawns - wait for all to complete
 */
export async function gatherChildResults(
  client: any,
  parentSessionId: string,
  timeoutMs: number = 60000
): Promise<SpawnResult[]> {
  const children = await getChildSessions(client, parentSessionId);
  const results: SpawnResult[] = [];

  for (const child of children) {
    const result = await waitForSessionCompletion(
      client,
      child.id,
      child.title || 'unknown',
      timeoutMs
    );
    results.push(result);
  }

  return results;
}
