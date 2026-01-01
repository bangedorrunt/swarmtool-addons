import { evalite } from 'evalite';
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
    data: [
        {
            type: "codeReview",
            args: [["src/index.ts", "package.json"]],
            expectedOptions: ["approve", "request_changes", "reject"]
        },
        {
            type: "dangerousOperation",
            args: ["DELETE * FROM prod", "Data loss"],
            expectedOptions: ["confirm", "cancel"]
        }
    ],
    task: async (input) => {
        return generateTemplate(input.type, input.args);
    },
    scorers: [
        // Verify Output is not null
        // @ts-ignore
        (result) => {
            return result ? 1 : 0;
        },
        // Verify Option IDs
        // @ts-ignore
        (result, { expectedOptions }) => {
            if (!result) return 0;
            const ids = result.options.map(o => o.id);
            const allFound = expectedOptions.every(opt => ids.includes(opt));
            return allFound ? 1 : 0;
        }
    ]
});
