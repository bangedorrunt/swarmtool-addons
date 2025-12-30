/**
 * Memory Lane Sidecar Adapter
 *
 * Implements high-integrity search, intent boosting, and entity filtering
 * using direct Drizzle ORM queries (no wrapper layer).
 *
 * BREAKING CHANGE: Migrated from MemoryAdapter wrapper to direct Drizzle client.
 * Resolves P0 "getClient()" type error by bypassing adapter abstraction.
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  MemoryType,
  MemoryLaneMetadata,
  MemoryLaneMetadataSchema,
  PRIORITY_WEIGHTS,
  createMemoryMetadata,
  isMemoryValid,
  calculateEffectiveConfidence,
  calculateDecayFactor,
} from './taxonomy';

// Re-export SwarmDb type for compatibility
export type SwarmDb = LibSQLDatabase<any>;

export interface SmartFindArgs {
  query?: string;
  limit?: number;
  entities?: string[]; // strictly filter by these entity slugs
}

/**
 * Memory Lane Adapter - Direct Drizzle Implementation
 *
 * Creates its own libSQL client and Drizzle ORM instance.
 * Bypasses MemoryAdapter wrapper to avoid getClient() type errors.
 */
export class MemoryLaneAdapter {
  private readonly COLLECTION = 'memory-lane';
  private readonly LANE_VERSION = '1.0.0';
  private readonly db: SwarmDb;
  private readonly client: Client;

  constructor() {
    // Get database path with centralized preference
    const dbPath = this.getDatabasePath();

    // Create libSQL client
    this.client = createClient({ url: dbPath });

    // Create Drizzle ORM instance with schema
    // Import schema dynamically from swarm-mail
    this.db = drizzle(this.client);
  }

  /**
   * Resolve database path with centralized preference
   * - swarm.db: Primary knowledge base (memories, entities)
   * - .opencode/swarm.db: Project-local fallback
   */
  private getDatabasePath(): string {
    const centralized = join(homedir(), '.config', 'swarm-tools', 'swarm.db');
    if (existsSync(centralized)) {
      return `file:${centralized}`;
    }

    const projectLocal = join(process.cwd(), '.opencode', 'swarm.db');
    return `file:${projectLocal}`;
  }

