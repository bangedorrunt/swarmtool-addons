import { describe, it, expect } from 'vitest';
import {
  SwarmToolAddonsConfig,
  parseConfig,
  validateConfig,
  DEFAULT_MODELS,
  getDefaultConfig,
} from './types';

describe('SwarmToolAddonsConfig', () => {
  describe('type definitions', () => {
    it('should allow creating a valid config with path-based model overrides', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/custom-model',
            temperature: 0.7,
          },
          'swarm/worker': {
            model: 'opencode/worker-model',
            temperature: 0.5,
          },
          'swarm/researcher': {
            model: 'opencode/researcher-model',
            temperature: 0.3,
          },
        },
      };

      expect(config.models['swarm/planner'].model).toBe('opencode/custom-model');
      expect(config.models['swarm/worker'].model).toBe('opencode/worker-model');
      expect(config.models['swarm/researcher'].model).toBe('opencode/researcher-model');
    });

    it('should allow partial model config with optional fields', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/simple-model',
          },
          'swarm/worker': {
            model: 'opencode/another-model',
          },
          'custom/path/agent': {
            model: 'opencode/third-model',
          },
        },
      };

      expect(config.models['swarm/planner'].temperature).toBeUndefined();
      expect(config.models['swarm/worker'].temperature).toBeUndefined();
    });

    it('should allow optional top-level settings', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: 'opencode/model' },
          'swarm/worker': { model: 'opencode/model' },
          'swarm/researcher': { model: 'opencode/model' },
        },
        debug: false,
        logLevel: 'error',
      };

      expect(config.debug).toBe(false);
      expect(config.logLevel).toBe('error');
    });

    it('should require models section', () => {
      const invalid: Partial<SwarmToolAddonsConfig> = {};
      expect(invalid.models).toBeUndefined();
    });
  });

  describe('parseConfig', () => {
    it('should parse valid JSON config string', () => {
      const jsonStr = JSON.stringify({
        models: {
          'swarm/planner': {
            model: 'opencode/planner-model',
            temperature: 0.8,
          },
          'swarm/worker': {
            model: 'opencode/worker-model',
          },
          'swarm/researcher': {
            model: 'opencode/researcher-model',
            temperature: 0.3,
          },
        },
      });

      const config = parseConfig(jsonStr);

      expect(config).toBeDefined();
      expect(config.models['swarm/planner'].model).toBe('opencode/planner-model');
      expect(config.models['swarm/planner'].temperature).toBe(0.8);
      expect(config.models['swarm/worker'].model).toBe('opencode/worker-model');
      expect(config.models['swarm/researcher'].model).toBe('opencode/researcher-model');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseConfig('invalid json')).toThrow();
    });

    it('should throw on missing models section', () => {
      const jsonStr = JSON.stringify({ debug: true });

      expect(() => parseConfig(jsonStr)).toThrow('models');
    });

    it('should throw on empty models section', () => {
      const jsonStr = JSON.stringify({ models: {} });

      expect(() => parseConfig(jsonStr)).toThrow('at least one');
    });

    it('should throw on missing model field', () => {
      const jsonStr = JSON.stringify({
        models: {
          'swarm/planner': { model: 'opencode/model' },
          'swarm/worker': {}, // missing model field
        },
      });

      expect(() => parseConfig(jsonStr)).toThrow('model field');
    });
  });

  describe('validateConfig', () => {
    it('should validate complete config', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: 'opencode/model' },
          'swarm/worker': { model: 'opencode/model' },
          'swarm/researcher': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate custom agent paths', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          librarian: { model: 'opencode/model' },
          'custom/path/agent': { model: 'opencode/model', temperature: 0.5 },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid temperature values', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: 'opencode/model', temperature: 2.1 },
          'swarm/worker': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for negative temperature', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: 'opencode/model', temperature: -0.5 },
          'swarm/worker': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate logLevel if provided', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: 'opencode/model' },
          'swarm/worker': { model: 'opencode/model' },
          'swarm/researcher': { model: 'opencode/model' },
        },
        logLevel: 'invalid' as unknown as SwarmToolAddonsConfig['logLevel'],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it('should accept all valid log levels', () => {
      const validLevels: Array<'debug' | 'info' | 'warn' | 'error'> = [
        'debug',
        'info',
        'warn',
        'error',
      ];

      for (const level of validLevels) {
        const config: SwarmToolAddonsConfig = {
          models: {
            'swarm/planner': { model: 'opencode/model' },
            'swarm/worker': { model: 'opencode/model' },
            'swarm/researcher': { model: 'opencode/model' },
          },
          logLevel: level,
        };

        const result = validateConfig(config);
        expect(result.valid).toBe(true);
      }
    });

    it('should return errors for empty model string', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': { model: '' },
          'swarm/worker': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('new fields: disable and forcedSkills', () => {
    it('should accept disable field in model config', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/model',
            disable: true,
          },
          'swarm/worker': {
            model: 'opencode/model',
            disable: false,
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['swarm/planner'].disable).toBe(true);
      expect(config.models['swarm/worker'].disable).toBe(false);
    });

    it('should accept forcedSkills field in model config', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/model',
            forcedSkills: ['system-design', 'swarm-coordination'],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['swarm/planner'].forcedSkills).toEqual([
        'system-design',
        'swarm-coordination',
      ]);
    });

    it('should accept empty forcedSkills array', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/model',
            forcedSkills: [],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['swarm/planner'].forcedSkills).toEqual([]);
    });

    it('should accept all optional fields together', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/model',
            temperature: 0.7,
            disable: false,
            forcedSkills: ['system-design'],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['swarm/planner'].disable).toBe(false);
      expect(config.models['swarm/planner'].forcedSkills).toEqual(['system-design']);
    });

    it('should parse config with disable and forcedSkills from JSON', () => {
      const jsonStr = JSON.stringify({
        models: {
          'swarm/planner': {
            model: 'opencode/model',
            disable: true,
            forcedSkills: ['skill1', 'skill2'],
          },
        },
      });

      const config = parseConfig(jsonStr);
      expect(config.models['swarm/planner'].disable).toBe(true);
      expect(config.models['swarm/planner'].forcedSkills).toEqual(['skill1', 'skill2']);
    });

    it('should preserve disable and forcedSkills when undefined', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'swarm/planner': {
            model: 'opencode/model',
          },
        },
      };

      expect(config.models['swarm/planner'].disable).toBeUndefined();
      expect(config.models['swarm/planner'].forcedSkills).toBeUndefined();
    });
  });

  describe('DEFAULT_MODELS includes oracle', () => {
    it('should include oracle in DEFAULT_MODELS', () => {
      expect(DEFAULT_MODELS).toHaveProperty('oracle');
      expect(DEFAULT_MODELS.oracle).toBe('openai/gpt-5.2');
    });

    it('should have all required agents in DEFAULT_MODELS', () => {
      const expectedAgents = ['swarm/planner', 'swarm/worker', 'swarm/researcher', 'oracle'];

      for (const agent of expectedAgents) {
        expect(DEFAULT_MODELS).toHaveProperty(agent);
        expect(typeof DEFAULT_MODELS[agent as keyof typeof DEFAULT_MODELS]).toBe('string');
      }
    });
  });

  describe('getDefaultConfig includes oracle', () => {
    it('should include oracle in default config', () => {
      const defaultConfig = getDefaultConfig();
      expect(defaultConfig.models).toHaveProperty('oracle');
      expect(defaultConfig.models.oracle.model).toBe('openai/gpt-5.2');
    });

    it('should include all agents with their default models', () => {
      const defaultConfig = getDefaultConfig();
      const expectedAgents = ['swarm/planner', 'swarm/worker', 'swarm/researcher', 'oracle'];

      for (const agent of expectedAgents) {
        expect(defaultConfig.models).toHaveProperty(agent);
        expect(defaultConfig.models[agent]).toBeDefined();
        expect(defaultConfig.models[agent].model).toBeDefined();
      }
    });
  });
});
