/**
 * Progress Notification Tests (v5.0)
 *
 * Tests for progress events and status line formatting.
 */

import { describe, expect, it } from 'bun:test';
import { formatStatusLine, AGENT_PHASES, type AgentName } from './progress';
import type { ProgressPayload } from '../durable-stream/types';

// Note: emitProgress, emitPhaseStart, etc. are async and emit events
// These tests focus on the synchronous formatting utilities

describe('Progress Notifications', () => {
  describe('formatStatusLine', () => {
    it('should format status with agent and message', () => {
      const payload: ProgressPayload = {
        agent: 'interviewer',
        phase: 'CLARIFYING',
        message: 'Analyzing requirements...',
      };
      const line = formatStatusLine(payload);

      expect(line).toContain('interviewer');
      expect(line).toContain('Analyzing requirements...');
    });

    it('should format with progress percentage', () => {
      const payload: ProgressPayload = {
        agent: 'executor',
        phase: 'IMPLEMENTING',
        message: 'Implementing task 1',
        progress_percent: 25,
      };
      const line = formatStatusLine(payload);

      expect(line).toContain('executor');
      expect(line).toContain('25%');
      expect(line).toContain('Implementing task 1');
    });

    it('should handle 0% progress', () => {
      const payload: ProgressPayload = {
        agent: 'architect',
        phase: 'DECOMPOSING',
        message: 'Starting decomposition',
        progress_percent: 0,
      };
      const line = formatStatusLine(payload);

      // 0% should not be shown (falsy)
      expect(line).not.toContain('%');
    });

    it('should handle 100% progress', () => {
      const payload: ProgressPayload = {
        agent: 'reviewer',
        phase: 'SUMMARIZING',
        message: 'Review complete',
        progress_percent: 100,
      };
      const line = formatStatusLine(payload);

      expect(line).toContain('100%');
    });

    it('should include phase icon', () => {
      const payload: ProgressPayload = {
        agent: 'debugger',
        phase: 'DIAGNOSING',
        message: 'Finding root cause',
      };
      const line = formatStatusLine(payload);

      // DIAGNOSING has icon 🩺
      expect(line).toContain('🩺');
    });
  });

  describe('AGENT_PHASES', () => {
    it('should have interviewer phases array', () => {
      expect(AGENT_PHASES.interviewer).toBeArray();
      expect(AGENT_PHASES.interviewer).toContain('CLARIFYING');
      expect(AGENT_PHASES.interviewer).toContain('AWAITING_APPROVAL');
    });

    it('should have architect phases array', () => {
      expect(AGENT_PHASES.architect).toBeArray();
      expect(AGENT_PHASES.architect).toContain('DECOMPOSING');
      expect(AGENT_PHASES.architect).toContain('PLANNING');
    });

    it('should have executor phases array', () => {
      expect(AGENT_PHASES.executor).toBeArray();
      expect(AGENT_PHASES.executor).toContain('TESTING');
      expect(AGENT_PHASES.executor).toContain('IMPLEMENTING');
    });

    it('should have reviewer phases array', () => {
      expect(AGENT_PHASES.reviewer).toBeArray();
      expect(AGENT_PHASES.reviewer).toContain('STAGE1_SPEC');
      expect(AGENT_PHASES.reviewer).toContain('STAGE2_QUALITY');
    });

    it('should have validator phases array', () => {
      expect(AGENT_PHASES.validator).toBeArray();
      expect(AGENT_PHASES.validator).toContain('VERIFYING');
    });

    it('should have all 9 agents mapped (including chief-of-staff)', () => {
      const agents: AgentName[] = [
        'chief-of-staff',
        'interviewer',
        'architect',
        'executor',
        'reviewer',
        'validator',
        'debugger',
        'explore',
        'librarian',
      ];

      for (const agent of agents) {
        expect(AGENT_PHASES[agent]).toBeDefined();
        expect(AGENT_PHASES[agent]).toBeArray();
        expect(AGENT_PHASES[agent].length).toBeGreaterThan(0);
      }
    });
  });
});
