/**
 * Actor Tools - OpenCode Tools for Actor State Management
 *
 * These tools enable the Chief-of-Staff orchestrator to:
 * - Initialize actor state
 * - Transition between phases
 * - Track assumptions
 * - Query current status
 */

import { tool } from '@opencode-ai/plugin';
import {
    ActorState,
    ActorPhase,
    loadActorState,
    saveActorState,
    createInitialState,
    clearActorState,
} from './state';
import { processMessage } from './core';

/**
 * Create all actor-related tools
 */
export function createActorTools(client: any) {
    return {
        /**
         * actor_init - Initialize actor state for orchestration
         */
        actor_init: tool({
            description:
                'Initialize the Chief-of-Staff actor state. Call this at the start of a new orchestration to set goals and constraints.',
            args: {
                goals: tool.schema.array(tool.schema.string()).describe('List of goals for this orchestration'),
                constraints: tool.schema
                    .array(tool.schema.string())
                    .optional()
                    .describe('Constraints to respect during execution'),
                reset: tool.schema
                    .boolean()
                    .optional()
                    .describe('If true, clears existing state and starts fresh'),
            },
            async execute(args, ctx: any) {
                const projectPath = process.cwd();

                // Check for existing state
                const existingState = await loadActorState(projectPath);
                if (existingState && !args.reset) {
                    return JSON.stringify({
                        success: false,
                        error: 'STATE_EXISTS',
                        message: 'Actor state already exists. Use reset: true to start fresh.',
                        currentPhase: existingState.phase,
                    });
                }

                // Clear if resetting
                if (args.reset) {
                    await clearActorState(projectPath);
                }

                // Create new state
                const state = createInitialState(ctx?.sessionID || 'unknown', {
                    goals: args.goals,
                    constraints: args.constraints,
                });

                // Transition to PLANNING phase
                const newState = await processMessage(
                    state,
                    { type: 'phase.change', payload: { from: 'INIT', to: 'PLANNING' } },
                    projectPath
                );

                return JSON.stringify({
                    success: true,
                    message: 'Actor initialized successfully',
                    state: {
                        phase: newState.phase,
                        goals: newState.direction.goals,
                        constraints: newState.direction.constraints,
                        sessionId: newState.sessionId,
                    },
                });
            },
        }),

        /**
         * actor_phase - Transition to a new phase
         */
        actor_phase: tool({
            description: 'Transition the actor to a new workflow phase. Use after completing current phase.',
            args: {
                phase: tool.schema
                    .enum(['PLANNING', 'VALIDATING', 'EXECUTING', 'COMPLETED', 'FAILED'])
                    .describe('Target phase'),
                reason: tool.schema.string().optional().describe('Reason for transition'),
            },
            async execute(args) {
                const projectPath = process.cwd();
                const state = await loadActorState(projectPath);

                if (!state) {
                    return JSON.stringify({
                        success: false,
                        error: 'NO_STATE',
                        message: 'No actor state found. Call actor_init first.',
                    });
                }

                const newState = await processMessage(
                    state,
                    {
                        type: 'phase.change',
                        payload: {
                            from: state.phase,
                            to: args.phase,
                            reason: args.reason,
                        },
                    },
                    projectPath
                );

                return JSON.stringify({
                    success: true,
                    previousPhase: state.phase,
                    currentPhase: newState.phase,
                    reason: args.reason,
                });
            },
        }),

        /**
         * actor_assumption - Track an assumption
         */
        actor_assumption: tool({
            description:
                'Track an assumption made during orchestration. Assumptions should be surfaced to user periodically.',
            args: {
                assumed: tool.schema.string().describe('What is being assumed'),
                confidence: tool.schema
                    .number()
                    .min(0)
                    .max(1)
                    .describe('Confidence level (0-1)'),
                worker: tool.schema.string().optional().describe('Which worker/agent made this assumption'),
            },
            async execute(args, ctx: any) {
                const projectPath = process.cwd();
                const state = await loadActorState(projectPath);

                if (!state) {
                    return JSON.stringify({
                        success: false,
                        error: 'NO_STATE',
                        message: 'No actor state found. Call actor_init first.',
                    });
                }

                const newState = await processMessage(
                    state,
                    {
                        type: 'assumption.track',
                        payload: {
                            assumed: args.assumed,
                            confidence: args.confidence,
                            worker: args.worker || 'chief-of-staff',
                        },
                    },
                    projectPath
                );

                // Check if we should surface assumptions to user
                const unverifiedCount = newState.assumptions.filter((a) => !a.verified).length;
                const shouldSurface = unverifiedCount >= 3 || args.confidence < 0.6;

                return JSON.stringify({
                    success: true,
                    assumptionCount: newState.assumptions.length,
                    unverifiedCount,
                    shouldSurface,
                    message: shouldSurface
                        ? 'Consider surfacing assumptions to user for verification'
                        : 'Assumption tracked',
                });
            },
        }),

        /**
         * actor_verify_assumption - Verify or reject an assumption
         */
        actor_verify_assumption: tool({
            description: 'Mark an assumption as verified or rejected based on user feedback.',
            args: {
                assumed: tool.schema.string().describe('The assumption to verify'),
                verified: tool.schema.boolean().describe('Whether the assumption is verified'),
                feedback: tool.schema.string().optional().describe('User feedback'),
            },
            async execute(args) {
                const projectPath = process.cwd();
                const state = await loadActorState(projectPath);

                if (!state) {
                    return JSON.stringify({
                        success: false,
                        error: 'NO_STATE',
                        message: 'No actor state found.',
                    });
                }

                const newState = await processMessage(
                    state,
                    {
                        type: 'assumption.verify',
                        payload: {
                            assumed: args.assumed,
                            verified: args.verified,
                            feedback: args.feedback,
                        },
                    },
                    projectPath
                );

                return JSON.stringify({
                    success: true,
                    verified: args.verified,
                    feedback: args.feedback,
                });
            },
        }),

        /**
         * actor_status - Get current actor state
         */
        actor_status: tool({
            description: 'Get the current actor state including phase, goals, assumptions, and sub-agents.',
            args: {},
            async execute() {
                const projectPath = process.cwd();
                const state = await loadActorState(projectPath);

                if (!state) {
                    return JSON.stringify({
                        success: true,
                        initialized: false,
                        message: 'No actor state. Call actor_init to start.',
                    });
                }

                const activeSubAgents = Object.values(state.subAgents).filter(
                    (a) => a.status === 'spawned' || a.status === 'running'
                );
                const completedSubAgents = Object.values(state.subAgents).filter((a) => a.status === 'completed');
                const unverifiedAssumptions = state.assumptions.filter((a) => !a.verified);

                return JSON.stringify({
                    success: true,
                    initialized: true,
                    phase: state.phase,
                    sessionId: state.sessionId,
                    direction: state.direction,
                    currentTask: state.currentTask,
                    eventOffset: state.eventOffset,
                    lastUpdated: state.lastUpdated,
                    stats: {
                        activeSubAgents: activeSubAgents.length,
                        completedSubAgents: completedSubAgents.length,
                        totalAssumptions: state.assumptions.length,
                        unverifiedAssumptions: unverifiedAssumptions.length,
                    },
                    activeSubAgents: activeSubAgents.map((a) => ({ agent: a.agent, sessionId: a.sessionId })),
                    unverifiedAssumptions: unverifiedAssumptions.map((a) => ({
                        assumed: a.assumed,
                        confidence: a.confidence,
                    })),
                });
            },
        }),

        /**
         * actor_direction - Update explicit direction
         */
        actor_direction: tool({
            description: 'Update the explicit direction from user (goals, constraints, decisions).',
            args: {
                goals: tool.schema.array(tool.schema.string()).optional().describe('Updated goals'),
                constraints: tool.schema.array(tool.schema.string()).optional().describe('Updated constraints'),
                decisions: tool.schema.array(tool.schema.string()).optional().describe('New decisions to record'),
            },
            async execute(args) {
                const projectPath = process.cwd();
                const state = await loadActorState(projectPath);

                if (!state) {
                    return JSON.stringify({
                        success: false,
                        error: 'NO_STATE',
                        message: 'No actor state found.',
                    });
                }

                const newState = await processMessage(
                    state,
                    {
                        type: 'direction.update',
                        payload: {
                            goals: args.goals,
                            constraints: args.constraints,
                            decisions: args.decisions,
                        },
                    },
                    projectPath
                );

                return JSON.stringify({
                    success: true,
                    direction: newState.direction,
                });
            },
        }),
    };
}
