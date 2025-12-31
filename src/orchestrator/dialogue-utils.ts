/**
 * Dialogue utilities for human-in-the-loop (HITL) interactions
 * 
 * This module provides utilities for parsing and managing dialogue state
 * in multi-turn agent conversations.
 */

/**
 * Dialogue state for multi-turn human-in-the-loop interactions
 */
export interface DialogueState {
    status:
    | 'needs_input'
    | 'needs_approval'
    | 'needs_verification'
    | 'approved'
    | 'rejected'
    | 'completed';
    turn?: number;
    message_to_user?: string;
    pending_questions?: string[];
    accumulated_direction?: {
        goals?: string[];
        constraints?: string[];
        decisions?: string[];
    };
}

/** Statuses that require user continuation */
export const BLOCKING_STATUSES = ['needs_input', 'needs_approval', 'needs_verification'];

/**
 * Extract dialogue_state from agent response text.
 * Tries multiple strategies:
 * 1. Direct JSON parse
 * 2. Extract from markdown code blocks (```json ... ```)
 * 3. Regex extraction of dialogue_state object
 */
export function extractDialogueState(text: string): DialogueState | null {
    if (!text || typeof text !== 'string') return null;

    // Strategy 1: Direct JSON parse
    try {
        const parsed = JSON.parse(text);
        if (parsed.dialogue_state) {
            return parsed.dialogue_state;
        }
        // Maybe the response IS the dialogue_state
        if (parsed.status && BLOCKING_STATUSES.includes(parsed.status)) {
            return parsed;
        }
    } catch {
        // Not valid JSON, try other strategies
    }

    // Strategy 2: Extract from markdown code blocks
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        try {
            const parsed = JSON.parse(match[1].trim());
            if (parsed.dialogue_state) {
                return parsed.dialogue_state;
            }
            if (parsed.status && BLOCKING_STATUSES.includes(parsed.status)) {
                return parsed;
            }
        } catch {
            // This code block wasn't valid JSON
        }
    }

    // Strategy 3: Regex for dialogue_state object (handles embedded JSON)
    const dialogueStateRegex = /"dialogue_state"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/;
    const dsMatch = dialogueStateRegex.exec(text);
    if (dsMatch) {
        try {
            return JSON.parse(dsMatch[1]);
        } catch {
            // Couldn't parse extracted object
        }
    }

    return null;
}

/**
 * Check if a dialogue state status is blocking (requires user continuation)
 */
export function isBlockingStatus(status: string | undefined): boolean {
    return !!status && BLOCKING_STATUSES.includes(status);
}

/**
 * Generate a continuation hint for the user based on dialogue status
 */
export function generateContinuationHint(
    dialogueState: DialogueState | null,
    sessionId: string
): string | null {
    if (!dialogueState?.status || !isBlockingStatus(dialogueState.status)) {
        return null;
    }
    return `To continue dialogue, call skill_agent with session_id: "${sessionId}"`;
}
