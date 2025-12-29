import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Session Learning Hooks
 *
 * Implements the self-learning workflow from PLAN.md:
 * - Session Start: Injects relevant past learnings into context
 * - Session End: Captures learnings via memory-catcher agent
 *
 * These hooks enable agents to automatically learn from past sessions
 * without manual memory-lane queries.
 */

interface Memory {
    id: string;
    type: string;
    information: string;
    confidence?: number;
    entities?: string[];
    timestamp?: string;
}

interface SessionContext {
    messages: Array<{ role: string; content: string }>;
    sessionId?: string;
    modifiedFiles?: string[];
}

interface LearningInjectorOptions {
    /** Max memories to inject. Default: 10 */
    maxMemories?: number;
    /** Memory Lane query function */
    memoryLaneFind: (args: { query: string; limit: number }) => Promise<{ memories: Memory[] }>;
    /** Path to project ledger. Default: .opencode/LEDGER.md */
    ledgerPath?: string;
}

interface LearningCaptureOptions {
    /** skill_agent function for spawning memory-catcher */
    skillAgent: (args: {
        skill_name: string;
        agent_name: string;
        prompt: string;
        context?: any;
    }) => Promise<any>;
    /** Path to project ledger. Default: .opencode/LEDGER.md */
    ledgerPath?: string;
    /** Max learnings to capture per session. Default: 10 */
    maxLearnings?: number;
}

/**
 * Extract keywords from user's first message for Memory Lane query
 */
function extractKeywords(message: string): string[] {
    // Remove common words and punctuation
    const stopWords = new Set([
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'under', 'again',
        'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
        'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
        'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
        'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this',
        'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
        'he', 'him', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what',
        'which', 'who', 'whom', 'please', 'help', 'want', 'need', 'like',
    ]);

    const words = message
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));

    // Return unique words, prioritizing longer ones (more specific)
    return [...new Set(words)]
        .sort((a, b) => b.length - a.length)
        .slice(0, 10);
}

/**
 * Detect user corrections in transcript
 * Looks for patterns like "No, do X instead" or "That's wrong, use Y"
 */
