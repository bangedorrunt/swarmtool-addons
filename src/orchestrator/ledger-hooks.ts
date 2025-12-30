/**
 * LEDGER Session Hooks
 *
 * Lifecycle hooks that integrate LEDGER.md with the session lifecycle:
 * - onSessionStart: Load LEDGER, surface learnings, resume epic
 * - onTaskComplete: Update LEDGER, extract learnings
 * - onPreCompact: Create handoff
 * - onSessionEnd: Archive epic, cleanup
 */

import {
    loadLedger,
    saveLedger,
    updateTaskStatus,
    addLearning,
    createHandoff,
    archiveEpic,
    getProgress,
    surfaceLearnings,
    Ledger,
    Task,
} from './ledger';

// ============================================================================
// Types
// ============================================================================

export interface SessionContext {
    sessionId: string;
    modifiedFiles: string[];
    contextUsage?: number;
}

export interface TaskResult {
    taskId: string;
    success: boolean;
    result?: string;
    error?: string;
    filesModified?: string[];
    toolsUsed?: string[];
}

export interface SessionStartResult {
    hasActiveEpic: boolean;
    epicTitle?: string;
    epicProgress?: string;
    hasHandoff: boolean;
    resumeCommand?: string;
    recentLearnings: {
        patterns: string[];
        antiPatterns: string[];
        decisions: string[];
    };
}

export interface SessionEndResult {
    epicArchived: boolean;
    outcome?: string;
    learningsExtracted: number;
}

// ============================================================================
// Session Lifecycle Hooks
// ============================================================================

/**
 * Called at session start
 *
 * Actions:
 * 1. Load LEDGER.md
 * 2. Check for active Epic (resume if exists)
 * 3. Surface recent Learnings
 * 4. Check for Handoff (continue from break)
 */
export async function onSessionStart(
    ledgerPath?: string
): Promise<SessionStartResult> {
    console.log('[SessionHook] Starting session...');

    const ledger = await loadLedger(ledgerPath);

    // Surface recent learnings
    const recentLearnings = surfaceLearnings(ledger);

    // Check for active epic
    const hasActiveEpic = !!ledger.epic;
    let epicTitle: string | undefined;
    let epicProgress: string | undefined;

    if (hasActiveEpic && ledger.epic) {
        epicTitle = ledger.epic.title;
        const progress = getProgress(ledger);
        epicProgress = `${progress.completed}/${progress.total} tasks (${progress.percentComplete}%)`;
        console.log(`[SessionHook] Resuming epic: ${epicTitle} - ${epicProgress}`);
    }

    // Check for handoff
    const hasHandoff = !!ledger.handoff;
    let resumeCommand: string | undefined;

    if (hasHandoff && ledger.handoff) {
        resumeCommand = ledger.handoff.resumeCommand;
        console.log(`[SessionHook] Handoff found: "${resumeCommand}"`);
    }

    // Log learnings summary
    const totalLearnings =
        recentLearnings.patterns.length +
        recentLearnings.antiPatterns.length +
        recentLearnings.decisions.length;

    if (totalLearnings > 0) {
        console.log(`[SessionHook] Surfacing ${totalLearnings} recent learnings`);
    }

    // Update session status
    ledger.meta.status = 'active';
    await saveLedger(ledger, ledgerPath);

    return {
        hasActiveEpic,
        epicTitle,
        epicProgress,
        hasHandoff,
        resumeCommand,
        recentLearnings,
    };
}

/**
 * Called when a task completes
 *
 * Actions:
 * 1. Update task status in LEDGER
 * 2. Extract learnings from result
 * 3. Log progress
 * 4. Save LEDGER
 */
