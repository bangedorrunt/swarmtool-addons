/**
 * Event Log - File-Based Durable Coordination
 *
 * Inspired by durable-streams + CCv2 patterns.
 *
 * Features:
 * - Append-only JSONL format
 * - Offset-based resumption
 * - File locking for parallel workers
 * - Log rotation to prevent unbounded growth
 * - Workflow event types (SDD, Ask User, Chief-of-Staff)
 *
 * File location: .opencode/events.jsonl
 */

import fs from 'node:fs';
import path from 'path';
import { tool } from '@opencode-ai/plugin';

/**
 * Configuration
 */
const MAX_LOG_SIZE_MB = 10; // Rotate when log exceeds this size
const MAX_LOG_ENTRIES = 1000; // Or when entries exceed this count

/**
 * Workflow event types for SDD, Interactive, Chief-of-Staff patterns
 */
export type WorkflowEventType =
    // SDD Pipeline events
    | 'sdd_spec_created'
    | 'sdd_plan_created'
    | 'sdd_validation_passed'
    | 'sdd_validation_failed'
    | 'sdd_execution_started'
    | 'sdd_execution_completed'
    // Interactive/Dialogue events
    | 'dialogue_started'
    | 'dialogue_question_asked'
    | 'dialogue_user_responded'
    | 'dialogue_approved'
    | 'dialogue_rejected'
    // Chief-of-Staff events
    | 'assumption_made'
    | 'assumption_surfaced'
    | 'assumption_confirmed'
    | 'assumption_rejected'
    | 'decision_pending'
    | 'decision_made'
    // Worker coordination
    | 'worker_spawned'
    | 'worker_completed'
    | 'worker_failed'
    | 'worker_blocked'
    // Generic
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'custom';

/**
 * Event structure for durable coordination
 */
export interface DurableEvent {
    offset: number;
    ts: string;
    type: string;
    agent?: string;
    worker_id?: string;
    session_id?: string;
    [key: string]: any;
}

/**
 * Get the events log path for the current project
 */
function getEventsPath(projectPath: string): string {
    return path.join(projectPath, '.opencode', 'events.jsonl');
}

/**
 * Get archive path for rotated logs
 */
function getArchivePath(projectPath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(projectPath, '.opencode', 'archive', `events-${timestamp}.jsonl`);
}

/**
 * Ensure directory exists
 */
async function ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }
}

/**
 * Simple file lock for parallel workers
 */
async function withFileLock<T>(
    lockPath: string,
    fn: () => Promise<T>,
    timeoutMs = 5000
): Promise<T> {
    const lockFile = lockPath + '.lock';
    const startTime = Date.now();

    // Wait for lock
    while (fs.existsSync(lockFile)) {
        if (Date.now() - startTime > timeoutMs) {
            // Force remove stale lock
            try {
                fs.unlinkSync(lockFile);
            } catch { }
            break;
        }
        await new Promise((r) => setTimeout(r, 50));
    }

    // Acquire lock
    try {
        fs.writeFileSync(lockFile, process.pid.toString());
        return await fn();
    } finally {
        // Release lock
        try {
            fs.unlinkSync(lockFile);
        } catch { }
    }
}

/**
 * Get the next offset for the event log
 */
async function getNextOffset(logPath: string): Promise<number> {
    if (!fs.existsSync(logPath)) return 0;

    const content = await fs.promises.readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    if (lines.length === 0) return 0;

    try {
        const lastEvent = JSON.parse(lines[lines.length - 1]);
        return (lastEvent.offset || 0) + 1;
    } catch {
        return lines.length;
    }
}

/**
 * Check if log needs rotation
 */
async function needsRotation(logPath: string): Promise<boolean> {
    if (!fs.existsSync(logPath)) return false;

    const stats = await fs.promises.stat(logPath);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB >= MAX_LOG_SIZE_MB) return true;

    const content = await fs.promises.readFile(logPath, 'utf-8');
    const lineCount = content.split('\n').filter(Boolean).length;

    return lineCount >= MAX_LOG_ENTRIES;
}

/**
 * Rotate log file to archive
 */
async function rotateLog(projectPath: string): Promise<void> {
    const logPath = getEventsPath(projectPath);
    const archivePath = getArchivePath(projectPath);

    await ensureDir(archivePath);
    await fs.promises.rename(logPath, archivePath);
}

/**
 * Append an event to the log (with locking for parallel workers)
 */
export async function appendEvent(
    projectPath: string,
    event: { type: string; agent?: string;[key: string]: any }
): Promise<DurableEvent> {
    const logPath = getEventsPath(projectPath);

    return withFileLock(logPath, async () => {
        await ensureDir(logPath);

        // Check rotation
        if (await needsRotation(logPath)) {
            await rotateLog(projectPath);
        }

        const offset = await getNextOffset(logPath);
        const entry: DurableEvent = {
            ...event,
            offset,
            ts: new Date().toISOString(),
        };

        await fs.promises.appendFile(logPath, JSON.stringify(entry) + '\n');
        return entry;
    });
}

