/**
 * Actor Message Types
 *
 * Defines the message types that the Actor can receive and process.
 * These messages drive state transitions and are logged to the durable event stream.
 */

/**
 * User request message - starts or continues orchestration
 */
export interface UserRequestMessage {
    type: 'user.request';
    payload: {
        prompt: string;
        context?: Record<string, any>;
    };
}

/**
 * Sub-agent spawn message - tracks when we spawn a child agent
 */
export interface SubAgentSpawnMessage {
    type: 'subagent.spawn';
    payload: {
        agent: string;
        sessionId: string;
        prompt: string;
    };
}

/**
 * Sub-agent completion message - tracks when a child agent finishes
 */
export interface SubAgentCompleteMessage {
    type: 'subagent.complete';
    payload: {
        sessionId: string;
        agent: string;
        result: any;
    };
}

/**
 * Sub-agent failure message - tracks when a child agent fails
 */
export interface SubAgentFailedMessage {
    type: 'subagent.failed';
    payload: {
        sessionId: string;
        agent: string;
        error: string;
    };
}

/**
 * Phase transition message - tracks workflow phase changes
 */
export interface PhaseChangeMessage {
    type: 'phase.change';
    payload: {
        from: string;
        to: string;
        reason?: string;
    };
}

/**
 * Assumption tracking message - records an assumption made
 */
export interface AssumptionTrackMessage {
    type: 'assumption.track';
    payload: {
        assumed: string;
        confidence: number;
        worker: string;
    };
}

/**
 * Assumption verification message - marks an assumption as verified/rejected
 */
export interface AssumptionVerifyMessage {
    type: 'assumption.verify';
    payload: {
        assumed: string;
        verified: boolean;
        feedback?: string;
    };
}

/**
 * User approval message - for dialogue mode approval gates
 */
export interface UserApprovalMessage {
    type: 'user.approval';
    payload: {
        approved: boolean;
        feedback?: string;
        approvedItem?: string;
    };
}

/**
 * Direction update message - when user provides explicit direction
 */
export interface DirectionUpdateMessage {
    type: 'direction.update';
    payload: {
        goals?: string[];
        constraints?: string[];
        decisions?: string[];
    };
}

/**
 * Task update message - tracks current task
 */
export interface TaskUpdateMessage {
    type: 'task.update';
    payload: {
        task: string;
        status: 'started' | 'completed' | 'failed';
    };
}

/**
 * Union of all actor message types
 */
export type ActorMessage =
    | UserRequestMessage
    | SubAgentSpawnMessage
    | SubAgentCompleteMessage
    | SubAgentFailedMessage
    | PhaseChangeMessage
    | AssumptionTrackMessage
    | AssumptionVerifyMessage
    | UserApprovalMessage
    | DirectionUpdateMessage
    | TaskUpdateMessage;

/**
 * Extract message type literal
 */
export type ActorMessageType = ActorMessage['type'];

/**
 * Create a message with timestamp
 */
export function createMessage<T extends ActorMessage>(
    type: T['type'],
    payload: T['payload']
): T & { timestamp: string } {
    return {
        type,
        payload,
        timestamp: new Date().toISOString(),
    } as unknown as T & { timestamp: string };
}
