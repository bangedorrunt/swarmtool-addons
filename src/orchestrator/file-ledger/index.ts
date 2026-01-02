/**
 * File-Based Ledger Core (v6.0)
 *
 * Hybrid approach: Lightweight LEDGER.md index + file-based epics
 *
 * Key differences from v5.0:
 * - LEDGER.md is now a lightweight index (pointers only)
 * - Epics are stored in separate directories with spec, plan, log files
 * - Learnings are persisted in dedicated files (not lost on archive)
 * - Git-friendly structure for easy review and history tracking
 */

import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'node:crypto';

import {
  OPENCODE_DIR,
  LEDGER_FILE,
  CONTEXT_DIR,
  EPICS_DIR,
  LEARNINGS_DIR,
  ARCHIVE_DIR,
  type LedgerIndex,
  type EpicMetadata,
  type Specification,
  type Plan,
  type TaskDefinition,
  type LogEntry,
  type Learning,
  type LearningType,
  type Phase,
  type EpicStatus,
  type Outcome,
} from './types';

import {
  PRODUCT_TEMPLATE,
  TECH_STACK_TEMPLATE,
  WORKFLOW_TEMPLATE,
  SPEC_TEMPLATE,
  PLAN_TEMPLATE,
  LOG_TEMPLATE,
  METADATA_TEMPLATE,
  PATTERNS_TEMPLATE,
  DECISIONS_TEMPLATE,
  PREFERENCES_TEMPLATE,
  LEDGER_INDEX_TEMPLATE,
  renderTemplate,
} from './templates';
import { createModuleLogger } from '../../utils/logger';

const log = createModuleLogger('file-ledger');

// Helper functions
function generateId(): string {
  return randomBytes(3).toString('hex');
}

function generateSessionId(): string {
  return `sess_${generateId()}`;
}

