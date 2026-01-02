/**
 * Memory Lane Store
 *
 * Standalone memory storage using Drizzle ORM and direct lm-studio HTTP API.
 * No external dependencies on swarm-mail or swarm-tools.
 *
 * Features:
 * - Vector embeddings via lm-studio mixedbread-ai/mxbai-embed-large-v1
 * - Semantic search with cosine similarity
 * - Memory Lane taxonomy (correction, decision, pattern, etc.)
 * - Temporal validity and decay
 * - LEDGER.md integration
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getDatabasePath } from '../utils/database-path';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('MemoryLaneStore');
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
import { cosineSimilarity, detectIntent } from './utils';

// ============================================================================
// Types
// ============================================================================

export type MemoryDb = LibSQLDatabase<Record<string, never>>;

export interface SmartFindArgs {
  query?: string;
  limit?: number;
  entities?: string[]; // strictly filter by these entity slugs
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  collection: string;
  metadata: MemoryLaneMetadata;
  effective_confidence: number;
  decay_factor: number;
}

// ============================================================================
// Memory Lane Store
// ============================================================================

export class MemoryLaneStore {
  private readonly COLLECTION = 'memory-lane';
  private readonly EMBEDDING_MODEL = 'mixedbread-ai/mxbai-embed-large-v1';
  private readonly LM_STUDIO_URL = 'http://127.0.0.1:1234';
  private readonly db: MemoryDb;
  private readonly client: Client;
  private schemaInitialized = false;

  constructor() {
    const dbPath = getDatabasePath();
    this.client = createClient({ url: dbPath });
    this.db = drizzle(this.client);

    log.info('Initializing memory store');

    this.initializeSchema()
      .then(() => {
        this.schemaInitialized = true;
        log.info('Schema initialized successfully');
      })
      .catch((err) => {
        log.error({ err }, 'CRITICAL: Schema initialization failed');
      });
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaInitialized) {
      await this.initializeSchema();
      this.schemaInitialized = true;
    }
  }

  /**
   * Initialize the memories table if it doesn't exist
   */
  private async initializeSchema(): Promise<void> {
    try {
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          metadata TEXT,
          collection TEXT DEFAULT 'memory-lane',
          tags TEXT,
          embedding BLOB,
          decay_factor REAL DEFAULT 1.0,
          valid_from TEXT,
          valid_until TEXT,
          superseded_by TEXT,
          auto_tags TEXT,
          keywords TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      log.info('Schema creation/check completed');
    } catch (err) {
      log.error({ err }, 'Failed to create schema');
      throw err;
    }
  }

  /**
   * Store a memory with Memory Lane specific metadata
   */
  async store(args: {
    information: string;
    type: MemoryType;
    entities?: string[];
    confidence_score?: number;
    tags?: string;
  }): Promise<{ id: string; message: string }> {
    await this.ensureSchema();

    // Generate embedding
    const embedding = await this.generateEmbedding(args.information);

    // Create metadata
    const metadata = createMemoryMetadata({
      memory_type: args.type,
      entity_slugs: args.entities,
      confidence_score: args.confidence_score,
      tags: args.tags ? args.tags.split(',').map((t) => t.trim()) : [],
    });

    // Generate unique ID
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;

    // Insert memory
    await this.client.execute({
      sql: `INSERT INTO memories (
        id, content, metadata, collection, tags, 
        embedding, decay_factor, valid_from, valid_until, 
        superseded_by, auto_tags, keywords, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        tags = excluded.tags,
        embedding = excluded.embedding,
        updated_at = excluded.updated_at`,
      args: [
        id,
        args.information,
        JSON.stringify(metadata),
        this.COLLECTION,
        JSON.stringify(args.tags ? args.tags.split(',').map((t) => t.trim()) : []),
        Buffer.from(new Float32Array(embedding).buffer),
        metadata.decay_factor,
        metadata.valid_from ?? null,
        metadata.valid_until ?? null,
        metadata.superseded_by ?? null,
        JSON.stringify([]),
        '',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    });

    return {
      id,
      message: `Stored memory ${id} in collection: ${this.COLLECTION}`,
    };
  }

  /**
   * Record feedback on a memory
   */
  async recordFeedback(id: string, signal: 'helpful' | 'harmful'): Promise<void> {
    await this.ensureSchema();

    const result = await this.client.execute({
      sql: 'SELECT id, metadata FROM memories WHERE id = ?',
      args: [id],
    });

    const memory = result.rows[0] as unknown as { id: string; metadata: string } | undefined;
    if (!memory) return;

    let metadata: MemoryLaneMetadata;
    try {
      metadata = MemoryLaneMetadataSchema.parse(
        typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata
      );
    } catch {
      return;
    }

    // Apply feedback
    if (signal === 'helpful') {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 1.1;
    } else {
      metadata.feedback_score = (metadata.feedback_score || 1.0) * 0.5;
    }
    metadata.feedback_count = (metadata.feedback_count || 0) + 1;
    metadata.access_count = (metadata.access_count || 0) + 1;
    metadata.last_accessed_at = new Date().toISOString();

    await this.client.execute({
      sql: 'UPDATE memories SET metadata = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify(metadata), new Date().toISOString(), id],
    });
  }

  /**
   * Smart semantic search with intent boosting and entity filtering
   */
  async smartFind(args: SmartFindArgs): Promise<{
    results: MemorySearchResult[];
    count: number;
  }> {
    await this.ensureSchema();

    const { query = '', limit = 10 } = args;

    // Detect intent boosting
    const boostedTypes = detectIntent(query);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Fetch all memories from collection (we'll score them in JS)
    const result = await this.client.execute({
      sql: `SELECT id, content, metadata, collection, tags, embedding, created_at 
            FROM memories 
            WHERE collection = ?`,
      args: [this.COLLECTION],
    });

    // Score and filter results
    const isEntityFiltered = args.entities && args.entities.length > 0;
    const minScoreThreshold = isEntityFiltered ? 0.15 : 0.2;

    const scoredResults: Array<{
      id: string;
      content: string;
      collection: string;
      score: number;
      metadata: MemoryLaneMetadata;
      effective_confidence: number;
      decay_factor: number;
    }> = [];

    for (const row of result.rows) {
      const memory = row as unknown as {
        id: string;
        content: string;
        metadata: string;
        collection: string;
        embedding: ArrayBuffer | null;
      };

      // Parse metadata
      let metadata: MemoryLaneMetadata;
      try {
        metadata = MemoryLaneMetadataSchema.parse(
          typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata
        );
      } catch {
        continue;
      }

      // Check temporal validity
      if (!isMemoryValid(metadata)) {
        continue;
      }

      // Calculate cosine similarity
      let similarity = 0;
      if (memory.embedding) {
        const storedEmbedding = new Float32Array(memory.embedding);
        similarity = cosineSimilarity(queryEmbedding, Array.from(storedEmbedding));
      }

      // Skip low similarity
      if (similarity < 0.1) continue;

      // Calculate decay factor
      const calculatedDecayFactor = calculateDecayFactor(
        metadata.last_accessed_at || new Date().toISOString(),
        metadata.first_observed_at || new Date().toISOString()
      );

      const calculatedEffectiveConfidence = calculateEffectiveConfidence(
        metadata.confidence_score,
        calculatedDecayFactor
      );

      // Calculate final score
      let finalScore = similarity;

      // Apply taxonomy weight
      const typeWeight = PRIORITY_WEIGHTS[metadata.memory_type] || 0.5;
      finalScore *= typeWeight;

      // Apply decay
      finalScore *= metadata.decay_factor ?? 1.0;

      // Apply intent boost
      if (boostedTypes.includes(metadata.memory_type)) {
        finalScore *= 1.15;
      }

      // Apply feedback
      finalScore *= metadata.feedback_score || 1.0;

      // Apply entity filter
      if (isEntityFiltered) {
        const hasMatch = args.entities!.some((slug) => metadata.entity_slugs?.includes(slug));
        if (!hasMatch) finalScore = 0;
      }

      if (finalScore >= minScoreThreshold) {
        scoredResults.push({
          id: memory.id,
          content: memory.content,
          collection: memory.collection,
          score: finalScore,
          metadata,
          effective_confidence: calculatedEffectiveConfidence,
          decay_factor: calculatedDecayFactor,
        });
      }
    }

    // Sort and limit
    const finalResults = scoredResults.sort((a, b) => b.score - a.score).slice(0, limit);

    return {
      results: finalResults,
      count: finalResults.length,
    };
  }

  /**
   * Generate embedding using lm-studio HTTP API (OpenAI-compatible)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    await this.ensureLmStudio();

    try {
      const response = await fetch(`${this.LM_STUDIO_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.EMBEDDING_MODEL,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`lm-studio embedding failed: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (err) {
      log.error({ err }, 'Embedding error');
      return new Array(1024).fill(0);
    }
  }

  /**
   * Ensure lm-studio is running (Mac auto-start)
   */
  private async ensureLmStudio(): Promise<void> {
    const check = async () => {
      try {
        const response = await fetch(`${this.LM_STUDIO_URL}/v1/models`);
        return response.ok;
      } catch {
        return false;
      }
    };

    if (await check()) return;

    if (process.platform === 'darwin') {
      try {
        const { exec } = await import('node:child_process');
        exec('open -a "LM Studio"');

        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          if (await check()) return;
        }
      } catch {}
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    this.client.close();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalStore: MemoryLaneStore | null = null;

export function getMemoryLaneStore(): MemoryLaneStore {
  if (!globalStore) {
    globalStore = new MemoryLaneStore();
  }
  return globalStore;
}

export function resetMemoryLaneStore(): void {
  if (globalStore) {
    globalStore.close();
    globalStore = null;
  }
}
