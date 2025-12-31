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
 * Maps agent paths (e.g., 'chief-of-staff', 'chief-of-staff/planner') to model overrides
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
 * Primary agent:
 *   - chief-of-staff: The only user-facing orchestrator agent
 *
 * Subagents (internal, only callable by chief-of-staff or designated agents):
 *   - chief-of-staff/oracle: Strategic advisor for decomposition
 *   - chief-of-staff/planner: Implementation blueprint creator
 *   - chief-of-staff/executor: TDD-driven code generator
 *   - chief-of-staff/interviewer: User clarification via dialogue
 *   - chief-of-staff/spec-writer: Requirements extraction
 *   - chief-of-staff/validator: Quality gate verification
 *   - chief-of-staff/explore: Codebase search specialist
 *   - chief-of-staff/librarian: External library research
 *   - chief-of-staff/frontend-ui-ux-engineer: UI/UX implementation
 *   - chief-of-staff/memory-catcher: Session learning extraction
 *   - chief-of-staff/workflow-architect: Workflow design meta-agent
 */
export const DEFAULT_MODELS = {
  // Primary agent (user-facing)
  'chief-of-staff': 'google/gemini-3-pro-low',

  // Strategy & Planning subagents
  'chief-of-staff/oracle': 'google/gemini-3-flash',
  'chief-of-staff/planner': 'google/gemini-3-flash',
  'chief-of-staff/workflow-architect': 'google/gemini-3-pro',

  // User interaction subagents (DIALOGUE mode)
  'chief-of-staff/interviewer': 'google/gemini-3-flash',
  'chief-of-staff/spec-writer': 'google/gemini-3-flash',

  // Execution subagents
  'chief-of-staff/executor': 'google/gemini-3-pro-low',
  'chief-of-staff/validator': 'google/gemini-3-flash',
  'chief-of-staff/frontend-ui-ux-engineer': 'google/gemini-3-pro-high',

  // Research subagents
  'chief-of-staff/explore': 'opencode/grok-code',
  'chief-of-staff/librarian': 'opencode/grok-code',

  // Learning subagents
  'chief-of-staff/memory-catcher': 'google/gemini-3-flash',
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
      // Primary agent
      'chief-of-staff': { model: DEFAULT_MODELS['chief-of-staff'] },

      // Strategy & Planning subagents
      'chief-of-staff/oracle': { model: DEFAULT_MODELS['chief-of-staff/oracle'] },
      'chief-of-staff/planner': { model: DEFAULT_MODELS['chief-of-staff/planner'] },
      'chief-of-staff/workflow-architect': {
        model: DEFAULT_MODELS['chief-of-staff/workflow-architect'],
      },

      // User interaction subagents
      'chief-of-staff/interviewer': { model: DEFAULT_MODELS['chief-of-staff/interviewer'] },
      'chief-of-staff/spec-writer': { model: DEFAULT_MODELS['chief-of-staff/spec-writer'] },

      // Execution subagents
      'chief-of-staff/executor': { model: DEFAULT_MODELS['chief-of-staff/executor'] },
      'chief-of-staff/validator': { model: DEFAULT_MODELS['chief-of-staff/validator'] },
      'chief-of-staff/frontend-ui-ux-engineer': {
        model: DEFAULT_MODELS['chief-of-staff/frontend-ui-ux-engineer'],
      },

      // Research subagents
      'chief-of-staff/explore': { model: DEFAULT_MODELS['chief-of-staff/explore'] },
      'chief-of-staff/librarian': { model: DEFAULT_MODELS['chief-of-staff/librarian'] },

      // Learning subagents
      'chief-of-staff/memory-catcher': { model: DEFAULT_MODELS['chief-of-staff/memory-catcher'] },
    },
    debug: false,
    logLevel: 'info',
  };
}
