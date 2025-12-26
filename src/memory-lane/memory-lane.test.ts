/* eslint-disable no-unused-vars */
import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { MemoryAdapter } from 'opencode-swarm-plugin';
import { MemoryLaneAdapter } from './adapter';
import { EntityResolver } from './resolver';
import path from 'path';
import fs from 'fs';

describe('Memory Lane System', () => {
  let lane: MemoryLaneAdapter;
  let currentTestDir: string;

  // Deterministic mock embedding based on text
  const mockEmbed = (text: string) => {
    const vec = new Array(1024).fill(0);
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      vec[i % 1024] = (vec[i % 1024] + charCode / 255) / 2;
    }
    return vec;
  };

  beforeEach(async () => {
    // Unique directory per test
    currentTestDir = path.join(process.cwd(), `.hive-test-lane-${globalThis.crypto.randomUUID()}`);
    if (fs.existsSync(currentTestDir)) {
      fs.rmSync(currentTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(currentTestDir, { recursive: true });

    // Mock global fetch for Ollama
    globalThis.fetch = mock((url: string, init?: any) => {
      if (url.includes('/api/embeddings')) {
        const body = JSON.parse(init.body);
        const text = body.prompt;
        return Promise.resolve(
          new globalThis.Response(
            JSON.stringify({
              embedding: mockEmbed(text),
            })
          )
        );
      }
      if (url.includes('/api/tags')) {
        return Promise.resolve(
          new globalThis.Response(
            JSON.stringify({
              models: [{ name: 'mxbai-embed-large' }],
            })
          )
        );
      }
      return Promise.resolve(new globalThis.Response('Not Found', { status: 404 }));
    }) as any;

    // Mock baseAdapter instead of using real DB
    const baseAdapter = {
      store: mock(async (_args) => ({
        id: `mem-${globalThis.crypto.randomUUID()}`,
        message: 'Stored',
      })),
      find: mock(async (_args) => ({ results: [], count: 0 })),
      get: mock(async (_args) => null),
      remove: mock(async (_args) => ({ success: true })),
      validate: mock(async (_args) => ({ success: true })),
      list: mock(async (_args) => []),
      stats: mock(async () => ({ memories: 0, embeddings: 0 })),
      checkHealth: mock(async () => ({ ollama: true })),
      upsert: mock(async (_args) => ({ operation: 'ADD', reason: 'new', memoryId: 'new-id' })),
    } as unknown as MemoryAdapter;

    lane = new MemoryLaneAdapter(baseAdapter);

    // Helper to simulate find results in tests
    (lane as any)._baseAdapter = baseAdapter;
  });

  afterEach(() => {
    mock.restore();
    if (fs.existsSync(currentTestDir)) {
      try {
        fs.rmSync(currentTestDir, { recursive: true, force: true });
      } catch {
        // Ignore busy files
      }
    }
  });

  test('should store and retrieve memories with taxonomy', async () => {
    // Mock find response
    const mockFind = (lane as any)._baseAdapter.find as any;
    mockFind.mockResolvedValueOnce({
      results: [
        {
          id: 'test-id',
          content: "Use 'const' for immutable bindings",
          score: 0.9,
          collection: 'memory-lane',
          metadata: JSON.stringify({
            lane_version: '1.0.0',
            memory_type: 'commitment',
            entity_slugs: ['project:swarm-tools'],
            confidence_score: 70,
          }),
          createdAt: new Date().toISOString(),
        },
      ],
      count: 1,
    });

    await lane.storeLaneMemory({
      information: "Use 'const' for immutable bindings",
      type: 'commitment',
      entities: ['project:swarm-tools'],
    });

    const result = await lane.smartFind({
      query: "Use 'const' for immutable bindings", // Use same text for high similarity
      entities: ['project:swarm-tools'],
    });

    expect(result.count).toBe(1);
    expect(result.results[0].content).toContain("Use 'const'");
    expect(result.results[0].metadata.memory_type).toBe('commitment');
  });

  test("should apply intent boosting for 'mistake'", async () => {
    // Mock find response with multiple results
    const mockFind = (lane as any)._baseAdapter.find as any;
    mockFind.mockResolvedValueOnce({
      results: [
        {
          id: 'id-1',
          content: 'Mistake correction: ellipses',
          score: 0.8,
          collection: 'memory-lane',
          metadata: JSON.stringify({
            lane_version: '1.0.0',
            memory_type: 'correction',
            confidence_score: 70,
          }),
          createdAt: new Date().toISOString(),
        },
        {
          id: 'id-2',
          content: 'General learning: Bun',
          score: 0.8,
          collection: 'memory-lane',
          metadata: JSON.stringify({
            lane_version: '1.0.0',
            memory_type: 'learning',
            confidence_score: 70,
          }),
          createdAt: new Date().toISOString(),
        },
      ],
      count: 2,
    });

    // 2. Query about mistakes - should match both but boost correction
    const result = await lane.smartFind({
      query: 'mistakes',
    });

    expect(result.count).toBeGreaterThan(0);
    // Correction (Priority 1.0 + Boost 1.15) should be first
    expect(result.results[0].metadata.memory_type).toBe('correction');
  });

  test('should filter by entities strictly', async () => {
    const mockFind = (lane as any)._baseAdapter.find as any;
    mockFind.mockResolvedValueOnce({
      results: [
        {
          id: 'id-auth',
          content: 'Auth feature uses OAuth2',
          score: 0.9,
          collection: 'memory-lane',
          metadata: JSON.stringify({
            lane_version: '1.0.0',
            memory_type: 'decision',
            entity_slugs: ['feature:auth'],
            confidence_score: 70,
          }),
          createdAt: new Date().toISOString(),
        },
        {
          id: 'id-billing',
          content: 'Billing uses Stripe',
          score: 0.9,
          collection: 'memory-lane',
          metadata: JSON.stringify({
            lane_version: '1.0.0',
            memory_type: 'decision',
            entity_slugs: ['feature:billing'],
            confidence_score: 70,
          }),
          createdAt: new Date().toISOString(),
        },
      ],
      count: 2,
    });

    const result = await lane.smartFind({
      query: 'Auth feature uses OAuth2',
      entities: ['feature:auth'],
    });

    expect(result.count).toBe(1);
    expect(result.results[0].content).toContain('OAuth2');
  });

  test('should record feedback and adjust ranking', async () => {
    // 1. Initial Search
    const mockFind = (lane as any)._baseAdapter.find as any;
    const itemX = {
      id: 'id-x',
      content: 'Rule X is better',
      score: 0.8,
      collection: 'memory-lane',
      metadata: JSON.stringify({
        lane_version: '1.0.0',
        memory_type: 'learning',
        feedback_score: 1.0,
      }),
      createdAt: new Date().toISOString(),
    };
    const itemY = {
      id: 'id-y',
      content: 'Rule Y is better',
      score: 0.8,
      collection: 'memory-lane',
      metadata: JSON.stringify({
        lane_version: '1.0.0',
        memory_type: 'learning',
        feedback_score: 1.0,
      }),
      createdAt: new Date().toISOString(),
    };

    mockFind.mockResolvedValueOnce({
      results: [itemX, itemY],
      count: 2,
    });

    // Query for both
    const initResult = await lane.smartFind({ query: 'Rule is better' });
    expect(initResult.count).toBe(2);

    // 2. Record Feedback
    // Mock get() for recordFeedback
    const mockGet = (lane as any)._baseAdapter.get as any;
    mockGet.mockResolvedValue({
      id: 'id-x',
      content: 'Rule X is better',
      confidence: 0.8,
      metadata: JSON.stringify({
        lane_version: '1.0.0',
        memory_type: 'learning',
        feedback_score: 1.0,
      }),
    });

    // Mock store() update
    const mockStore = (lane as any)._baseAdapter.store as any;
    mockStore.mockResolvedValue({ id: 'id-x', message: 'Updated' });

    // Apply harmful feedback to X
    await lane.recordFeedback('id-x', 'harmful');

    // 3. Final Search
    // We simulate the updated metadata coming back from DB
    const itemXUpdated = {
      ...itemX,
      metadata: JSON.stringify({ memory_type: 'learning', feedback_score: 0.5 }), // 0.5 penalty
    };

    mockFind.mockResolvedValueOnce({
      results: [itemXUpdated, itemY], // X is now penalized
      count: 2,
    });

    const finalResult = await lane.smartFind({ query: 'Rule is better' });

    const resX = finalResult.results.find((r) => r.id === 'id-x');
    const resY = finalResult.results.find((r) => r.id !== 'id-x');

    // X should have been penalized by 0.5
    if (resX && resY) {
      expect(resX.score).toBeLessThan(resY.score);
    }
  });
});

describe('Entity Resolver', () => {
  test('should extract entities from text', () => {
    const text = 'Project project:swarm and agent:BlueLake are working on feature:auth';
    const entities = EntityResolver.extractFromText(text);
    const slugs = EntityResolver.toSlugs(entities);

    expect(slugs).toContain('project:swarm');
    expect(slugs).toContain('agent:bluelake');
    expect(slugs).toContain('feature:auth');
  });

  test('should extract entities from paths', () => {
    const path1 = 'packages/swarm-mail/src/hive/index.ts';
    const path2 = 'src/features/auth/login.tsx';

    const ent1 = EntityResolver.extractFromPath(path1);
    const ent2 = EntityResolver.extractFromPath(path2);

    expect(EntityResolver.toSlugs(ent1)).toContain('project:swarm-mail');
    expect(EntityResolver.toSlugs(ent2)).toContain('feature:auth');
  });

  test('should handle ambiguous names', async () => {
    const matches = await EntityResolver.disambiguate('mark');
    expect(matches).toContain('person:mark-robinson');
    expect(matches).toContain('person:mark-zuckerberg');
  });
});
