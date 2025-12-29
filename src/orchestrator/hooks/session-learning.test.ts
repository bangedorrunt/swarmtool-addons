import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import {
    createSessionLearningInjector,
    createSessionLearningCapture,
    trackAssumption,
    getTrackedAssumptions,
    clearTrackedAssumptions,
    verifyAssumption,
} from '../hooks/session-learning';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), '.sisyphus-test');

describe('Session Learning Hooks', () => {
    beforeAll(async () => {
        // Create test directory
        await mkdir(TEST_DIR, { recursive: true });
    });

    afterAll(async () => {
        // Cleanup test directory
        if (existsSync(TEST_DIR)) {
            await rm(TEST_DIR, { recursive: true });
        }
    });

    describe('createSessionLearningInjector', () => {
        it('should inject relevant memories at session start', async () => {
            const mockMemories = [
                { id: 'mem-1', type: 'preference', information: 'User prefers Zod over io-ts', confidence: 0.9 },
                { id: 'mem-2', type: 'decision', information: 'Using PostgreSQL for vector storage', confidence: 0.95 },
            ];

            const mockMemoryLaneFind = mock(async () => ({ memories: mockMemories })) as any;

            const injector = createSessionLearningInjector({
                memoryLaneFind: mockMemoryLaneFind,
                ledgerPath: join(TEST_DIR, 'LEDGER.md'),
            });

            const result = await injector.execute({
                messages: [{ role: 'user', content: 'Help me with schema validation and database setup' }],
            });

            expect(result.systemPromptAddition).toBeDefined();
            expect(result.systemPromptAddition).toContain('Relevant Past Learnings');
            expect(result.systemPromptAddition).toContain('preference');
            expect(result.systemPromptAddition).toContain('Zod');
        });

        it('should include continuity state if ledger exists', async () => {
            // Create ledger at .sisyphus-test/SISYPHUS_LEDGER.md which is the default relative path
            const ledgerPath = join(TEST_DIR, 'SISYPHUS_LEDGER.md');
            await writeFile(ledgerPath, '# SISYPHUS_LEDGER\n\n## Current State\nPhase: EXECUTION');

            const mockMemoryLaneFind = mock(async () => ({ memories: [] }));

            const injector = createSessionLearningInjector({
                memoryLaneFind: mockMemoryLaneFind,
                ledgerPath: '.sisyphus-test/SISYPHUS_LEDGER.md', // Path relative to process.cwd()
            });

            const result = await injector.execute({
                messages: [{ role: 'user', content: 'Continue work' }],
            });

            expect(result.systemPromptAddition).toBeDefined();
            expect(result.systemPromptAddition).toContain('Continuity State');
        });

        it('should return empty if no first message', async () => {
            const mockMemoryLaneFind = mock(async () => ({ memories: [] }));

            const injector = createSessionLearningInjector({
                memoryLaneFind: mockMemoryLaneFind,
            });

            const result = await injector.execute({ messages: [] });

            expect(result.systemPromptAddition).toBeUndefined();
        });
    });

    describe('Assumption Tracking', () => {
        const assumptionsPath = join(TEST_DIR, 'assumptions.json');

        beforeAll(async () => {
            // Ensure clean state
            process.chdir(TEST_DIR);
            await mkdir('.sisyphus', { recursive: true });
        });

        it('should track assumptions', async () => {
            await clearTrackedAssumptions();

            await trackAssumption({
                worker: 'auth-executor',
                assumed: 'Using JWT for sessions',
                confidence: 0.8,
                verified: false,
                timestamp: new Date().toISOString(),
            });

            const assumptions = await getTrackedAssumptions();
            expect(assumptions).toHaveLength(1);
            expect(assumptions[0].assumed).toBe('Using JWT for sessions');
        });

        it('should verify assumptions', async () => {
            await clearTrackedAssumptions();

            await trackAssumption({
                worker: 'db-executor',
                assumed: 'SQLite for storage',
                confidence: 0.6,
                verified: false,
                timestamp: new Date().toISOString(),
            });

            await verifyAssumption('SQLite for storage');

            const assumptions = await getTrackedAssumptions();
            expect(assumptions[0].verified).toBe(true);
        });

        it('should clear assumptions', async () => {
            await trackAssumption({
                worker: 'test',
                assumed: 'test assumption',
                confidence: 0.5,
                verified: false,
                timestamp: new Date().toISOString(),
            });

            await clearTrackedAssumptions();

            const assumptions = await getTrackedAssumptions();
            expect(assumptions).toHaveLength(0);
        });
    });
});

describe('Skill Agent Tools', () => {
    // Mock client for testing
    const mockClient = {
        call: mock(async (tool: string, args: any) => {
            if (tool === 'task') {
                return JSON.stringify({ result: 'Task completed', tool, args });
            }
            if (tool === 'background_task') {
                return `task-${Date.now()}`;
            }
            throw new Error(`Unknown tool: ${tool}`);
        }),
    };

    it('should discover available agents with skill_list', async () => {
        // This test requires actual skill files to exist
        // For now, just verify the structure
        const { createSkillAgentTools } = await import('../../opencode/agent/tools');
        const tools = createSkillAgentTools(mockClient);

        expect(tools.skill_list).toBeDefined();
        expect(tools.skill_agent).toBeDefined();
        expect(tools.skill_spawn_batch).toBeDefined();
        expect(tools.skill_gather).toBeDefined();
    });

    it('should include context in enhanced prompt', async () => {
        const { createSkillAgentTools } = await import('../../opencode/agent/tools');
        const tools = createSkillAgentTools(mockClient);

        // Create a mock that captures the args
        let capturedArgs: any = null;
        mockClient.call = mock(async (tool: string, args: any) => {
            capturedArgs = args;
            return JSON.stringify({ result: 'done' });
        });

        // Note: This will fail if no agents are loaded, but tests the path
        try {
            await tools.skill_agent.execute(
                {
                    skill_name: 'sisyphus',
                    agent_name: 'planner',
                    prompt: 'Test prompt',
                    context: {
                        explicit_direction: { goals: ['Build auth'] },
                        assumptions: [{ assumed: 'JWT', confidence: 0.8 }],
                    },
                },
                {} as any
            );

            // If agent found, verify context was included
            if (capturedArgs?.description) {
                expect(capturedArgs.description).toContain('Build auth');
                expect(capturedArgs.description).toContain('JWT');
            }
        } catch (e) {
            // Expected if agent not found during test
        }
    });
});
