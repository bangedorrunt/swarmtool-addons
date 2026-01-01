import { evalite } from 'evalite';
import { CHECKPOINT_TEMPLATES, type CheckpointDefinition } from '../orchestrator/checkpoint';

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
  // @ts-ignore
  data: () => [
    // @ts-ignore
    {
      input: {
        type: 'codeReview' as any,
        args: [['src/index.ts', 'package.json']] as any,
      },
      // @ts-ignore
      expectedOptions: ['approve', 'request_changes', 'reject'],
    },
    // @ts-ignore
    {
      input: {
        type: 'dangerousOperation' as any,
        args: ['DELETE * FROM prod', 'Data loss'] as any,
      },
      // @ts-ignore
      expectedOptions: ['confirm', 'cancel'],
    },
  ],
  task: async (input) => {
    return generateTemplate((input as any).type, (input as any).args);
  },
  scorers: [
    // Verify Output is not null
    // @ts-ignore
    (result) => {
      return result ? 1 : 0;
    },
    // Verify Option IDs
    // @ts-ignore
    (result, ctx) => {
      if (!result) return 0;
      const expectedOptions = (ctx as any)?.expectedOptions;
      if (!expectedOptions) return 0;
      const ids = result.options.map((o: any) => o.id);
      const allFound = expectedOptions.every((opt: string) => ids.includes(opt));
      return allFound ? 1 : 0;
    },
  ],
});
