/**
 * LEDGER.md - Single Source of Truth for Orchestration Continuity
 *
 * This module provides utilities to manage the LEDGER.md file which tracks:
 * - Meta: Session state, current phase, progress
 * - Epic: ONE active epic with max 3 tasks
 * - Learnings: Patterns, anti-patterns, decisions
 * - Handoff: Context for session breaks
 * - Archive: Last 5 completed epics
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import crypto from 'crypto';
import { lock } from 'proper-lockfile';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'suspended'
  | 'stale';
export type TaskOutcome = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | '-';
export type EpicStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
export type LedgerPhase =
  | 'CLARIFICATION'
  | 'DECOMPOSITION'
  | 'PLANNING'
  | 'EXECUTION'
  | 'COMPLETION';

export interface Directive {
  content: string;
  source: 'user' | 'interviewer';
  createdAt: number;
}

export interface Assumption {
  content: string;
  source: 'oracle' | 'executor' | 'planner' | 'chief-of-staff';
  rationale: string;
  status: 'pending_review' | 'approved' | 'rejected';
  createdAt: number;
}

export interface Governance {
  directives: Directive[];
  assumptions: Assumption[];
}

export interface Task {
  id: string; // Format: abc123.1
  title: string;
  agent: string;
  status: TaskStatus;
  outcome: TaskOutcome;
  dependencies: string[];
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  sessionId?: string; // Durable Subagent Reference
  yieldReason?: string;
  // v4.1: Parallel execution tracking
  affectsFiles?: string[]; // Files this task will modify
  filesModified?: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
  conflictInfo?: {
    type: 'file_collision' | 'import_conflict' | 'state_conflict' | 'resource_lock';
    conflictingTaskId?: string;
    conflictingFiles?: string[];
    resolution?: 'retried' | 'redecomposed' | 'sequential';
  };
}

export interface Epic {
  id: string; // Format: abc123
  title: string;
  request: string;
  status: EpicStatus;
  createdAt: number;
  completedAt?: number;
  tasks: Task[];
  context: string[];
  progressLog: string[];
}

export interface LearningEntry {
  content: string;
  createdAt?: number;
}

export interface Learnings {
  patterns: LearningEntry[];
  antiPatterns: LearningEntry[];
  decisions: LearningEntry[];
  preferences: LearningEntry[];
}

export interface Handoff {
  created: string;
  reason: 'context_limit' | 'user_exit' | 'session_break';
  resumeCommand: string;
  whatsDone: string[];
  whatsNext: string[];
  keyContext: string[];
  filesModified: string[];
  learningsThisSession: string[];
  snapshotPath?: string;
}

export interface ArchiveEntry {
  epicId: string;
  title: string;
  outcome: TaskOutcome;
  duration: string;
  date: string;
}

export interface RealTimeActivity {
  timestamp: string;
  agent: string;
  message: string;
}

export interface LedgerMeta {
  sessionId: string;
  status: 'active' | 'paused' | 'handoff';
  phase: LedgerPhase;
  lastUpdated: string;
  contextUsage?: string;
  tasksCompleted: string; // e.g., "2/3"
  currentTask?: string;
}

export interface Ledger {
  meta: LedgerMeta;
  governance: Governance;
  epic: Epic | null;
  activity: RealTimeActivity[];
  learnings: Learnings;
  handoff: Handoff | null;
  archive: ArchiveEntry[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LEDGER_PATH = '.opencode/LEDGER.md';
const MAX_TASKS_PER_EPIC = 3;
const MAX_ARCHIVE_ENTRIES = 5;
const MAX_ACTIVITY_LOGS = 10;

// ============================================================================
// Helper Functions
// ============================================================================

function generateHash(): string {
  return crypto.randomBytes(3).toString('hex'); // 6 chars: abc123
}

function generateSessionId(): string {
  return `sess_${generateHash()}`;
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function formatDuration(startMs: number, endMs: number): string {
  const seconds = Math.floor((endMs - startMs) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ============================================================================
// Default Ledger
// ============================================================================

function createDefaultLedger(): Ledger {
  return {
    meta: {
      sessionId: generateSessionId(),
      status: 'active',
      phase: 'CLARIFICATION',
      lastUpdated: formatTimestamp(),
      tasksCompleted: '0/0',
    },
    governance: {
      directives: [],
      assumptions: [],
    },
    epic: null,
    activity: [],
    learnings: {
      patterns: [],
      antiPatterns: [],
      decisions: [],
      preferences: [],
    },
    handoff: null,
    archive: [],
  };
}

// ============================================================================
// Markdown Parser
// ============================================================================

function parseLedgerMarkdown(content: string): Ledger {
  const ledger = createDefaultLedger();
  const lines = content.split('\n');

  let currentSection = '';
  let currentSubSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Section headers
    if (line.startsWith('## Meta')) {
      currentSection = 'meta';
      continue;
    } else if (line.startsWith('## Governance')) {
      currentSection = 'governance';
      continue;
    } else if (line.startsWith('## Epic:')) {
      currentSection = 'epic';
      const epicId = line.replace('## Epic:', '').trim();
      ledger.epic = {
        id: epicId,
        title: '',
        request: '',
        status: 'pending',
        createdAt: Date.now(),
        tasks: [],
        context: [],
        progressLog: [],
      };
      continue;
    } else if (line.startsWith('## Real-time Activity')) {
      currentSection = 'activity';
      continue;
    } else if (line.startsWith('## Learnings')) {
      currentSection = 'learnings';
      continue;
    } else if (line.startsWith('## Handoff')) {
      currentSection = 'handoff';
      ledger.handoff = {
        created: '',
        reason: 'session_break',
        resumeCommand: '',
        whatsDone: [],
        whatsNext: [],
        keyContext: [],
        filesModified: [],
        learningsThisSession: [],
      };
      continue;
    } else if (line.startsWith('## Archive')) {
      currentSection = 'archive';
      continue;
    }

    // Parse Meta section
    if (currentSection === 'meta') {
      if (line.startsWith('session_id:')) {
        ledger.meta.sessionId = line.replace('session_id:', '').trim();
      } else if (line.startsWith('status:')) {
        ledger.meta.status = line.replace('status:', '').trim() as LedgerMeta['status'];
      } else if (line.startsWith('phase:')) {
        ledger.meta.phase = line.replace('phase:', '').trim() as LedgerPhase;
      } else if (line.startsWith('last_updated:')) {
        ledger.meta.lastUpdated = line.replace('last_updated:', '').trim();
      } else if (line.startsWith('tasks_completed:')) {
        ledger.meta.tasksCompleted = line.replace('tasks_completed:', '').trim();
      } else if (line.startsWith('current_task:')) {
        ledger.meta.currentTask = line.replace('current_task:', '').trim();
      }
    }

    // Parse Governance section
    if (currentSection === 'governance') {
      if (line.startsWith('### Directives')) {
        currentSubSection = 'directives';
      } else if (line.startsWith('### Assumptions')) {
        currentSubSection = 'assumptions';
      } else if (line.startsWith('- ')) {
        // Parse Directive: - [x] Content (Source, Date)
        if (currentSubSection === 'directives') {
          const contentMatch = line.match(/- \[x\] (.*) \((.*), (.*)\)/);
          if (contentMatch) {
            ledger.governance.directives.push({
              content: contentMatch[1],
              source: contentMatch[2] as Directive['source'],
              createdAt: new Date(contentMatch[3]).getTime() || Date.now(),
            });
          }
        }
        // Parse Assumption: - [?] Content (Source: Rationale)
        else if (currentSubSection === 'assumptions') {
          const contentMatch = line.match(/- \[\?\] (.*) \((.*): (.*)\)/);
          if (contentMatch) {
            ledger.governance.assumptions.push({
              content: contentMatch[1],
              source: contentMatch[2] as Assumption['source'],
              rationale: contentMatch[3],
              status: 'pending_review',
              createdAt: Date.now(), // Date usually not stored in markdown line for assumptions to keep it short
            });
          }
        }
      }
    }

    // Parse Epic section
    if (currentSection === 'epic' && ledger.epic) {
      if (line.startsWith('**Title**:')) {
        ledger.epic.title = line.replace('**Title**:', '').trim();
      } else if (line.startsWith('**Request**:')) {
        ledger.epic.request = line.replace('**Request**:', '').trim();
      } else if (line.startsWith('**Status**:')) {
        ledger.epic.status = line.replace('**Status**:', '').trim() as EpicStatus;
      } else if (line.startsWith('### Tasks')) {
        currentSubSection = 'tasks';
      } else if (line.startsWith('### Context')) {
        currentSubSection = 'context';
      } else if (line.startsWith('### Progress Log')) {
        currentSubSection = 'progressLog';
      } else if (line.startsWith('### Dependencies')) {
        currentSubSection = 'dependencies';
      }

      // Parse task table rows
      if (
        currentSubSection === 'tasks' &&
        line.startsWith('|') &&
        !line.includes('ID') &&
        !line.includes('---')
      ) {
        const cols = line
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        if (cols.length >= 4) {
          const outcomeStr = cols[4] || '-';
          const outcome: TaskOutcome = ['SUCCEEDED', 'PARTIAL', 'FAILED', '-'].includes(outcomeStr)
            ? (outcomeStr as TaskOutcome)
            : '-';
          ledger.epic.tasks.push({
            id: cols[0],
            title: cols[1],
            agent: cols[2],
            status: cols[3].includes('✅')
              ? 'completed'
              : cols[3].includes('❌')
                ? 'failed'
                : cols[3].includes('⏸️')
                  ? 'suspended'
                  : 'pending',
            outcome,
            dependencies: [],
          });
        }
      }

      // Parse context items
      if (currentSubSection === 'context' && line.startsWith('- ')) {
        ledger.epic.context.push(line.replace('- ', ''));
      }

      // Parse progress log
      if (currentSubSection === 'progressLog' && line.startsWith('- ')) {
        ledger.epic.progressLog.push(line.replace('- ', ''));
      }
    }

    // Parse Activity section
    if (currentSection === 'activity' && line.startsWith('- ')) {
      const match = line.match(/- \[(.*)\] \*\*(.*)\*\*: (.*)/);
      if (match) {
        ledger.activity.push({
          timestamp: match[1],
          agent: match[2],
          message: match[3],
        });
      }
    }

    // Parse Learnings section
    if (currentSection === 'learnings') {
      if (line.startsWith('### Patterns')) {
        currentSubSection = 'patterns';
      } else if (line.startsWith('### Anti-Patterns')) {
        currentSubSection = 'antiPatterns';
      } else if (line.startsWith('### Decisions')) {
        currentSubSection = 'decisions';
      } else if (line.startsWith('### Preferences')) {
        currentSubSection = 'preferences';
      } else if (line.startsWith('- ')) {
        const content = line.replace('- ', '').replace(/^\*\*[^*]+\*\*:\s*/, '');
        if (currentSubSection === 'patterns') {
          ledger.learnings.patterns.push({ content });
        } else if (currentSubSection === 'antiPatterns') {
          ledger.learnings.antiPatterns.push({ content });
        } else if (currentSubSection === 'decisions') {
          ledger.learnings.decisions.push({ content });
        } else if (currentSubSection === 'preferences') {
          ledger.learnings.preferences.push({ content });
        }
      }
    }

    // Parse Handoff section
    if (currentSection === 'handoff' && ledger.handoff) {
      if (line.startsWith('**Created**:')) {
        ledger.handoff.created = line.replace('**Created**:', '').trim();
      } else if (line.startsWith('**Reason**:')) {
        ledger.handoff.reason = line.replace('**Reason**:', '').trim() as Handoff['reason'];
      } else if (line.startsWith('**Resume Command**:')) {
        ledger.handoff.resumeCommand = line
          .replace('**Resume Command**:', '')
          .replace(/^"|"$/g, '')
          .trim();
      } else if (line.startsWith('**Snapshot Path**:')) {
        ledger.handoff.snapshotPath = line
          .replace('**Snapshot Path**:', '')
          .replace(/`/g, '')
          .trim();
      } else if (line.startsWith("### What's Done")) {
        currentSubSection = 'whatsDone';
      } else if (line.startsWith("### What's Next")) {
        currentSubSection = 'whatsNext';
      } else if (line.startsWith('### Key Context')) {
        currentSubSection = 'keyContext';
      } else if (line.startsWith('### Files Modified')) {
        currentSubSection = 'filesModified';
      } else if (line.startsWith('- ')) {
        const content = line.replace('- ', '').replace('[x] ', '').replace('[ ] ', '');
        if (currentSubSection === 'whatsDone') {
          ledger.handoff.whatsDone.push(content);
        } else if (currentSubSection === 'whatsNext') {
          ledger.handoff.whatsNext.push(content);
        } else if (currentSubSection === 'keyContext') {
          ledger.handoff.keyContext.push(content);
        } else if (currentSubSection === 'filesModified') {
          ledger.handoff.filesModified.push(content.replace(/`/g, ''));
        }
      }
    }

    // Parse Archive section
    if (
      currentSection === 'archive' &&
      line.startsWith('|') &&
      !line.includes('Epic') &&
      !line.includes('---')
    ) {
      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length >= 4) {
        ledger.archive.push({
          epicId: cols[0],
          title: cols[1],
          outcome: cols[2] as TaskOutcome,
          duration: '',
          date: cols[3],
        });
      }
    }
  }

  return ledger;
}

