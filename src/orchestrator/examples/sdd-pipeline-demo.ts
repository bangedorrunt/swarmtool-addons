/**
 * Skill-Based Subagent System - Demo Workflow
 *
 * This example demonstrates the complete SDD (Spec-Driven Development) pipeline
 * with self-learning hooks and Chief-of-Staff assumption tracking.
 *
 * Run with: npx ts-node src/orchestrator/examples/sdd-pipeline-demo.ts
 */

import {
    createSessionLearningInjector,
    createSessionLearningCapture,
    trackAssumption,
    getTrackedAssumptions,
} from '../hooks';

// Mock implementations for demo purposes
const mockMemoryLaneFind = async (args: { query: string; limit: number }) => {
    console.log(`[Memory Lane] Searching for: "${args.query}"`);

    // Simulate past learnings
    return {
        memories: [
            {
                id: 'mem-001',
                type: 'preference',
                information: 'User prefers TypeScript for all new projects',
                confidence: 0.95,
            },
            {
                id: 'mem-002',
                type: 'decision',
                information: 'PostgreSQL chosen for database (pgvector support)',
                confidence: 0.9,
            },
        ],
    };
};

const mockSkillAgent = async (args: {
    skill_name: string;
    agent_name: string;
    prompt: string;
    context?: any;
}) => {
    const agentName = `${args.skill_name}/${args.agent_name}`;
    console.log(`\n[Skill Agent] Spawning: ${agentName}`);
    console.log(`[Skill Agent] Prompt: ${args.prompt.slice(0, 100)}...`);

    // Simulate agent responses
    switch (args.agent_name) {
        case 'interviewer':
            return {
                success: true,
                output: {
                    clarifications_resolved: true,
                    responses: [
                        { category: 'auth', answer: 'OAuth with Google and GitHub' },
                        { category: 'database', answer: 'PostgreSQL' },
                    ],
                    explicit_direction: {
                        goals: ['Build auth system with OAuth'],
                        constraints: ['TypeScript only', 'PostgreSQL database'],
                    },
                },
            };

        case 'spec-writer':
            return {
                success: true,
                output: {
                    title: 'User Authentication System',
                    requirements: {
                        functional: [
                            { id: 'FR-001', description: 'Users can register with email' },
                            { id: 'FR-002', description: 'Users can log in with OAuth' },
                        ],
                        non_functional: [
                            { id: 'NFR-001', description: 'Passwords hashed with bcrypt' },
                        ],
                    },
                },
            };

        case 'planner':
            return {
                success: true,
                output: {
                    phases: [
                        { title: 'Setup database schema', files: ['src/db/schema.ts'] },
                        { title: 'Implement auth endpoints', files: ['src/auth/routes.ts'] },
                        { title: 'Add OAuth providers', files: ['src/auth/oauth.ts'] },
                    ],
                },
            };

        case 'validator':
            return {
                success: true,
                output: {
                    verdict: 'PASS',
                    notes: 'Plan is consistent with memory lane precedents',
                },
            };

        case 'executor':
            return {
                success: true,
                output: {
                    files_touched: args.context?.files_assigned || [],
                    tests_passed: true,
                    diagnostics: 0,
                },
            };

        case 'memory-catcher':
            console.log('[Memory Catcher] Extracting learnings from session...');
            return {
                success: true,
                output: {
                    learnings_captured: 3,
                    by_type: { decision: 2, preference: 1 },
                },
            };

        default:
            return { success: false, error: 'Unknown agent' };
    }
};

/**
 * Demo: Complete SDD Pipeline
 */
