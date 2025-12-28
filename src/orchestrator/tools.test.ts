import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSkillAgentTools } from './tools';
import { loadSkillAgents } from '../opencode/loader';
import * as loader from '../opencode/loader';

/**
 * Unit Tests for Orchestrator Skill Agent Tools
 *
 * Tests prompt generation, argument validation, and error handling
 * for skill_agent tool in the orchestrator module.
 * This mirrors the opencode/agent/tests but validates orchestrator's
 * own implementation, ensuring it's decoupled from opencode/agent.
 */

describe('orchestrator/createSkillAgentTools', () => {
  let mockClient: any;
  let loadSkillAgentsMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock client with call method
    mockClient = {
      call: vi.fn().mockResolvedValue('task-result'),
    };

    // Mock loadSkillAgents
    loadSkillAgentsMock = vi.spyOn(loader, 'loadSkillAgents');
    loadSkillAgentsMock.mockClear();
  });

  describe('skill_agent tool', () => {
    let skillAgentTool: any;

    beforeEach(() => {
      const tools = createSkillAgentTools(mockClient);
      skillAgentTool = tools.skill_agent;
    });

    describe('resolves fullName correctly', () => {
      it('constructs fullName as skill_name/agent_name', async () => {
        // Mock agent discovery
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'code-reviewer/reviewer',
            config: {
              name: 'code-reviewer/reviewer',
              prompt: 'Review code for issues.',
            },
          },
        ]);

        const parsedResult = JSON.parse(
          await skillAgentTool.execute({
            skill_name: 'code-reviewer',
            agent_name: 'reviewer',
            prompt: 'Review this file',
          })
        );

        expect(parsedResult.success).toBe(true);
      });

      it('handles skill names with hyphens', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'my-skill/agent-name',
            config: {
              name: 'my-skill/agent-name',
              prompt: 'Agent prompt',
            },
          },
        ]);

        const parsedResult = JSON.parse(
          await skillAgentTool.execute({
            skill_name: 'my-skill',
            agent_name: 'agent-name',
            prompt: 'Test task',
          })
        );

        expect(parsedResult.success).toBe(true);
      });

      it('handles skill names with underscores', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'my_skill/my_agent',
            config: {
              name: 'my_skill/my_agent',
              prompt: 'Agent prompt',
            },
          },
        ]);

        const parsedResult = JSON.parse(
          await skillAgentTool.execute({
            skill_name: 'my_skill',
            agent_name: 'my_agent',
            prompt: 'Test task',
          })
        );

        expect(parsedResult.success).toBe(true);
      });
    });

    describe('calls client.call with correct arguments', () => {
      it('calls client.call with task tool when run_in_background is false', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent prompt',
            },
          },
        ]);

        await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task description',
          run_in_background: false,
        });

        expect(mockClient.call).toHaveBeenCalledTimes(1);
        expect(mockClient.call).toHaveBeenCalledWith('task', {
          description: 'Test task description',
          agent: 'test-skill/test-agent',
        });
      });

      it('calls client.call with background_task tool when run_in_background is true', async () => {
        mockClient.call.mockResolvedValue('background-task-id');

        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent prompt',
            },
          },
        ]);

        await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task description',
          run_in_background: true,
        });

        expect(mockClient.call).toHaveBeenCalledTimes(1);
        expect(mockClient.call).toHaveBeenCalledWith('background_task', {
          description: 'Test task description',
          agent: 'test-skill/test-agent',
        });
      });

      it('defaults run_in_background to false when not provided', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent prompt',
            },
          },
        ]);

        await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task description',
        });

        expect(mockClient.call).toHaveBeenCalledWith('task', expect.any(Object));
      });

      it('passes prompt from args to client.call', async () => {
        const customPrompt = 'This is a custom prompt with detailed instructions';

        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Default prompt',
            },
          },
        ]);

        await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: customPrompt,
        });

        expect(mockClient.call).toHaveBeenCalledWith(
          'task',
          expect.objectContaining({
            description: customPrompt,
          })
        );
      });

      it('passes agent name from discovery to client.call', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'code-reviewer/reviewer',
            config: {
              name: 'code-reviewer/reviewer',
              prompt: 'Code reviewer prompt',
            },
          },
        ]);

        await skillAgentTool.execute({
          skill_name: 'code-reviewer',
          agent_name: 'reviewer',
          prompt: 'Review this code',
        });

        expect(mockClient.call).toHaveBeenCalledWith(
          'task',
          expect.objectContaining({
            agent: 'code-reviewer/reviewer',
          })
        );
      });
    });

    describe('error handling for missing agents', () => {
      it('returns error when agent is not found', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/other-agent',
            config: {
              name: 'test-skill/other-agent',
              prompt: 'Other agent prompt',
            },
          },
        ]);

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'nonexistent-agent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('AGENT_NOT_FOUND');
        expect(parsedResult.message).toContain(
          "Agent 'nonexistent-agent' not found in skill 'test-skill'"
        );
      });

      it('includes available agents in error message when skill exists', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/agent1',
            config: {
              name: 'test-skill/agent1',
              prompt: 'Agent 1 prompt',
            },
          },
          {
            name: 'test-skill/agent2',
            config: {
              name: 'test-skill/agent2',
              prompt: 'Agent 2 prompt',
            },
          },
          {
            name: 'other-skill/agent',
            config: {
              name: 'other-skill/agent',
              prompt: 'Other agent prompt',
            },
          },
        ]);

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'nonexistent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('AGENT_NOT_FOUND');
        expect(parsedResult.message).toContain('Available agents in this skill: agent1, agent2');
      });

      it('indicates no agents found when skill does not exist', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'other-skill/agent',
            config: {
              name: 'other-skill/agent',
              prompt: 'Other agent',
            },
          },
        ]);

        const result = await skillAgentTool.execute({
          skill_name: 'nonexistent-skill',
          agent_name: 'agent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('AGENT_NOT_FOUND');
        expect(parsedResult.message).toContain("No agents found for skill 'nonexistent-skill'");
      });

      it('does not call client.call when agent is not found', async () => {
        loadSkillAgentsMock.mockResolvedValue([]);

        await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'nonexistent',
          prompt: 'Test task',
        });

        expect(mockClient.call).not.toHaveBeenCalled();
      });
    });

    describe('handles client.call errors', () => {
      it('returns error when client.call throws', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent',
            },
          },
        ]);

        const error = new Error('Network error');
        mockClient.call.mockRejectedValue(error);

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('SPAWN_FAILED');
        expect(parsedResult.message).toBe('Network error');
      });

      it('handles error without message property', async () => {
        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent',
            },
          },
        ]);

        mockClient.call.mockRejectedValue('String error');

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('SPAWN_FAILED');
        expect(parsedResult.message).toBe('String error');
      });
    });

    describe('successful execution', () => {
      it('returns success with output for foreground task', async () => {
        const mockOutput = 'Task completed successfully';

        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent',
            },
          },
        ]);

        mockClient.call.mockResolvedValue(mockOutput);

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task',
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(true);
        expect(parsedResult.output).toBe(mockOutput);
      });

      it('returns success with taskId for background task', async () => {
        const mockTaskId = 'task-123-abc';

        loadSkillAgentsMock.mockResolvedValue([
          {
            name: 'test-skill/test-agent',
            config: {
              name: 'test-skill/test-agent',
              prompt: 'Test agent',
            },
          },
        ]);

        mockClient.call.mockResolvedValue(mockTaskId);

        const result = await skillAgentTool.execute({
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: 'Test task',
          run_in_background: true,
        });

        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(true);
        expect(parsedResult.taskId).toBe(mockTaskId);
      });
    });
  });

  describe('tool definition', () => {
    it('has correct description', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.description).toBe(
        'Spawn a specialized subagent defined by a skill.'
      );
    });

    it('has skill_name argument defined', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.skill_name).toBeDefined();
    });

    it('has agent_name argument defined', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.agent_name).toBeDefined();
    });

    it('has prompt argument defined', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.prompt).toBeDefined();
    });

    it('has run_in_background argument defined as optional', () => {
      const tools = createSkillAgentTools(mockClient);

      expect(tools.skill_agent.args.run_in_background).toBeDefined();
    });
  });
});
