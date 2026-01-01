import { evalite } from 'evalite';
import { cachedInference, loadSkillContent } from './utils';

evalite('Chief-of-Staff: Strategic Orchestration (Real LLM)', {
  data: () => [
    {
      input: {
        name: 'Governance Check',
        text: 'Deploy the application to AWS',
        context: 'No directives exist for cloud provider or environment.',
      },
      expectedAction: 'POLL', // CoS should poll for missing directives
    },
    {
      input: {
        name: 'Task Parallelization',
        text: 'Add a search bar to the header and create a new FAQ page',
        context: 'Directives: Framework: React, Styling: Tailwind.',
      },
      expectedStrategy: 'parallel',
    },
  ],
  task: async (input: any) => {
    const system = loadSkillContent('chief-of-staff');

    const prompt = `
      Current Context: ${input.context}
      User Request: "${input.text}"
      
      Respond as the Chief-of-Staff agent. Show your reasoning and next action.
      If you need to poll, output a POLL structure. 
      If you can delegate, show the delegation plan with execution_strategy.
    `;

    const result = await cachedInference({
      system,
      prompt,
      tag: 'cos-orchestration',
      model: 'gemini-2.5-flash',
    });

    return result.parsed || result;
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      const text = JSON.stringify(result).toUpperCase();
      if (ctx?.input?.expectedAction === 'POLL') {
        return text.includes('POLL') || text.includes('STRATEGIC_POLL') || text.includes('QUESTION')
          ? 1
          : 0;
      }
      if (ctx?.input?.expectedStrategy) {
        return text.includes(ctx.input.expectedStrategy.toUpperCase()) ? 1 : 0;
      }
      return 1;
    },
  ],
});
