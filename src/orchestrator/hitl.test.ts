/**
 * HITL (Human-in-the-Loop) Utilities Tests (v5.0)
 *
 * Tests for poll formatting and user response parsing.
 */

import { describe, expect, it } from 'bun:test';
import {
  formatPoll,
  formatConfirmation,
  formatInputRequest,
  formatYieldMessage,
  parseUserResponse,
  type PollOption,
  type PollConfig,
} from './hitl';

describe('HITL Utilities', () => {
  describe('formatPoll', () => {
    it('should format a simple poll with title and options', () => {
      const poll: PollConfig = {
        title: 'Database Selection',
        options: [
          { id: 'postgres', label: 'PostgreSQL' },
          { id: 'sqlite', label: 'SQLite' },
        ],
        allowFreeText: false,
      };

      const result = formatPoll(poll);

      expect(result).toContain('Database Selection');
      expect(result).toContain('[1]');
      expect(result).toContain('PostgreSQL');
      expect(result).toContain('[2]');
      expect(result).toContain('SQLite');
    });

    it('should include description when provided', () => {
      const poll: PollConfig = {
        title: 'Test Poll',
        description: 'This is a detailed description',
        options: [{ id: 'a', label: 'Option A' }],
        allowFreeText: false,
      };

      const result = formatPoll(poll);

      expect(result).toContain('This is a detailed description');
    });

    it('should include option descriptions', () => {
      const poll: PollConfig = {
        title: 'Test Poll',
        options: [
          { id: 'postgres', label: 'PostgreSQL', description: 'Scalable, pgvector support' },
          { id: 'sqlite', label: 'SQLite', description: 'Simple, file-based' },
        ],
        allowFreeText: false,
      };

      const result = formatPoll(poll);

      expect(result).toContain('Scalable, pgvector support');
      expect(result).toContain('Simple, file-based');
    });

    it('should show free text instruction when allowed', () => {
      const poll: PollConfig = {
        title: 'Test Poll',
        options: [{ id: 'a', label: 'Option A' }],
        allowFreeText: true,
      };

      const result = formatPoll(poll);

      expect(result).toContain('write your own answer');
    });

    it('should NOT show free text instruction when not allowed', () => {
      const poll: PollConfig = {
        title: 'Test Poll',
        options: [{ id: 'a', label: 'Option A' }],
        allowFreeText: false,
      };

      const result = formatPoll(poll);

      expect(result).not.toContain('write your own answer');
      expect(result).toContain('Type a number');
    });
  });

  describe('formatConfirmation', () => {
    it('should format confirmation with title and summary', () => {
      const result = formatConfirmation(
        'Approve Specification',
        'Build a REST API with authentication'
      );

      expect(result).toContain('Approve Specification');
      expect(result).toContain('Build a REST API with authentication');
      expect(result).toContain('Confirm?');
      expect(result).toContain('yes');
    });
  });

  describe('formatInputRequest', () => {
    it('should format input request with title and prompt', () => {
      const result = formatInputRequest('Project Name', 'What should we call this project?');

      expect(result).toContain('Project Name');
      expect(result).toContain('What should we call this project?');
      expect(result).toContain('Your response');
    });

    it('should include hint when provided', () => {
      const result = formatInputRequest('API Key', 'Enter your API key', 'Found in settings page');

      expect(result).toContain('Hint: Found in settings page');
    });

    it('should NOT include hint section when not provided', () => {
      const result = formatInputRequest('Name', 'Enter name');

      expect(result).not.toContain('Hint:');
    });
  });

  describe('formatYieldMessage', () => {
    it('should format yield message with agent name and reason', () => {
      const result = formatYieldMessage(
        'interviewer',
        'Need clarification',
        'Missing requirements details'
      );

      expect(result).toContain('interviewer');
      expect(result).toContain('Need clarification');
      expect(result).toContain('Missing requirements details');
    });

    it('should include options when provided', () => {
      const options: PollOption[] = [
        { id: 'option1', label: 'First Choice' },
        { id: 'option2', label: 'Second Choice' },
      ];

      const result = formatYieldMessage(
        'architect',
        'Design decision needed',
        'Context here',
        options
      );

      expect(result).toContain('[1]');
      expect(result).toContain('First Choice');
      expect(result).toContain('[2]');
      expect(result).toContain('Second Choice');
      expect(result).toContain('Options');
    });

    it('should show appropriate instruction without options', () => {
      const result = formatYieldMessage('executor', 'Need input', 'Summary');

      expect(result).toContain('Type your response to continue');
    });

    it('should show choose instruction with options', () => {
      const options: PollOption[] = [{ id: 'a', label: 'A' }];
      const result = formatYieldMessage('validator', 'Approval needed', 'Summary', options);

      expect(result).toContain('Choose an option');
    });
  });

  describe('parseUserResponse', () => {
    const options: PollOption[] = [
      { id: 'postgres', label: 'PostgreSQL' },
      { id: 'sqlite', label: 'SQLite' },
      { id: 'mysql', label: 'MySQL' },
    ];

    it('should parse numeric input as option selection', () => {
      const result = parseUserResponse('1', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('postgres');
      expect(result.value).toBe('PostgreSQL');
    });

    it('should parse second option', () => {
      const result = parseUserResponse('2', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('sqlite');
      expect(result.value).toBe('SQLite');
    });

    it('should parse third option', () => {
      const result = parseUserResponse('3', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('mysql');
      expect(result.value).toBe('MySQL');
    });

    it('should handle whitespace around number', () => {
      const result = parseUserResponse('  2  ', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('sqlite');
    });

    it('should parse exact ID match (case-insensitive)', () => {
      const result = parseUserResponse('POSTGRES', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('postgres');
      expect(result.value).toBe('PostgreSQL');
    });

    it('should parse lowercase ID match', () => {
      const result = parseUserResponse('sqlite', options);

      expect(result.type).toBe('option');
      expect(result.option_id).toBe('sqlite');
    });

    it('should return free text for non-matching input', () => {
      const result = parseUserResponse('I want MongoDB instead', options);

      expect(result.type).toBe('freetext');
      expect(result.value).toBe('I want MongoDB instead');
      expect(result.raw_input).toBe('I want MongoDB instead');
    });

    it('should return free text for out-of-range number', () => {
      const result = parseUserResponse('5', options);

      expect(result.type).toBe('freetext');
      expect(result.value).toBe('5');
    });

    it('should return free text for zero', () => {
      const result = parseUserResponse('0', options);

      expect(result.type).toBe('freetext');
      expect(result.value).toBe('0');
    });

    it('should return free text for negative number', () => {
      const result = parseUserResponse('-1', options);

      expect(result.type).toBe('freetext');
      expect(result.value).toBe('-1');
    });

    it('should preserve raw_input in option response', () => {
      const result = parseUserResponse('  1  ', options);

      expect(result.raw_input).toBe('1');
    });
  });
});
