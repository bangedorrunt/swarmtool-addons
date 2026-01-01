import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitForSessionCompletion } from './session-coordination';
import { getDurableStreamOrchestrator, StreamEvent } from './durable-stream';
import { mkdir, rm } from 'node:fs/promises';

describe('Session Coordination - waitForSessionCompletion', () => {
  const TEST_DIR = '.opencode-test-session-coord';
  let orchestrator: any;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    orchestrator = getDurableStreamOrchestrator({
      streamPath: `${TEST_DIR}/stream.jsonl`,
      checkpointPath: `${TEST_DIR}/checkpoints`,
      snapshotPath: `${TEST_DIR}/snapshots`,
    });

    // Clear state
    orchestrator.eventStream.clear();
    orchestrator.eventHistory = [];
    orchestrator.subscribers.clear();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should resolve immediately if event is already in history (Race Condition Fix)', async () => {
    const sessionId = 'session-123';
    const agent = 'test-agent';

    // Simulate event happening BEFORE waiting
    await orchestrator.completeAgent(sessionId, agent, 'Result from history', 100);

    const result = await waitForSessionCompletion(
      {} as any, // Mock client not needed for history check
      sessionId,
      agent,
      1000 // 1s timeout
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.result).toBe('Result from history');
  });

  it('should resolve when event is emitted after waiting (Event Subscription)', async () => {
    const sessionId = 'session-456';
    const agent = 'async-agent';

    // Start waiting first
    const waitPromise = waitForSessionCompletion({} as any, sessionId, agent, 1000);

    // Emit event AFTER waiting started (simulate async process)
    setTimeout(async () => {
      await orchestrator.completeAgent(sessionId, agent, 'Async Result', 200);
    }, 50);

    const result = await waitPromise;

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.result).toBe('Async Result');
  });

  it('should handle failure events correctly', async () => {
    const sessionId = 'session-789';
    const agent = 'fail-agent';

    const waitPromise = waitForSessionCompletion({} as any, sessionId, agent, 1000);

    setTimeout(async () => {
      await orchestrator.failAgent(sessionId, agent, 'Something went wrong');
    }, 50);

    const result = await waitPromise;

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Something went wrong');
  });

  it('should timeout if no event is received', async () => {
    const sessionId = 'session-timeout';
    const agent = 'timeout-agent';

    // Wait with short timeout
    const result = await waitForSessionCompletion(
      {} as any,
      sessionId,
      agent,
      100 // 100ms timeout
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Timeout');
  });
});
