import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLaneStore } from './memory-store';
import { getDatabasePath } from '../utils/database-path';
import { existsSync, unlinkSync } from 'node:fs';

// Mock fetch for Ollama API
global.fetch = vi.fn() as any;

describe('MemoryLaneStore', () => {
    let store: MemoryLaneStore;
    const testDbPath = getDatabasePath().replace('file:', '');

    beforeEach(async () => {
        // Clear test database if it exists
        if (existsSync(testDbPath)) {
            try { unlinkSync(testDbPath); } catch { }
        }
        store = new MemoryLaneStore();

        // Mock successful Ollama response
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ embedding: new Array(768).fill(0.1) })
        });
    });

    afterEach(async () => {
        await store.close();
        if (existsSync(testDbPath)) {
            try { unlinkSync(testDbPath); } catch { }
        }
    });

    it('should initialize and store a memory', async () => {
        const result = await store.store({
            information: 'Test memory content',
            type: 'insight',
            entities: ['project:test']
        });

        expect(result.id).toBeDefined();
        expect(result.message).toContain('Stored memory');
    });

    it('should find stored memories via semantic search', async () => {
        await store.store({
            information: 'Specific unique insight about testing',
            type: 'insight'
        });

        const findResult = await store.smartFind({
            query: 'testing insight',
            limit: 5
        });

        expect(findResult.count).toBeGreaterThan(0);
        expect(findResult.results[0].content).toContain('insight about testing');
    });

    it('should filter by entities', async () => {
        await store.store({
            information: 'Project A memory',
            type: 'decision',
            entities: ['project:a']
        });

        await store.store({
            information: 'Project B memory',
            type: 'decision',
            entities: ['project:b']
        });

        const findResult = await store.smartFind({
            query: 'Project',
            entities: ['project:a']
        });

        expect(findResult.count).toBe(1);
        expect(findResult.results[0].content).toContain('Project A');
    });

    it('should apply feedback signals', async () => {
        const storeResult = await store.store({
            information: 'Feedback test',
            type: 'learning'
        });

        await store.recordFeedback(storeResult.id, 'helpful');

        const findResult = await store.smartFind({ query: 'Feedback' });
        expect(findResult.results[0].metadata.feedback_score).toBeGreaterThan(1.0);
    });
});