function detectCorrections(messages: Array<{ role: string; content: string }>): string[] {
    const corrections: string[] = [];
    const correctionPatterns = [
        /no[,.]?\s+(do|use|try|make|don't|instead|actually)/i,
        /that's (wrong|incorrect|not right)/i,
        /not what i (asked|meant|wanted)/i,
        /instead[,.]?\s+(use|do|try)/i,
        /prefer[s]?\s+.+\s+(over|instead|rather)/i,
        /actually[,.]?\s+(i want|use|it should)/i,
    ];

    for (const msg of messages) {
        if (msg.role === 'user') {
            for (const pattern of correctionPatterns) {
                if (pattern.test(msg.content)) {
                    corrections.push(msg.content);
                    break;
                }
            }
        }
    }

    return corrections;
}

/**
 * Build context injection string from memories and ledger
 */
function buildLearningContext(memories: Memory[], ledger: string | null): string {
    const sections: string[] = [];

    if (memories.length > 0) {
        sections.push('## 📚 Relevant Past Learnings\n');
        sections.push('The following insights from previous sessions may help:\n');

        // Group by type for readability
        const byType: Record<string, Memory[]> = {};
        for (const m of memories) {
            const type = m.type || 'insight';
            if (!byType[type]) byType[type] = [];
            byType[type].push(m);
        }

        // Priority order for display
        const typeOrder = ['correction', 'decision', 'preference', 'anti_pattern', 'pattern', 'insight'];

        for (const type of typeOrder) {
            if (byType[type]?.length) {
                for (const m of byType[type]) {
                    const confidenceNote = m.confidence && m.confidence < 0.5 ? ' ⚠️ (low confidence)' : '';
                    sections.push(`- **[${type}]**: ${m.information}${confidenceNote}`);
                }
            }
        }

        // Any remaining types
        for (const type of Object.keys(byType)) {
            if (!typeOrder.includes(type) && byType[type]?.length) {
                for (const m of byType[type]) {
                    sections.push(`- **[${type}]**: ${m.information}`);
                }
            }
        }

        sections.push('');
    }

    if (ledger) {
        sections.push('## 📋 Continuity State\n');
        sections.push('Previous work detected. Resume from LEDGER.md.\n');
        sections.push('Run `read .opencode/LEDGER.md` to see current state.\n');
    }

    return sections.join('\n');
}

/**
 * Create Session Learning Injector Hook
 *
 * Automatically injects relevant past learnings at session start.
 */
export function createSessionLearningInjector(options: LearningInjectorOptions) {
    const {
        maxMemories = 10,
        memoryLaneFind,
        ledgerPath = '.opencode/LEDGER.md',
    } = options;

    return {
        name: 'session-learning-injector',
        event: 'session_start' as const,

        async execute(context: SessionContext): Promise<{ systemPromptAddition?: string }> {
            try {
                // 1. Extract keywords from first message
                const firstMessage = context.messages[0]?.content || '';
                if (!firstMessage) {
                    return {};
                }

                const keywords = extractKeywords(firstMessage);
                if (keywords.length === 0) {
                    return {};
                }

                // 2. Query Memory Lane for relevant learnings
                const query = keywords.join(' ');
                const { memories } = await memoryLaneFind({
                    query,
                    limit: maxMemories,
                });

                // 3. Check for ledger
                let ledger: string | null = null;
                const fullLedgerPath = join(process.cwd(), ledgerPath);
                if (existsSync(fullLedgerPath)) {
                    ledger = await readFile(fullLedgerPath, 'utf-8');
                }

                // 4. Build injection
                if (memories.length === 0 && !ledger) {
                    return {};
                }

                const injection = buildLearningContext(memories, ledger);

                return { systemPromptAddition: injection };
            } catch (error) {
                return {};
            }
        },
    };
}

/**
 * Create Session Learning Capture Hook
 *
 * Automatically captures learnings at session end via memory-catcher.
 */
export function createSessionLearningCapture(options: LearningCaptureOptions) {
    const {
        skillAgent,
        ledgerPath = '.opencode/LEDGER.md',
        maxLearnings = 10,
    } = options;

    return {
        name: 'session-learning-capture',
        event: 'session_end' as const,

        async execute(context: SessionContext): Promise<{ learnings_captured: boolean }> {
            try {
                // 1. Summarize transcript (simple version - just key messages)
                const userMessages = context.messages
                    .filter((m) => m.role === 'user')
                    .map((m) => m.content)
                    .slice(-20); // Last 20 user messages

                const assistantMessages = context.messages
                    .filter((m) => m.role === 'assistant')
                    .map((m) => {
                        // Truncate long responses
                        if (m.content.length > 500) {
                            return m.content.slice(0, 500) + '...';
                        }
                        return m.content;
                    })
                    .slice(-20);

                const transcriptSummary = userMessages
                    .map((u, i) => `User: ${u}\nAssistant: ${assistantMessages[i] || '...'}\n`)
                    .join('\n---\n');

                // 2. Detect corrections
                const userCorrections = detectCorrections(context.messages);

                // 3. Get modified files
                const filesTouched = context.modifiedFiles || [];

                // 4. Load Chief-of-Staff assumptions if available
                let workerAssumptions: any[] = [];
                const assumptionsPath = join(process.cwd(), '.opencode', 'assumptions.json');
                if (existsSync(assumptionsPath)) {
                    try {
                        const content = await readFile(assumptionsPath, 'utf-8');
                        workerAssumptions = JSON.parse(content);
                    } catch {
                        // Ignore parse errors
                    }
                }

                // 5. Spawn memory-catcher with context
                const result = await skillAgent({
                    skill_name: 'chief-of-staff',
                    agent_name: 'memory-catcher',
                    prompt: `Extract learnings from this completed session.
          
Focus on:
1. User corrections (highest priority)
2. Verified decisions
3. Failed approaches (anti-patterns)
4. Successful patterns

Store each via memory-lane_store with appropriate type.
Max ${maxLearnings} learnings.`,
                    context: {
                        transcript_summary: transcriptSummary,
                        files_touched: filesTouched,
                        user_corrections: userCorrections,
                        worker_assumptions: workerAssumptions,
                        session_id: context.sessionId,
                    },
                });

                // 6. Update ledger if ongoing work
                // (Memory-catcher handles this internally)

                return { learnings_captured: true };
            } catch (error) {
                return { learnings_captured: false };
            }
        },
    };
}

/**
 * Assumption Tracker for Chief-of-Staff
 *
 * Persists assumptions to .opencode/assumptions.json for session-end capture.
 */
export interface TrackedAssumption {
    worker: string;
    assumed: string;
    confidence: number;
    verified: boolean;
    timestamp: string;
}

export async function trackAssumption(assumption: TrackedAssumption) {
    const assumptionsPath = join(process.cwd(), '.opencode', 'assumptions.json');

    // Ensure directory exists
    await mkdir(dirname(assumptionsPath), { recursive: true });

    // Load existing
    let assumptions: TrackedAssumption[] = [];
    if (existsSync(assumptionsPath)) {
        try {
            const content = await readFile(assumptionsPath, 'utf-8');
            assumptions = JSON.parse(content);
        } catch {
            // Start fresh if parse fails
        }
    }

    // Add new assumption
    assumptions.push(assumption);

    // Write back
    await writeFile(assumptionsPath, JSON.stringify(assumptions, null, 2));

    return assumptions;
}

export async function getTrackedAssumptions(): Promise<TrackedAssumption[]> {
    const assumptionsPath = join(process.cwd(), '.opencode', 'assumptions.json');

    if (!existsSync(assumptionsPath)) {
        return [];
    }

    try {
        const content = await readFile(assumptionsPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function clearTrackedAssumptions() {
    const assumptionsPath = join(process.cwd(), '.opencode', 'assumptions.json');

    if (existsSync(assumptionsPath)) {
        await writeFile(assumptionsPath, '[]');
    }
}

export async function verifyAssumption(assumed: string) {
    const assumptions = await getTrackedAssumptions();
    const updated = assumptions.map((a) => {
        if (a.assumed === assumed) {
            return { ...a, verified: true };
        }
        return a;
    });

    const assumptionsPath = join(process.cwd(), '.opencode', 'assumptions.json');
    await writeFile(assumptionsPath, JSON.stringify(updated, null, 2));

    return updated;
}
