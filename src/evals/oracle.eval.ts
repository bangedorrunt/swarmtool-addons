import { evalite } from 'evalite';
import { cachedInference, loadSkillContent } from './utils';

evalite('Oracle Agent: Real LLM Reasoning (v4.1)', {
  data: () => [
    {
      input: {
        text: 'Add a login page with Google Auth and a user profile settings page',
        expectedMode: 'parallel',
      },
    },
    {
      input: {
        text: 'Refactor the database schema for orders and update all existing queries to match',
        expectedMode: 'sequential',
      },
    },
  ],
  task: async (input: any) => {
    const system = loadSkillContent('oracle');
    const result = await cachedInference({
      system,
      prompt: `Decompose this request: "${input.text}"`,
      tag: 'oracle',
      model: 'nvidia/nemotron-3-nano',
    });

    return result.parsed || result;
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      const mode = result?.execution_strategy?.mode;
      const expected = ctx?.input?.expectedMode;
      return mode === expected ? 1 : 0;
    },
    // @ts-ignore
    (result) => {
      const tasks = result && typeof result === 'object' ? (result as any).tasks : null;
      if (tasks && Array.isArray(tasks) && tasks.length <= 3) {
        return 1;
      }
      return 0;
    },
  ],
});
