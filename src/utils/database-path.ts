/**
 * Centralized Database Path Resolution
 *
 * Provides a single source of truth for database path resolution
 * across all modules in swarm-tool-addons.
 *
 * Resolution Order:
 * 1. SWARM_DB_PATH environment variable (if set)
 * 2. ~/.config/swarm-tools/swarm.db (user-level)
 * 3. .opencode/swarm.db (project-local fallback)
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export const SWARM_DB_FILENAME = 'swarm.db';
export const SWARM_DB_DIRNAME = 'swarm-tools';
export const OPENCODE_DIRNAME = '.opencode';
export const CONFIG_DIRNAME = '.config';

export interface DatabasePathResult {
  path: string;
  source: 'env' | 'user' | 'project' | 'default';
}

function getEnvPath(): string | null {
  return process.env.SWARM_DB_PATH ?? null;
}

function getUserPath(): string | null {
  const userPath = join(homedir(), CONFIG_DIRNAME, SWARM_DB_DIRNAME, SWARM_DB_FILENAME);
  return existsSync(userPath) ? userPath : null;
}

function getProjectPath(): string {
  return join(process.cwd(), OPENCODE_DIRNAME, SWARM_DB_FILENAME);
}

export function resolveDatabasePath(): DatabasePathResult {
  const envPath = getEnvPath();
  if (envPath) {
    return { path: `file:${envPath}`, source: 'env' };
  }

  const userPath = getUserPath();
  if (userPath) {
    return { path: `file:${userPath}`, source: 'user' };
  }

  return { path: `file:${getProjectPath()}`, source: 'project' };
}

export function getDatabasePath(): string {
  return resolveDatabasePath().path;
}

export function getDatabaseSource(): DatabasePathResult['source'] {
  return resolveDatabasePath().source;
}
