/**
 * Learning Extractor Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StreamEvent } from '../durable-stream/types';
import { LearningExtractor } from './learning-extractor';
import { DurableStream } from '../durable-stream/orchestrator';

describe('LearningExtractor', () => {
  let mockStream: DurableStream;
  let extractor: LearningExtractor;

  beforeEach(async () => {
    mockStream = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getStreamEvents: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockReturnValue(() => {}),
    } as unknown as DurableStream;

    extractor = new LearningExtractor({
      minConfidence: 0.6,
      maxLearnings: 10,
      realTime: false,
    });

    (extractor as any).stream = mockStream;
  });

  afterEach(async () => {
    await extractor.shutdown();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize the stream', async () => {
      await extractor.initialize();
      expect(mockStream.initialize).toHaveBeenCalled();
    });
  });

  describe('extractFromSession', () => {
    it('should extract learnings from session events', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: 'Successfully implemented the feature' },
        },
      ] as unknown as StreamEvent[];

      mockStream.getStreamEvents = vi.fn().mockResolvedValue(mockEvents);

      await extractor.initialize();
      const learnings = await extractor.extractFromSession('session_123');

      expect(learnings.length).toBeGreaterThan(0);
      expect(learnings[0].type).toBe('decision');
    });

    it('should extract corrections from events', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'lifecycle.session.error',
          timestamp: Date.now(),
          payload: { error: "That's wrong, use a different approach" },
        },
      ] as unknown as StreamEvent[];

      mockStream.getStreamEvents = vi.fn().mockResolvedValue(mockEvents);

      await extractor.initialize();
      const learnings = await extractor.extractFromSession('session_123');

      const corrections = learnings.filter((l) => l.type === 'correction');
      expect(corrections.length).toBeGreaterThan(0);
    });

    it('should extract anti-patterns from failed agents', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.failed',
          timestamp: Date.now(),
          payload: { error: 'Connection timeout after 30 seconds' },
        },
      ] as unknown as StreamEvent[];

      mockStream.getStreamEvents = vi.fn().mockResolvedValue(mockEvents);

      await extractor.initialize();
      const learnings = await extractor.extractFromSession('session_123');

      const antiPatterns = learnings.filter((l) => l.type === 'anti_pattern');
      expect(antiPatterns.length).toBeGreaterThan(0);
    });

    it('should extract preferences from approved checkpoints', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'checkpoint.approved',
          timestamp: Date.now(),
          payload: { selected_option: 'strategy_b' },
        },
      ] as unknown as StreamEvent[];

      mockStream.getStreamEvents = vi.fn().mockResolvedValue(mockEvents);

      await extractor.initialize();
      const learnings = await extractor.extractFromSession('session_123');

      const preferences = learnings.filter((l) => l.type === 'preference');
      expect(preferences.length).toBeGreaterThan(0);
    });
  });

  describe('extractFromEvents', () => {
    it('should extract learnings from raw events array', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: 'Task completed successfully' },
        },
      ] as unknown as StreamEvent[];

      await extractor.initialize();
      const learnings = await extractor.extractFromEvents(mockEvents);

      expect(learnings.length).toBeGreaterThan(0);
    });
  });

  describe('startRealTimeExtraction', () => {
    it('should subscribe to stream events', async () => {
      await extractor.initialize();

      const handler = vi.fn();
      extractor.startRealTimeExtraction(handler);

      expect(mockStream.subscribe).toHaveBeenCalled();
    });

    it('should call handler when learning is extracted', async () => {
      await extractor.initialize();

      const handler = vi.fn();

      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: 'Successfully implemented' },
        },
      ] as unknown as StreamEvent[];

      mockStream.subscribe = vi
        .fn()
        .mockImplementation((_type: string, callback: (event: StreamEvent) => void) => {
          callback(mockEvents[0]);
          return () => {};
        });

      extractor.startRealTimeExtraction(handler);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('stopRealTimeExtraction', () => {
    it('should stop real-time extraction', async () => {
      await extractor.initialize();

      const cleanup = extractor.startRealTimeExtraction(vi.fn());
      extractor.stopRealTimeExtraction();

      expect(cleanup).toBeDefined();
    });
  });

  describe('getExtractedLearnings', () => {
    it('should return extracted learnings', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: 'Task completed' },
        },
      ] as unknown as StreamEvent[];

      await extractor.initialize();
      await extractor.extractFromEvents(mockEvents);

      const learnings = extractor.getExtractedLearnings();
      expect(learnings.length).toBeGreaterThan(0);
    });
  });

  describe('clearLearnings', () => {
    it('should clear extracted learnings', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: 'Task completed' },
        },
      ] as unknown as StreamEvent[];

      await extractor.initialize();
      await extractor.extractFromEvents(mockEvents);

      extractor.clearLearnings();

      const learnings = extractor.getExtractedLearnings();
      expect(learnings.length).toBe(0);
    });
  });

  describe('confidence filtering', () => {
    it('should filter out learnings below minConfidence', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'lifecycle.session.error',
          timestamp: Date.now(),
          payload: { error: 'Minor issue' },
        },
      ] as unknown as StreamEvent[];

      await extractor.initialize();
      const learnings = await extractor.extractFromEvents(mockEvents);

      for (const learning of learnings) {
        expect(learning.confidence).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('should respect maxLearnings limit', async () => {
      const mockEvents = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `event_${i}`,
          type: 'agent.completed',
          timestamp: Date.now(),
          payload: { result: `Task ${i} completed successfully` },
        })) as unknown as StreamEvent[];

      await extractor.initialize();
      const learnings = await extractor.extractFromEvents(mockEvents);

      expect(learnings.length).toBeLessThanOrEqual(10);
    });
  });
});