export async function onTaskComplete(
    taskResult: TaskResult,
    ledgerPath?: string
): Promise<void> {
    console.log(`[SessionHook] Task completed: ${taskResult.taskId}`);

    const ledger = await loadLedger(ledgerPath);

    // Update task status
    updateTaskStatus(
        ledger,
        taskResult.taskId,
        taskResult.success ? 'completed' : 'failed',
        taskResult.result,
        taskResult.error
    );

    // Extract learnings
    if (taskResult.result) {
        const learnings = extractLearningsFromResult(taskResult);
        for (const learning of learnings) {
            addLearning(ledger, learning.type, learning.content);
        }
    }

    // Add files modified to context
    if (taskResult.filesModified && taskResult.filesModified.length > 0) {
        for (const file of taskResult.filesModified) {
            if (ledger.epic && !ledger.epic.context.includes(`Modified: ${file}`)) {
                ledger.epic.context.push(`Modified: ${file}`);
            }
        }
    }

    await saveLedger(ledger, ledgerPath);
}

/**
 * Called when context is nearly full (>75%)
 *
 * Actions:
 * 1. Create Handoff section in LEDGER
 * 2. Include: what's done, what's next, key context
 * 3. Signal safe to /clear
 */
export async function onPreCompact(
    context: SessionContext,
    ledgerPath?: string
): Promise<string> {
    console.log('[SessionHook] Context limit approaching, creating handoff...');

    const ledger = await loadLedger(ledgerPath);

    // Create handoff
    createHandoff(ledger, 'context_limit', 'Continue the current task', {
        keyContext: ledger.epic?.context,
        filesModified: context.modifiedFiles,
    });

    await saveLedger(ledger, ledgerPath);

    const message = ledger.epic
        ? `Handoff created for epic "${ledger.epic.title}". Safe to /clear.`
        : 'Handoff created. Safe to /clear.';

    console.log(`[SessionHook] ${message}`);
    return message;
}

/**
 * Called at session end
 *
 * Actions:
 * 1. Mark Epic outcome (SUCCEEDED/PARTIAL/FAILED)
 * 2. Archive Epic if completed
 * 3. Clean up Handoff if resolved
 */
export async function onSessionEnd(
    outcome?: 'SUCCEEDED' | 'PARTIAL' | 'FAILED',
    ledgerPath?: string
): Promise<SessionEndResult> {
    console.log('[SessionHook] Ending session...');

    const ledger = await loadLedger(ledgerPath);

    let epicArchived = false;
    let finalOutcome: string | undefined;
    let learningsExtracted = 0;

    // Archive completed epic
    if (ledger.epic && (ledger.epic.status === 'completed' || outcome)) {
        finalOutcome = outcome || 'PARTIAL';
        archiveEpic(ledger, outcome);
        epicArchived = true;
        console.log(`[SessionHook] Epic archived: ${finalOutcome}`);
    }

    // Count learnings
    learningsExtracted =
        ledger.learnings.patterns.length +
        ledger.learnings.antiPatterns.length +
        ledger.learnings.decisions.length +
        ledger.learnings.preferences.length;

    await saveLedger(ledger, ledgerPath);

    return {
        epicArchived,
        outcome: finalOutcome,
        learningsExtracted,
    };
}

// ============================================================================
// Learning Extraction
// ============================================================================

interface ExtractedLearning {
    type: 'pattern' | 'antiPattern' | 'decision' | 'preference';
    content: string;
}

/**
 * Extract learnings from a task result
 *
 * Looks for:
 * - Patterns: "Use X for Y", "X works well", successful approaches
 * - Anti-patterns: "Don't use X", "X causes Y", failed approaches
 * - Decisions: "Chose X over Y", "Decided to X"
 */
