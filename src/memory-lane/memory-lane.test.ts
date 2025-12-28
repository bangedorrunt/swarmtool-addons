/* eslint-disable no-unused-vars */
import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { MemoryLaneAdapter } from './adapter';
import { EntityResolver } from './resolver';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

describe('Memory Lane System', () => {
  let lane: MemoryLaneAdapter;
  let resolver: EntityResolver;
  let testDbPath: string;

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
    // Create in-memory database for testing
    testDbPath = ':memory:';

    // Mock global fetch for Ollama
    globalThis.fetch = mock((url: string, init: any) => {
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

    // Create real adapter with in-memory database
    lane = new MemoryLaneAdapter();

    // Swap client to in-memory database for test isolation
    const testClient = createClient({ url: testDbPath });
    (lane as any).client = testClient;
    (lane as any).db = drizzle(testClient);

    // Create table schema
    await testClient.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT,
        metadata TEXT,
        collection TEXT,
        tags TEXT,
        embedding BLOB,
        decay_factor REAL,
        valid_from TEXT,
        valid_until TEXT,
        superseded_by TEXT,
        auto_tags TEXT,
        keywords TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    // Create resolver with same database
    resolver = new EntityResolver((lane as any).db);
  });

  afterEach(() => {
    mock.restore();
  });

  test('should store memory with 14 columns successfully', async () => {
    const result = await lane.storeLaneMemory({
      information: "Use 'const' for immutable bindings",
      type: 'commitment',
      entities: ['project:swarm-tools'],
    });

    expect(result.id).toBeDefined();
    expect(result.message).toContain('Stored memory');
    expect(result.message).toContain('memory-lane');

    // Verify row was actually inserted
    const check = await (lane as any).client.execute('SELECT COUNT(*) as count FROM memories');
    expect(check.rows[0].count).toBe(1);
  });

  test('should handle temporal validity fields', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 86400000); // +1 day

    await lane.storeLaneMemory({
      information: 'Valid for 24 hours',
      type: 'learning',
      confidence_score: 80,
    });

    const result = await (lane as any).client.execute('SELECT * FROM memories LIMIT 1');
    const metadata = JSON.parse(result.rows[0].metadata as string);

    expect(metadata.decay_factor).toBeDefined();
    // The factory creates a timestamp, not null
    expect(metadata.valid_from).toBeDefined();
    expect(typeof metadata.valid_from).toBe('string');
    expect(metadata.valid_until).toBeNull();
    expect(metadata.superseded_by).toBeNull();
  });

  test('should record feedback and update metadata', async () => {
    // First, store a memory
    const { id } = await lane.storeLaneMemory({
      information: 'Test memory for feedback',
      type: 'insight',
    });

    // Record helpful feedback
    await lane.recordFeedback(id, 'helpful');

    // Check that metadata was updated
    const result = await (lane as any).client.execute('SELECT * FROM memories WHERE id = ?', [id]);
    const metadata = JSON.parse(result.rows[0].metadata as string);

    expect(metadata.feedback_score).toBeGreaterThan(1.0); // Should be boosted by 1.1
    expect(metadata.feedback_count).toBe(1);
    expect(metadata.access_count).toBe(1);
  });

  test('should record harmful feedback and penalize score', async () => {
    const { id } = await lane.storeLaneMemory({
      information: 'Memory to penalize',
      type: 'decision',
    });

    await lane.recordFeedback(id, 'harmful');

    const result = await (lane as any).client.execute('SELECT * FROM memories WHERE id = ?', [id]);
    const metadata = JSON.parse(result.rows[0].metadata as string);

    expect(metadata.feedback_score).toBeLessThan(1.0); // Should be reduced by 0.5
  });

  test.skip('should filter by entities strictly', async () => {
    const { id: authId } = await lane.storeLaneMemory({
      information: 'Auth uses OAuth2',
      type: 'decision',
      entities: ['feature:auth'],
    });

    await lane.storeLaneMemory({
      information: 'Billing uses Stripe',
      type: 'decision',
      entities: ['feature:billing'],
    });

    const authEmbedding = mockEmbed('Auth uses OAuth2');
    const billingEmbedding = mockEmbed('Billing uses Stripe');

    const mockSearch = mock(async (queryEmbedding: number[], options: any) => {
      return [
        {
          memory: {
            id: authId,
            content: 'Auth uses OAuth2',
            collection: 'memory-lane',
            metadata: JSON.stringify({
              lane_version: '1.0.0',
              memory_type: 'decision',
              entity_slugs: ['feature:auth'],
              confidence_score: 70,
              decay_factor: 1.0,
            }),
            embedding: authEmbedding,
            createdAt: new Date().toISOString(),
          },
          score: 0.85,
        },
        {
          memory: {
            id: 'billing-123',
            content: 'Billing uses Stripe',
            collection: 'memory-lane',
            metadata: JSON.stringify({
              lane_version: '1.0.0',
              memory_type: 'decision',
              entity_slugs: ['feature:billing'],
              confidence_score: 70,
              decay_factor: 1.0,
            }),
            embedding: billingEmbedding,
            createdAt: new Date().toISOString(),
          },
          score: 0.82,
        },
      ];
    });

    const mockStore = {
      search: mockSearch,
      store: mock(() => Promise.resolve()),
      ftsSearch: mock(() => Promise.resolve([])),
      list: mock(() => Promise.resolve([])),
      get: mock(() => Promise.resolve(null)),
      getStats: mock(() => Promise.resolve({ total: 0, collections: {} })),
    };

    const mockCreateMemoryStore = mock(() => mockStore);

    const originalSwarmMail = await import('swarm-mail');
    mock.module('swarm-mail', () => ({
      ...originalSwarmMail,
      createMemoryStore: mockCreateMemoryStore,
    }));

    const results = await lane.smartFind({
      query: 'features',
      entities: ['feature:auth'],
    });

    expect(results.count).toBe(1);
    expect(results.results[0].id).toBe(authId);
    expect(results.results[0].content).toContain('OAuth2');
  });

  test('should apply temporal validity filtering', async () => {
    const { id } = await lane.storeLaneMemory({
      information: 'Invalid memory',
      type: 'learning',
    });

    // Mock MemoryStore.search() to return memory with expired valid_until
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const mockEmbedding = mockEmbed('Invalid memory');
    const mockSearch = mock(async (queryEmbedding: number[], options: any) => {
      return [
        {
          memory: {
            id,
            content: 'Invalid memory',
            collection: 'memory-lane',
            metadata: JSON.stringify({
              lane_version: '1.0.0',
              memory_type: 'learning',
              entity_slugs: [],
              confidence_score: 70,
              decay_factor: 1.0,
              valid_from: new Date().toISOString(),
              valid_until: pastDate,
            }),
            embedding: mockEmbedding,
            createdAt: new Date().toISOString(),
          },
          score: 0.85,
        },
      ];
    });

    // Create mock MemoryStore
    const mockStore = {
      search: mockSearch,
      store: mock(() => Promise.resolve()),
      ftsSearch: mock(() => Promise.resolve([])),
      list: mock(() => Promise.resolve([])),
      get: mock(() => Promise.resolve(null)),
      getStats: mock(() => Promise.resolve({ total: 0, collections: {} })),
    };

    const mockCreateMemoryStore = mock(() => mockStore);

    // Mock entire swarm-mail module to intercept dynamic import
    const originalSwarmMail = await import('swarm-mail');
    mock.module('swarm-mail', () => ({
      ...originalSwarmMail,
      createMemoryStore: mockCreateMemoryStore,
    }));

    // This memory should be filtered out due to expired valid_until
    const results = await lane.smartFind({ query: 'memory' });

    expect(results.count).toBe(0);
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

  test('should handle slugs correctly', () => {
    const entities = [
      { type: 'project', name: 'Swarm-Mail', slug: 'swarm-mail' },
      { type: 'feature', name: 'Auth System', slug: 'auth-system' },
    ];
    const slugs = EntityResolver.toSlugs(entities);

    expect(slugs).toEqual(['project:swarm-mail', 'feature:auth-system']);
  });
});
