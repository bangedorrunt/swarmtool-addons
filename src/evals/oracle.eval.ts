import { evalite, createScorer } from 'evalite';
import { cachedInference, loadSkillContent } from './utils';

evalite('Architect Agent: Real LLM Decomposition (v5.0)', {
  data: () => [
    {
      input: 'Add a login page with Google Auth and a user profile settings page',
      expected: 'parallel',
    },
    {
      input: 'Refactor the database schema for orders and update all existing queries to match',
      expected: 'sequential',
    },
  ],
  task: async (input: string) => {
    const system = loadSkillContent('architect');
    const result = await cachedInference({
      system,
      prompt: `Decompose this request: "${input}"`,
      tag: 'architect',
      model: 'nvidia/nemotron-3-nano',
    });

    return result.parsed || result;
  },
  scorers: [
    createScorer('strategy-mode', ({ output, expected }) => {
      const mode = output?.execution_strategy?.mode;
      return mode === expected ? 1 : 0;
    }),
    createScorer('task-count', ({ output }) => {
      const tasks = output && typeof output === 'object' ? (output as any).tasks : null;
      return tasks && Array.isArray(tasks) && tasks.length <= 3 ? 1 : 0;
    }),
  ],
});
