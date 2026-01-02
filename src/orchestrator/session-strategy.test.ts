/**
 * Session Strategy Tests (v5.0)
 *
 * Tests for hybrid session mode: inline vs child sessions.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  getSessionMode,
  requiresContext,
  buildHandoffContext,
  prepareChildSessionPrompt,
  AGENT_SESSION_CONFIG,
} from './session-strategy';

// Mock ledger module
vi.mock('./ledger', () => ({
  loadLedger: async () => ({
    governance: {
      directives: [{ content: 'Database: PostgreSQL' }, { content: 'Auth: JWT' }],
    },
    epic: {
      title: 'Test Epic',
      context: ['Context item 1', 'Context item 2'],
      tasks: [
        { title: 'Task 1', affectsFiles: ['src/file1.ts'] },
        { title: 'Task 2', affectsFiles: ['src/file2.ts'] },
      ],
    },
    learnings: {
      patterns: ['Pattern 1', 'Pattern 2', 'Pattern 3', 'Pattern 4'],
      antiPatterns: ['Anti 1', 'Anti 2', 'Anti 3'],
    },
  }),
}));

// Mock progress module
vi.mock('./progress', () => ({
  emitContextHandoff: async () => {},
}));

describe('Session Strategy', () => {
  describe('AGENT_SESSION_CONFIG', () => {
    it('should have 8 active agents configured', () => {
      const activeAgents = [
        'interviewer',
        'architect',
        'executor',
        'reviewer',
        'validator',
        'debugger',
        'explore',
        'librarian',
        'chief-of-staff',
      ];

      for (const agent of activeAgents) {
        expect(AGENT_SESSION_CONFIG[agent]).toBeDefined();
      }
    });

    it('should have correct session modes', () => {
      // v5.x: Hybrid mode (inline planning + child execution)
      expect(AGENT_SESSION_CONFIG.interviewer.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.architect.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.reviewer.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.validator.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.debugger.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.explore.mode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.executor.mode).toBe('child');
      expect(AGENT_SESSION_CONFIG.librarian.mode).toBe('child');
      expect(AGENT_SESSION_CONFIG['chief-of-staff'].mode).toBe('inline');
    });

    it('should preserve intended modes for future reference', () => {
      // These are the intended modes when OpenCode supports deferred inline prompts
      expect(AGENT_SESSION_CONFIG.interviewer.intendedMode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.architect.intendedMode).toBe('inline');
      expect(AGENT_SESSION_CONFIG.executor.intendedMode).toBe('child');
      expect(AGENT_SESSION_CONFIG.librarian.intendedMode).toBe('child');
    });
  });

  describe('getSessionMode', () => {
    it('should return correct mode for known agents', () => {
      expect(getSessionMode('interviewer')).toBe('inline');
      expect(getSessionMode('executor')).toBe('child');
      expect(getSessionMode('librarian')).toBe('child');
    });

    it('should normalize agent names with prefix', () => {
      expect(getSessionMode('chief-of-staff/interviewer')).toBe('inline');
      expect(getSessionMode('chief-of-staff/executor')).toBe('child');
    });

    it('should default to child for unknown agents', () => {
      expect(getSessionMode('unknown-agent')).toBe('child');
    });
  });

  describe('requiresContext', () => {
    it('should return true for context-requiring agents', () => {
      expect(requiresContext('interviewer')).toBe(true);
      expect(requiresContext('architect')).toBe(true);
      expect(requiresContext('executor')).toBe(true);
    });

    it('should return false for quick lookup agents', () => {
      expect(requiresContext('explore')).toBe(false);
      expect(requiresContext('librarian')).toBe(false);
    });
  });

  describe('buildHandoffContext', () => {
    it('should extract directives from LEDGER', async () => {
      const context = await buildHandoffContext('chief-of-staff', 'session-1', 'executor');

      expect(context.directives).toContain('Database: PostgreSQL');
      expect(context.directives).toContain('Auth: JWT');
    });

    it('should extract decisions from epic context', async () => {
      const context = await buildHandoffContext('chief-of-staff', 'session-1', 'executor');

      expect(context.decisions).toContain('Context item 1');
      expect(context.decisions).toContain('Context item 2');
    });

    it('should build plan summary from epic', async () => {
      const context = await buildHandoffContext('chief-of-staff', 'session-1', 'executor');

      expect(context.plan).toContain('Epic: Test Epic');
      expect(context.plan).toContain('Task 1');
      expect(context.plan).toContain('Task 2');
    });

    it('should collect affected files from tasks', async () => {
      const context = await buildHandoffContext('chief-of-staff', 'session-1', 'executor');

      expect(context.files_affected).toContain('src/file1.ts');
      expect(context.files_affected).toContain('src/file2.ts');
    });

    it('should include recent learnings', async () => {
      const context = await buildHandoffContext('chief-of-staff', 'session-1', 'executor');

      expect(context.learnings?.some((l) => l.includes('Pattern'))).toBe(true);
      expect(context.learnings?.some((l) => l.includes('Anti-Pattern'))).toBe(true);
    });
  });

  describe('prepareChildSessionPrompt', () => {
    it('should prepend context header to prompt', async () => {
      const prompt = await prepareChildSessionPrompt(
        'Implement user authentication',
        'chief-of-staff',
        'session-1',
        'executor'
      );

      expect(prompt).toContain('## Directives (Mandatory)');
      expect(prompt).toContain('Database: PostgreSQL');
      expect(prompt).toContain('Implement user authentication');
    });

    it('should include all context sections', async () => {
      const prompt = await prepareChildSessionPrompt(
        'Task prompt',
        'chief-of-staff',
        'session-1',
        'executor'
      );

      expect(prompt).toContain('## Directives');
      expect(prompt).toContain('## Decisions Made');
      expect(prompt).toContain('## Current Plan');
      expect(prompt).toContain('## Files Affected');
      expect(prompt).toContain('## Relevant Learnings');
    });
  });
});
