import { evalite } from 'evalite';
import { cachedInference, loadSkillContent } from './utils';
import type { DialogueState } from '../agent-spawn';

evalite('Interviewer: HITL Dialogue System (Real LLM)', {
  data: () => [
    {
      input: {
        name: 'Initial Ambiguity',
        text: 'I want to integrate a payment system',
        prevState: undefined,
      },
      expectedStatus: 'needs_input',
    },
    {
      input: {
        name: 'Approval Detection',
        text: 'Yes, proceed with Stripe',
        prevState: {
          status: 'needs_approval',
          turn: 2,
          message_to_user: 'Should I use Stripe for payments?',
          history: [
            { role: 'user', content: 'integrate payment' },
            { role: 'assistant', content: 'Which provider?' },
          ],
        } as DialogueState,
      },
      expectedStatus: 'approved',
    },
  ],
  task: async (input: any) => {
    const system = loadSkillContent('interviewer');

    const prompt = `
      User Input: "${input.text}"
      Previous State: ${JSON.stringify(input.prevState || 'null')}
      
      Respond as the Interviewer agent in DIALOGUE mode. 
      Return only the JSON structure as defined in your SKILL.md.
    `;

    const result = await cachedInference({
      system,
      prompt,
      tag: 'interviewer',
      model: 'gemini-2.5-flash',
    });

    return result.parsed || result;
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      const state = result?.dialogue_state || result;
      const status = state?.status;
      return status === ctx?.expectedStatus ? 1 : 0;
    },
  ],
});
