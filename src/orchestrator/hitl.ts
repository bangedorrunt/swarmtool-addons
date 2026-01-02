/**
 * HITL (Human-in-the-Loop) Utilities (v5.0)
 *
 * Provides standardized formatting for user interactions.
 * Addresses the "không biết phải làm gì" issue with clear, actionable prompts.
 *
 * Features:
 * - Numbered options + free text (Option C from Q9)
 * - User-friendly formatting
 * - Consistent UX across all agents
 */

import { getCheckpointManager } from './checkpoint';

// Poll option interface
export interface PollOption {
  id: string;
  label: string;
  description?: string;
}

// Poll configuration
export interface PollConfig {
  title: string;
  description?: string;
  options: PollOption[];
  allowFreeText: boolean;
  timeout_ms?: number;
  agent?: string;
}

// User response interface
export interface UserResponse {
  type: 'option' | 'freetext';
  value: string;
  option_id?: string;
  raw_input: string;
}

/**
 * Format a poll for display to user.
 * Uses numbered options + free text support (Q9: Option C).
 */
export function formatPoll(poll: PollConfig): string {
  const lines: string[] = [];

  // Header
  lines.push(`## 🗳️ ${poll.title}`);
  lines.push('');

  // Description
  if (poll.description) {
    lines.push(poll.description);
    lines.push('');
  }

  // Options
  poll.options.forEach((opt, i) => {
    const desc = opt.description ? ` — ${opt.description}` : '';
    lines.push(`**[${i + 1}]** ${opt.label}${desc}`);
  });

  // Separator and instruction
  lines.push('');
  lines.push('---');

  if (poll.allowFreeText) {
    lines.push(
      `💬 **Your response**: Type a number (1-${poll.options.length}) or write your own answer.`
    );
  } else {
    lines.push(`💬 **Your response**: Type a number (1-${poll.options.length}).`);
  }

  return lines.join('\n');
}

/**
 * Format a confirmation prompt.
 */
export function formatConfirmation(title: string, summary: string): string {
  return `## ✅ ${title}

${summary}

---
💬 **Confirm?** Type "yes" to proceed, or explain what to change.`;
}

/**
 * Format an input request.
 */
export function formatInputRequest(title: string, prompt: string, hint?: string): string {
  const hintLine = hint ? `\n\n_Hint: ${hint}_` : '';
  return `## 💬 ${title}

${prompt}${hintLine}

---
**Your response**: Type your answer below.`;
}

/**
 * Format agent yield message for user (improved UX).
 * Replaces technical "[SYSTEM: SUBAGENT SIGNAL]" with user-friendly format.
 */
export function formatYieldMessage(
  agentName: string,
  reason: string,
  summary: string,
  options?: PollOption[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`## ⏸️ ${agentName} needs your input`);
  lines.push('');

  // Reason
  lines.push(`**Reason**: ${reason}`);
  lines.push('');

  // Summary/context
  if (summary) {
    lines.push('### Current Context');
    lines.push(summary);
    lines.push('');
  }

  // Options if provided
  if (options && options.length > 0) {
    lines.push('### Options');
    options.forEach((opt, i) => {
      const desc = opt.description ? ` — ${opt.description}` : '';
      lines.push(`**[${i + 1}]** ${opt.label}${desc}`);
    });
    lines.push('');
  }

  // Action instruction
  lines.push('---');
  if (options && options.length > 0) {
    lines.push(
      '💬 **What to do**: Choose an option (1-' + options.length + ') or type your response.'
    );
  } else {
    lines.push('💬 **What to do**: Type your response to continue.');
  }

  return lines.join('\n');
}

/**
 * Parse user response to a poll.
 */
export function parseUserResponse(input: string, options: PollOption[]): UserResponse {
  const trimmed = input.trim();

  // Check if it's a number
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    const option = options[num - 1];
    return {
      type: 'option',
      value: option.label,
      option_id: option.id,
      raw_input: trimmed,
    };
  }

  // Check for exact ID match
  const idMatch = options.find((o) => o.id.toLowerCase() === trimmed.toLowerCase());
  if (idMatch) {
    return {
      type: 'option',
      value: idMatch.label,
      option_id: idMatch.id,
      raw_input: trimmed,
    };
  }

  // Free text response
  return {
    type: 'freetext',
    value: trimmed,
    raw_input: trimmed,
  };
}

/**
 * Request a poll from user via checkpoint system.
 * Returns the user's response.
 */
export async function requestPoll(
  sessionId: string,
  poll: PollConfig
): Promise<UserResponse | null> {
  const checkpointManager = getCheckpointManager();

  // Create checkpoint with promise-based handler
  return new Promise((resolve) => {
    const timeout = poll.timeout_ms || 300000;

    checkpointManager
      .requestCheckpoint(
        sessionId,
        {
          decisionPoint: poll.title,
          description: poll.description,
          options: poll.options,
          timeoutMs: timeout,
        },
        (result) => {
          if (result.approved && result.selectedOption) {
            resolve(parseUserResponse(result.selectedOption, poll.options));
          } else if (result.rejectedReason === 'timeout') {
            resolve(null);
          } else {
            // Rejection with reason = free text response
            if (result.rejectedReason) {
              resolve({
                type: 'freetext',
                value: result.rejectedReason,
                raw_input: result.rejectedReason,
              });
            } else {
              resolve(null);
            }
          }
        }
      )
      .catch(() => resolve(null));
  });
}

/**
 * Request simple confirmation from user.
 */
export async function requestConfirmation(
  sessionId: string,
  title: string,
  summary: string,
  agent?: string
): Promise<boolean> {
  const response = await requestPoll(sessionId, {
    title,
    description: summary,
    options: [
      { id: 'yes', label: 'Yes, proceed' },
      { id: 'no', label: 'No, let me explain' },
    ],
    allowFreeText: true,
    agent,
  });

  if (!response) return false;

  if (response.type === 'option') {
    return response.option_id === 'yes';
  }

  // Free text - check for affirmative words
  const affirmatives = ['yes', 'ok', 'okay', 'sure', 'proceed', 'continue', 'approved', 'confirm'];
  return affirmatives.some((a) => response.value.toLowerCase().includes(a));
}

/**
 * Strategic poll - for architectural/design decisions.
 * Converts user selection to a Directive for LEDGER.
 */
export async function strategicPoll(
  sessionId: string,
  topic: string,
  options: PollOption[],
  context?: string,
  agent?: string
): Promise<{ directive: string; value: string } | null> {
  const response = await requestPoll(sessionId, {
    title: `Strategic Decision: ${topic}`,
    description: context,
    options,
    allowFreeText: true,
    agent,
  });

  if (!response) return null;

  const value = response.type === 'option' ? response.value : response.raw_input;

  return {
    directive: `${topic}: ${value}`,
    value,
  };
}
