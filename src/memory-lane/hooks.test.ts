/**
 * Tests for memory-lane hooks
 *
 * Test-Driven Development approach for refactored hooks.ts:
 * - Removed swarm-mail polling (createSwarmCompletionHook no longer exists)
 * - Added tool.execute.after integration tests
 * - Preserved triggerMemoryExtraction() function tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { triggerMemoryExtraction } from './hooks';
import type { SwarmCompletionData } from './hooks';

// Helper for testing file operations
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readFileSync, unlinkSync } from 'fs';

describe('triggerMemoryExtraction', () => {
  let projectPath: string;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let originalBunDollar: any;

  beforeEach(() => {
    // Create unique test directory
    projectPath = `/tmp/test-hooks-${Date.now()}-${Math.random()}`;
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
    }

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Store original Bun.$ and replace with mock
    originalBunDollar = (globalThis as any).Bun.$;
  });

  // eslint-disable-next-line no-unused-vars
  const createMockShell = (captureCallback: (cmd: string) => void, shouldFail = false) => {
    const mockFn = (strings: TemplateStringsArray, ...values: any[]) => {
      const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
      captureCallback(cmd);

      const promise = shouldFail
        ? Promise.reject(new Error('Spawn failed'))
        : Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });

      const chainable = Object.assign(promise, {
        quiet: () => chainable,
        nothrow: () => chainable,
        signal: () => chainable,
      });

      return chainable;
    };
    return vi.fn().mockImplementation(mockFn);
  };

  afterEach(() => {
    // Restore original Bun.$
    if (originalBunDollar) {
      (globalThis as any).Bun.$ = originalBunDollar;
    }

    // Clean up test directory
    try {
      const hiveDir = join(projectPath, '.hive');
      if (existsSync(hiveDir)) {
        // Just empty the log file instead of deleting dir to avoid potential issues
        const logFile = join(hiveDir, 'memory-lane.log');
        if (existsSync(logFile)) {
          unlinkSync(logFile);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should log extraction trigger with bead_id', async () => {
      const outcomeData: SwarmCompletionData = {
        bead_id: 'bd-test-123',
        summary: 'Test task completed',
        files_touched: ['src/test.ts'],
        success: true,
        duration_ms: 120000,
      };

      // Mock Bun.$ to capture command without complex chaining
      let capturedCommand = '';
      (globalThis as any).Bun.$ = createMockShell((cmd) => {
        capturedCommand = cmd;
      });

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      // Verify logging via file
      const logFile = join(projectPath, '.hive', 'memory-lane.log');
      expect(existsSync(logFile)).toBe(true);
      const logContent = readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Triggering extraction for task bd-test-123');

      // Verify command was called (basic check)
      expect(capturedCommand).toContain('opencode run --agent "swarm/worker"');
      expect(capturedCommand).toContain('SYSTEM: Memory Lane Extraction');
      expect(capturedCommand).toContain('CONTEXT: Task bd-test-123 completed');
      expect(capturedCommand).toContain('SUMMARY: Test task completed');
    });

    it('should handle missing optional fields gracefully', async () => {
      const outcomeData: SwarmCompletionData = {
        summary: 'Minimal test task',
        files_touched: [],
        success: true,
        duration_ms: 5000,
      };

      let capturedCommand = '';
      (globalThis as any).Bun.$ = createMockShell((cmd) => {
        capturedCommand = cmd;
      });

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      // Should still log extraction trigger (with 'unknown' for missing bead_id)
      const logFile = join(projectPath, '.hive', 'memory-lane.log');
      const logContent = readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Triggering extraction for task unknown');

      // Should still attempt to spawn process
      expect(capturedCommand).toContain('opencode run --agent "swarm/worker"');
      expect(capturedCommand).toContain('CONTEXT: Task unknown completed');
      expect(capturedCommand).toContain('SUMMARY: Minimal test task');
    });
  });

  describe('Transcript handling', () => {
    it('should include transcript when provided', async () => {
      const outcomeData: SwarmCompletionData = {
        summary: 'Test with transcript',
        files_touched: [],
        success: true,
        duration_ms: 1000,
        transcript: 'This is a test transcript',
      };

      let capturedCommand = '';
      (globalThis as any).Bun.$ = createMockShell((cmd) => {
        capturedCommand = cmd;
      });

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      expect(capturedCommand).toContain('TRANSCRIPT (TRUNCATED):');
      expect(capturedCommand).toContain('This is a test transcript');
    });

    it('should handle missing transcript with appropriate message', async () => {
      const outcomeData: SwarmCompletionData = {
        summary: 'Test without transcript',
        files_touched: [],
        success: true,
        duration_ms: 1000,
      };

      let capturedCommand = '';
      (globalThis as any).Bun.$ = createMockShell((cmd) => {
        capturedCommand = cmd;
      });

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      expect(capturedCommand).toContain('TRANSCRIPT (TRUNCATED):');
      expect(capturedCommand).toContain(
        'Not provided in immediate outcome. Memory-catcher will fetch from swarm-mail if needed.'
      );
    });

    it('should truncate very long transcripts', async () => {
      const longTranscript = 'a'.repeat(20000); // Very long transcript
      const outcomeData: SwarmCompletionData = {
        summary: 'Test with long transcript',
        files_touched: [],
        success: true,
        duration_ms: 1000,
        transcript: longTranscript,
      };

      let capturedCommand = '';
      (globalThis as any).Bun.$ = createMockShell((cmd) => {
        capturedCommand = cmd;
      });

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      expect(capturedCommand).toContain('TRANSCRIPT (TRUNCATED):');
      expect(capturedCommand).toContain('a'.repeat(16000)); // Should be truncated
      expect(capturedCommand).toContain(
        '[... TRANSCRIPT TRUNCATED TO 16000 CHARACTERS TO PREVENT CONTEXT ROT ...]'
      );
      expect(capturedCommand.length).toBeLessThan(longTranscript.length + 1000); // Should be shorter than full
    });
  });

  describe('Error handling', () => {
    it('should handle missing shell helper gracefully', async () => {
      const outcomeData: SwarmCompletionData = {
        summary: 'Test without shell',
        files_touched: [],
        success: true,
        duration_ms: 1000,
      };

      await triggerMemoryExtraction(projectPath, outcomeData, undefined);

      const logFile = join(projectPath, '.hive', 'memory-lane.log');
      const logContent = readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Shell helper ($) unavailable - skipping spawn');
    });

    it('should handle process spawn errors gracefully', async () => {
      const outcomeData: SwarmCompletionData = {
        summary: 'Test with spawn error',
        files_touched: [],
        success: true,
        duration_ms: 1000,
      };

      (globalThis as any).Bun.$ = createMockShell(() => {}, true);

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      // Spawn errors are logged via logToFile (implied by quiet() in implementation if needed,
      // but current implementation catches it and logs to logToFile)
      const logFile = join(projectPath, '.hive', 'memory-lane.log');
      const logContent = readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Spawn error: Error: Spawn failed');
    });
  });

  describe('File logging', () => {
    it('should write log file to .hive directory', async () => {
      const outcomeData: SwarmCompletionData = {
        bead_id: 'bd-logging-test',
        summary: 'Logging test',
        files_touched: [],
        success: true,
        duration_ms: 1000,
      };

      (globalThis as any).Bun.$ = createMockShell(() => {});

      await triggerMemoryExtraction(projectPath, outcomeData, (globalThis as any).Bun.$);

      // Verify log file was created
      const logFile = join(projectPath, '.hive', 'memory-lane.log');
      expect(existsSync(logFile)).toBe(true);

      const logContent = readFileSync(logFile, 'utf8');
      expect(logContent).toContain('Triggering extraction for task bd-logging-test');
      expect(logContent).toContain('Spawning opencode CLI for memory-catcher...');
      expect(logContent).toContain('CLI process exited with code 0');
    });
  });
});

describe('SwarmCompletionData interface validation', () => {
  it('should accept valid data structure', () => {
    const validData: SwarmCompletionData = {
      bead_id: 'bd-valid',
      epic_id: 'epic-valid',
      agent_name: 'test-agent',
      summary: 'Valid summary',
      files_touched: ['file1.ts', 'file2.ts'],
      success: true,
      duration_ms: 60000,
      error_count: 0,
      evaluation: 'Good work',
      transcript: 'Session transcript',
    };

    // Should not throw during type checking
    expect(validData.summary).toBe('Valid summary');
    expect(validData.files_touched).toEqual(['file1.ts', 'file2.ts']);
    expect(validData.success).toBe(true);
    expect(validData.duration_ms).toBe(60000);
  });

  it('should handle minimal required data', () => {
    const minimalData: SwarmCompletionData = {
      summary: 'Minimal summary',
      files_touched: [],
      success: false,
      duration_ms: 1000,
    };

    expect(minimalData.bead_id).toBeUndefined();
    expect(minimalData.epic_id).toBeUndefined();
    expect(minimalData.agent_name).toBeUndefined();
    expect(minimalData.error_count).toBeUndefined();
    expect(minimalData.evaluation).toBeUndefined();
    expect(minimalData.transcript).toBeUndefined();
  });
});

// Note: tool.execute.after integration tests are handled at plugin level (src/index.ts)
// The triggerMemoryExtraction function is tested in isolation above with mocked shell helpers