// ============================================================================
// Markdown Renderer
// ============================================================================

function renderLedgerMarkdown(ledger: Ledger): string {
  const lines: string[] = [];

  // Header
  lines.push('# LEDGER');
  lines.push('');

  // Meta section
  lines.push('## Meta');
  lines.push(`session_id: ${ledger.meta.sessionId}`);
  lines.push(`status: ${ledger.meta.status}`);
  lines.push(`phase: ${ledger.meta.phase}`);
  lines.push(`last_updated: ${ledger.meta.lastUpdated}`);
  lines.push(`tasks_completed: ${ledger.meta.tasksCompleted}`);
  if (ledger.meta.currentTask) {
    lines.push(`current_task: ${ledger.meta.currentTask}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Governance section
  lines.push('## Governance');
  lines.push('');
  lines.push('### Directives (The Law)');
  if (ledger.governance.directives.length > 0) {
    for (const d of ledger.governance.directives) {
      const dateStr = new Date(d.createdAt).toISOString().split('T')[0];
      lines.push(`- [x] ${d.content} (${d.source}, ${dateStr})`);
    }
  } else {
    lines.push('*No directives established*');
  }
  lines.push('');

  lines.push('### Assumptions (The Debt)');
  if (ledger.governance.assumptions.length > 0) {
    for (const a of ledger.governance.assumptions) {
      lines.push(`- [?] ${a.content} (${a.source}: ${a.rationale})`);
    }
  } else {
    lines.push('*No pending assumptions*');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Epic section
  if (ledger.epic) {
    lines.push(`## Epic: ${ledger.epic.id}`);
    lines.push('');
    lines.push(`**Title**: ${ledger.epic.title}`);
    lines.push(`**Request**: "${ledger.epic.request}"`);
    lines.push(`**Status**: ${ledger.epic.status}`);
    lines.push(`**Created**: ${new Date(ledger.epic.createdAt).toISOString()}`);
    lines.push('');

    // Tasks table
    lines.push('### Tasks');
    lines.push('');
    lines.push('| ID | Title | Agent | Status | Outcome |');
    lines.push('|----|-------|-------|--------|---------|');
    for (const task of ledger.epic.tasks) {
      const statusIcon =
        task.status === 'completed'
          ? '✅'
          : task.status === 'failed'
            ? '❌'
            : task.status === 'suspended'
              ? '⏸️'
              : task.status === 'stale'
                ? '⚠️'
                : '⏳';
      lines.push(
        `| ${task.id} | ${task.title} | ${task.agent} | ${statusIcon} ${task.status} | ${task.outcome} |`
      );
    }
    lines.push('');

    // Dependencies
    const deps = ledger.epic.tasks.filter((t) => t.dependencies.length > 0);
    if (deps.length > 0) {
      lines.push('### Dependencies');
      for (const task of deps) {
        for (const dep of task.dependencies) {
          lines.push(`- ${task.id} → depends on → ${dep}`);
        }
      }
      lines.push('');
    }

    // Context
    if (ledger.epic.context.length > 0) {
      lines.push('### Context');
      for (const ctx of ledger.epic.context) {
        lines.push(`- ${ctx}`);
      }
      lines.push('');
    }

    // Progress Log
    if (ledger.epic.progressLog.length > 0) {
      lines.push('### Progress Log');
      for (const log of ledger.epic.progressLog) {
        lines.push(`- ${log}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## Epic');
    lines.push('');
    lines.push('*No active epic*');
    lines.push('');
  }

  // Activity section
  lines.push('## Real-time Activity');
  lines.push('');
  if (ledger.activity.length > 0) {
    for (const act of ledger.activity) {
      lines.push(`- [${act.timestamp}] **${act.agent}**: ${act.message}`);
    }
  } else {
    lines.push('*No recent activity*');
  }
  lines.push('');

  lines.push('---');
  lines.push('');

  // Learnings section
  lines.push('## Learnings');
  lines.push('');

  lines.push('### Patterns ✅');
  if (ledger.learnings.patterns.length > 0) {
    for (const p of ledger.learnings.patterns) {
      lines.push(`- ${p.content}`);
    }
  } else {
    lines.push('*No patterns yet*');
  }
  lines.push('');

  lines.push('### Anti-Patterns ❌');
  if (ledger.learnings.antiPatterns.length > 0) {
    for (const ap of ledger.learnings.antiPatterns) {
      lines.push(`- ${ap.content}`);
    }
  } else {
    lines.push('*No anti-patterns yet*');
  }
  lines.push('');

  lines.push('### Decisions');
  if (ledger.learnings.decisions.length > 0) {
    for (const d of ledger.learnings.decisions) {
      lines.push(`- ${d.content}`);
    }
  } else {
    lines.push('*No decisions yet*');
  }
  lines.push('');

  lines.push('### Preferences');
  if (ledger.learnings.preferences.length > 0) {
    for (const pref of ledger.learnings.preferences) {
      lines.push(`- ${pref.content}`);
    }
  } else {
    lines.push('*No preferences yet*');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Handoff section
  lines.push('## Handoff');
  lines.push('');
  if (ledger.handoff) {
    lines.push(`**Created**: ${ledger.handoff.created}`);
    lines.push(`**Reason**: ${ledger.handoff.reason}`);
    lines.push(`**Resume Command**: "${ledger.handoff.resumeCommand}"`);
    lines.push('');
    lines.push("### What's Done");
    for (const done of ledger.handoff.whatsDone) {
      lines.push(`- [x] ${done}`);
    }
    lines.push('');
    lines.push("### What's Next");
    for (const next of ledger.handoff.whatsNext) {
      lines.push(`- [ ] ${next}`);
    }
    lines.push('');
    if (ledger.handoff.keyContext.length > 0) {
      lines.push('### Key Context');
      for (const ctx of ledger.handoff.keyContext) {
        lines.push(`- ${ctx}`);
      }
      lines.push('');
    }
    if (ledger.handoff.filesModified.length > 0) {
      lines.push('### Files Modified');
      for (const file of ledger.handoff.filesModified) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }
    if (ledger.handoff.snapshotPath) {
      lines.push(`**Snapshot Path**: \`${ledger.handoff.snapshotPath}\``);
      lines.push('');
    }
  } else {
    lines.push('*No pending handoff*');
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Archive section
  lines.push('## Archive');
  lines.push('');
  if (ledger.archive.length > 0) {
    lines.push('| Epic | Title | Outcome | Date |');
    lines.push('|------|-------|---------|------|');
    for (const entry of ledger.archive) {
      lines.push(`| ${entry.epicId} | ${entry.title} | ${entry.outcome} | ${entry.date} |`);
    }
  } else {
    lines.push('*No archived epics*');
  }
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load LEDGER from file system
 */
export async function loadLedger(path: string = DEFAULT_LEDGER_PATH): Promise<Ledger> {
  try {
    if (!existsSync(path)) {
      console.log(`[Ledger] No LEDGER found at ${path}, creating default`);
      return createDefaultLedger();
    }

    const content = await readFile(path, 'utf-8');
    const ledger = parseLedgerMarkdown(content);
    console.log(`[Ledger] Loaded from ${path}`);
    return ledger;
  } catch (error) {
    console.error(`[Ledger] Failed to load: ${error}`);
    return createDefaultLedger();
  }
}

/**
 * Save LEDGER to file system
 */
export async function saveLedger(
  ledger: Ledger,
  path: string = DEFAULT_LEDGER_PATH
): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Ensure file exists for locking (create empty if not)
    if (!existsSync(path)) {
      await writeFile(path, '', 'utf-8');
    }

    // Update timestamp
    ledger.meta.lastUpdated = formatTimestamp();
    const content = renderLedgerMarkdown(ledger);

    // Write with lock
    // retries: 5 retries with randomized backoff logic (default)
    const release = await lock(path, { retries: 5 });

    try {
      await writeFile(path, content, 'utf-8');
      console.log(`[Ledger] Saved to ${path}`);
    } finally {
      await release();
    }
  } catch (error) {
    console.error(`[Ledger] Failed to save: ${error}`);
    throw error;
  }
}

/**
 * Create a new Epic
 */
export function createEpic(ledger: Ledger, title: string, request: string): string {
  if (ledger.epic) {
    throw new Error('Cannot create epic: An active epic already exists. Archive it first.');
  }

  const epicId = generateHash();
  ledger.epic = {
    id: epicId,
    title,
    request,
    status: 'pending',
    createdAt: Date.now(),
    tasks: [],
    context: [],
    progressLog: [`[${formatTimestamp()}] Epic created: ${title}`],
  };

  ledger.meta.phase = 'DECOMPOSITION';
  ledger.meta.tasksCompleted = '0/0';

  console.log(`[Ledger] Created epic: ${epicId} - ${title}`);
  return epicId;
}

/**
 * Create a task within the current Epic
 */
export function createTask(
  ledger: Ledger,
  title: string,
  agent: string,
  options?: { dependencies?: string[] }
): string {
  if (!ledger.epic) {
    throw new Error('Cannot create task: No active epic');
  }

  if (ledger.epic.tasks.length >= MAX_TASKS_PER_EPIC) {
    throw new Error(`Cannot create task: Epic already has ${MAX_TASKS_PER_EPIC} tasks (maximum)`);
  }

  const taskNumber = ledger.epic.tasks.length + 1;
  const taskId = `${ledger.epic.id}.${taskNumber}`;

  const task: Task = {
    id: taskId,
    title,
    agent,
    status: 'pending',
    outcome: '-',
    dependencies: options?.dependencies || [],
  };

  ledger.epic.tasks.push(task);
  ledger.meta.tasksCompleted = `0/${ledger.epic.tasks.length}`;
  ledger.epic.progressLog.push(`[${formatTimestamp()}] Task created: ${taskId} - ${title}`);

  console.log(`[Ledger] Created task: ${taskId} - ${title}`);
  return taskId;
}

/**
 * Update task status
 */
export function updateTaskStatus(
  ledger: Ledger,
  taskId: string,
  status: TaskStatus,
  result?: string,
  error?: string
): void {
  if (!ledger.epic) {
    throw new Error('Cannot update task: No active epic');
  }

  const task = ledger.epic.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  task.status = status;

  if (status === 'running' && !task.startedAt) {
    task.startedAt = Date.now();
    ledger.meta.currentTask = taskId;
    ledger.meta.phase = 'EXECUTION';
    ledger.epic.status = 'in_progress';
  }

  if (status === 'completed') {
    task.completedAt = Date.now();
    task.outcome = 'SUCCEEDED';
    if (result) task.result = result;
    ledger.epic.progressLog.push(`[${formatTimestamp()}] ${taskId} completed`);
  }

  if (status === 'failed') {
    task.completedAt = Date.now();
    task.outcome = 'FAILED';
    if (error) task.error = error;
    ledger.epic.progressLog.push(`[${formatTimestamp()}] ${taskId} failed: ${error || 'unknown'}`);
  }

  // Update progress
  const completed = ledger.epic.tasks.filter((t) => t.status === 'completed').length;
  ledger.meta.tasksCompleted = `${completed}/${ledger.epic.tasks.length}`;

  // Check if epic is complete
  const allDone = ledger.epic.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
  if (allDone) {
    const allSucceeded = ledger.epic.tasks.every((t) => t.status === 'completed');
    ledger.epic.status = allSucceeded ? 'completed' : 'failed';
    ledger.meta.phase = 'COMPLETION';
    ledger.meta.currentTask = undefined;
  }

  console.log(`[Ledger] Task ${taskId} status: ${status}`);
}

/**
 * Add a learning entry
 */
export function addLearning(
  ledger: Ledger,
  type: 'pattern' | 'antiPattern' | 'decision' | 'preference',
  content: string
): void {
  const entry: LearningEntry = { content, createdAt: Date.now() };

  switch (type) {
    case 'pattern':
      ledger.learnings.patterns.push(entry);
      break;
    case 'antiPattern':
      ledger.learnings.antiPatterns.push(entry);
      break;
    case 'decision':
      ledger.learnings.decisions.push(entry);
      break;
    case 'preference':
      ledger.learnings.preferences.push(entry);
      break;
  }

  console.log(`[Ledger] Added ${type}: ${content}`);
}

/**
 * Add context to current epic
 */
export function addContext(ledger: Ledger, context: string): void {
  if (!ledger.epic) {
    throw new Error('Cannot add context: No active epic');
  }

  ledger.epic.context.push(context);
  console.log(`[Ledger] Added context: ${context}`);
}

/**
 * Log real-time activity (rotates at MAX_ACTIVITY_LOGS)
 */
export function logActivity(ledger: Ledger, agent: string, message: string): void {
  ledger.activity.push({
    timestamp: new Date().toLocaleTimeString(),
    agent,
    message,
  });

  if (ledger.activity.length > MAX_ACTIVITY_LOGS) {
    ledger.activity = ledger.activity.slice(-MAX_ACTIVITY_LOGS);
  }
}

/**
 * Create handoff for session break
 */
export function createHandoff(
  ledger: Ledger,
  reason: Handoff['reason'],
  resumeCommand: string,
  options?: {
    keyContext?: string[];
    filesModified?: string[];
  }
): void {
  if (!ledger.epic) {
    console.log('[Ledger] No active epic, skipping handoff');
    return;
  }

  const completedTasks = ledger.epic.tasks.filter((t) => t.status === 'completed');
  const pendingTasks = ledger.epic.tasks.filter((t) => t.status !== 'completed');

  ledger.handoff = {
    created: formatTimestamp(),
    reason,
    resumeCommand,
    whatsDone: completedTasks.map((t) => `${t.id}: ${t.title}`),
    whatsNext: pendingTasks.map((t) => `${t.id}: ${t.title}`),
    keyContext: options?.keyContext || [],
    filesModified: options?.filesModified || [],
    learningsThisSession: [
      ...ledger.learnings.patterns.slice(-3).map((l) => `Pattern: ${l.content}`),
      ...ledger.learnings.decisions.slice(-3).map((l) => `Decision: ${l.content}`),
    ],
  };

  ledger.meta.status = 'handoff';
  console.log(`[Ledger] Created handoff: ${reason}`);
}

/**
 * Archive the current epic
 */
export function archiveEpic(ledger: Ledger, outcome?: TaskOutcome): void {
  if (!ledger.epic) {
    console.log('[Ledger] No active epic to archive');
    return;
  }

  const epic = ledger.epic;
  const now = Date.now();

  // Determine outcome
  let finalOutcome = outcome;
  if (!finalOutcome) {
    const completed = epic.tasks.filter((t) => t.status === 'completed').length;
    const total = epic.tasks.length;
    if (completed === total) {
      finalOutcome = 'SUCCEEDED';
    } else if (completed > 0) {
      finalOutcome = 'PARTIAL';
    } else {
      finalOutcome = 'FAILED';
    }
  }

  // Create archive entry
  const entry: ArchiveEntry = {
    epicId: epic.id,
    title: epic.title,
    outcome: finalOutcome,
    duration: formatDuration(epic.createdAt, epic.completedAt || now),
    date: new Date(now).toISOString().split('T')[0],
  };

  // Add to archive (keep last 5)
  ledger.archive.unshift(entry);
  if (ledger.archive.length > MAX_ARCHIVE_ENTRIES) {
    ledger.archive = ledger.archive.slice(0, MAX_ARCHIVE_ENTRIES);
  }

  // Clear epic
  ledger.epic = null;
  ledger.meta.phase = 'CLARIFICATION';
  ledger.meta.tasksCompleted = '0/0';
  ledger.meta.currentTask = undefined;
  ledger.meta.status = 'active';

  // Clear handoff if resolved
  if (finalOutcome === 'SUCCEEDED') {
    ledger.handoff = null;
  }

  console.log(`[Ledger] Archived epic: ${entry.epicId} - ${finalOutcome}`);
}

/**
 * Get progress summary
 */
export function getProgress(ledger: Ledger): {
  total: number;
  completed: number;
  failed: number;
  running: number;
  percentComplete: number;
} {
  if (!ledger.epic) {
    return { total: 0, completed: 0, failed: 0, running: 0, percentComplete: 0 };
  }

  const tasks = ledger.epic.tasks;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const running = tasks.filter((t) => t.status === 'running').length;
  const percentComplete = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  return { total: tasks.length, completed, failed, running, percentComplete };
}

/**
 * Check if a task can start (dependencies satisfied)
 */
export function canStartTask(ledger: Ledger, taskId: string): boolean {
  if (!ledger.epic) return false;

  const task = ledger.epic.tasks.find((t) => t.id === taskId);
  if (!task) return false;

  for (const depId of task.dependencies) {
    const dep = ledger.epic.tasks.find((t) => t.id === depId);
    if (!dep || dep.status !== 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Get tasks that are ready to start
 */
export function getReadyTasks(ledger: Ledger): Task[] {
  if (!ledger.epic) return [];

  // If epic is paused, no tasks are ready
  if (ledger.epic.status === 'paused') return [];

  return ledger.epic.tasks.filter((t) => t.status === 'pending' && canStartTask(ledger, t.id));
}

/**
 * Surface recent learnings (for session start)
 */
export function surfaceLearnings(
  ledger: Ledger,
  maxAge: number = 48 * 60 * 60 * 1000
): {
  patterns: string[];
  antiPatterns: string[];
  decisions: string[];
} {
  const now = Date.now();

  const filterRecent = (entries: LearningEntry[]): string[] =>
    entries.filter((e) => !e.createdAt || now - e.createdAt < maxAge).map((e) => e.content);

  return {
    patterns: filterRecent(ledger.learnings.patterns),
    antiPatterns: filterRecent(ledger.learnings.antiPatterns),
    decisions: filterRecent(ledger.learnings.decisions),
  };
}

/**
 * Add a Directive (The Law)
 */
export function addDirective(ledger: Ledger, content: string, source: Directive['source']): void {
  ledger.governance.directives.push({
    content,
    source,
    createdAt: Date.now(),
  });
  console.log(`[Ledger] Added Directive: ${content}`);
}

/**
 * Add an Assumption (The Debt)
 */
export function addAssumption(
  ledger: Ledger,
  content: string,
  source: Assumption['source'],
  rationale: string
): void {
  ledger.governance.assumptions.push({
    content,
    source,
    rationale,
    status: 'pending_review',
    createdAt: Date.now(),
  });
  console.log(`[Ledger] Added Assumption: ${content}`);
}

/**
 * Review an Assumption (approve/reject)
 * If approved, optionally promotes to Directive
 */
export function reviewAssumption(
  ledger: Ledger,
  index: number,
  status: 'approved' | 'rejected',
  promoteToDirective: boolean = false
): void {
  const assumption = ledger.governance.assumptions[index];
  if (!assumption) {
    throw new Error(`Assumption at index ${index} not found`);
  }

  assumption.status = status;

  if (status === 'approved' && promoteToDirective) {
    addDirective(ledger, assumption.content, 'user');
    ledger.governance.assumptions.splice(index, 1);
    console.log(`[Ledger] Assumption promoted to Directive: ${assumption.content}`);
  } else {
    console.log(`[Ledger] Assumption ${status}: ${assumption.content}`);
  }
}

/**
 * Get assumptions pending user review
 */
export function getUnreviewedAssumptions(ledger: Ledger): Assumption[] {
  return ledger.governance.assumptions.filter((a) => a.status === 'pending_review');
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_LEDGER_PATH,
  MAX_TASKS_PER_EPIC,
  MAX_ARCHIVE_ENTRIES,
  generateHash,
  generateSessionId,
  formatTimestamp,
  formatDuration,
  createDefaultLedger,
  parseLedgerMarkdown,
  renderLedgerMarkdown,
};
