import { tool } from '@opencode-ai/plugin';
import { loadSkillAgents } from './loader';

/**
 * Skill-Based Subagent Tools
 *
 * Provides tools for spawning specialized subagents defined within skills.
 * Follows Approach 3 (Hybrid Delegator Pattern) from RESEARCH.md.
 */

export function createSkillAgentTools(client: any) {
  return {
    skill_agent: tool({
      description: 'Spawn a specialized subagent defined by a skill.',
      args: {
        skill_name: tool.schema.string().describe('Name of the skill that defines the agent.'),
        agent_name: tool.schema.string().describe('Name of the subagent to spawn.'),
        prompt: tool.schema.string().describe('Task description for the subagent.'),
        run_in_background: tool.schema
          .boolean()
          .optional()
          .describe('Whether to run the agent in the background (defaults to false)'),
      },
      async execute(args) {
        const { skill_name, agent_name, prompt, run_in_background } = args;
        const fullName = `${skill_name}/${agent_name}`;

        // Discover all agents (including skill-based ones)
        const allAgents = await loadSkillAgents();
        const agent = allAgents.find((a) => a.name === fullName);

        if (!agent) {
          // Find available agents for this skill for better error message
          const skillAgents = allAgents
            .filter((a) => a.name.startsWith(`${skill_name}/`))
            .map((a) => a.name.split('/')[1]);

          return JSON.stringify({
            success: false,
            error: 'AGENT_NOT_FOUND',
            message:
              `Agent '${agent_name}' not found in skill '${skill_name}'. ` +
              (skillAgents.length > 0
                ? `Available agents in this skill: ${skillAgents.join(', ')}`
                : `No agents found for skill '${skill_name}'.`),
          });
        }

        // Prepare spawn arguments
        const spawnArgs = {
          description: prompt,
          agent: agent.name,
        };

        try {
          if (run_in_background) {
            // Use background_task native tool
            const result = await client.call('background_task', spawnArgs);
            return JSON.stringify({ success: true, taskId: result });
          } else {
            // Use task native tool
            const result = await client.call('task', spawnArgs);
            return JSON.stringify({ success: true, output: result });
          }
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: 'SPAWN_FAILED',
            message: error.message || String(error),
          });
        }
      },
    }),
  };
}
