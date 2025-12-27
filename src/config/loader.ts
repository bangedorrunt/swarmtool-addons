/**
 * Config loader with fallback to defaults
 *
 * Reads configuration from JSON file with graceful error handling.
 * Returns default configuration if file is missing or invalid.
 *
 * IMPORTANT: This module ONLY handles configuration file paths, NOT database paths.
 *
 * Database Path Resolution (separate concern):
 * - Database (swarm.db) path is determined by swarm-mail via getSwarmMailLibSQL()
 * - See src/memory-lane/tools.ts:17 for database path resolution logic
 * - See src/index.ts:194 for projectPath initialization
 *
 * Configuration file paths handled here:
 * - Config directory: ~/.config/opencode/ (macOS/Linux) or %APPDATA%\opencode\ (Windows)
 * - Config file: ~/.config/opencode/swarmtool-addons.json
 *
 * DATABASE vs CONFIG PATHS - They are DIFFERENT:
 * - Config: Global user settings (models, preferences)
 * - Database: Project-specific swarm.db located in .hive/ directory
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  return path.join(getConfigDir(), 'swarmtool-addons.json');
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
      // eslint-disable-next-line no-console
      console.error(`[ERROR] Config validation failed for ${filePath}:\n${errorMessage}`);
    }

    return config;
  } catch (error) {
    // Log error with [ERROR] prefix (no console.log errors)
    const errorMessage = error instanceof Error ? error.toString() : String(error);
    // eslint-disable-next-line no-console
    console.error(`[ERROR] Failed to load config from ${filePath}: ${errorMessage}`);

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
