import { evalite, createScorer } from 'evalite';
import { CHECKPOINT_TEMPLATES, type CheckpointDefinition } from '../orchestrator/checkpoint';

// Wrap templates for testing
const generateTemplate = (type: string, args: any[]): CheckpointDefinition | null => {
  if (type === 'codeReview') {
    return CHECKPOINT_TEMPLATES.codeReview(args[0]);
  }
  if (type === 'dangerousOperation') {
    return CHECKPOINT_TEMPLATES.dangerousOperation(args[0], args[1]);
  }
  return null;
};

evalite('Checkpoint Templates', {
  data: () => [
    {
      input: { type: 'codeReview', args: [['src/index.ts', 'package.json']] },
      expected: ['approve', 'request_changes', 'reject'],
    },
    {
      input: { type: 'dangerousOperation', args: ['DELETE * FROM prod', 'Data loss'] },
      expected: ['confirm', 'cancel'],
    },
  ],
  task: async (input: { type: string; args: any[] }) => {
    return generateTemplate(input.type, input.args);
  },
  scorers: [
    createScorer('not-null', ({ output }) => (output ? 1 : 0)),
    createScorer('option-ids', ({ output, expected }) => {
      if (!output) return 0;
      const ids = output.options.map((o) => o.id);
      const allFound = (expected || []).every((opt) => ids.includes(opt));
      return allFound ? 1 : 0;
    }),
  ],
});
