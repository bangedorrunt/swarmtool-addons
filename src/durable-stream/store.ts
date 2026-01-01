/**
 * JSONL Stream Store
 *
 * File-based event store using JSONL format with proper file locking.
 * This is the v1 storage implementation.
 */

import { readFile, writeFile, mkdir, stat, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { lock } from 'proper-lockfile';
import type { IStreamStore, StreamEvent, StreamFilter } from './types';
import { applyFilter, serializeEvent, deserializeEvent } from './core';

export interface JsonlStoreConfig {
  /** Path to the JSONL file */
  path: string;
  /** Maximum file size in MB before rotation (default: 10) */
  maxSizeMb?: number;
  /** Enable file locking (default: true) */
  useLocking?: boolean;
}

const DEFAULT_CONFIG: Required<JsonlStoreConfig> = {
  path: '.opencode/durable_stream.jsonl',
  maxSizeMb: 10,
  useLocking: true,
};

export class JsonlStore implements IStreamStore {
  private config: Required<JsonlStoreConfig>;
  private eventCache: StreamEvent[] = [];
  private cacheLoaded = false;
  private offset = 0;

  constructor(config?: Partial<JsonlStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the store - ensure directory exists.
   */
  async initialize(): Promise<void> {
    const dir = dirname(this.config.path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Create empty file if it doesn't exist
    if (!existsSync(this.config.path)) {
      await writeFile(this.config.path, '', 'utf-8');
    }

    // Load cache
    await this.loadCache();
  }

  /**
   * Load all events into memory cache.
   */
  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;

    try {
      const content = await readFile(this.config.path, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      this.eventCache = [];
      for (const line of lines) {
        const event = deserializeEvent(line);
        if (event) {
          this.eventCache.push(event);
          this.offset++;
        }
      }

      this.cacheLoaded = true;
    } catch {
      // File doesn't exist or is empty
      this.eventCache = [];
      this.cacheLoaded = true;
    }
  }

  async append(event: StreamEvent): Promise<void> {
    await this.loadCache();

    const line = serializeEvent(event) + '\n';

    if (this.config.useLocking) {
      // Ensure file exists for locking
      if (!existsSync(this.config.path)) {
        await writeFile(this.config.path, '', 'utf-8');
      }

      const release = await lock(this.config.path, { retries: 5 });
      try {
        await writeFile(this.config.path, line, { flag: 'a' });

        // Check for rotation
        if (await this.shouldRotate()) {
          await this.rotate();
        }
      } finally {
        await release();
      }
    } else {
      await writeFile(this.config.path, line, { flag: 'a' });
    }

    // Update cache
    this.eventCache.push(event);
    this.offset++;
  }

  async readStream(streamId: string, fromOffset?: number): Promise<StreamEvent[]> {
    await this.loadCache();

    let events = this.eventCache.filter((e) => e.stream_id === streamId);

    if (fromOffset !== undefined) {
      events = events.slice(fromOffset);
    }

    return events;
  }

  async query(filter: StreamFilter): Promise<StreamEvent[]> {
    await this.loadCache();
    return applyFilter(this.eventCache, filter);
  }

  async getOffset(): Promise<number> {
    await this.loadCache();
    return this.offset;
  }

  async close(): Promise<void> {
    // No-op for file-based store
    this.eventCache = [];
    this.cacheLoaded = false;
  }

  /**
   * Check if file should be rotated based on size.
   */
  private async shouldRotate(): Promise<boolean> {
    try {
      const stats = await stat(this.config.path);
      return stats.size > this.config.maxSizeMb * 1024 * 1024;
    } catch {
      return false;
    }
  }

  /**
   * Rotate the log file.
   */
  private async rotate(): Promise<void> {
    const timestamp = Date.now();
    const rotatedPath = this.config.path.replace('.jsonl', `_${timestamp}.jsonl`);

    await rename(this.config.path, rotatedPath);
    await writeFile(this.config.path, '', 'utf-8');

    // Clear cache (new file starts fresh)
    this.eventCache = [];
    this.offset = 0;
  }
}

// ============================================================================
// Factory
// ============================================================================

let defaultStore: JsonlStore | null = null;

/**
 * Get or create the default JSONL store.
 */
export function getDefaultStore(config?: Partial<JsonlStoreConfig>): JsonlStore {
  if (!defaultStore) {
    defaultStore = new JsonlStore(config);
  }
  return defaultStore;
}

/**
 * Initialize the default store.
 */
export async function initializeDefaultStore(
  config?: Partial<JsonlStoreConfig>
): Promise<JsonlStore> {
  const store = getDefaultStore(config);
  await store.initialize();
  return store;
}
