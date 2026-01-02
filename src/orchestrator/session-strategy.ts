/**
 * Session Strategy (v5.0)
 *
 * Defines which agents run inline (visible thinking) vs child sessions (isolated).
 * Implements Hybrid Session Model from Q6: Option C.
 *
 * INLINE: Run in current session - user sees thinking
 * CHILD: Spawn child session - isolated execution
 *
 * Benefits:
 * - Planning visible in main session (transparency)
 * - Execution isolated to avoid context pollution
 * - Best of both worlds
 *
 * NOTE (2026-01-02):
 * Inline mode must NOT call session.prompt() synchronously from inside a tool
 * on the same session (deadlock). This plugin uses deferred same-session
 * prompts via HANDOFF_INTENT + session.promptAsync() (scheduled after tool
 * completion) to preserve inline visibility without re-entrancy.
 */

import { loadLedger } from './ledger';

type HandoffContext = {
  directives: string[];
  decisions: string[];
  plan?: string;
  files_affected?: string[];
  learnings?: string[];
};

/**
 * Session mode for agent execution.
 */
export type SessionMode = 'inline' | 'child';

/**
 * Agent session configuration.
 */
export interface AgentSessionConfig {
  mode: SessionMode;
  reason: string;
  contextRequired: boolean;
}

/**
 * Session mode mapping for each agent.
 *
 * NOTE: All agents currently use 'child' mode due to inline deadlock issue.
 * See file header comment for details.
 *
 * INTENDED modes (when OpenCode supports deferred inline prompts):
 *
 * INLINE agents:
 * - interviewer: User needs to see clarification process
 * - architect: User needs to see planning/decomposition
 * - reviewer: User needs to see review results
 * - validator: User needs to see validation results
 * - debugger: Within executor's session for debugging
 * - explore: Quick search results visible
 *
 * CHILD agents:
 * - executor: Long-running, may modify files, needs isolation
 * - librarian: External research, may be slow
 */
export const AGENT_SESSION_CONFIG: Record<string, AgentSessionConfig> = {
  // INLINE - Visible planning/review
  interviewer: {
    mode: 'inline',
    reason: 'User needs to see clarification process and respond',
    contextRequired: true,
  },
  architect: {
    mode: 'inline',
    reason: 'User needs to see planning/decomposition and approve',
    contextRequired: true,
  },
  reviewer: {
    mode: 'inline',
    reason: 'User needs to see review results immediately',
    contextRequired: true,
  },
  validator: {
    mode: 'inline',
    reason: 'User needs to see validation results immediately',
    contextRequired: true,
  },
  debugger: {
    mode: 'inline',
    reason: 'Debugging visible within executor context',
    contextRequired: true,
  },
  explore: {
    mode: 'inline',
    reason: 'Quick search results should be visible',
    contextRequired: false,
  },

  // CHILD - Always child mode (no change needed)
  executor: {
    mode: 'child',
    reason: 'Long-running, file modifications, needs isolation',
    contextRequired: true,
  },
  librarian: {
    mode: 'child',
    reason: 'External research may be slow, runs in background',
    contextRequired: false,
  },

  // Chief-of-Staff is special - it's the orchestrator
  'chief-of-staff': {
    mode: 'inline',
    reason: 'Orchestrator runs in main session',
    contextRequired: false,
  },
};

/**
 * Get session mode for an agent.
 */
export function getSessionMode(agent: string): SessionMode {
  // Normalize agent name (remove prefix if present)
  const normalizedAgent = agent.replace('chief-of-staff/', '');
  const config = AGENT_SESSION_CONFIG[normalizedAgent];
  return config?.mode ?? 'child'; // Default to child for safety
}

/**
 * Check if agent requires context from LEDGER.
 */
export function requiresContext(agent: string): boolean {
  const normalizedAgent = agent.replace('chief-of-staff/', '');
  const config = AGENT_SESSION_CONFIG[normalizedAgent];
  return config?.contextRequired ?? false;
}

/**
 * Build context for handoff to child session.
 * Extracts directives, decisions, and plan from LEDGER.
 */
export async function buildHandoffContext(
  fromAgent: string,
  fromSession: string,
  toAgent: string
): Promise<HandoffContext> {
  const ledger = await loadLedger();

  const context: HandoffContext = {
    directives: ledger.governance.directives.map((d) => d.content),
    decisions: ledger.epic?.context || [],
    files_affected: [],
    learnings: [],
  };

  // Add current epic context if available
  if (ledger.epic) {
    context.plan = `Epic: ${ledger.epic.title}\nTasks: ${ledger.epic.tasks.map((t) => t.title).join(', ')}`;

    // Collect files from tasks
    for (const task of ledger.epic.tasks) {
      if (task.affectsFiles) {
        context.files_affected?.push(...task.affectsFiles);
      }
    }
  }

  // Add recent learnings
  const recentLearnings = [
    ...ledger.learnings.patterns.slice(-3).map((p) => `[Pattern] ${p}`),
    ...ledger.learnings.antiPatterns.slice(-2).map((p) => `[Anti-Pattern] ${p}`),
  ];
  context.learnings = recentLearnings;

  return context;
}

/**
 * Prepare prompt with context for child session.
 */
export async function prepareChildSessionPrompt(
  originalPrompt: string,
  fromAgent: string,
  fromSession: string,
  toAgent: string
): Promise<string> {
  const context = await buildHandoffContext(fromAgent, fromSession, toAgent);

  // Build context header
  const contextHeader: string[] = [];

  if (context.directives.length > 0) {
    contextHeader.push('## Directives (Mandatory)');
    context.directives.forEach((d) => contextHeader.push(`- ${d}`));
    contextHeader.push('');
  }

  if (context.decisions.length > 0) {
    contextHeader.push('## Decisions Made');
    context.decisions.forEach((d) => contextHeader.push(`- ${d}`));
    contextHeader.push('');
  }

  if (context.plan) {
    contextHeader.push('## Current Plan');
    contextHeader.push(context.plan);
    contextHeader.push('');
  }

  if (context.files_affected && context.files_affected.length > 0) {
    contextHeader.push('## Files Affected');
    context.files_affected.forEach((f) => contextHeader.push(`- ${f}`));
    contextHeader.push('');
  }

  if (context.learnings && context.learnings.length > 0) {
    contextHeader.push('## Relevant Learnings');
    context.learnings.forEach((l) => contextHeader.push(`- ${l}`));
    contextHeader.push('');
  }

  if (contextHeader.length > 0) {
    contextHeader.push('---');
    contextHeader.push('');
  }

  return contextHeader.join('\n') + originalPrompt;
}
