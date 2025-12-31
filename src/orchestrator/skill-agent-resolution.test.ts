import { describe, expect, it, vi } from 'vitest';
import { createSkillAgentTools } from './tools';

// Mock @opencode-ai/plugin
vi.mock('@opencode-ai/plugin', () => {
    const mockTool: any = vi.fn((opts) => ({
        execute: opts.execute,
    }));
    mockTool.schema = {
        string: () => ({ optional: () => ({ describe: () => ({}) }), describe: () => ({}) }),
        boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
        number: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
        any: () => ({ optional: () => ({ describe: () => ({}) }) }),
        array: () => ({ describe: () => ({}) }),
        object: () => ({ describe: () => ({}) }),
    };
    return {
        tool: mockTool,
    };
});

// Mock dependencies
vi.mock('../opencode/loader', () => ({
    loadSkillAgents: vi.fn(async () => [
        { name: 'test-skill/test-agent', config: { prompt: 'test' } },
        { name: 'other-agent', config: { prompt: 'other' } }
    ]),
}));

vi.mock('../opencode/config/skill-loader', () => ({
    loadChiefOfStaffSkills: vi.fn(async () => [
        { name: 'chief-of-staff/oracle', description: 'oracle', prompt: 'oracle' },
        { name: 'chief-of-staff/executor', description: 'executor', prompt: 'executor' },
    ]),
    getAvailableSkillNames: vi.fn(async () => ['chief-of-staff/oracle', 'chief-of-staff/executor']),
}));

vi.mock('./session-coordination', () => ({
    spawnChildAgent: vi.fn(),
}));

vi.mock('./actor/state', () => ({
    loadActorState: vi.fn(async () => ({})),
}));

vi.mock('./actor/core', () => ({
    processMessage: vi.fn(),
}));

describe('skill_agent Resolution', () => {
    const mockClient = {
        session: {
            create: vi.fn(async () => ({ data: { id: 'session-123' } })),
            prompt: vi.fn(async () => { }),
            promptAsync: vi.fn(async () => { }),
            status: vi.fn(async () => ({ data: {} })),
            messages: vi.fn(async () => ({ data: [] })),
        },
    };

    const tools = createSkillAgentTools(mockClient as any);
    const skill_agent = tools.skill_agent;

    it('should resolve agent using hierarchical name in agent_name', async () => {
        const result = await skill_agent.execute({
            agent_name: 'chief-of-staff/oracle',
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.agent).toBe('chief-of-staff/oracle');
    });

    it('should resolve agent using short name and skill_name', async () => {
        const result = await skill_agent.execute({
            skill_name: 'chief-of-staff',
            agent_name: 'oracle',
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.agent).toBe('chief-of-staff/oracle');
    });

    it('should resolve agent using "agent" alias (backward compatibility)', async () => {
        const result = await (skill_agent.execute as any)({
            agent: 'chief-of-staff/executor',
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.agent).toBe('chief-of-staff/executor');
    });

    it('should resolve nested agent by short name if it includes a slash', async () => {
        const result = await skill_agent.execute({
            agent_name: 'test-skill/test-agent',
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.agent).toBe('test-skill/test-agent');
    });

    it('should return error if agent not found', async () => {
        const result = await skill_agent.execute({
            agent_name: 'non-existent',
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toBe('AGENT_NOT_FOUND');
    });

    it('should return error if both agent_name and agent are missing', async () => {
        const result = await (skill_agent.execute as any)({
            prompt: 'hello',
            async: true,
            timeout_ms: 60000
        }, { sessionID: 'parent-123' } as any);

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toBe('MISSING_ARGUMENT');
    });
});

describe('skill_list Resolution', () => {
    const mockClient = { session: {} };
    const tools = createSkillAgentTools(mockClient as any);
    const skill_list = tools.skill_list;

    it('should list all agents from both loaders', async () => {
        const result = await skill_list.execute({}, {} as any);
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed.agents).toContain('chief-of-staff/executor');
        expect(parsed.agents).toContain('chief-of-staff/oracle');
        expect(parsed.agents).toContain('test-skill/test-agent');
        expect(parsed.agents).toContain('other-agent');
        expect(parsed.count).toBe(4);
    });
});
