import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSkillAgentTools } from './agent/tools';
import * as loader from './loader';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Integration Tests for Skill Agent Tool
 *
 * Tests end-to-end flow from skill discovery to subagent spawning.
 * Verifies Hybrid Delegator Pattern (see src/orchestrator/PLAN.md).
 * Follows TDD: RED → GREEN → REFACTOR.
 */

describe('Integration: skill_agent tool', () => {
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

    // Mock client with call method
    mockClient = {
      call: vi.fn().mockResolvedValue('task-result'),
    };

    // Mock loadSkillAgents
    loadSkillAgentsMock = vi.spyOn(loader, 'loadSkillAgents');
    loadSkillAgentsMock.mockClear();
  });

  describe('end-to-end subagent spawning flow', () => {
    it('discovers code-reviewer skill and spawns it with correct arguments', async () => {
      // Mock loadSkillAgents to return code-reviewer agent from fixtures
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'code-reviewer/reviewer',
          config: {
            name: 'code-reviewer/reviewer',
            description:
              'Automated code review agent that analyzes code for quality, security, performance, and best practices',
            model: 'opencode/grok-code',
            temperature: 0.2,
            tools: {
              write: false,
              edit: false,
              background_task: false,
            },
            prompt: `You are an expert code reviewer. Your job: analyze code for quality, security, and maintainability.

## Your Mission

Review code submissions and provide constructive feedback covering:

- **Code Quality**: Readability, structure, and organization
- **Security**: Potential vulnerabilities and security best practices
- **Performance**: Efficiency and optimization opportunities
- **Best Practices**: Adherence to language-specific conventions
- **Maintainability**: Ease of understanding and future modifications`,
          },
        },
      ]);

      // Create tools with mocked client
      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      // Execute tool - this should discover and spawn code-reviewer
      const result = await skillAgentTool.execute(
        {
          skill_name: 'code-reviewer',
          agent_name: 'reviewer',
          prompt: 'Review this TypeScript file for security issues',
          run_in_background: false,
        },
        mockContext
      );

      // Parse JSON result
      const parsedResult = JSON.parse(result);

      // Verify success
      expect(parsedResult.success).toBe(true);

      // Verify client.call was invoked with correct arguments
      expect(mockClient.call).toHaveBeenCalledTimes(1);
      expect(mockClient.call).toHaveBeenCalledWith('task', {
        description: 'Review this TypeScript file for security issues',
        agent: 'code-reviewer/reviewer',
      });
    });
  });

  describe('context partitioning and prompt construction', () => {
    it('passes user-provided prompt directly to client.call without modification', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'test-skill/test-agent',
          config: {
            name: 'test-skill/test-agent',
            description: 'Test agent for context partitioning',
            prompt: 'Default test agent prompt',
          },
        },
      ]);

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const customPrompt =
        'Analyze this code for performance bottlenecks and suggest optimizations. Focus on:\n1. Loop complexity\n2. Memory usage\n3. I/O operations';

      await skillAgentTool.execute(
        {
          skill_name: 'test-skill',
          agent_name: 'test-agent',
          prompt: customPrompt,
        },
        mockContext
      );

      // Verify exact prompt is passed through (context partitioning - isolation)
      expect(mockClient.call).toHaveBeenCalledWith('task', {
        description: customPrompt,
        agent: 'test-skill/test-agent',
      });
    });
  });

  describe('background task spawning', () => {
    it('uses background_task tool when run_in_background is true', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'async-skill/worker',
          config: {
            name: 'async-skill/worker',
            description: 'Async worker agent',
            prompt: 'Worker prompt',
          },
        },
      ]);

      mockClient.call.mockResolvedValue('bg-task-123');

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const result = await skillAgentTool.execute(
        {
          skill_name: 'async-skill',
          agent_name: 'worker',
          prompt: 'Process this large file in background',
          run_in_background: true,
        },
        mockContext
      );

      const parsedResult = JSON.parse(result);

      // Verify success with taskId (not output)
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.taskId).toBe('bg-task-123');

      // Verify background_task tool was called
      expect(mockClient.call).toHaveBeenCalledWith('background_task', {
        description: 'Process this large file in background',
        agent: 'async-skill/worker',
      });
    });
  });

  describe('error handling in integration context', () => {
    it('handles spawn failure gracefully and returns structured error', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'failing-skill/worker',
          config: {
            name: 'failing-skill/worker',
            description: 'Failing agent',
            prompt: 'Worker prompt',
          },
        },
      ]);

      // Simulate spawn failure
      mockClient.call.mockRejectedValue(new Error('Agent spawn timeout'));

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const result = await skillAgentTool.execute(
        {
          skill_name: 'failing-skill',
          agent_name: 'worker',
          prompt: 'Test task',
        },
        mockContext
      );

      const parsedResult = JSON.parse(result);

      // Verify error is caught and returned
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBe('SPAWN_FAILED');
      expect(parsedResult.message).toBe('Agent spawn timeout');
    });
  });

  describe('integration with real fixture content', () => {
    it('can parse and use real code-reviewer fixture content', async () => {
      // Read actual fixture file
      const fixturePath = path.join(
        __dirname,
        '__tests__',
        'fixtures',
        'skill',
        'code-reviewer',
        'SKILL.md'
      );
      const fixtureContent = await Bun.file(fixturePath).text();

      // Parse to get config
      const { parseAgentMarkdown } = await import('./loader');
      const config = parseAgentMarkdown(fixtureContent, 'code-reviewer/reviewer');

      // Mock to return this config (note: agent name in format skill/agent)
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'code-reviewer/reviewer',
          config,
        },
      ]);

      mockClient.call.mockResolvedValue('Review complete: 3 issues found');

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const result = await skillAgentTool.execute(
        {
          skill_name: 'code-reviewer',
          agent_name: 'reviewer',
          prompt: 'Review src/agent/integration.test.ts',
        },
        mockContext
      );

      const parsedResult = JSON.parse(result);

      // Verify fixture content was used correctly
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.output).toBe('Review complete: 3 issues found');

      // Verify correct agent name was used
      expect(mockClient.call).toHaveBeenCalledWith('task', {
        description: 'Review src/agent/integration.test.ts',
        agent: 'code-reviewer/reviewer',
      });
    });
  });

  describe('multi-agent scenarios', () => {
    it('handles multiple agents from same skill correctly', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'dev-skill/linter',
          config: {
            name: 'dev-skill/linter',
            description: 'Code linter agent',
            prompt: 'Lint code for style violations',
          },
        },
        {
          name: 'dev-skill/formatter',
          config: {
            name: 'dev-skill/formatter',
            description: 'Code formatter agent',
            prompt: 'Format code according to style guide',
          },
        },
        {
          name: 'dev-skill/tester',
          config: {
            name: 'dev-skill/tester',
            description: 'Test runner agent',
            prompt: 'Run tests and report results',
          },
        },
      ]);

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      // Spawn first agent
      const result1 = await skillAgentTool.execute(
        {
          skill_name: 'dev-skill',
          agent_name: 'linter',
          prompt: 'Lint this file',
        },
        mockContext
      );

      expect(JSON.parse(result1).success).toBe(true);

      // Spawn second agent
      const result2 = await skillAgentTool.execute(
        {
          skill_name: 'dev-skill',
          agent_name: 'formatter',
          prompt: 'Format this file',
        },
        mockContext
      );

      expect(JSON.parse(result2).success).toBe(true);

      // Spawn third agent
      const result3 = await skillAgentTool.execute(
        {
          skill_name: 'dev-skill',
          agent_name: 'tester',
          prompt: 'Test this file',
        },
        mockContext
      );

      expect(JSON.parse(result3).success).toBe(true);

      // Verify all three agents were spawned correctly
      expect(mockClient.call).toHaveBeenCalledTimes(3);
      expect(mockClient.call).toHaveBeenNthCalledWith(1, 'task', {
        description: 'Lint this file',
        agent: 'dev-skill/linter',
      });
      expect(mockClient.call).toHaveBeenNthCalledWith(2, 'task', {
        description: 'Format this file',
        agent: 'dev-skill/formatter',
      });
      expect(mockClient.call).toHaveBeenNthCalledWith(3, 'task', {
        description: 'Test this file',
        agent: 'dev-skill/tester',
      });
    });
  });

  describe('Hybrid Delegator Pattern verification', () => {
    it('follows delegation flow: discover → load → spawn', async () => {
      // This test verifies the complete Hybrid Delegator Pattern flow:
      // 1. Discover agent from skill
      // 2. Load agent configuration
      // 3. Spawn agent via client.call delegation

      const mockAgent = {
        name: 'orchestration-skill/coordinator',
        config: {
          name: 'orchestration-skill/coordinator',
          description: 'Orchestration agent',
          model: 'opencode/gpt-4',
          temperature: 0.7,
          prompt: 'Coordinator prompt with context partitioning logic',
        },
      };

      loadSkillAgentsMock.mockResolvedValue([mockAgent]);

      mockClient.call.mockResolvedValue('orchestration-complete');

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const taskDescription = 'Orchestrate multi-agent workflow for refactoring task';

      const result = await skillAgentTool.execute(
        {
          skill_name: 'orchestration-skill',
          agent_name: 'coordinator',
          prompt: taskDescription,
        },
        mockContext
      );

      const parsedResult = JSON.parse(result);

      // Step 1: Verify discovery happened
      expect(loadSkillAgentsMock).toHaveBeenCalledTimes(1);

      // Step 2: Verify spawn happened via delegation
      expect(mockClient.call).toHaveBeenCalledTimes(1);
      expect(mockClient.call).toHaveBeenCalledWith('task', {
        description: taskDescription,
        agent: 'orchestration-skill/coordinator',
      });

      // Step 3: Verify successful delegation
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.output).toBe('orchestration-complete');
    });
  });

  describe('edge cases and error scenarios', () => {
    it('handles special characters in skill and agent names', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'my-skill-v2/special_agent@123',
          config: {
            name: 'my-skill-v2/special_agent@123',
            description: 'Agent with special characters',
            prompt: 'Agent prompt',
          },
        },
      ]);

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      const result = await skillAgentTool.execute(
        {
          skill_name: 'my-skill-v2',
          agent_name: 'special_agent@123',
          prompt: 'Test with special characters',
        },
        mockContext
      );

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(mockClient.call).toHaveBeenCalledWith('task', {
        description: 'Test with special characters',
        agent: 'my-skill-v2/special_agent@123',
      });
    });

    it('preserves case sensitivity in agent names', async () => {
      loadSkillAgentsMock.mockResolvedValue([
        {
          name: 'Code-Reviewer/Main',
          config: {
            name: 'Code-Reviewer/Main',
            description: 'Uppercase agent name',
            prompt: 'Agent prompt',
          },
        },
        {
          name: 'Code-Reviewer/secondary',
          config: {
            name: 'Code-Reviewer/secondary',
            description: 'Lowercase agent name',
            prompt: 'Agent prompt',
          },
        },
      ]);

      const tools = createSkillAgentTools(mockClient);
      const skillAgentTool = tools.skill_agent;

      // Request uppercase agent
      const result1 = await skillAgentTool.execute(
        {
          skill_name: 'Code-Reviewer',
          agent_name: 'Main',
          prompt: 'Test uppercase',
        },
        mockContext
      );

      expect(JSON.parse(result1).success).toBe(true);

      // Request lowercase agent
      const result2 = await skillAgentTool.execute(
        {
          skill_name: 'Code-Reviewer',
          agent_name: 'secondary',
          prompt: 'Test lowercase',
        },
        mockContext
      );

      expect(JSON.parse(result2).success).toBe(true);

      // Verify both were called with exact case
      expect(mockClient.call).toHaveBeenNthCalledWith(1, 'task', {
        description: 'Test uppercase',
        agent: 'Code-Reviewer/Main',
      });
      expect(mockClient.call).toHaveBeenNthCalledWith(2, 'task', {
        description: 'Test lowercase',
        agent: 'Code-Reviewer/secondary',
      });
    });
  });
});
