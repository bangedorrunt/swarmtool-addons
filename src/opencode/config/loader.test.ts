import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import {
  loadConfig,
  saveConfig,
  configExists,
  loadConfigWithValidation,
  getConfigDir,
  getConfigPath,
} from './loader';

const testDir = join(process.cwd(), 'test');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => { });
  // Ensure test directory exists
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadConfig', () => {
  const testConfigPath = join(testDir, 'test-config.json');

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }
  });

  it('should return default config when file does not exist', () => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true, force: true });
    }

    const config = loadConfig(testConfigPath);

    expect(config).toBeDefined();
    expect(config.models['chief-of-staff'].model).toBe('google/gemini-3-pro-low');
    expect(config.models['chief-of-staff/oracle'].model).toBe('google/gemini-3-flash');
    expect(config.models['chief-of-staff/planner'].model).toBe('google/gemini-3-flash');
  });

  it('should load and parse valid config file', () => {
    const validConfig = {
      models: {
        'chief-of-staff/planner': { model: 'opencode/custom-planner', temperature: 0.8 },
        'chief-of-staff/executor': { model: 'opencode/custom-executor' },
        'chief-of-staff/oracle': { model: 'opencode/custom-oracle', temperature: 0.3 },
      },
      debug: true,
      logLevel: 'debug' as const,
    };

    writeFileSync(testConfigPath, JSON.stringify(validConfig));

    const config = loadConfig(testConfigPath);

    expect(config.models['chief-of-staff/planner'].model).toBe('opencode/custom-planner');
    expect(config.models['chief-of-staff/planner'].temperature).toBe(0.8);
    expect(config.models['chief-of-staff/executor'].model).toBe('opencode/custom-executor');
    expect(config.models['chief-of-staff/oracle'].model).toBe('opencode/custom-oracle');
    expect(config.models['chief-of-staff/oracle'].temperature).toBe(0.3);
    expect(config.debug).toBe(true);
    expect(config.logLevel).toBe('debug');
  });

  it('should return default config when JSON is invalid', () => {
    writeFileSync(testConfigPath, '{ invalid json }');

    const config = loadConfig(testConfigPath);

    expect(config).toBeDefined();
    expect(config.models['chief-of-staff'].model).toBe('google/gemini-3-pro-low');
  });

  it('should return default config when missing required models section', () => {
    const invalidConfig = {
      debug: true,
    };

    writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

    const config = loadConfig(testConfigPath);

    expect(config).toBeDefined();
    expect(config.models['chief-of-staff'].model).toBe('google/gemini-3-pro-low');
  });

  it('should return default config when models section is empty', () => {
    const invalidConfig = {
      models: {},
    };

    writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

    const config = loadConfig(testConfigPath);

    expect(config).toBeDefined();
    expect(config.models['chief-of-staff'].model).toBe('google/gemini-3-pro-low');
  });

  it('should handle file read errors gracefully', () => {
    mkdirSync(testConfigPath);

    const config = loadConfig(testConfigPath);

    expect(config).toBeDefined();
    expect(config.models['chief-of-staff'].model).toBe('google/gemini-3-pro-low');

    rmSync(testConfigPath, { recursive: true });
  });

  it('should support custom agent paths', () => {
    const validConfig = {
      models: {
        librarian: { model: 'opencode/librarian-model' },
        'custom/path/agent': { model: 'opencode/custom-agent', temperature: 0.5 },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(validConfig));

    const config = loadConfig(testConfigPath);

    expect(config.models['librarian'].model).toBe('opencode/librarian-model');
    expect(config.models['custom/path/agent'].model).toBe('opencode/custom-agent');
    expect(config.models['custom/path/agent'].temperature).toBe(0.5);
  });

  it('should preserve disable and forcedSkills fields from config file', () => {
    const validConfig = {
      models: {
        'chief-of-staff/planner': {
          model: 'opencode/planner',
          disable: true,
          forcedSkills: ['system-design', 'swarm-coordination'],
        },
        'chief-of-staff/executor': {
          model: 'opencode/executor',
          disable: false,
          forcedSkills: [],
        },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(validConfig));

    const config = loadConfig(testConfigPath);

    expect(config.models['chief-of-staff/planner'].disable).toBe(true);
    expect(config.models['chief-of-staff/planner'].forcedSkills).toEqual([
      'system-design',
      'swarm-coordination',
    ]);
    expect(config.models['chief-of-staff/executor'].disable).toBe(false);
    expect(config.models['chief-of-staff/executor'].forcedSkills).toEqual([]);
    expect(config.models['chief-of-staff/oracle'].model).toBe('google/gemini-3-flash');
    expect(config.models['chief-of-staff/oracle'].forcedSkills).toBeUndefined();
  });
});