  /**
   * Store a memory with Memory Lane specific metadata
   *
   * Uses direct Drizzle insert to avoid adapter abstraction.
   * Generates embedding via Ollama through swarm-mail's MemoryStore.
   */
  async storeLaneMemory(args: {
    information: string;
    type: MemoryType;
    entities?: string[];
    confidence_score?: number;
    tags?: string;
  }): Promise<{ id: string; message: string }> {
    // Generate embedding for content
    const queryEmbedding = await this.generateEmbedding(args.information);

    // Use factory function to create metadata with all Drizzle-aligned fields
    const laneMetadata = createMemoryMetadata({
      memory_type: args.type,
      entity_slugs: args.entities,
      confidence_score: args.confidence_score,
      tags: args.tags ? args.tags.split(',').map((t) => t.trim()) : [],
    });

    // Generate unique memory ID
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;

    // Insert memory using libSQL client (raw SQL for full schema access)
    // Using raw SQL allows access to temporal validity fields not in MemoryStore interface
    await this.client.execute(
      `INSERT INTO memories (
        id, content, metadata, collection, tags, 
        embedding, decay_factor, valid_from, valid_until, 
        superseded_by, auto_tags, keywords, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
               content = excluded.content,
               metadata = excluded.metadata,
               tags = excluded.tags,
               embedding = excluded.embedding,
               decay_factor = excluded.decay_factor,
               valid_from = excluded.valid_from,
               valid_until = excluded.valid_until,
               superseded_by = excluded.superseded_by,
               auto_tags = excluded.auto_tags,
               keywords = excluded.keywords,
               updated_at = excluded.updated_at`,
      [
        id,
        args.information,
        JSON.stringify(laneMetadata),
        this.COLLECTION,
        JSON.stringify(args.tags ? args.tags.split(',').map((t) => t.trim()) : []),
        Buffer.from(new Float32Array(queryEmbedding).buffer), // Convert to Uint8Array
        laneMetadata.decay_factor,
        laneMetadata.valid_from ?? null,
        laneMetadata.valid_until ?? null,
        laneMetadata.superseded_by ?? null,
        JSON.stringify([]),
        '',
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    return {
      id,
      message: `Stored memory ${id} in collection: ${this.COLLECTION}`,
    };
  }

  /**
   * Record feedback for a specific memory
   * Updates the aggregate score in metadata and access tracking
   *
   * Uses direct Drizzle update to avoid adapter abstraction.
   */
  async recordFeedback(id: string, signal: 'helpful' | 'harmful'): Promise<void> {
    // Fetch current memory
    const result = await this.client.execute(
      'SELECT id, content, metadata, collection, tags, created_at, updated_at, decay_factor, valid_from, valid_until, superseded_by, auto_tags, keywords FROM memories WHERE id = ?',
      [id]
    );

    const memory = result.rows[0] as any;
    if (!memory) return;

    // Parse and update metadata
    let metadata: MemoryLaneMetadata;
    try {
      metadata = MemoryLaneMetadataSchema.parse(
        typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata
      );
    } catch {
      return; // Malformed metadata
    }

    // Apply feedback adjustment
    if (signal === 'helpful') {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 1.1;
    } else {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 0.5;
    }
    metadata.feedback_count = (metadata.feedback_count || 0) + 1;

    // Update access tracking
    metadata.access_count = (metadata.access_count || 0) + 1;
    metadata.last_accessed_at = new Date().toISOString();

    // Update last_observed_at as well (for consistency)
    metadata.last_observed_at = new Date().toISOString();

    // Update memory with new metadata
    await this.client.execute('UPDATE memories SET metadata = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(metadata),
      new Date().toISOString(),
      id,
    ]);
  }

  /**
   * Smart Retrieval Engine
   * 1. Detect intent boosting
   * 2. Apply temporal validity filtering
   * 3. Apply entity filtering
   * 4. Re-rank results (Priority + Decay + Intent + Feedback)
   *
   * Uses Drizzle queries + vector search from MemoryStore.
   */
  async smartFind(args: SmartFindArgs): Promise<{
    results: Array<{
      id: string;
      content: string;
      score: number;
      collection: string;
      metadata: MemoryLaneMetadata;
      effective_confidence: number;
      decay_factor: number;
    }>;
    count: number;
  }> {
    const { query = '', limit = 10 } = args;

    // 1. Detect Intent Boosting
    const boostedTypes = this.detectIntent(query);

    // 2. Base Retrieval (Vector Search)
    const { createMemoryStore } = await import('swarm-mail');
    const store = createMemoryStore(this.db);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Vector search
    const searchResults = await store.search(queryEmbedding, {
      limit: limit * 3,
      threshold: 0.1, // Lowered from 0.3 - too strict was filtering everything
      collection: this.COLLECTION,
    });

    // 3. Re-Ranking & Filtering
    const isEntityFiltered = args.entities && args.entities.length > 0;
    const minScoreThreshold = isEntityFiltered ? 0.15 : 0.2; // Lowered - was filtering too aggressively

    // Process and score results
    const scoredResults: Array<{
      memory: any;
      score: number;
      metadata: MemoryLaneMetadata;
      effective_confidence: number;
      decay_factor: number;
    }> = [];

    for (const res of searchResults) {
      const memory = res.memory;

      // Validate metadata schema
      let metadata: MemoryLaneMetadata;
      try {
        metadata = MemoryLaneMetadataSchema.parse(
          typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata
        );
      } catch {
        continue; // Skip malformed metadata
      }

      // Filter by temporal validity (Drizzle-aligned)
      if (!isMemoryValid(metadata)) {
        continue;
      }

      // Update access tracking for decay calculation
      metadata.access_count = (metadata.access_count || 0) + 1;
      metadata.last_accessed_at = new Date().toISOString();

      // Calculate decay factor
      const calculatedDecayFactor = calculateDecayFactor(
        metadata.last_accessed_at,
        metadata.first_observed_at || new Date().toISOString()
      );

      // Calculate effective confidence (after decay)
      const calculatedEffectiveConfidence = calculateEffectiveConfidence(
        metadata.confidence_score,
        calculatedDecayFactor
      );

      let finalScore = res.score;

      // Apply Taxonomy Priority Weight
      const typeWeight = PRIORITY_WEIGHTS[metadata.memory_type] || 0.5;
      finalScore *= typeWeight;

      // Apply Decay Factor (time-based relevance)
      finalScore *= metadata.decay_factor ?? 1.0;

      // Apply Intent Boost (+15%)
      if (boostedTypes.includes(metadata.memory_type)) {
        finalScore *= 1.15;
      }

      // Apply Feedback Adjustment
      finalScore *= metadata.feedback_score || 1.0;

      // Apply Entity Filter (Strict)
      if (isEntityFiltered) {
        const hasMatch = args.entities!.some((slug) => metadata.entity_slugs?.includes(slug));
        if (!hasMatch) finalScore = 0;
      }

      scoredResults.push({
        memory,
        score: finalScore,
        metadata,
        effective_confidence: calculatedEffectiveConfidence,
        decay_factor: calculatedDecayFactor,
      });
    }

    // Sort by new score and truncate
    const finalResults = scoredResults
      .filter((r) => r.score >= minScoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        score: r.score,
        collection: r.memory.collection,
        metadata: r.metadata,
        effective_confidence: r.effective_confidence,
        decay_factor: r.decay_factor,
      }));

