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
  /** Enable daily rotation (default: true) */
  dailyRotation?: boolean;
  /** Enable file locking (default: true) */
  useLocking?: boolean;
}

const DEFAULT_CONFIG: Required<JsonlStoreConfig> = {
  path: '.opencode/durable_stream.jsonl',
  maxSizeMb: 10,
  dailyRotation: true,
  useLocking: true,
};

export class JsonlStore implements IStreamStore {
  private config: Required<JsonlStoreConfig>;
  private eventCache: StreamEvent[] = [];
  private cacheLoaded = false;
  private offset = 0;
  private lastDate: string = new Date().toISOString().split('T')[0];
  private readonly maxCacheSize: number;

  constructor(config?: Partial<JsonlStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxCacheSize = 500000;
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
        // Check for daily rotation
        if (this.config.dailyRotation && this.shouldRotateDate()) {
          await this.rotate('daily');
        }

        await writeFile(this.config.path, line, { flag: 'a' });

        // Check for size rotation
        if (await this.shouldRotateSize()) {
          await this.rotate('size');
        }
      } finally {
        await release();
      }
    } else {
      // Check for daily rotation (unlocked)
      if (this.config.dailyRotation && this.shouldRotateDate()) {
        await this.rotate('daily');
      }

      await writeFile(this.config.path, line, { flag: 'a' });
    }

    // Update cache
    this.eventCache.push(event);
    this.offset++;

    // Limit cache size to prevent unbounded memory growth
    if (this.eventCache.length > this.maxCacheSize) {
      this.eventCache.shift();
    }
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
  private async shouldRotateSize(): Promise<boolean> {
    try {
      const stats = await stat(this.config.path);
      return stats.size > this.config.maxSizeMb * 1024 * 1024;
    } catch {
      return false;
    }
  }

  /**
   * Check if file should be rotated based on date.
   */
  private shouldRotateDate(): boolean {
    const currentDate = new Date().toISOString().split('T')[0];
    return currentDate !== this.lastDate;
  }

  /**
   * Rotate the log file.
   */
  private async rotate(reason: 'size' | 'daily' = 'size'): Promise<void> {
    const timestamp = reason === 'daily' ? this.lastDate : Date.now();
    const rotatedPath = this.config.path.replace('.jsonl', `_${timestamp}.jsonl`);

    if (existsSync(this.config.path)) {
      await rename(this.config.path, rotatedPath);
    }
    await writeFile(this.config.path, '', 'utf-8');

    // Update last date
    this.lastDate = new Date().toISOString().split('T')[0];

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
