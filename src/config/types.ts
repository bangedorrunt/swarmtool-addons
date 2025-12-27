/**
 * Model configuration for a single agent
 *
 * Allows overriding default models with optional parameters
 */
export interface ModelOverride {
  /** Model identifier (e.g., 'opencode/big-pickle', 'opencode/glm-4.7-free') */
  model: string;

  /** Temperature for generation (0.0 - 2.0), optional */
  temperature?: number;

  /** Disable this agent (optional, default: false) */
  disable?: boolean;

  /** Force specific skills to be loaded for this agent (optional) */
  forcedSkills?: string[];
}

/**
 * Configuration for all swarm agent models
 *
 * Maps agent paths (e.g., 'swarm/planner', 'librarian') to model overrides
 */
export interface AgentModelConfig {
  /** Agent path -> model configuration mapping */
  [agentPath: string]: ModelOverride;
}

/**
 * Valid log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Complete configuration for swarm-tool-addons plugin
 *
 * Loaded from ~/.config/opencode/swarmtool-addons.json
 */
export interface SwarmToolAddonsConfig {
  /** Model overrides for each agent type (required) */
  models: AgentModelConfig;

  /** Enable debug logging (optional, default: false) */
  debug?: boolean;

  /** Logging level (optional, default: 'info') */
  logLevel?: LogLevel;

  /** Additional custom settings can be added here as needed */
  [key: string]: unknown;
}

/**
 * Validation result for configuration
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;

  /** List of validation errors (empty if valid) */
  errors: string[];
}

/**
 * Default model identifiers for agent paths
 *
 * Maps agent paths (from src/agent/*.md) to default models
 */
export const DEFAULT_MODELS = {
  'swarm/planner': 'opencode/big-pickle',
  'swarm/worker': 'opencode/glm-4.7-free',
  'swarm/researcher': 'opencode/grok-code',
  oracle: 'openai/gpt-5.2',
} as const;

/**
 * Parse configuration from JSON string
 *
 * @param jsonStr - JSON string containing configuration
 * @returns Parsed configuration object
 * @throws Error if JSON is invalid or required fields are missing
 */
export function parseConfig(jsonStr: string): SwarmToolAddonsConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    const message = error instanceof Error ? error.toString() : String(error);
    throw new Error(`Failed to parse config JSON: ${message}`);
  }

  // Validate that parsed object has required models section
  if (typeof parsed !== 'object' || parsed === null || !('models' in parsed)) {
    throw new Error('Config must contain "models" section');
  }

  const config = parsed as Record<string, unknown>;
  const models = config.models as Record<string, unknown>;

  // Validate that models is an object
  if (typeof models !== 'object' || models === null) {
    throw new Error('Config "models" must be an object');
  }

  // Validate that each agent config has a model field
  for (const [agentPath, agentConfig] of Object.entries(models)) {
    const configObj = agentConfig as Record<string, unknown>;
    if (typeof configObj?.model !== 'string') {
      throw new Error(`Missing required model field for: models.${agentPath}.model`);
    }
  }

  // Ensure models section has at least one agent config
  if (Object.keys(models).length === 0) {
    throw new Error('Config "models" section must contain at least one agent configuration');
  }

  return config as SwarmToolAddonsConfig;
}

/**
 * Validate configuration structure and values
 *
 * Checks that all values are within acceptable ranges and types
 *
 * @param config - Configuration to validate
 * @returns Validation result with valid flag and error list
 */
export function validateConfig(config: SwarmToolAddonsConfig): ConfigValidationResult {
  const errors: string[] = [];

  // Validate each agent's model configuration
  for (const [agentPath, agentConfig] of Object.entries(config.models)) {
    // Check temperature if provided
    if (
      agentConfig.temperature !== undefined &&
      (typeof agentConfig.temperature !== 'number' ||
        agentConfig.temperature < 0 ||
        agentConfig.temperature > 2)
    ) {
      errors.push(`models.${agentPath}.temperature must be a number between 0 and 2`);
    }

    // Validate model is a string
    if (typeof agentConfig.model !== 'string' || agentConfig.model.trim() === '') {
      errors.push(`models.${agentPath}.model must be a non-empty string`);
    }
  }

  // Validate logLevel if provided
  if (config.logLevel !== undefined) {
    const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(config.logLevel)) {
      errors.push(`logLevel must be one of: ${validLevels.join(', ')}, got: ${config.logLevel}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default configuration with all default values
 *
 * @returns Default configuration object
 */
export function getDefaultConfig(): SwarmToolAddonsConfig {
  return {
    models: {
      'swarm/planner': {
        model: DEFAULT_MODELS['swarm/planner'],
      },
      'swarm/worker': {
        model: DEFAULT_MODELS['swarm/worker'],
      },
      'swarm/researcher': {
        model: DEFAULT_MODELS['swarm/researcher'],
      },
      oracle: {
        model: DEFAULT_MODELS.oracle,
      },
    },
    debug: false,
    logLevel: 'info',
  };
}