    return {
      results: finalResults,
      count: finalResults.length,
    };
  }

  /**
   * Generate embedding for text using Ollama
   *
   * Private helper method for embedding generation.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // 1. Ensure Ollama is running
    await this.ensureOllama();

    const { getDefaultConfig, makeOllamaLive, Ollama } = await import('swarm-mail');
    const { Effect: EffectNs } = await import('effect');

    const config = getDefaultConfig();
    const ollamaLayer = makeOllamaLive(config);

    // Generate embedding
    const program = EffectNs.gen(function* () {
      const ollama = yield* Ollama;
      return yield* ollama.embed(text);
    });

    return EffectNs.runPromise(program.pipe(EffectNs.provide(ollamaLayer)));
  }

  /**
   * Ensure Ollama is running, attempt to start on Mac if missing
   */
  private async ensureOllama(): Promise<void> {
    const checkOllama = async () => {
      try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        return response.ok;
      } catch {
        return false;
      }
    };

    // Mac-specific auto-start
    if (process.platform === 'darwin') {
      try {
        const { exec } = await import('node:child_process');
        exec('open -a Ollama');

        // Poll for up to 30 seconds
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (await checkOllama()) {
            return;
          }
        }
      } catch (err: any) {}
    }

    // If we reach here, either not Mac or failed to start
  }

  /**
   * Scan query for intent keywords to boost specific memory types
   */
  private detectIntent(query: string): MemoryType[] {
    if (!query) return [];

    const q = query.toLowerCase();
    const boosts: MemoryType[] = [];

    if (q.includes('mistake') || q.includes('wrong') || q.includes('error')) {
      boosts.push('correction', 'gap');
    }
    if (q.includes('decided') || q.includes('chose') || q.includes('choice')) {
      boosts.push('decision');
    }
    if (q.includes('pattern') || q.includes('usually') || q.includes('habit')) {
      boosts.push('pattern_seed', 'commitment');
    }
    if (q.includes('learned') || q.includes('realized')) {
      boosts.push('learning', 'insight');
    }

    return boosts;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.client.close();
  }
}