function extractLearningsFromResult(taskResult: TaskResult): ExtractedLearning[] {
    const learnings: ExtractedLearning[] = [];

    if (!taskResult.result) return learnings;

    const result = taskResult.result.toLowerCase();

    // Pattern indicators
    const patternIndicators = [
        'use ',
        'works well',
        'recommend',
        'best practice',
        'effective',
        'successfully',
    ];

    // Anti-pattern indicators
    const antiPatternIndicators = [
        "don't use",
        'avoid',
        'causes issues',
        'failed because',
        'problem with',
        'deprecated',
    ];

    // Decision indicators
    const decisionIndicators = [
        'chose',
        'decided',
        'selected',
        'opted for',
        'using',
        'went with',
    ];

    // Check for patterns
    for (const indicator of patternIndicators) {
        if (result.includes(indicator)) {
            // Extract a relevant snippet
            const snippet = extractSnippetAround(taskResult.result, indicator, 100);
            if (snippet) {
                learnings.push({
                    type: 'pattern',
                    content: `[${taskResult.taskId}] ${snippet}`,
                });
                break; // Only one pattern per result
            }
        }
    }

    // Check for anti-patterns
    for (const indicator of antiPatternIndicators) {
        if (result.includes(indicator)) {
            const snippet = extractSnippetAround(taskResult.result, indicator, 100);
            if (snippet) {
                learnings.push({
                    type: 'antiPattern',
                    content: `[${taskResult.taskId}] ${snippet}`,
                });
                break;
            }
        }
    }

    // Check for decisions
    for (const indicator of decisionIndicators) {
        if (result.includes(indicator)) {
            const snippet = extractSnippetAround(taskResult.result, indicator, 100);
            if (snippet) {
                learnings.push({
                    type: 'decision',
                    content: `[${taskResult.taskId}] ${snippet}`,
                });
                break;
            }
        }
    }

    // If task failed, add as anti-pattern
    if (!taskResult.success && taskResult.error) {
        learnings.push({
            type: 'antiPattern',
            content: `[${taskResult.taskId}] ${taskResult.error}`,
        });
    }

    return learnings;
}

/**
 * Extract a snippet of text around a keyword
 */
function extractSnippetAround(
    text: string,
    keyword: string,
    maxLength: number
): string | null {
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(keyword.toLowerCase());

    if (index === -1) return null;

    // Find sentence boundaries
    const start = Math.max(0, text.lastIndexOf('.', index) + 1);
    const end = Math.min(text.length, text.indexOf('.', index + keyword.length) + 1);

    let snippet = text.slice(start, end || text.length).trim();

    // Truncate if too long
    if (snippet.length > maxLength) {
        snippet = snippet.slice(0, maxLength) + '...';
    }

    return snippet;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format session start result as context for agents
 */
export function formatSessionContext(result: SessionStartResult): string {
    const lines: string[] = [];

    if (result.hasActiveEpic) {
        lines.push(`## Active Epic`);
        lines.push(`**Title**: ${result.epicTitle}`);
        lines.push(`**Progress**: ${result.epicProgress}`);
        lines.push('');
    }

    if (result.hasHandoff) {
        lines.push(`## Handoff`);
        lines.push(`**Resume Command**: "${result.resumeCommand}"`);
        lines.push('');
    }

    const totalLearnings =
        result.recentLearnings.patterns.length +
        result.recentLearnings.antiPatterns.length +
        result.recentLearnings.decisions.length;

    if (totalLearnings > 0) {
        lines.push(`## Recent Learnings`);

        if (result.recentLearnings.patterns.length > 0) {
            lines.push('### Patterns');
            for (const p of result.recentLearnings.patterns.slice(0, 5)) {
                lines.push(`- ${p}`);
            }
        }

        if (result.recentLearnings.antiPatterns.length > 0) {
            lines.push('### Anti-Patterns');
            for (const ap of result.recentLearnings.antiPatterns.slice(0, 5)) {
                lines.push(`- ${ap}`);
            }
        }

        if (result.recentLearnings.decisions.length > 0) {
            lines.push('### Decisions');
            for (const d of result.recentLearnings.decisions.slice(0, 5)) {
                lines.push(`- ${d}`);
            }
        }
    }

    return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export {
    extractLearningsFromResult,
    extractSnippetAround,
};