function generateEpicId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 20);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `${slug}_${date}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

function dateOnly(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * FileBasedLedger - Main class for file-based orchestration state
 */
export class FileBasedLedger {
  private baseDir: string;
  private index: LedgerIndex | null = null;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  // PATHS

  private get opencodePath(): string {
    return join(this.baseDir, OPENCODE_DIR);
  }

  private get ledgerPath(): string {
    return join(this.baseDir, LEDGER_FILE);
  }

  private get contextPath(): string {
    return join(this.baseDir, CONTEXT_DIR);
  }

  private get epicsPath(): string {
    return join(this.baseDir, EPICS_DIR);
  }

  private get learningsPath(): string {
    return join(this.baseDir, LEARNINGS_DIR);
  }

  private get archivePath(): string {
    return join(this.baseDir, ARCHIVE_DIR);
  }

  private epicPath(epicId: string): string {
    return join(this.epicsPath, epicId);
  }

  // INITIALIZATION

  /**
   * Check if .opencode/ is initialized
   */
  async isInitialized(): Promise<boolean> {
    return existsSync(this.ledgerPath);
  }

  /**
   * Initialize .opencode/ directory structure
   */
  async initialize(): Promise<void> {
    log.info('Initializing .opencode/ directory...');

    // Create directories
    await mkdir(this.contextPath, { recursive: true });
    await mkdir(this.epicsPath, { recursive: true });
    await mkdir(this.learningsPath, { recursive: true });
    await mkdir(this.archivePath, { recursive: true });

    const sessionId = generateSessionId();
    const vars = { sessionId, date: dateOnly() };

    // Create context files
    await writeFile(join(this.contextPath, 'product.md'), renderTemplate(PRODUCT_TEMPLATE, vars));
    await writeFile(
      join(this.contextPath, 'tech-stack.md'),
      renderTemplate(TECH_STACK_TEMPLATE, vars)
    );
    await writeFile(join(this.contextPath, 'workflow.md'), renderTemplate(WORKFLOW_TEMPLATE, vars));

    // Create learning files
    await writeFile(
      join(this.learningsPath, 'patterns.md'),
      renderTemplate(PATTERNS_TEMPLATE, vars)
    );
    await writeFile(
      join(this.learningsPath, 'decisions.md'),
      renderTemplate(DECISIONS_TEMPLATE, vars)
    );
    await writeFile(
      join(this.learningsPath, 'preferences.md'),
      renderTemplate(PREFERENCES_TEMPLATE, vars)
    );

    // Create LEDGER.md index
    await writeFile(this.ledgerPath, renderTemplate(LEDGER_INDEX_TEMPLATE, vars));

    // Initialize index in memory
    this.index = {
      meta: {
        version: '6.0',
        sessionId,
        phase: 'CLARIFY',
        lastUpdated: timestamp(),
      },
      activeEpic: null,
      recentLearnings: [],
      handoff: null,
    };

    log.info({ path: this.opencodePath }, 'Initialized');
  }

  // LEDGER INDEX

  /**
   * Load LEDGER.md index
   */
  async loadIndex(): Promise<LedgerIndex> {
    if (this.index) return this.index;

    if (!existsSync(this.ledgerPath)) {
      await this.initialize();
      return this.index!;
    }

    const content = await readFile(this.ledgerPath, 'utf-8');
    this.index = this.parseIndex(content);
    return this.index;
  }

  /**
   * Save LEDGER.md index
   */
  async saveIndex(): Promise<void> {
    if (!this.index) return;

    this.index.meta.lastUpdated = timestamp();
    const content = this.renderIndex();
    await writeFile(this.ledgerPath, content);
    log.info('Index saved');
  }

  private parseIndex(content: string): LedgerIndex {
    const lines = content.split('\n');
    const index: LedgerIndex = {
      meta: {
        version: '6.0',
        sessionId: generateSessionId(),
        phase: 'CLARIFY',
        lastUpdated: timestamp(),
      },
      activeEpic: null,
      recentLearnings: [],
      handoff: null,
    };

    let section = '';
    for (const line of lines) {
      if (line.startsWith('## Meta')) section = 'meta';
      else if (line.startsWith('## Active Epic')) section = 'epic';
      else if (line.startsWith('## Recent Learnings')) section = 'learnings';
      else if (line.startsWith('## Handoff')) section = 'handoff';

      if (section === 'meta') {
        if (line.includes('**Session**:')) {
          index.meta.sessionId = line.split(':')[1]?.trim() || generateSessionId();
        } else if (line.includes('**Phase**:')) {
          index.meta.phase = (line.split(':')[1]?.trim() || 'CLARIFY') as Phase;
        }
      }

      if (section === 'epic' && line.includes('**Epic**:')) {
        const match = line.match(/\[([^\]]+)\]\(epics\/([^/]+)\/?\)/);
        if (match) {
          index.activeEpic = {
            id: match[2],
            path: `epics/${match[2]}`,
          };
        }
      }

      if (section === 'learnings' && line.startsWith('- ')) {
        index.recentLearnings.push(line.slice(2));
      }
    }

    return index;
  }

  private renderIndex(): string {
    const idx = this.index!;
    const lines: string[] = [];

    lines.push('# LEDGER (v6.0)');
    lines.push('');
    lines.push('## Meta');
    lines.push(`- **Version**: ${idx.meta.version}`);
    lines.push(`- **Session**: ${idx.meta.sessionId}`);
    lines.push(`- **Phase**: ${idx.meta.phase}`);
    lines.push(`- **Last Updated**: ${idx.meta.lastUpdated}`);
    lines.push('');

    lines.push('## Active Epic');
    if (idx.activeEpic) {
      lines.push(`**Epic**: [${idx.activeEpic.id}](${idx.activeEpic.path}/)`);
    } else {
      lines.push('*No active epic*');
    }
    lines.push('');

    lines.push('## Recent Learnings');
    if (idx.recentLearnings.length > 0) {
      for (const learning of idx.recentLearnings.slice(0, 5)) {
        lines.push(`- ${learning}`);
      }
    } else {
      lines.push('*No recent learnings*');
    }
    lines.push('');

    lines.push('## Handoff');
    if (idx.handoff) {
      lines.push(`**Reason**: ${idx.handoff.reason}`);
      lines.push(`**Resume**: \`${idx.handoff.resumeCommand}\``);
      lines.push(`**Summary**: ${idx.handoff.summary}`);
    } else {
      lines.push('*No pending handoff*');
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## Quick Reference');
    lines.push('');
    lines.push('| Command | Description |');
    lines.push('|---------|-------------|');
    lines.push('| `/sdd <task>` | Start SDD workflow |');
    lines.push('| `/ama <question>` | Ask with Strategic Polling |');
    lines.push('| `/status` | Check current status |');
    lines.push('');
    lines.push('## Context Files');
    lines.push('- [Product](context/product.md)');
    lines.push('- [Tech Stack](context/tech-stack.md)');
    lines.push('- [Workflow](context/workflow.md)');
    lines.push('');
    lines.push('## Learnings');
    lines.push('- [Patterns](learnings/patterns.md)');
    lines.push('- [Decisions](learnings/decisions.md)');
    lines.push('- [Preferences](learnings/preferences.md)');
    lines.push('');

    return lines.join('\n');
  }

  // EPIC OPERATIONS

  /**
   * Create a new epic
   */
  async createEpic(title: string, request: string): Promise<string> {
    await this.loadIndex();

    if (this.index!.activeEpic) {
      throw new Error('Cannot create epic: An active epic already exists. Archive it first.');
    }

    const epicId = generateEpicId(title);
    const epicDir = this.epicPath(epicId);

    // Create epic directory
    await mkdir(epicDir, { recursive: true });

    // Create metadata
    const metadata: EpicMetadata = {
      ...METADATA_TEMPLATE,
      id: epicId,
      title,
      type: 'feature',
      status: 'draft',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    await writeFile(join(epicDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Create spec (draft)
    const specVars = { title, overview: request, date: dateOnly() };
    await writeFile(join(epicDir, 'spec.md'), renderTemplate(SPEC_TEMPLATE, specVars));

    // Create plan (empty)
    const planVars = { title, goal: request, epicId, date: dateOnly() };
    await writeFile(join(epicDir, 'plan.md'), renderTemplate(PLAN_TEMPLATE, planVars));

    // Create log
    const logVars = { title, epicId, date: dateOnly(), timestamp: timestamp() };
    await writeFile(join(epicDir, 'log.md'), renderTemplate(LOG_TEMPLATE, logVars));

    // Update index
    this.index!.activeEpic = { id: epicId, path: `epics/${epicId}` };
    this.index!.meta.phase = 'CLARIFY';
    await this.saveIndex();

    log.info({ epicId }, 'Created epic');
    return epicId;
  }

  /**
   * Get active epic metadata
   */
  async getActiveEpic(): Promise<EpicMetadata | null> {
    await this.loadIndex();

    if (!this.index!.activeEpic) return null;

    const metaPath = join(this.epicPath(this.index!.activeEpic.id), 'metadata.json');
    if (!existsSync(metaPath)) return null;

    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content) as EpicMetadata;
  }

  /**
   * Update epic metadata
   */
  async updateEpicMetadata(epicId: string, updates: Partial<EpicMetadata>): Promise<void> {
    const metaPath = join(this.epicPath(epicId), 'metadata.json');
    const content = await readFile(metaPath, 'utf-8');
    const metadata = JSON.parse(content) as EpicMetadata;

    Object.assign(metadata, updates, { updatedAt: timestamp() });
    await writeFile(metaPath, JSON.stringify(metadata, null, 2));

    log.info({ epicId }, 'Updated epic metadata');
  }

  /**
   * Update epic status
   */
  async updateEpicStatus(epicId: string, status: EpicStatus): Promise<void> {
    await this.updateEpicMetadata(epicId, { status });

    // Update phase in index
    const phaseMap: Record<EpicStatus, Phase> = {
      draft: 'CLARIFY',
      planning: 'PLAN',
      in_progress: 'EXECUTE',
      review: 'REVIEW',
      completed: 'COMPLETE',
      failed: 'COMPLETE',
      paused: 'EXECUTE',
    };

    await this.loadIndex();
    this.index!.meta.phase = phaseMap[status];
    await this.saveIndex();
  }

  /**
   * Archive the active epic
   */
  async archiveEpic(outcome?: Outcome): Promise<void> {
    await this.loadIndex();

    if (!this.index!.activeEpic) {
      log.info('No active epic to archive');
      return;
    }

    const epicId = this.index!.activeEpic.id;
    const epicDir = this.epicPath(epicId);
    const archiveDir = join(this.archivePath, epicId);

    // Update metadata with outcome
    const metadata = await this.getActiveEpic();
    if (metadata) {
      await this.updateEpicMetadata(epicId, {
        status: 'completed',
        completedAt: timestamp(),
        outcome: outcome || this.determineOutcome(metadata),
      });
    }

    // Move to archive
    await mkdir(archiveDir, { recursive: true });

    const files = await readdir(epicDir);
    for (const file of files) {
      const src = join(epicDir, file);
      const dest = join(archiveDir, file);
      const content = await readFile(src, 'utf-8');
      await writeFile(dest, content);
    }

    // Remove from epics
    await rm(epicDir, { recursive: true });

    // Update index
    this.index!.activeEpic = null;
    this.index!.meta.phase = 'CLARIFY';
    await this.saveIndex();

    log.info({ epicId }, 'Archived epic');
  }

  private determineOutcome(metadata: EpicMetadata): Outcome {
    const { total, completed } = metadata.tasksSummary;
    if (completed === total && total > 0) return 'SUCCEEDED';
    if (completed > 0) return 'PARTIAL';
    return 'FAILED';
  }

  // SPEC OPERATIONS

  /**
   * Read specification file
   */
  async readSpec(epicId: string): Promise<string> {
    const specPath = join(this.epicPath(epicId), 'spec.md');
    return await readFile(specPath, 'utf-8');
  }

  /**
   * Write specification file
   */
  async writeSpec(epicId: string, content: string): Promise<void> {
    const specPath = join(this.epicPath(epicId), 'spec.md');
    await writeFile(specPath, content);
    await this.updateEpicMetadata(epicId, { status: 'planning' });
    log.info({ epicId }, 'Updated spec');
  }

  // PLAN OPERATIONS

  /**
   * Read plan file
   */
  async readPlan(epicId: string): Promise<string> {
    const planPath = join(this.epicPath(epicId), 'plan.md');
    return await readFile(planPath, 'utf-8');
  }

  /**
   * Write plan file
   */
  async writePlan(epicId: string, content: string): Promise<void> {
    const planPath = join(this.epicPath(epicId), 'plan.md');
    await writeFile(planPath, content);
    log.info({ epicId }, 'Updated plan');
  }

  /**
   * Update task status in plan file
   */
  async updateTaskInPlan(
    epicId: string,
    taskId: string,
    status: 'completed' | 'failed'
  ): Promise<void> {
    const planPath = join(this.epicPath(epicId), 'plan.md');
    let content = await readFile(planPath, 'utf-8');

    // Replace [ ] Task X.Y with [x] or [!]
    const marker = status === 'completed' ? 'x' : '!';
    const pattern = new RegExp(`\\[ \\] Task ${taskId}:`, 'g');
    content = content.replace(pattern, `[${marker}] Task ${taskId}:`);

    await writeFile(planPath, content);

    // Update metadata task summary
    const completed = (content.match(/\[x\]/g) || []).length;
    const failed = (content.match(/\[!\]/g) || []).length;
    const total = (content.match(/Task \d+\.\d+:/g) || []).length;

    await this.updateEpicMetadata(epicId, {
      tasksSummary: { total, completed, failed },
    });

    log.info({ epicId, taskId, status }, 'Task marked');
  }

  // LOG OPERATIONS

  /**
   * Append to execution log
   */
  async appendLog(epicId: string, entry: LogEntry): Promise<void> {
    const logPath = join(this.epicPath(epicId), 'log.md');
    let content = await readFile(logPath, 'utf-8');

    const logLine = `- [${entry.timestamp}] ${entry.agent}: ${entry.action}${entry.details ? ` - ${entry.details}` : ''}`;

    // Find the right phase section and append
    const phaseHeader = `### Phase: ${entry.phase}`;
    if (content.includes(phaseHeader)) {
      const nextPhase = content.indexOf('### Phase:', content.indexOf(phaseHeader) + 1);
      const insertPos =
        nextPhase > 0 ? nextPhase : content.indexOf('---', content.indexOf(phaseHeader));
      content = content.slice(0, insertPos) + logLine + '\n' + content.slice(insertPos);
    } else {
      // Append at the end before the footer
      const footerPos = content.lastIndexOf('---');
      content =
        content.slice(0, footerPos) + `\n${phaseHeader}\n${logLine}\n\n` + content.slice(footerPos);
    }

    // Update last updated
    content = content.replace(/\*Last updated: [^*]+\*/, `*Last updated: ${dateOnly()}*`);

    await writeFile(logPath, content);
  }

  // LEARNINGS OPERATIONS

  /**
   * Add a learning
   */
  async addLearning(type: LearningType, content: string, source?: string): Promise<void> {
    const fileMap: Record<LearningType, string> = {
      pattern: 'patterns.md',
      antiPattern: 'patterns.md',
      decision: 'decisions.md',
      preference: 'preferences.md',
    };

    const filePath = join(this.learningsPath, fileMap[type]);
    let fileContent = await readFile(filePath, 'utf-8');

    const entry = `- **[${dateOnly()}]** ${content}${source ? ` (${source})` : ''}`;

    // Insert after "## Recent" header
    const insertMarker = '## Recent';
    const insertPos = fileContent.indexOf(insertMarker);
    if (insertPos >= 0) {
      const afterHeader = fileContent.indexOf('\n', insertPos) + 1;
      fileContent =
        fileContent.slice(0, afterHeader) + '\n' + entry + fileContent.slice(afterHeader);
    }

    await writeFile(filePath, fileContent);

    // Update index recent learnings
    await this.loadIndex();
    const summary = `[${type}] ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`;
    this.index!.recentLearnings.unshift(summary);
    this.index!.recentLearnings = this.index!.recentLearnings.slice(0, 5);
    await this.saveIndex();

    log.info({ type, content: content.slice(0, 50) }, 'Added learning');
  }

  /**
   * Read learnings of a specific type
   */
  async readLearnings(type: LearningType): Promise<string[]> {
    const fileMap: Record<LearningType, string> = {
      pattern: 'patterns.md',
      antiPattern: 'patterns.md',
      decision: 'decisions.md',
      preference: 'preferences.md',
    };

    const filePath = join(this.learningsPath, fileMap[type]);
    const content = await readFile(filePath, 'utf-8');

    const learnings: string[] = [];
    for (const line of content.split('\n')) {
      if (line.startsWith('- **[')) {
        // Extract content after date
        const match = line.match(/\*\*\[[^\]]+\]\*\* (.+)/);
        if (match) learnings.push(match[1]);
      }
    }

    return learnings;
  }

  // CONTEXT OPERATIONS

  /**
   * Read context file
   */
  async readContext(type: 'product' | 'tech-stack' | 'workflow'): Promise<string> {
    const filePath = join(this.contextPath, `${type}.md`);
    return await readFile(filePath, 'utf-8');
  }

  /**
   * Write context file
   */
  async writeContext(type: 'product' | 'tech-stack' | 'workflow', content: string): Promise<void> {
    const filePath = join(this.contextPath, `${type}.md`);
    await writeFile(filePath, content);
    log.info({ type }, 'Updated context');
  }

  // HANDOFF OPERATIONS

  /**
   * Create handoff for session break
   */
  async createHandoff(
    reason: 'context_limit' | 'user_exit' | 'session_break',
    resumeCommand: string,
    summary: string
  ): Promise<void> {
    await this.loadIndex();

    this.index!.handoff = { reason, resumeCommand, summary };
    await this.saveIndex();

    log.info({ reason }, 'Created handoff');
  }

  /**
   * Clear handoff after resume
   */
  async clearHandoff(): Promise<void> {
    await this.loadIndex();

    this.index!.handoff = null;
    await this.saveIndex();

    log.info('Cleared handoff');
  }

  // STATUS

  /**
   * Get current status summary
   */
  async getStatus(): Promise<{
    initialized: boolean;
    phase: Phase;
    activeEpic: EpicMetadata | null;
    hasHandoff: boolean;
    recentLearnings: string[];
  }> {
    const initialized = await this.isInitialized();
    if (!initialized) {
      return {
        initialized: false,
        phase: 'CLARIFY',
        activeEpic: null,
        hasHandoff: false,
        recentLearnings: [],
      };
    }

    await this.loadIndex();
    const activeEpic = await this.getActiveEpic();

    return {
      initialized: true,
      phase: this.index!.meta.phase,
      activeEpic,
      hasHandoff: this.index!.handoff !== null,
      recentLearnings: this.index!.recentLearnings,
    };
  }
}

// Singleton instance
let instance: FileBasedLedger | null = null;

export function getFileLedger(baseDir?: string): FileBasedLedger {
  if (!instance || (baseDir && instance['baseDir'] !== baseDir)) {
    instance = new FileBasedLedger(baseDir);
  }
  return instance;
}

export function resetFileLedger(): void {
  instance = null;
}
