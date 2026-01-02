import { evalite, createScorer } from 'evalite';
import { buildDialogueContinuationPrompt } from '../orchestrator/dialogue-routing';
import type { ActiveDialogue } from '../orchestrator/ledger';

evalite('Multi-turn Dialogue: Build Continuation Prompt', {
  data: () => [
    {
      input: {
        userResponse: '2',
        activeDialogue: {
          agent: 'chief-of-staff',
          command: '/ama',
          turn: 1,
          status: 'needs_input',
          sessionId: 'sess_1',
          accumulatedDirection: {
            goals: ['API structure'],
            constraints: [],
            preferences: [],
            decisions: [],
          },
          pendingQuestions: ['Pick API style'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as ActiveDialogue,
      },
      expected: {
        mustInclude: ['DIALOGUE CONTINUATION', 'Command: /ama', 'User responded:', '2'],
      },
    },
  ],
  task: async (input: { userResponse: string; activeDialogue: ActiveDialogue }) => {
    return buildDialogueContinuationPrompt({
      userResponse: input.userResponse,
      activeDialogue: input.activeDialogue,
    });
  },
  scorers: [
    createScorer('contains-required-markers', ({ output, expected }) => {
      const text = String(output);
      const mustInclude = expected?.mustInclude || [];
      for (const needle of mustInclude) {
        if (!text.includes(needle)) return 0;
      }
      return 1;
    }),
  ],
});
