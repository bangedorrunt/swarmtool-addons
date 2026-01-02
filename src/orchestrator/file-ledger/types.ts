/**
 * File-Based Ledger Types (v6.0)
 *
 * Hybrid approach: Lightweight LEDGER.md index + file-based epics
 * Inspired by Conductor's file structure but adapted for OpenCode.
 *
 * Structure:
 *   .opencode/
 *   ├── LEDGER.md           # Lightweight index (pointers only)
 *   ├── context/            # Project context
 *   │   ├── product.md
 *   │   ├── tech-stack.md
 *   │   └── workflow.md
 *   ├── epics/              # File-based epics
 *   │   └── <epic_id>/
 *   │       ├── spec.md
 *   │       ├── plan.md
 *   │       ├── log.md
 *   │       └── metadata.json
 *   ├── learnings/          # Persistent learnings
 *   │   ├── patterns.md
 *   │   ├── decisions.md
 *   │   └── preferences.md
 *   └── archive/            # Archived epics (git-tracked)
 *       └── <epic_id>/
 */

// Directory structure constants
export const OPENCODE_DIR = '.opencode';
export const LEDGER_FILE = `${OPENCODE_DIR}/LEDGER.md`;
export const CONTEXT_DIR = `${OPENCODE_DIR}/context`;
export const EPICS_DIR = `${OPENCODE_DIR}/epics`;
export const LEARNINGS_DIR = `${OPENCODE_DIR}/learnings`;
export const ARCHIVE_DIR = `${OPENCODE_DIR}/archive`;

// Epic statuses
export type EpicStatus =
  | 'draft'
  | 'planning'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'failed'
  | 'paused';

// Task statuses
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped';

// Outcome types
export type Outcome = 'SUCCEEDED' | 'PARTIAL' | 'FAILED';

// SDD Phases
export type Phase = 'CLARIFY' | 'PLAN' | 'EXECUTE' | 'REVIEW' | 'COMPLETE';

// Spec requirement priorities
export type Priority = 'must-have' | 'should-have' | 'could-have' | 'wont-have';

// Learning types
export type LearningType = 'pattern' | 'antiPattern' | 'decision' | 'preference';

// Session mode for agents
export type SessionMode = 'inline' | 'child';

/**
 * Lightweight LEDGER.md index (v6.0)
 * Only contains pointers and session state
 */
export interface LedgerIndex {
  meta: {
    version: '6.0';
    sessionId: string;
    phase: Phase;
    lastUpdated: string;
  };
  activeEpic: {
    id: string;
    path: string; // e.g., "epics/auth_20260102"
  } | null;
  recentLearnings: string[]; // Last 5 learning summaries
  handoff: {
    reason: 'context_limit' | 'user_exit' | 'session_break';
    resumeCommand: string;
    summary: string;
  } | null;
}

/**
 * Epic metadata (metadata.json)
 */
export interface EpicMetadata {
  id: string;
  title: string;
  type: 'feature' | 'bug' | 'chore' | 'refactor';
  status: EpicStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  completedAt?: string;
  outcome?: Outcome;
  // Task summary (computed)
  tasksSummary: {
    total: number;
    completed: number;
    failed: number;
  };
  // File impact tracking
  filesModified: string[];
  // Git tracking
  startCommit?: string;
  endCommit?: string;
}

/**
 * Specification file structure (spec.md)
 */
export interface Specification {
  title: string;
  version: string;
  overview: string;
  functionalRequirements: Array<{
    id: string; // FR-001
    priority: Priority;
    description: string;
  }>;
  nonFunctionalRequirements: Array<{
    id: string; // NFR-001
    category: 'performance' | 'security' | 'scalability' | 'usability';
    description: string;
  }>;
  constraints: string[];
  outOfScope: string[];
  acceptanceCriteria: Array<{
    given: string;
    when: string;
    then: string;
  }>;
}

/**
 * Plan file structure (plan.md)
 */
export interface Plan {
  goal: string;
  executionStrategy: 'sequential' | 'parallel' | 'phased';
  currentStateAnalysis: {
    whatExists: string[];
    whatsMissing: string[];
  };
  fileImpact: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
    purpose: string;
  }>;
  phases: Array<{
    id: string; // Phase 1
    name: string;
    tasks: TaskDefinition[];
    checkpoint?: string;
  }>;
  verificationPlan: {
    testCommand: string;
    coverageTarget: string;
    manualSteps: string[];
  };
  risks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  assumptions: string[];
}

/**
 * Task definition in plan
 */
export interface TaskDefinition {
  id: string; // 1.1, 1.2, etc.
  title: string;
  agent: string;
  status: TaskStatus;
  dependencies: string[];
  // Execution tracking
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  // File tracking
  filesModified?: string[];
}

/**
 * Log entry (log.md)
 */
export interface LogEntry {
  timestamp: string;
  agent: string;
  phase: Phase;
  action: string;
  details?: string;
}

/**
 * Learning entry (learnings/*.md)
 */
export interface Learning {
  content: string;
  source: string; // Epic ID or agent name
  createdAt: string;
  tags?: string[];
}

/**
 * Context files (context/*.md)
 */
export interface ProductContext {
  name: string;
  description: string;
  users: string[];
  goals: string[];
  features: string[];
}

export interface TechStackContext {
  language: string;
  runtime: string;
  frameworks: string[];
  databases: string[];
  tools: string[];
  conventions: string[];
}

export interface WorkflowContext {
  methodology: 'tdd' | 'bdd' | 'standard';
  commitStrategy: string;
  branchingModel: string;
  codeReview: boolean;
  qualityGates: string[];
}

/**
 * Review result (from reviewer agent)
 */
export interface ReviewResult {
  phase: 'spec_compliance' | 'code_quality';
  status: 'approved' | 'needs_changes' | 'rejected';
  findings: Array<{
    requirement: string;
    status: 'pass' | 'fail' | 'missing';
    evidence?: string;
  }>;
  summary: string;
  recommendations: string[];
}
