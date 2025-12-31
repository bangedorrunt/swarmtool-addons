/**
 * Centralized Database Path Resolution
 *
 * Provides a single source of truth for database path resolution
 * across all modules in swarmtool-addons.
 *
 * Resolution Order:
 * 1. OPENCODE_DB_PATH environment variable (if set)
 * 2. ~/.opencode/memories.db (global)
 * 3. .opencode/memories.db (project-local fallback)
 */

import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const MEMORY_DB_FILENAME = 'memories.db';
export const OPENCODE_DIRNAME = '.opencode';

export interface DatabasePathResult {
  path: string;
  source: 'env' | 'global' | 'project';
}

function getEnvPath(): string | null {
  return process.env.OPENCODE_DB_PATH ?? null;
}

function getGlobalPath(): string {
  const globalDir = join(homedir(), OPENCODE_DIRNAME);
  // Ensure directory exists
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }
  return join(globalDir, MEMORY_DB_FILENAME);
}

function getProjectPath(): string {
  return join(process.cwd(), OPENCODE_DIRNAME, MEMORY_DB_FILENAME);
}

export function resolveDatabasePath(): DatabasePathResult {
  const envPath = getEnvPath();
  if (envPath) {
    return { path: `file:${envPath}`, source: 'env' };
  }

  // Prefer global path for cross-project memory persistence
  const globalPath = getGlobalPath();
  return { path: `file:${globalPath}`, source: 'global' };
}

export function getDatabasePath(): string {
  return resolveDatabasePath().path;
}

export function getDatabaseSource(): DatabasePathResult['source'] {
  return resolveDatabasePath().source;
}
