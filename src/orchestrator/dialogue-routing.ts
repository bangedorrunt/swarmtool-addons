import type { ActiveDialogue } from './ledger';

type TextLikePart = { type: string; text?: string };

export function getUserTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return (parts as TextLikePart[])
    .filter((p) => p && p.type === 'text')
    .map((p) => p.text || '')
    .join('')
    .trim();
}

export function isSlashCommand(text: string): boolean {
  return text.trim().startsWith('/');
}

export function isCancelMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === 'cancel' || normalized === 'stop' || normalized === 'quit';
}

export function shouldRouteToActiveDialogue(active: ActiveDialogue | null, sessionId: string) {
  if (!active) return { shouldRoute: false as const };
  if (active.sessionId && active.sessionId !== sessionId) return { shouldRoute: false as const };
  return { shouldRoute: true as const };
}

export function buildDialogueContinuationPrompt(args: {
  userResponse: string;
  activeDialogue: ActiveDialogue;
}): string {
  const { userResponse, activeDialogue } = args;
  const { command, turn, status, accumulatedDirection, pendingQuestions } = activeDialogue;

  return `DIALOGUE CONTINUATION

Command: ${command}
Turn: ${turn + 1}
Phase: ${status}

Previous accumulated direction:
${JSON.stringify(accumulatedDirection, null, 2)}

Pending questions:
${JSON.stringify(pendingQuestions || [], null, 2)}

User responded:
${userResponse}

Instructions:
1) Interpret the user response in the context of the last poll/checkpoint.
2) If more input is needed: call ledger_update_active_dialogue({ status: 'needs_input', pendingQuestions: [...] }) and ask the next poll.
3) If this completes the dialogue: call ledger_clear_active_dialogue({}) and provide the final guidance.
`;
}
