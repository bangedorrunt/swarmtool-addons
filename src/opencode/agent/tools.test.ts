import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSkillAgentTools } from '../../orchestrator/tools';
import * as skillLoader from '../config/skill-loader';

/**
 * Unit Tests for Skill Agent Tools
 *
 * Tests prompt generation, argument validation, and error handling
 * for skill_agent tool. Follows TDD principles: RED → GREEN → REFACTOR
 */

describe('createSkillAgentTools', () => {
  let mockClient: any;
  let loadSkillAgentsMock: any;
  const mockContext = {
    sessionID: 'test-session',
    messageID: 'test-message',
    agent: 'test-agent',
    abort: new AbortController().signal,
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock client with session.prompt method
    mockClient = {
      session: {
        create: vi.fn().mockResolvedValue({
          data: { id: 'test-session' },
        }),
        prompt: vi.fn().mockResolvedValue({
          data: {
            success: true,
            note: 'Agent message sent.',
          },
        }),
      },
    };
  });

  describe('skill_agent tool', () => {
    let skillAgentTool: any;

    beforeEach(() => {
      const tools = createSkillAgentTools(mockClient);
      skillAgentTool = tools.skill_agent;
    });

    describe('skill_agent invocation', () => {
      it('calls client.session.prompt with correct hierarchical agent name', async () => {
        await skillAgentTool.execute(
          {
            agent_name: 'chief-of-staff/oracle',
            prompt: 'Hello Oracle',
          },
          mockContext
        );

        expect(mockClient.session.prompt).toHaveBeenCalledWith({
          path: { id: 'test-session' },
          body: {
            agent: 'chief-of-staff/oracle',
            parts: [{ type: 'text', text: 'Hello Oracle' }],
          },
        });
      });

      it('includes context in the prompt if provided', async () => {
        await skillAgentTool.execute(
          {
            agent_name: 'chief-of-staff/oracle',
            prompt: 'Main prompt',
            context: 'Previous context',
          },
          mockContext
        );

        expect(mockClient.session.prompt).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              parts: [{ type: 'text', text: 'Previous context\n\nMain prompt' }],
            }),
          })
        );
      });

      it('returns success when session.prompt succeeds', async () => {
        const result = await skillAgentTool.execute(
          {
            agent_name: 'chief-of-staff/oracle',
            prompt: 'Test',
          },
          mockContext
        );

        const parsedResult = JSON.parse(result);
        expect(parsedResult.success).toBe(true);
        expect(parsedResult.agent).toBe('chief-of-staff/oracle');
      });

      it('returns error when session.create fails', async () => {
        mockClient.session.create.mockRejectedValue(new Error('Session create failed'));

        try {
          await skillAgentTool.execute(
            {
              agent_name: 'chief-of-staff/oracle',
              prompt: 'Test',
            },
            mockContext
          );
        } catch (err: any) {
          expect(err.message).toContain('Session create failed');
        }
      });

      it('returns error when session.prompt fails', async () => {
        mockClient.session.prompt.mockRejectedValue(new Error('Spawn failed'));

        const result = await skillAgentTool.execute(
          {
            agent_name: 'chief-of-staff/oracle',
            prompt: 'Test',
          },
          mockContext
        );

        const parsedResult = JSON.parse(result);
        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('SPAWN_FAILED');
        expect(parsedResult.message).toBe('Spawn failed');
      });

      it('returns success even if session.prompt has EOF error (OpenCode quirk)', async () => {
        mockClient.session.prompt.mockRejectedValue(new Error('JSON Parse error: Unexpected EOF'));

        const result = await skillAgentTool.execute(
          {
            agent_name: 'chief-of-staff/oracle',
            prompt: 'Test',
          },
          mockContext
        );

        const parsedResult = JSON.parse(result);
        expect(parsedResult.success).toBe(true);
        expect(parsedResult.agent).toBe('chief-of-staff/oracle');
      });
    });

    describe('skill_list tool', () => {
      let skillListTool: any;

      beforeEach(() => {
        const tools = createSkillAgentTools(mockClient);
        skillListTool = tools.skill_list;
      });

      it('lists available agents from loader', async () => {
        const mockSkillNames = ['chief-of-staff/oracle', 'chief-of-staff/interviewer'];
        vi.spyOn(skillLoader, 'getAvailableSkillNames').mockResolvedValue(mockSkillNames);

        const result = await skillListTool.execute({}, mockContext);

        expect(result).toContain('chief-of-staff/oracle');
        expect(result).toContain('chief-of-staff/interviewer');
      });
    });
  });

  describe('tool definition', () => {
    it('has correct description', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.description).toBe(
        'Spawn a specialized subagent. Use async:false for sequential orchestration (waits for result).'
      );
    });

    it('has agent_name argument defined', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.agent_name).toBeDefined();
    });

    it('has prompt argument defined', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.prompt).toBeDefined();
    });

    it('has context argument defined as optional', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.context).toBeDefined();
    });
  });
});
