/**
 * Activity Logger - High-frequency activity tracking
 *
 * Decoupled from LEDGER.md to prevent file locking issues.
 * Stores real-time agent activity in a separate JSONL file with daily rotation.
 */

import { appendFile, mkdir, stat, rename, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('ActivityLogger');

export interface ActivityEntry {
  timestamp: string;
  agent: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface ActivityLoggerConfig {
  path: string;
  dailyRotation?: boolean;
}

const DEFAULT_CONFIG: ActivityLoggerConfig = {
  path: '.opencode/activity.jsonl',
  dailyRotation: true,
};

export class ActivityLogger {
  private config: ActivityLoggerConfig;
  private lastDate: string = new Date().toISOString().split('T')[0];

  constructor(config?: Partial<ActivityLoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    const dir = dirname(this.config.path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async log(agent: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.initialize();

    const entry: ActivityEntry = {
      timestamp: new Date().toISOString(),
      agent,
      message,
      metadata,
    };

    const line = JSON.stringify(entry) + '\n';

    // Check for rotation
    if (this.config.dailyRotation && this.shouldRotate()) {
      await this.rotate();
    }

    try {
      await appendFile(this.config.path, line);
    } catch (error) {
      log.error({ error }, 'Failed to log activity');
    }
  }

  private shouldRotate(): boolean {
    const currentDate = new Date().toISOString().split('T')[0];
    return currentDate !== this.lastDate;
  }

  private async rotate(): Promise<void> {
    const rotatedPath = this.config.path.replace('.jsonl', `_${this.lastDate}.jsonl`);
    if (existsSync(this.config.path)) {
      try {
        await rename(this.config.path, rotatedPath);
      } catch (e) {
        log.error({ err: e }, 'Rotation failed');
      }
    }
    this.lastDate = new Date().toISOString().split('T')[0];
  }
}

// Singleton
let globalLogger: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!globalLogger) {
    globalLogger = new ActivityLogger();
  }
  return globalLogger;
}
