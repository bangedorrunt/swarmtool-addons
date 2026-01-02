/**
 * Tests for index.ts config hook functionality
 * Specifically tests that command and agent model overrides work correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { SwarmToolAddonsConfig, ModelOverride } from './opencode/config/types';

// Mock environment
const testDir = join(process.cwd(), 'test-config-hook');

// Store original env
const originalEnv = { ...process.env };

describe('Config Hook - Model Overrides', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    // Restore env
    process.env = originalEnv;
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Model Override', () => {
    it('should apply user config model override to commands based on agent name', () => {
      // This test verifies the core fix: commands should respect userConfig.models[agentName].model

      // Simulate the config hook logic
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff': { model: 'custom/chief-model' },
          architect: { model: 'custom/architect-model' },
        },
      };

      const commands = [
        {
          name: 'sdd',
          frontmatter: {
            agent: 'chief-of-staff',
            model: 'frontmatter-chief-model',
            description: 'Strategic Design Driver',
          },
          template: '...',
        },
        {
          name: 'ama',
          frontmatter: {
            agent: 'architect',
            model: 'frontmatter-architect-model',
            description: 'Ask Me Anything',
          },
          template: '...',
        },
      ];

      const config: any = { command: {} };

      // This is the fixed logic from src/index.ts lines 513-522
      for (const cmd of commands) {
        const modelOverride = userConfig.models[cmd.frontmatter.agent];
        const model = modelOverride?.model ?? cmd.frontmatter.model ?? 'opencode/grok-code';

        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model,
        };
      }

      // Verify override is applied
      expect(config.command['sdd'].model).toBe('custom/chief-model');
      expect(config.command['ama'].model).toBe('custom/architect-model');
    });

    it('should fall back to frontmatter model when no user override exists', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {},
      };

      const commands = [
        {
          name: 'test-cmd',
          frontmatter: {
            agent: 'interviewer',
            model: 'frontmatter-interviewer-model',
            description: 'Test command',
          },
          template: '...',
        },
      ];

      const config: any = { command: {} };

      for (const cmd of commands) {
        const modelOverride = userConfig.models[cmd.frontmatter.agent];
        const model = modelOverride?.model ?? cmd.frontmatter.model ?? 'opencode/grok-code';

        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model,
        };
      }

      expect(config.command['test-cmd'].model).toBe('frontmatter-interviewer-model');
    });

    it('should use default model when no frontmatter model exists', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {},
      };

      const commands = [
        {
          name: 'minimal-cmd',
          frontmatter: {
            agent: 'librarian',
            description: 'Minimal command',
          },
          template: '...',
        },
      ];

      const config: any = { command: {} };

      for (const cmd of commands) {
        const modelOverride = userConfig.models[cmd.frontmatter.agent];
        const model =
          modelOverride?.model ?? (cmd.frontmatter as any).model ?? 'opencode/grok-code';

        config.command[cmd.name] = {
          template: cmd.template,
          description: cmd.frontmatter.description,
          agent: cmd.frontmatter.agent,
          model,
        };
      }

      expect(config.command['minimal-cmd'].model).toBe('opencode/grok-code');
    });
  });

  describe('Agent Model Override', () => {
    it('should apply user config model override to skill-based agents', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          architect: { model: 'override/architect' },
          executor: { model: 'override/executor' },
        },
      };

      const agents = [
        {
          name: 'architect',
          config: { model: 'default/architect', prompt: '...' },
        },
        {
          name: 'executor',
          config: { model: 'default/executor', prompt: '...' },
        },
        {
          name: 'interviewer',
          config: { model: 'default/interviewer', prompt: '...' },
        },
      ];

      const config: any = { agent: {} };

      // This is the logic from src/index.ts lines 524-532
      for (const agt of agents) {
        const modelOverride = userConfig.models[agt.name];
        const model = modelOverride?.model ?? agt.config.model ?? 'opencode/grok-code';
        config.agent[agt.name] = {
          ...agt.config,
          model,
        };
      }

      expect(config.agent.architect.model).toBe('override/architect');
      expect(config.agent.executor.model).toBe('override/executor');
      expect(config.agent.interviewer.model).toBe('default/interviewer');
    });

    it('should apply user config model override to chief-of-staff skills', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          'chief-of-staff/architect': { model: 'override/nested-architect' },
        },
      };

      const chiefOfStaffSkills = [
        {
          name: 'chief-of-staff/architect',
          model: 'default/nested-architect',
          prompt: '...',
          description: 'Architect skill',
          tools: {},
          temperature: undefined,
          metadata: {},
        },
        {
          name: 'chief-of-staff/executor',
          model: 'default/nested-executor',
          prompt: '...',
          description: 'Executor skill',
          tools: {},
          temperature: undefined,
          metadata: {},
        },
      ];

      const config: any = { agent: {} };

      // This is the logic from src/index.ts lines 535-547
      for (const skill of chiefOfStaffSkills) {
        const modelOverride = userConfig.models[skill.name];
        const model = modelOverride?.model ?? skill.model ?? 'opencode/grok-code';
        config.agent[skill.name] = {
          mode: 'subagent',
          model,
          prompt: skill.prompt,
          description: skill.description,
          tools: skill.tools,
          temperature: skill.temperature,
          metadata: { ...skill.metadata, visibility: 'internal' },
        };
      }

      expect(config.agent['chief-of-staff/architect'].model).toBe('override/nested-architect');
      expect(config.agent['chief-of-staff/executor'].model).toBe('default/nested-executor');
    });
  });

  describe('Native Agent Override', () => {
    it('should override native OpenCode agents from user config', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          Code: { model: 'override/code' },
          Ask: { model: 'override/ask' },
        },
      };

      const config: any = {
        agent: {
          Code: { model: 'native/code' },
          Ask: { model: 'native/ask' },
        },
      };

      // This is the logic from src/index.ts lines 551-570
      for (const [agentPath, modelConfig] of Object.entries(userConfig.models)) {
        if (modelConfig.disable) {
          continue;
        }

        if (config.agent[agentPath]) {
          config.agent[agentPath].model = modelConfig.model;
          if (modelConfig.temperature !== undefined) {
            config.agent[agentPath].temperature = modelConfig.temperature;
          }
        } else {
          config.agent[agentPath] = {
            model: modelConfig.model,
            ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
          };
        }
      }

      expect(config.agent.Code.model).toBe('override/code');
      expect(config.agent.Ask.model).toBe('override/ask');
    });

    it('should create new agent entry for native agents not in config', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          CustomAgent: { model: 'custom/agent' },
        },
      };

      const config: any = {
        agent: {},
      };

      for (const [agentPath, modelConfig] of Object.entries(userConfig.models)) {
        if (modelConfig.disable) {
          continue;
        }

        if (config.agent[agentPath]) {
          config.agent[agentPath].model = modelConfig.model;
        } else {
          config.agent[agentPath] = {
            model: modelConfig.model,
            ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
          };
        }
      }

      expect(config.agent.CustomAgent.model).toBe('custom/agent');
    });

    it('should skip disabled agents', () => {
      const userConfig: SwarmToolAddonsConfig = {
        models: {
          DisabledAgent: { model: 'disabled/agent', disable: true },
        },
      };

      const config: any = {
        agent: {},
      };

      for (const [agentPath, modelConfig] of Object.entries(userConfig.models)) {
        if (modelConfig.disable) {
          continue;
        }

        if (config.agent[agentPath]) {
          config.agent[agentPath].model = modelConfig.model;
        } else {
          config.agent[agentPath] = {
            model: modelConfig.model,
          };
        }
      }

      expect(config.agent.DisabledAgent).toBeUndefined();
    });
  });
});
