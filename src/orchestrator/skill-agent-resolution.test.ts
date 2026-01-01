import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveAgent, listAllAgents } from './skill-agent-resolution';
import { loadSkillAgents } from '../opencode/loader';
import { loadChiefOfStaffSkills } from '../opencode/config/skill-loader';

// Mock dependencies
vi.mock('../opencode/loader', () => ({
  loadSkillAgents: vi.fn(),
}));

vi.mock('../opencode/config/skill-loader', () => ({
  loadChiefOfStaffSkills: vi.fn(),
}));

describe('Skill Agent Resolution Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve agent using exact name', async () => {
    (loadSkillAgents as any).mockResolvedValue([{ name: 'executor', config: {} }]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([]);

    const result = await resolveAgent({ agent_name: 'executor' });
    expect(result?.name).toBe('executor');
  });

  it('should resolve agent with chief-of-staff prefix if not provided', async () => {
    (loadSkillAgents as any).mockResolvedValue([]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([
      { name: 'chief-of-staff/oracle', config: {} },
    ]);

    const result = await resolveAgent({ agent_name: 'oracle' });
    expect(result?.name).toBe('chief-of-staff/oracle');
  });

  it('should resolve agent with skill_name prefix', async () => {
    (loadSkillAgents as any).mockResolvedValue([{ name: 'my-skill/my-agent', config: {} }]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([]);

    const result = await resolveAgent({ skill_name: 'my-skill', agent_name: 'my-agent' });
    expect(result?.name).toBe('my-skill/my-agent');
  });

  it('should fallback to Explore if agent not found', async () => {
    (loadSkillAgents as any).mockResolvedValue([]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([
      { name: 'chief-of-staff/explore', config: {} },
    ]);

    const result = await resolveAgent({ agent_name: 'unknown-agent' });
    expect(result?.name).toBe('chief-of-staff/explore');
  });

  it('should fallback to General if Explore not found', async () => {
    (loadSkillAgents as any).mockResolvedValue([]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([
      { name: 'chief-of-staff/general', config: {} },
    ]);

    const result = await resolveAgent({ agent_name: 'unknown-agent' });
    expect(result?.name).toBe('chief-of-staff/general');
  });

  it('should return null if no agent or fallback exists', async () => {
    (loadSkillAgents as any).mockResolvedValue([]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([]);

    const result = await resolveAgent({ agent_name: 'unknown-agent' });
    expect(result).toBeNull();
  });

  it('should list all agents uniquely and sorted', async () => {
    (loadSkillAgents as any).mockResolvedValue([{ name: 'executor' }, { name: 'common' }]);
    (loadChiefOfStaffSkills as any).mockResolvedValue([
      { name: 'chief-of-staff/oracle' },
      { name: 'common' },
    ]);

    const agents = await listAllAgents();
    expect(agents).toEqual(['chief-of-staff/oracle', 'common', 'executor']);
  });
});
