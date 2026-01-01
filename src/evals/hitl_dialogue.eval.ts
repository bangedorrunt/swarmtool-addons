import { evalite } from 'evalite';
import type { DialogueState } from '../agent-spawn';

// Mock Agent Dialogue Logic (mimicking src/agent-spawn.ts)
const mockDialogueSystem = (
    input: string,
    previousState?: DialogueState
): DialogueState => {
    if (!previousState) {
        // Initial State
        return {
            status: 'needs_input',
            turn: 1,
            message_to_user: "I need more information about...",
            pending_questions: ["What uses this?"],
            history: [{ role: 'user', content: input, timestamp: new Date().toISOString() }]
        };
    }

    // Continuation
    const newState = { ...previousState };
    newState.turn += 1;
    newState.history = [
        ...(newState.history || []),
        { role: 'user', content: input, timestamp: new Date().toISOString() }
    ];

    if (input.toLowerCase().includes('yes') || input.toLowerCase().includes('approve')) {
        newState.status = 'approved';
        newState.message_to_user = "Proceeding with execution.";
    } else {
        newState.status = 'needs_input';
        newState.message_to_user = "Understood. Any other constraints?";
    }

    return newState;
};

evalite('HITL Dialogue System', {
    data: [
        {
            name: "Start Dialogue",
            input: "I want to delete the database",
            prevState: undefined,
            expectedStatus: "needs_input"
        },
        {
            name: "Approve Dialogue",
            input: "Yes, I approve",
            prevState: {
                status: 'needs_approval',
                turn: 1,
                message_to_user: "Confirm deletion?",
                history: []
            } as DialogueState,
            expectedStatus: "approved"
        }
    ],
    task: async (data) => {
        return mockDialogueSystem(data.input, data.prevState);
    },
    scorers: [
        // Verify Status Transition
        // @ts-ignore
        (result, { expectedStatus }) => {
            return result.status === expectedStatus ? 1 : 0;
        },
        // Verify History integrity
        // @ts-ignore
        (result, { input }) => {
            const lastMsg = result.history?.[result.history.length - 1];
            return (lastMsg && lastMsg.content === input) ? 1 : 0;
        }
    ]
});
