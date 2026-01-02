/**
 * File-Based Ledger Tests (v6.0)
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { FileBasedLedger, resetFileLedger } from './index';
import { rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = '/tmp/opencode-test-' + Date.now();

describe('FileBasedLedger', () => {
  let ledger: FileBasedLedger;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    resetFileLedger();
    ledger = new FileBasedLedger(TEST_DIR);
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should detect uninitialized state', async () => {
      const isInit = await ledger.isInitialized();
      expect(isInit).toBe(false);
    });

    it('should initialize directory structure', async () => {
      await ledger.initialize();

      expect(existsSync(join(TEST_DIR, '.opencode/LEDGER.md'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/context/product.md'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/context/tech-stack.md'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/context/workflow.md'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/learnings/patterns.md'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/epics'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.opencode/archive'))).toBe(true);
    });

    it('should detect initialized state', async () => {
      await ledger.initialize();
      const isInit = await ledger.isInitialized();
      expect(isInit).toBe(true);
    });
  });

  describe('epic operations', () => {
    beforeEach(async () => {
      await ledger.initialize();
    });

    it('should create a new epic', async () => {
      const epicId = await ledger.createEpic('Add authentication', 'Implement JWT auth');

      expect(epicId).toContain('add_authentication');
      expect(existsSync(join(TEST_DIR, `.opencode/epics/${epicId}/spec.md`))).toBe(true);
      expect(existsSync(join(TEST_DIR, `.opencode/epics/${epicId}/plan.md`))).toBe(true);
      expect(existsSync(join(TEST_DIR, `.opencode/epics/${epicId}/log.md`))).toBe(true);
      expect(existsSync(join(TEST_DIR, `.opencode/epics/${epicId}/metadata.json`))).toBe(true);
    });

    it('should get active epic', async () => {
      await ledger.createEpic('Test Epic', 'Test request');
      const epic = await ledger.getActiveEpic();

      expect(epic).not.toBeNull();
      expect(epic!.title).toBe('Test Epic');
      expect(epic!.status).toBe('draft');
    });

    it('should prevent creating epic when one exists', async () => {
      await ledger.createEpic('First', 'First request');

      expect(async () => {
        await ledger.createEpic('Second', 'Second request');
      }).toThrow();
    });

    it('should update epic status', async () => {
      const epicId = await ledger.createEpic('Test', 'Test');
      await ledger.updateEpicStatus(epicId, 'in_progress');

      const epic = await ledger.getActiveEpic();
      expect(epic!.status).toBe('in_progress');
    });

    it('should archive epic', async () => {
      const epicId = await ledger.createEpic('Test', 'Test');
      await ledger.archiveEpic('SUCCEEDED');

      expect(await ledger.getActiveEpic()).toBeNull();
      expect(existsSync(join(TEST_DIR, `.opencode/archive/${epicId}/spec.md`))).toBe(true);
    });
  });

  describe('spec and plan operations', () => {
    let epicId: string;

    beforeEach(async () => {
      await ledger.initialize();
      epicId = await ledger.createEpic('Test', 'Test');
    });

    it('should read spec file', async () => {
      const spec = await ledger.readSpec(epicId);
      expect(spec).toContain('Specification');
    });

    it('should write spec file', async () => {
      const newSpec = '# New Spec\n\nUpdated content';
      await ledger.writeSpec(epicId, newSpec);

      const spec = await ledger.readSpec(epicId);
      expect(spec).toBe(newSpec);
    });

    it('should read plan file', async () => {
      const plan = await ledger.readPlan(epicId);
      expect(plan).toContain('Implementation Plan');
    });

    it('should write plan file', async () => {
      const newPlan = '# New Plan\n\n- [ ] Task 1.1: First task';
      await ledger.writePlan(epicId, newPlan);

      const plan = await ledger.readPlan(epicId);
      expect(plan).toBe(newPlan);
    });

    it('should update task status in plan', async () => {
      const planWithTasks = `# Plan
## Phase 1
- [ ] Task 1.1: First task
- [ ] Task 1.2: Second task
`;
      await ledger.writePlan(epicId, planWithTasks);
      await ledger.updateTaskInPlan(epicId, '1.1', 'completed');

      const updated = await ledger.readPlan(epicId);
      expect(updated).toContain('[x] Task 1.1:');
      expect(updated).toContain('[ ] Task 1.2:');
    });
  });

  describe('learnings', () => {
    beforeEach(async () => {
      await ledger.initialize();
    });

    it('should add pattern learning', async () => {
      await ledger.addLearning('pattern', 'Use bcrypt for password hashing', 'auth_epic');

      const learnings = await ledger.readLearnings('pattern');
      expect(learnings).toContain('Use bcrypt for password hashing (auth_epic)');
    });

    it('should add decision learning', async () => {
      await ledger.addLearning('decision', 'Chose PostgreSQL for database');

      const learnings = await ledger.readLearnings('decision');
      expect(learnings.length).toBeGreaterThan(0);
    });

    it('should update recent learnings in index', async () => {
      await ledger.addLearning('pattern', 'Test pattern 1');
      await ledger.addLearning('decision', 'Test decision 1');

      const status = await ledger.getStatus();
      expect(status.recentLearnings.length).toBe(2);
    });
  });

  describe('context operations', () => {
    beforeEach(async () => {
      await ledger.initialize();
    });

    it('should read product context', async () => {
      const product = await ledger.readContext('product');
      expect(product).toContain('Product Context');
    });

    it('should update tech-stack context', async () => {
      const newStack = '# Tech Stack\n\n- TypeScript\n- Bun';
      await ledger.writeContext('tech-stack', newStack);

      const stack = await ledger.readContext('tech-stack');
      expect(stack).toBe(newStack);
    });
  });

  describe('handoff', () => {
    beforeEach(async () => {
      await ledger.initialize();
    });

    it('should create handoff', async () => {
      await ledger.createHandoff('session_break', '/sdd continue auth', 'Implementing auth routes');

      const status = await ledger.getStatus();
      expect(status.hasHandoff).toBe(true);
    });

    it('should clear handoff', async () => {
      await ledger.createHandoff('session_break', '/sdd continue', 'Summary');
      await ledger.clearHandoff();

      const status = await ledger.getStatus();
      expect(status.hasHandoff).toBe(false);
    });
  });

  describe('status', () => {
    it('should return uninitialized status', async () => {
      const status = await ledger.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.activeEpic).toBeNull();
    });

    it('should return full status after init', async () => {
      await ledger.initialize();
      await ledger.createEpic('Test', 'Test request');

      const status = await ledger.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.phase).toBe('CLARIFY');
      expect(status.activeEpic).not.toBeNull();
      expect(status.activeEpic!.title).toBe('Test');
    });
  });
});
