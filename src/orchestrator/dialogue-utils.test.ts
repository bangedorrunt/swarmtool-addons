import { describe, expect, it } from 'vitest';
import { extractDialogueState, DialogueState } from './dialogue-utils';

describe('extractDialogueState', () => {
    describe('Strategy 1: Direct JSON parse', () => {
        it('should extract dialogue_state from a valid JSON object', () => {
            const input = JSON.stringify({
                dialogue_state: {
                    status: 'needs_input',
                    turn: 1,
                    message_to_user: 'Please clarify...',
                },
                output: null,
            });

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_input',
                turn: 1,
                message_to_user: 'Please clarify...',
            });
        });

        it('should recognize standalone dialogue_state object', () => {
            const input = JSON.stringify({
                status: 'needs_approval',
                turn: 2,
                message_to_user: 'Ready to proceed?',
            });

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_approval',
                turn: 2,
                message_to_user: 'Ready to proceed?',
            });
        });

        it('should return null for JSON without blocking status', () => {
            const input = JSON.stringify({
                status: 'completed',
                result: 'All done',
            });

            const result = extractDialogueState(input);

            expect(result).toBeNull();
        });
    });

    describe('Strategy 2: Markdown code blocks', () => {
        it('should extract from json code block', () => {
            const input = `Here is the response:

\`\`\`json
{
  "dialogue_state": {
    "status": "needs_input",
    "pending_questions": ["What framework?"]
  }
}
\`\`\`

Let me know your answers.`;

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_input',
                pending_questions: ['What framework?'],
            });
        });

        it('should extract from unlabeled code block', () => {
            const input = `Response:

\`\`\`
{"status": "needs_approval", "message_to_user": "Confirm?"}
\`\`\``;

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_approval',
                message_to_user: 'Confirm?',
            });
        });

        it('should try multiple code blocks until one matches', () => {
            const input = `
\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`json
{"dialogue_state": {"status": "needs_verification"}}
\`\`\`
`;

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_verification',
            });
        });
    });

    describe('Strategy 3: Regex extraction', () => {
        it('should extract embedded dialogue_state from prose', () => {
            const input = `Based on my analysis, here is the result:
      
      The response includes "dialogue_state": {"status": "needs_input", "turn": 1} for continuation.
      
      Please provide more details.`;

            const result = extractDialogueState(input);

            expect(result).toEqual({
                status: 'needs_input',
                turn: 1,
            });
        });
    });

    describe('Edge cases', () => {
        it('should return null for empty string', () => {
            expect(extractDialogueState('')).toBeNull();
        });

        it('should return null for null input', () => {
            expect(extractDialogueState(null as any)).toBeNull();
        });

        it('should return null for undefined input', () => {
            expect(extractDialogueState(undefined as any)).toBeNull();
        });

        it('should return null for plain text without JSON', () => {
            const input = 'This is just a regular response without any JSON.';
            expect(extractDialogueState(input)).toBeNull();
        });

        it('should return null for malformed JSON', () => {
            const input = '{"dialogue_state": {"status": broken}}';
            expect(extractDialogueState(input)).toBeNull();
        });
    });

    describe('Blocking status recognition', () => {
        it('should recognize needs_input as blocking', () => {
            const input = JSON.stringify({ status: 'needs_input' });
            expect(extractDialogueState(input)?.status).toBe('needs_input');
        });

        it('should recognize needs_approval as blocking', () => {
            const input = JSON.stringify({ status: 'needs_approval' });
            expect(extractDialogueState(input)?.status).toBe('needs_approval');
        });

        it('should recognize needs_verification as blocking', () => {
            const input = JSON.stringify({ status: 'needs_verification' });
            expect(extractDialogueState(input)?.status).toBe('needs_verification');
        });

        it('should NOT recognize approved as blocking', () => {
            const input = JSON.stringify({ status: 'approved' });
            expect(extractDialogueState(input)).toBeNull();
        });

        it('should NOT recognize completed as blocking', () => {
            const input = JSON.stringify({ status: 'completed' });
            expect(extractDialogueState(input)).toBeNull();
        });
    });
});