async function runSDDPipelineDemo() {
    console.log('='.repeat(60));
    console.log('  SKILL-BASED SUBAGENT SYSTEM - SDD PIPELINE DEMO');
    console.log('='.repeat(60));

    // ============================================================
    // PHASE 0: Session Start (Learning Injection)
    // ============================================================
    console.log('\n📚 PHASE 0: Session Start - Learning Injection');
    console.log('-'.repeat(40));

    const learningInjector = createSessionLearningInjector({
        memoryLaneFind: mockMemoryLaneFind,
    });

    const sessionContext = {
        messages: [
            { role: 'user', content: 'Build user authentication with OAuth support' },
        ],
    };

    const injection = await learningInjector.execute(sessionContext);

    if (injection.systemPromptAddition) {
        console.log('\n[Injected Context]:');
        console.log(injection.systemPromptAddition);
    }

    // ============================================================
    // PHASE 1: Interview (if needed)
    // ============================================================
    console.log('\n🎤 PHASE 1: Interview - Clarifying Requirements');
    console.log('-'.repeat(40));

    const interviewResult = await mockSkillAgent({
        skill_name: 'sisyphus',
        agent_name: 'interviewer',
        prompt: 'Clarify requirements for: Build user authentication with OAuth support',
    });

    console.log('[Interview Result]:', JSON.stringify(interviewResult.output, null, 2));

    // ============================================================
    // PHASE 2: Spec Writing
    // ============================================================
    console.log('\n📋 PHASE 2: Spec Writing');
    console.log('-'.repeat(40));

    const specResult = await mockSkillAgent({
        skill_name: 'sisyphus',
        agent_name: 'spec-writer',
        prompt: 'Create spec for authenticated system',
        context: {
            explicit_direction: interviewResult.output?.explicit_direction,
        },
    });

    console.log('[Spec]:', JSON.stringify(specResult.output, null, 2));

    // ============================================================
    // PHASE 3: Planning
    // ============================================================
    console.log('\n📐 PHASE 3: Planning');
    console.log('-'.repeat(40));

    const planResult = await mockSkillAgent({
        skill_name: 'sisyphus',
        agent_name: 'planner',
        prompt: 'Create implementation plan',
        context: {
            spec: specResult.output,
        },
    });

    console.log('[Plan]:', JSON.stringify(planResult.output, null, 2));

    // ============================================================
    // PHASE 4: Validation
    // ============================================================
    console.log('\n✅ PHASE 4: Validation');
    console.log('-'.repeat(40));

    const validationResult = await mockSkillAgent({
        skill_name: 'sisyphus',
        agent_name: 'validator',
        prompt: 'Validate plan against precedents',
        context: {
            plan: planResult.output,
        },
    });

    console.log('[Validation]:', JSON.stringify(validationResult.output, null, 2));

    if (validationResult.output?.verdict !== 'PASS') {
        console.log('❌ Validation failed. Would return to planning phase.');
        return;
    }

    // ============================================================
    // PHASE 5: Execution (with assumption tracking)
    // ============================================================
    console.log('\n🔨 PHASE 5: Execution');
    console.log('-'.repeat(40));

    const phases = planResult.output?.phases || [];

    // Simulate parallel execution with assumption tracking
    for (const phase of phases) {
        console.log(`\n[Executing]: ${phase.title}`);

        // Track an assumption (as Chief-of-Staff would)
        await trackAssumption({
            worker: `executor-${phase.title.replace(/\s+/g, '-').toLowerCase()}`,
            assumed: `Best practices for ${phase.title}`,
            confidence: 0.85,
            verified: false,
            timestamp: new Date().toISOString(),
        });

        await mockSkillAgent({
            skill_name: 'sisyphus',
            agent_name: 'executor',
            prompt: `Implement: ${phase.title}`,
            context: {
                files_assigned: phase.files,
            },
        });

        console.log(`[Complete]: ${phase.title}`);
    }

    // ============================================================
    // PHASE 6: Assumption Surfacing
    // ============================================================
    console.log('\n📢 PHASE 6: Assumption Surfacing');
    console.log('-'.repeat(40));

    const assumptions = await getTrackedAssumptions();

    console.log('\n[Chief-of-Staff] Tracked assumptions:');
    for (const a of assumptions) {
        console.log(`  - ${a.assumed} (${a.worker}, confidence: ${a.confidence})`);
    }

    console.log('\n[Chief-of-Staff] Would surface these to user for verification.');

    // ============================================================
    // PHASE 7: Session End (Learning Capture)
    // ============================================================
    console.log('\n📝 PHASE 7: Session End - Learning Capture');
    console.log('-'.repeat(40));

    const learningCapture = createSessionLearningCapture({
        skillAgent: mockSkillAgent,
    });

    const captureResult = await learningCapture.execute({
        messages: sessionContext.messages,
        modifiedFiles: phases.flatMap((p: any) => p.files),
    });

    console.log('[Learnings Captured]:', captureResult.learnings_captured);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('  PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log(`
Summary:
- Requirements clarified via Interviewer
- Spec created with ${specResult.output?.requirements?.functional?.length || 0} functional requirements
- Plan created with ${phases.length} phases
- Validation: ${validationResult.output?.verdict}
- Execution: All phases complete
- Assumptions tracked: ${assumptions.length}
- Learnings captured for future sessions
`);
}

// Run the demo
runSDDPipelineDemo().catch(console.error);
