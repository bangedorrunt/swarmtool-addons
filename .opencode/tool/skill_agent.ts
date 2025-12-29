import { tool } from '@opencode-ai/plugin';
import { loadSkillAgents } from '../../src/opencode/loader';

/**
 * OpenCode Custom Tool: skill_agent
 * 
 * Spawns specialized subagents with context injection and dialogue mode support.
 * Integrates swarmtool-addons skill-based agents with OpenCode.
 */
export default tool({
    description: 'Spawn a specialized subagent. Supports context injection and interactive dialogue mode for multi-turn user interactions.',

    args: {
        skill_name: tool.schema.string().describe('Name of the skill containing the agent (e.g., "sisyphus/interviewer")'),
        agent_name: tool.schema.string().optional().describe('Name of the agent within the skill (defaults to last path segment)'),
        prompt: tool.schema.string().describe('Task description for the agent'),
        interaction_mode: tool.schema.enum(['one_shot', 'dialogue']).optional().describe('Interaction mode: "one_shot" for immediate return, "dialogue" for multi-turn with user approval'),
        context: tool.schema.any().optional().describe('Structured context (explicit_direction, assumptions, memories, dialogue_state, etc.)'),
        run_in_background: tool.schema.boolean().optional().describe('Run asynchronously in background')
    },

    async execute(args, context) {
        const {
            skill_name,
            agent_name,
            prompt,
            interaction_mode = 'one_shot',
            context: agentContext,
            run_in_background = false
        } = args;

        // Validation: dialogue mode incompatible with background
        if (interaction_mode === 'dialogue' && run_in_background) {
            return JSON.stringify({
                success: false,
                error: 'INVALID_ARGS',
                message: 'dialogue mode cannot be used with run_in_background=true (multi-turn requires foreground)'
            });
        }

        try {
            // Discover agents
            const agents = await loadSkillAgents();

            // Find the agent
            const fullName = agent_name ? `${skill_name}/${agent_name}` : skill_name;
            const agent = agents.find(a => a.name === fullName);

            if (!agent) {
                const skillAgents = agents
                    .filter(a => a.name.startsWith(skill_name + '/'))
                    .map(a => a.name.split('/').pop());

                return JSON.stringify({
                    success: false,
                    error: 'AGENT_NOT_FOUND',
                    message: skillAgents.length > 0
                        ? `Agent '${agent_name || skill_name}' not found in skill '${skill_name}'. Available: ${skillAgents.join(', ')}`
                        : `No agents found for skill '${skill_name}'`
                });
            }

            // Build enhanced prompt with context
            let enhancedPrompt = prompt;

            if (agentContext) {
                const contextParts: string[] = [];

                if (agentContext.explicit_direction) {
                    contextParts.push('## Explicit Direction');
                    if (agentContext.explicit_direction.goals?.length) {
                        contextParts.push('**Goals:**');
                        agentContext.explicit_direction.goals.forEach((g: string) => contextParts.push(`- ${g}`));
                    }
                    if (agentContext.explicit_direction.constraints?.length) {
                        contextParts.push('**Constraints:**');
                        agentContext.explicit_direction.constraints.forEach((c: string) => contextParts.push(`- ${c}`));
                    }
                }

                if (agentContext.assumptions?.length) {
                    contextParts.push('## Tracked Assumptions');
                    agentContext.assumptions.forEach((a: any) => {
                        contextParts.push(`- ${a.assumed} (confidence: ${a.confidence})`);
                    });
                }

                if (agentContext.relevant_memories?.length) {
                    contextParts.push('## Relevant Past Learnings');
                    agentContext.relevant_memories.forEach((m: any) => {
                        contextParts.push(`- [${m.type}] ${m.information}`);
                    });
                }

                if (contextParts.length > 0) {
                    enhancedPrompt = contextParts.join('\n') + '\n\n---\n\n' + prompt;
                }
            }

            // Add dialogue mode instructions if needed
            if (interaction_mode === 'dialogue') {
                const dialogueInstructions = `
## DIALOGUE MODE ACTIVE

You are operating in dialogue mode. Your response MUST include a \`dialogue_state\` object.

**Response Format:**
\`\`\`json
{
  "dialogue_state": {
    "status": "<status>",
    "turn": <number>,
    "message_to_user": "<message>",
    "pending_questions": ["<question1>", ...],
    "accumulated_direction": { "goals": [...], "constraints": [...] },
    "proposal": { "type": "<type>", "summary": "<summary>", "details": {...} }
  },
  "output": null | <final_output>
}
\`\`\`

**Status Values:**
- \`needs_input\` - You have questions for the user
- \`needs_approval\` - Present summary/proposal awaiting user confirmation
- \`needs_verification\` - Assumptions need user verification
- \`approved\` - User approved, ready to proceed
- \`completed\` - Dialogue naturally concluded

**CRITICAL:** Do NOT proceed with work until status is \`approved\`. Ask questions, get approval, THEN act.
`;

                enhancedPrompt = dialogueInstructions + '\n\n' + enhancedPrompt;

                // Include previous dialogue state if exists
                if (agentContext?.dialogue_state) {
                    enhancedPrompt += `\n\n## Previous Dialogue State\n\`\`\`json\n${JSON.stringify(agentContext.dialogue_state, null, 2)}\n\`\`\``;
                }
            }

            // Call the appropriate tool based on background mode
            const toolName = run_in_background ? 'background_task' : 'task';
            const result = await (context as any).client.call(toolName, {
                description: enhancedPrompt,
                agent: fullName
            });

            // Format response
            if (run_in_background) {
                return JSON.stringify({
                    success: true,
                    taskId: result,
                    agent: fullName,
                    mode: 'background'
                });
            }

            if (interaction_mode === 'dialogue') {
                return JSON.stringify({
                    success: true,
                    output: result,
                    agent: fullName,
                    mode: 'dialogue',
                    interaction_hint: 'Check output.dialogue_state.status to determine if user input is needed before proceeding.'
                });
            }

            return JSON.stringify({
                success: true,
                output: result,
                agent: fullName,
                mode: 'one_shot'
            });

        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: 'SPAWN_FAILED',
                message: error?.message || String(error)
            });
        }
    }
});
