import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadSkillAgents } from './loader';

const TEMP_VIRTUAL_HOME = join(process.cwd(), '.temp_home');
const TEMP_SKILL_DIR = join(TEMP_VIRTUAL_HOME, '.config', 'opencode', 'skill');

describe('loadSkillAgents discovery and filtering', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = TEMP_VIRTUAL_HOME;
    if (!existsSync(TEMP_SKILL_DIR)) {
      mkdirSync(TEMP_SKILL_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (existsSync(TEMP_VIRTUAL_HOME)) {
      rmSync(TEMP_VIRTUAL_HOME, { recursive: true });
    }
  });

  it('should NOT load root SKILL.md without agent: true', async () => {
    const skillPath = join(TEMP_SKILL_DIR, 'non-agent-skill');
    mkdirSync(skillPath, { recursive: true });
    writeFileSync(join(skillPath, 'SKILL.md'), '---\nname: non-agent\n---\nContent');

    const agents = await loadSkillAgents();
    expect(agents.find((a) => a.name === 'non-agent')).toBeUndefined();
  });

  it('should load root SKILL.md WITH agent: true', async () => {
    const skillPath = join(TEMP_SKILL_DIR, 'agent-skill');
    mkdirSync(skillPath, { recursive: true });
    // Use flat fields since our parser is simple
    writeFileSync(
      join(skillPath, 'SKILL.md'),
      '---\nname: real-agent\nagent: true\nvisibility: public\n---\nContent'
    );

    const agents = await loadSkillAgents();
    const agent = agents.find((a) => a.name === 'real-agent');
    expect(agent).toBeDefined();
    expect(agent?.config.visibility).toBe('public');
  });

  it('should load nested agents regardless of agent: true flag', async () => {
    const skillPath = join(TEMP_SKILL_DIR, 'nested-skill');
    const nestedAgentPath = join(skillPath, 'agent', 'sub-agent');
    mkdirSync(nestedAgentPath, { recursive: true });
    writeFileSync(join(nestedAgentPath, 'SKILL.md'), '---\nname: sub-agent\n---\nContent');

    const agents = await loadSkillAgents();
    expect(
      agents.find((a) => a.name === 'nested-skill/sub-agent' || a.name === 'sub-agent')
    ).toBeDefined();
  });
});
