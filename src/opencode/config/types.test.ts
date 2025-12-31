import { describe, it, expect } from 'vitest';
import { SwarmToolAddonsConfig, parseConfig, validateConfig } from './types';

describe('SwarmToolAddonsConfig', () => {
  describe('type definitions', () => {
    it('should allow creating a valid config with path-based model overrides', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/oracle': {
            model: 'opencode/oracle-model',
            temperature: 0.3,
          },
        },
      };

      expect(config.models['chief-of-staff/oracle'].model).toBe('opencode/oracle-model');
    });

    it('should allow partial model config with optional fields', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/oracle': {
            model: 'opencode/oracle-model',
          },
        },
      };

      expect(config.models['chief-of-staff/oracle'].temperature).toBeUndefined();
    });

    it('should allow optional top-level settings', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/oracle': { model: 'opencode/oracle-model' },
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
          'chief-of-staff/oracle': { model: 'opencode/oracle-model', temperature: 0.3 },
        },
      });

      const config = parseConfig(jsonStr);

      expect(config).toBeDefined();
      expect(config.models['chief-of-staff/oracle'].model).toBe('opencode/oracle-model');
      expect(config.models['chief-of-staff/oracle'].temperature).toBe(0.3);
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
          'chief-of-staff/oracle': { model: 'opencode/oracle' },
          'chief-of-staff/planner': {}, // missing model field
        },
      });

      expect(() => parseConfig(jsonStr)).toThrow('model field');
    });
  });

  describe('validateConfig', () => {
    it('should validate complete config', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': { model: 'opencode/model' },
          'chief-of-staff/executor': { model: 'opencode/model' },
          'chief-of-staff/oracle': { model: 'opencode/model' },
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
          'chief-of-staff/planner': { model: 'opencode/model', temperature: 2.1 },
          'chief-of-staff/executor': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for negative temperature', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': { model: 'opencode/model', temperature: -0.5 },
          'chief-of-staff/executor': { model: 'opencode/model' },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate logLevel if provided', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': { model: 'opencode/model' },
          'chief-of-staff/executor': { model: 'opencode/model' },
          'chief-of-staff/oracle': { model: 'opencode/model' },
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
            'chief-of-staff/planner': { model: 'opencode/model' },
            'chief-of-staff/executor': { model: 'opencode/model' },
            'chief-of-staff/oracle': { model: 'opencode/model' },
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
          'chief-of-staff/planner': { model: '' },
          'chief-of-staff/executor': { model: 'opencode/model' },
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
          'chief-of-staff/planner': {
            model: 'opencode/model',
            disable: true,
          },
          'chief-of-staff/executor': {
            model: 'opencode/model',
            disable: false,
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['chief-of-staff/planner'].disable).toBe(true);
      expect(config.models['chief-of-staff/executor'].disable).toBe(false);
    });

    it('should accept forcedSkills field in model config', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': {
            model: 'opencode/model',
            forcedSkills: ['system-design', 'swarm-coordination'],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['chief-of-staff/planner'].forcedSkills).toEqual([
        'system-design',
        'swarm-coordination',
      ]);
    });

    it('should accept empty forcedSkills array', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': {
            model: 'opencode/model',
            forcedSkills: [],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['chief-of-staff/planner'].forcedSkills).toEqual([]);
    });

    it('should accept all optional fields together', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': {
            model: 'opencode/model',
            temperature: 0.7,
            disable: false,
            forcedSkills: ['system-design'],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(config.models['chief-of-staff/planner'].disable).toBe(false);
      expect(config.models['chief-of-staff/planner'].forcedSkills).toEqual(['system-design']);
    });

    it('should parse config with disable and forcedSkills from JSON', () => {
      const jsonStr = JSON.stringify({
        models: {
          'chief-of-staff/planner': {
            model: 'opencode/model',
            disable: true,
            forcedSkills: ['skill1', 'skill2'],
          },
        },
      });

      const config = parseConfig(jsonStr);
      expect(config.models['chief-of-staff/planner'].disable).toBe(true);
      expect(config.models['chief-of-staff/planner'].forcedSkills).toEqual(['skill1', 'skill2']);
    });

    it('should preserve disable and forcedSkills when undefined', () => {
      const config: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/planner': {
            model: 'opencode/model',
          },
        },
      };

      expect(config.models['chief-of-staff/planner'].disable).toBeUndefined();
      expect(config.models['chief-of-staff/planner'].forcedSkills).toBeUndefined();
    });
  });
});