/**
 * Read events from the log
 */
export async function readEvents(
    projectPath: string,
    options: { fromOffset?: number; type?: string; agent?: string; limit?: number } = {}
): Promise<DurableEvent[]> {
    const logPath = getEventsPath(projectPath);

    if (!fs.existsSync(logPath)) return [];

    const { fromOffset = 0, type, agent, limit } = options;

    const content = await fs.promises.readFile(logPath, 'utf-8');
    let events = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line) as DurableEvent;
            } catch {
                return null;
            }
        })
        .filter((e): e is DurableEvent => e !== null && e.offset >= fromOffset);

    if (type) events = events.filter((e) => e.type === type);
    if (agent) events = events.filter((e) => e.agent === agent);
    if (limit && events.length > limit) events = events.slice(-limit);

    return events;
}

/**
 * Get the latest offset in the log
 */
export async function getLatestOffset(projectPath: string): Promise<number> {
    const logPath = getEventsPath(projectPath);
    return (await getNextOffset(logPath)) - 1;
}

/**
 * Create event log tools for OpenCode
 */
export function createEventLogTools() {
    return {
        /**
         * event_append - Add event to durable log
         */
        event_append: tool({
            description:
                'Append an event to the durable coordination log. Supports workflow events (SDD, dialogue, assumptions).',
            args: {
                type: tool.schema
                    .string()
                    .describe(
                        'Event type (e.g., "sdd_plan_created", "dialogue_approved", "assumption_made", "worker_spawned")'
                    ),
                agent: tool.schema.string().optional().describe('Agent that generated this event'),
                worker_id: tool.schema.string().optional().describe('Worker ID for parallel coordination'),
                message: tool.schema.string().optional().describe('Event message or description'),
                data: tool.schema.string().optional().describe('Additional JSON data'),
            },
            async execute(args) {
                const { type, agent, worker_id, message, data } = args;
                const projectPath = process.cwd();

                let eventData: Record<string, any> = { type };
                if (agent) eventData.agent = agent;
                if (worker_id) eventData.worker_id = worker_id;
                if (message) eventData.message = message;
                if (data) {
                    try {
                        eventData = { ...eventData, ...JSON.parse(data) };
                    } catch {
                        eventData.raw_data = data;
                    }
                }

                const event = await appendEvent(
                    projectPath,
                    eventData as { type: string; agent?: string;[key: string]: any }
                );

                return JSON.stringify({
                    success: true,
                    event,
                    log_path: getEventsPath(projectPath),
                });
            },
        }),

        /**
         * event_read - Read events from durable log
         */
        event_read: tool({
            description: 'Read events from the durable coordination log. Filter by type, agent, or offset.',
            args: {
                from_offset: tool.schema.number().optional().describe('Start reading from this offset'),
                type: tool.schema.string().optional().describe('Filter by event type'),
                agent: tool.schema.string().optional().describe('Filter by agent'),
                limit: tool.schema.number().optional().describe('Maximum number of events'),
            },
            async execute(args) {
                const { from_offset, type, agent, limit } = args;
                const projectPath = process.cwd();

                const events = await readEvents(projectPath, {
                    fromOffset: from_offset,
                    type,
                    agent,
                    limit,
                });

                const latestOffset = await getLatestOffset(projectPath);

                return JSON.stringify({
                    success: true,
                    count: events.length,
                    latest_offset: latestOffset,
                    events,
                    resume_from: latestOffset + 1,
                });
            },
        }),

        /**
         * event_status - Get log status
         */
        event_status: tool({
            description: 'Get the status of the durable event log.',
            args: {},
            async execute() {
                const projectPath = process.cwd();
                const logPath = getEventsPath(projectPath);

                const exists = fs.existsSync(logPath);
                const latestOffset = exists ? await getLatestOffset(projectPath) : -1;
                let sizeMB = 0;

                if (exists) {
                    const stats = await fs.promises.stat(logPath);
                    sizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
                }

                return JSON.stringify({
                    success: true,
                    log_exists: exists,
                    log_path: logPath,
                    event_count: latestOffset + 1,
                    latest_offset: latestOffset,
                    size_mb: sizeMB,
                    rotation_threshold_mb: MAX_LOG_SIZE_MB,
                });
            },
        }),

        /**
         * event_rotate - Force log rotation
         */
        event_rotate: tool({
            description: 'Force rotation of the event log to archive. Use when log is getting large.',
            args: {},
            async execute() {
                const projectPath = process.cwd();
                const logPath = getEventsPath(projectPath);

                if (!fs.existsSync(logPath)) {
                    return JSON.stringify({ success: false, error: 'No log to rotate' });
                }

                await rotateLog(projectPath);

                return JSON.stringify({
                    success: true,
                    message: 'Log rotated to archive',
                    new_log_path: logPath,
                });
            },
        }),
    };
}
