/**
 * Actor Module - Export all actor components
 *
 * This module provides the Actor Model implementation for Chief-of-Staff orchestration.
 */

// State management
export {
    type ActorState,
    type ActorPhase,
    type TrackedAssumption,
    type SubAgentState,
    type ExplicitDirection,
    loadActorState,
    saveActorState,
    clearActorState,
    hasActorState,
    createInitialState,
} from './state';

// Message types
export {
    type ActorMessage,
    type ActorMessageType,
    type UserRequestMessage,
    type SubAgentSpawnMessage,
    type SubAgentCompleteMessage,
    type SubAgentFailedMessage,
    type PhaseChangeMessage,
    type AssumptionTrackMessage,
    type AssumptionVerifyMessage,
    type UserApprovalMessage,
    type DirectionUpdateMessage,
    type TaskUpdateMessage,
    createMessage,
} from './messages';

// Core processing
export { receive, processMessage, resumeFromOffset } from './core';

// Tools
export { createActorTools } from './tools';
