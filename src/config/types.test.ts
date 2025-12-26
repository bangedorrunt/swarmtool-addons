import { describe, it, expect } from 'vitest';
import { SwarmToolAddonsConfig, parseConfig, validateConfig } from './types';

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
});