describe('saveConfig', () => {
  const testConfigPath = join(testDir, 'test-save-config.json');

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  it('should save config to file', () => {
    const configToSave = {
      models: {
        'chief-of-staff/planner': { model: 'saved/planner' },
        'chief-of-staff/executor': { model: 'saved/executor' },
        'chief-of-staff/oracle': { model: 'saved/oracle' },
      },
      debug: true,
    };

    saveConfig(configToSave, testConfigPath);

    expect(existsSync(testConfigPath)).toBe(true);

    const loaded = JSON.parse(readFileSync(testConfigPath, 'utf-8'));
    expect(loaded.models['chief-of-staff/planner'].model).toBe('saved/planner');
    expect(loaded.debug).toBe(true);
  });

  it('should create directory if it does not exist', () => {
    const nestedPath = join(process.cwd(), 'test-nested', 'dir', 'config.json');
    const configToSave = {
      models: {
        'chief-of-staff/planner': { model: 'model' },
        'chief-of-staff/executor': { model: 'model' },
      },
    };

    saveConfig(configToSave, nestedPath);

    expect(existsSync(nestedPath)).toBe(true);

    rmSync(join(process.cwd(), 'test-nested'), { recursive: true });
  });

  it('should throw on invalid config', () => {
    const invalidConfig = {
      models: {
        'chief-of-staff/planner': { model: 'model', temperature: 5.0 },
      },
    };

    expect(() => saveConfig(invalidConfig, testConfigPath)).toThrow();
  });
});

describe('configExists', () => {
  const testConfigPath = join(testDir, 'test-exists-config.json');

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  it('should return false when file does not exist', () => {
    const exists = configExists(testConfigPath);

    expect(exists).toBe(false);
  });

  it('should return true when file exists', () => {
    writeFileSync(testConfigPath, '{}');

    const exists = configExists(testConfigPath);

    expect(exists).toBe(true);
  });
});

describe('loadConfigWithValidation', () => {
  const testConfigPath = join(testDir, 'test-validation-config.json');

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  it('should return config and validation result', () => {
    const configToSave = {
      models: {
        'chief-of-staff/planner': { model: 'model' },
        'chief-of-staff/executor': { model: 'model' },
        'chief-of-staff/oracle': { model: 'model' },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(configToSave));

    const { config, validation } = loadConfigWithValidation(testConfigPath);

    expect(config).toBeDefined();
    expect(validation).toBeDefined();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('should return validation errors for invalid config', () => {
    const configToSave = {
      models: {
        'chief-of-staff/planner': { model: 'model', temperature: 3.0 },
        'chief-of-staff/executor': { model: 'model' },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(configToSave));

    const { config, validation } = loadConfigWithValidation(testConfigPath);

    expect(config).toBeDefined();
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should return valid validation for default config when file missing', () => {
    const { config, validation } = loadConfigWithValidation(testConfigPath);

    expect(config).toBeDefined();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});

describe('getConfigDir', () => {
  it('should return platform-specific config directory', () => {
    const dir = getConfigDir();

    expect(dir).toBeDefined();
    expect(typeof dir).toBe('string');
  });

  it('should include homedir', () => {
    const dir = getConfigDir();
    const home = os.homedir();

    expect(dir).toContain(home);
  });
});

describe('getConfigPath', () => {
  it('should return full path to config file', () => {
    const configPath = getConfigPath();

    expect(configPath).toBeDefined();
    expect(typeof configPath).toBe('string');
    expect(configPath).toContain('swarmtool-addons.json');
  });
});
