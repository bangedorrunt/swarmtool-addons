/**
 * Config loader with fallback to defaults
 *
 * Reads configuration from JSON file with graceful error handling.
 * Returns default configuration if file is missing or invalid.
 *
 * IMPORTANT: This module ONLY handles configuration file paths, NOT database paths.
 *
 * Database Path Resolution (separate concern):
 * - Database (memories.db) path is determined by src/utils/database-path.ts
 * - See src/memory-lane/tools.ts for database-backed tools
 * - See src/index.ts for overall plugin initialization
 *
 * Migration Note:
 * - memory-lane now operates independently with its own database (~/.opencode/memories.db)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createModuleLogger } from '../../utils/logger';

const log = createModuleLogger('ConfigLoader');
import {
  getDefaultConfig,
  parseConfig,
  validateConfig,
  type SwarmToolAddonsConfig,
  type ConfigValidationResult,
} from './types';

/**
 * Get default config directory path
 *
 * Platform-specific:
 * - macOS/Linux: ~/.config/opencode/
 * - Windows: %APPDATA%\opencode\
 *
 * @returns Path to config directory
 */
export function getConfigDir(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Roaming', 'opencode');
  }

  // macOS and Linux
  return path.join(homeDir, '.config', 'opencode');
}

/**
 * Get the default config file path
 *
 * @returns Path to swarm-tool-addons config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'opencode-addons.json');
}

/**
 * Load configuration from file with fallback to defaults
 *
 * Attempts to read and parse configuration file. If any error occurs
 * (file missing, invalid JSON, validation errors), returns default config.
 *
 * @param configPath - Optional path to config file
 * @returns Configuration object (either from file or defaults)
 */
export function loadConfig(configPath?: string): SwarmToolAddonsConfig {
  const defaultPath = getConfigPath();
  const filePath = configPath ?? defaultPath;

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return getDefaultConfig();
  }

  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse and validate configuration
    const config = parseConfig(content);
    const validation = validateConfig(config);

    // Warn about validation errors but still use config
    if (!validation.valid) {
      const errorMessage = validation.errors.join('\n');
      log.warn({ filePath, errors: validation.errors }, 'Config validation failed');
    }

    // Merge with default config to ensure all default models are present
    const defaultConfig = getDefaultConfig();
    return {
      ...defaultConfig,
      ...config,
      models: { ...defaultConfig.models, ...config.models },
    };
  } catch (error) {
    // Log error with [ERROR] prefix (no console.log errors)
    const errorMessage = error instanceof Error ? error.toString() : String(error);
    log.error({ filePath, error: errorMessage }, 'Failed to load config');

    // Return default config on any error
    return getDefaultConfig();
  }
}

/**
 * Load configuration with validation result
 *
 * Same as loadConfig but returns validation result instead of logging.
 *
 * @param configPath - Optional path to config file
 * @returns Configuration with validation result
 */
export function loadConfigWithValidation(configPath?: string): {
  config: SwarmToolAddonsConfig;
  validation: ConfigValidationResult;
} {
  const config = loadConfig(configPath);
  const validation = validateConfig(config);

  return { config, validation };
}

/**
 * Save configuration to file
 *
 * Creates config directory if it doesn't exist.
 *
 * @param config - Configuration to save
 * @param configPath - Optional path to config file
 * @throws Error if save fails
 */
export function saveConfig(config: SwarmToolAddonsConfig, configPath?: string): void {
  const filePath = configPath ?? getConfigPath();

  // Validate before saving
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Cannot save invalid config:\n${validation.errors.join('\n')}`);
  }

  // Create directory if it doesn't exist
  const configDir = path.dirname(filePath);
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create config directory: ${message}`);
    }
  }

  // Write config file
  try {
    const configStr = JSON.stringify(config, null, 2);
    fs.writeFileSync(filePath, configStr, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write config file: ${message}`);
  }
}

/**
 * Check if config file exists
 *
 * @param configPath - Optional path to config file
 * @returns True if config file exists
 */
export function configExists(configPath?: string): boolean {
  const filePath = configPath ?? getConfigPath();
  return fs.existsSync(filePath);
}
