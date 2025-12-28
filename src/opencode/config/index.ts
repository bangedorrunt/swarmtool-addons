/**
 * Config module exports
 *
 * Provides configuration types, parsing, validation, and file I/O
 * for the swarm-tool-addons plugin.
 */

export type {
  ModelOverride,
  AgentModelConfig,
  SwarmToolAddonsConfig,
  LogLevel,
  ConfigValidationResult,
} from './types';

export { DEFAULT_MODELS, parseConfig, validateConfig, getDefaultConfig } from './types';

export {
  loadConfig,
  saveConfig,
  configExists,
  loadConfigWithValidation,
  getConfigDir,
  getConfigPath,
} from './loader';
