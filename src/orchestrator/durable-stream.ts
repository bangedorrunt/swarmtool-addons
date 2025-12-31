/**
 * Durable Stream Orchestration - Event-Driven Coordination + Context Preservation
 *
 * Optimized patterns for skill-based agents:
 * 1. Event-Driven Coordination: Use OpenCode's native event system instead of polling
 * 2. Context Preservation: Automatic context snapshotting for agent handoffs
 * 3. Human-in-Loop Checkpoints: Pause/resume at decision points with user approval
 * 4. Session Lineage Tracking: Full trace of agent interactions
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: number;
  sessionId: string;
  parentEventId?: string;
  agent?: string;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
  checkpoint?: HumanCheckpoint;
}

export type StreamEventInput = Omit<StreamEvent, 'id' | 'timestamp' | 'metadata'> & {
  metadata?: EventMetadataInput;
};

export interface EventMetadataInput {
  sourceAgent?: string;
  targetAgent?: string;
  duration?: number;
  retryCount?: number;
}

export type StreamEventType =
  | 'session.created'
  | 'session.resumed'
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'handoff.initiated'
  | 'handoff.completed'
  | 'context.snapshot'
  | 'context.restored'
  | 'checkpoint.requested'
  | 'checkpoint.approved'
  | 'checkpoint.rejected'
  | 'human.intervention'
  | 'human.approved'
  | 'human.rejected'
  | 'learning.extracted'
  | 'error.recovered';

export interface EventMetadata {
  offset: number;
  correlationId: string;
  sourceAgent: string;
  targetAgent?: string;
  duration?: number;
  retryCount?: number;
}

export interface HumanCheckpoint {
  id: string;
  decisionPoint: string;
  options: CheckpointOption[];
  requestedBy: string;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  expiresAt?: number;
}

export interface CheckpointOption {
  id: string;
  label: string;
  description: string;
  action: string;
}

export interface StreamConfig {
  streamPath: string;
  checkpointPath: string;
  maxStreamSizeMb: number;
  maxCheckpoints: number;
  checkpointTimeoutMs: number;
  enableContextPreservation: boolean;
  enableHumanInLoop: boolean;
}

export interface AgentContext {
  sessionId: string;
  agentName: string;
  prompt: string;
  memories: ContextMemory[];
  ledgerState: ContextLedgerState;
  recentEvents: string[];
}

export interface ContextMemory {
  type: 'correction' | 'decision' | 'pattern' | 'anti_pattern' | 'insight';
  content: string;
  relevanceScore: number;
  sourceEventId: string;
}

export interface ContextLedgerState {
  epicId?: string;
  taskId?: string;
  phase: string;
  completedTasks: string[];
  pendingTasks: string[];
}

const DEFAULT_CONFIG: StreamConfig = {
  streamPath: '.opencode/orchestration_stream.jsonl',
  checkpointPath: '.opencode/checkpoints',
  maxStreamSizeMb: 10,
  maxCheckpoints: 20,
  checkpointTimeoutMs: 300000,
  enableContextPreservation: true,
  enableHumanInLoop: true,
};

const EVENT_TYPES: StreamEventType[] = [
  'session.created',
  'session.resumed',
  'agent.spawned',
  'agent.completed',
  'agent.failed',
  'handoff.initiated',
  'handoff.completed',
  'context.snapshot',
  'context.restored',
  'checkpoint.requested',
  'checkpoint.approved',
  'checkpoint.rejected',
  'human.intervention',
  'human.approved',
  'human.rejected',
  'learning.extracted',
  'error.recovered',
];

export class DurableStreamOrchestrator {
  private config: StreamConfig;
  private eventStream: Map<string, StreamEvent> = new Map();
  private pendingCheckpoints: Map<string, HumanCheckpoint> = new Map();
  private contextSnapshots: Map<string, AgentContext> = new Map();
  private currentOffset: number = 0;
  private streamFileHandle?: ReturnType<typeof writeFile>;
  private correlationId: string;
  private subscribers: Map<StreamEventType, Set<(event: StreamEvent) => void>> = new Map();
  private eventHistory: StreamEvent[] = [];
  private maxHistorySize: number = 1000;

  constructor(config?: Partial<StreamConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.correlationId = this.generateCorrelationId();
  }

  private generateCorrelationId(): string {
    return randomBytes(8).toString('hex');
  }

  private generateEventId(): string {
    return `${this.correlationId}_${Date.now()}_${this.currentOffset}`;
  }

  async initialize(): Promise<void> {
    const streamDir = dirname(this.config.streamPath);
    const checkpointDir = this.config.checkpointPath;

    if (!existsSync(streamDir)) {
      await mkdir(streamDir, { recursive: true });
    }
    if (!existsSync(checkpointDir)) {
      await mkdir(checkpointDir, { recursive: true });
    }

    await this.resumeFromLastOffset();
    console.log(`[DurableStream] Initialized at offset ${this.currentOffset}`);
  }

  private async resumeFromLastOffset(): Promise<void> {
    try {
      if (!existsSync(this.config.streamPath)) {
        return;
      }

      const content = await readFile(this.config.streamPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as StreamEvent;
          this.eventStream.set(event.id, event);
          this.currentOffset = Math.max(this.currentOffset, event.metadata.offset);
          this.eventHistory.push(event);

          if (event.type === 'checkpoint.requested' && !event.checkpoint?.approvedAt) {
            this.pendingCheckpoints.set(event.checkpoint!.id, event.checkpoint!);
          }

          if (event.type === 'context.snapshot') {
            const context = event.payload.context as AgentContext;
            this.contextSnapshots.set(context.sessionId, context);
          }
        } catch {
          console.warn(`[DurableStream] Failed to parse event: ${line.slice(0, 100)}`);
        }
      }

      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
      }
    } catch (error) {
      console.warn(`[DurableStream] Could not resume from stream: ${error}`);
    }
  }

  async append(
    event: Omit<StreamEvent, 'id' | 'timestamp' | 'metadata'> & { metadata?: EventMetadataInput }
  ): Promise<StreamEvent> {
    const meta = event.metadata || {};
    const fullEvent: StreamEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
      metadata: {
        offset: ++this.currentOffset,
        correlationId: this.correlationId,
        sourceAgent: event.agent || 'system',
        targetAgent: meta.targetAgent,
        duration: meta.duration,
        retryCount: meta.retryCount,
      },
    };

    this.eventStream.set(fullEvent.id, fullEvent);
    this.eventHistory.push(fullEvent);

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    await this.persistEvent(fullEvent);
    await this.notifySubscribers(fullEvent);

    return fullEvent;
  }

  private async persistEvent(event: StreamEvent): Promise<void> {
    try {
      const line = JSON.stringify(event) + '\n';
      await writeFile(this.config.streamPath, line, { flag: 'a' });

      if (await this.shouldRotateStream()) {
        await this.rotateStream();
      }
    } catch (error) {
      console.error(`[DurableStream] Failed to persist event: ${error}`);
    }
  }

  private async shouldRotateStream(): Promise<boolean> {
    try {
      const stats = await import('fs').then((fs) =>
        import('fs/promises').then((p) => p.stat(this.config.streamPath))
      );
      return stats.size > this.config.maxStreamSizeMb * 1024 * 1024;
    } catch {
      return false;
    }
  }

  private async rotateStream(): Promise<void> {
    const timestamp = Date.now();
    const rotatedPath = this.config.streamPath.replace('.jsonl', `_${timestamp}.jsonl`);

    await writeFile(rotatedPath, await readFile(this.config.streamPath, 'utf-8'), 'utf-8');
    await writeFile(this.config.streamPath, '', 'utf-8');
    this.currentOffset = 0;

    console.log(`[DurableStream] Rotated stream to ${rotatedPath}`);
  }

  subscribe(eventType: StreamEventType, callback: (event: StreamEvent) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(callback);

    return () => {
      this.subscribers.get(eventType)?.delete(callback);
    };
  }

  private async notifySubscribers(event: StreamEvent): Promise<void> {
    const callbacks = this.subscribers.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          await callback(event);
        } catch (error) {
          console.error(`[DurableStream] Subscriber error for ${event.type}: ${error}`);
        }
      }
    }

    const wildcardCallbacks = this.subscribers.get('*' as StreamEventType);
    if (wildcardCallbacks) {
      for (const callback of wildcardCallbacks) {
        try {
          await callback(event);
        } catch (error) {
          console.error(`[DurableStream] Wildcard subscriber error: ${error}`);
        }
      }
    }
  }

  async createContextSnapshot(
    sessionId: string,
    agentName: string,
    prompt: string,
    memories: ContextMemory[],
    ledgerState: ContextLedgerState
  ): Promise<StreamEvent> {
    const context: AgentContext = {
      sessionId,
      agentName,
      prompt,
      memories,
      ledgerState,
      recentEvents: this.eventHistory.slice(-50).map((e) => e.type),
    };

    this.contextSnapshots.set(sessionId, context);

    return this.append({
      type: 'context.snapshot',
      sessionId,
      agent: agentName,
      payload: { context, snapshotId: `${sessionId}_${Date.now()}` },
      metadata: { sourceAgent: agentName },
    });
  }

  async restoreContext(sessionId: string): Promise<AgentContext | null> {
    const snapshot = this.contextSnapshots.get(sessionId);
    if (!snapshot) {
      return null;
    }

    await this.append({
      type: 'context.restored',
      sessionId,
      agent: snapshot.agentName,
      payload: { snapshotId: `${sessionId}_${Date.now()}` },
      metadata: { sourceAgent: snapshot.agentName },
    });

    return snapshot;
  }

  async requestCheckpoint(
    sessionId: string,
    decisionPoint: string,
    options: CheckpointOption[],
    requestedBy: string
  ): Promise<HumanCheckpoint> {
    const checkpoint: HumanCheckpoint = {
      id: this.generateEventId(),
      decisionPoint,
      options,
      requestedBy,
      requestedAt: Date.now(),
      expiresAt: Date.now() + this.config.checkpointTimeoutMs,
    };

    await this.append({
      type: 'checkpoint.requested',
      sessionId,
      agent: requestedBy,
      payload: { decisionPoint, options },
      metadata: { sourceAgent: requestedBy },
      checkpoint,
    });

    this.pendingCheckpoints.set(checkpoint.id, checkpoint);

    if (this.config.enableHumanInLoop) {
      await this.append({
        type: 'human.intervention',
        sessionId,
        agent: requestedBy,
        payload: {
          checkpointId: checkpoint.id,
          decisionPoint,
          message: `Human approval required: ${decisionPoint}`,
        },
        metadata: { sourceAgent: requestedBy },
      });
    }

    return checkpoint;
  }

  async approveCheckpoint(
    checkpointId: string,
    approvedBy: string,
    selectedOption?: string
  ): Promise<boolean> {
    const checkpoint = this.pendingCheckpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }

    checkpoint.approvedBy = approvedBy;
    checkpoint.approvedAt = Date.now();

    await this.append({
      type: 'checkpoint.approved',
      sessionId: checkpoint.decisionPoint,
      agent: checkpoint.requestedBy,
      payload: {
        checkpointId,
        approvedBy,
        selectedOption,
        decisionPoint: checkpoint.decisionPoint,
      },
      metadata: { sourceAgent: approvedBy },
    });

    this.pendingCheckpoints.delete(checkpointId);
    return true;
  }

  async rejectCheckpoint(
    checkpointId: string,
    rejectedBy: string,
    reason?: string
  ): Promise<boolean> {
    const checkpoint = this.pendingCheckpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }

    await this.append({
      type: 'checkpoint.rejected',
      sessionId: checkpoint.decisionPoint,
      agent: checkpoint.requestedBy,
      payload: { checkpointId, rejectedBy, reason },
      metadata: { sourceAgent: rejectedBy },
    });

    this.pendingCheckpoints.delete(checkpointId);
    return true;
  }

  async spawnAgent(
    sessionId: string,
    parentSessionId: string | undefined,
    agentName: string,
    prompt: string
  ): Promise<StreamEvent> {
    const spawnEvent = await this.append({
      type: 'agent.spawned',
      sessionId,
      agent: agentName,
      payload: {
        parentSessionId,
        prompt: prompt.slice(0, 500),
        promptLength: prompt.length,
      },
      metadata: {
        sourceAgent: 'orchestrator',
        targetAgent: agentName,
      },
    });

    return spawnEvent;
  }

  async completeAgent(
    sessionId: string,
    agentName: string,
    result: string,
    duration: number
  ): Promise<StreamEvent> {
    return this.append({
      type: 'agent.completed',
      sessionId,
      agent: agentName,
      payload: { result: result.slice(0, 1000), resultLength: result.length },
      metadata: { sourceAgent: agentName, duration },
    });
  }

  async failAgent(sessionId: string, agentName: string, error: string): Promise<StreamEvent> {
    return this.append({
      type: 'agent.failed',
      sessionId,
      agent: agentName,
      payload: { error },
      metadata: { sourceAgent: agentName },
    });
  }

  async initiateHandoff(
    fromSessionId: string,
    toAgent: string,
    context: AgentContext
  ): Promise<StreamEvent> {
    await this.createContextSnapshot(
      context.sessionId,
      context.agentName,
      context.prompt,
      context.memories,
      context.ledgerState
    );

    const handoffEvent = await this.append({
      type: 'handoff.initiated',
      sessionId: fromSessionId,
      agent: context.agentName,
      payload: {
        toAgent,
        context: {
          agentName: context.agentName,
          ledgerPhase: context.ledgerState.phase,
          completedTasks: context.ledgerState.completedTasks,
          pendingTasks: context.ledgerState.pendingTasks,
        },
      },
      metadata: { sourceAgent: context.agentName, targetAgent: toAgent },
    });

    return handoffEvent;
  }

  async completeHandoff(
    fromSessionId: string,
    toSessionId: string,
    toAgent: string
  ): Promise<StreamEvent> {
    return this.append({
      type: 'handoff.completed',
      sessionId: toSessionId,
      agent: toAgent,
      payload: { fromSessionId },
      metadata: { sourceAgent: toAgent },
    });
  }

  async extractLearning(
    sessionId: string,
    agentName: string,
    learningType: ContextMemory['type'],
    content: string
  ): Promise<StreamEvent> {
    return this.append({
      type: 'learning.extracted',
      sessionId,
      agent: agentName,
      payload: { learningType, content },
      metadata: { sourceAgent: agentName },
    });
  }

  async recoverFromError(
    sessionId: string,
    errorEventId: string,
    recoveryAction: string
  ): Promise<StreamEvent> {
    return this.append({
      type: 'error.recovered',
      sessionId,
      agent: 'orchestrator',
      payload: { errorEventId, recoveryAction },
      metadata: { sourceAgent: 'orchestrator', retryCount: 1 },
    });
  }

  getEventHistory(eventType?: StreamEventType, limit: number = 100): StreamEvent[] {
    let events = this.eventHistory;

    if (eventType) {
      events = events.filter((e) => e.type === eventType);
    }

    return events.slice(-limit).reverse();
  }

  getPendingCheckpoints(): HumanCheckpoint[] {
    return Array.from(this.pendingCheckpoints.values());
  }

  getContextSnapshot(sessionId: string): AgentContext | undefined {
    return this.contextSnapshots.get(sessionId);
  }

  getCurrentOffset(): number {
    return this.currentOffset;
  }

  getConfig(): StreamConfig {
    return { ...this.config };
  }

  async cleanup(): Promise<void> {
    const checkpoints = await readdir(this.config.checkpointPath);
    const sortedCheckpoints = checkpoints
      .map((name) => ({ name, time: parseInt(name.split('_')[1] || '0') }))
      .sort((a, b) => b.time - a.time);

    for (const checkpoint of sortedCheckpoints.slice(this.config.maxCheckpoints)) {
      try {
        await unlink(join(this.config.checkpointPath, checkpoint.name));
      } catch {
        console.warn(`[DurableStream] Failed to delete checkpoint: ${checkpoint.name}`);
      }
    }
  }

  async getSessionLineage(sessionId: string): Promise<StreamEvent[]> {
    const events = this.eventHistory.filter(
      (e) =>
        e.sessionId === sessionId ||
        (e.payload as Record<string, unknown>)?.parentSessionId === sessionId
    );
    return events.sort((a, b) => a.metadata.offset - b.metadata.offset);
  }

  async exportSessionContext(sessionId: string): Promise<{
    events: StreamEvent[];
    context: AgentContext | undefined;
    checkpoints: HumanCheckpoint[];
    lineage: StreamEvent[];
  }> {
    const events = this.getEventHistory(undefined, 10000).filter((e) => e.sessionId === sessionId);
    const context = this.getContextSnapshot(sessionId);
    const checkpoints = this.getPendingCheckpoints().filter(
      (c) => c.decisionPoint === sessionId || c.requestedBy === sessionId
    );
    const lineage = await this.getSessionLineage(sessionId);

    return { events, context, checkpoints, lineage };
  }
}

let globalOrchestrator: DurableStreamOrchestrator | null = null;

export function getDurableStreamOrchestrator(
  config?: Partial<StreamConfig>
): DurableStreamOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new DurableStreamOrchestrator(config);
  }
  return globalOrchestrator;
}

export function initializeDurableStream(
  config?: Partial<StreamConfig>
): Promise<DurableStreamOrchestrator> {
  const orchestrator = getDurableStreamOrchestrator(config);
  return orchestrator.initialize().then(() => orchestrator);
}

export function shutdownDurableStream(): Promise<void> {
  if (globalOrchestrator) {
    return globalOrchestrator.cleanup().then(() => {
      globalOrchestrator = null;
    });
  }
  return Promise.resolve();
}
