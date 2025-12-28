import { AgentModelConfig } from './types';

/**
 * Substitute the model line in agent prompts with configured model overrides
 *
 * Looks for a line starting with 'model:' in the markdown prompt and replaces
 * the model identifier with the configured value for the specified agent type.
 *
 * @param prompt - The agent prompt markdown content
 * @param agentType - Type of agent ('planner', 'worker', or 'researcher')
 * @param config - Configuration containing model overrides for all agents
 * @returns Modified prompt with substituted model, or original if no override needed
 */
export function substituteModel(
  prompt: string,
  agentType: keyof AgentModelConfig,
  config: AgentModelConfig
): string {
  const overrideModel = config[agentType]?.model;

  // If no override configured or override is same as current, return original
  if (!overrideModel) {
    return prompt;
  }

  // Regex to match "model: <value>" lines
  // ^model: matches at line start with optional leading whitespace
  // \s+ matches one or more whitespace characters after colon
  // (.+) captures the model name
  // $ matches end of line
  const modelLineRegex = /^model:\s+(.+)$/gm;

  // Find the first model line and its match
  const match = modelLineRegex.exec(prompt);

  if (!match) {
    // No model line found, return original prompt
    return prompt;
  }

  const currentModel = match[1].trim();

  // If override is same as current model, return original prompt
  if (currentModel === overrideModel) {
    return prompt;
  }

  // Replace the model line with the override model
  // Use replace with the regex to ensure we only replace the model: line
  const result = prompt.replace(modelLineRegex, `model: ${overrideModel}`);

  return result;
}
