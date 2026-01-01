/**
 * Durable Stream Orchestration - Event-Driven Coordination + Context Preservation
 *
 * Optimized patterns for skill-based agents:
 * 1. Event-Driven Coordination: Use OpenCode's native event system instead of polling
 * 2. Context Preservation: Automatic context snapshotting for agent handoffs
 * 3. Human-in-Loop Checkpoints: Pause/resume at decision points with user approval
 * 4. Session Lineage Tracking: Full trace of agent interactions
 */

import { mkdir, unlink, readdir, appendFile, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

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
  | 'error.recovered'
  | 'task.progress';

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
  snapshotPath: string;
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
  snapshotPath: '.opencode/snapshots',
  maxStreamSizeMb: 10,
  maxCheckpoints: 20,
  checkpointTimeoutMs: 300000,
  enableContextPreservation: true,
  enableHumanInLoop: true,
};

export class DurableStreamOrchestrator {
  private config: StreamConfig;
  private eventStream: Map<string, StreamEvent> = new Map();
  private pendingCheckpoints: Map<string, HumanCheckpoint> = new Map();
  private contextSnapshots: Map<string, AgentContext> = new Map();
  private currentOffset: number = 0;
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

    // Bun doesn't have native mkdir -p equivalent in generic API yet, using node:fs/promises
    if (!existsSync(streamDir)) await mkdir(streamDir, { recursive: true });
    if (!existsSync(this.config.checkpointPath))
      await mkdir(this.config.checkpointPath, { recursive: true });
    if (!existsSync(this.config.snapshotPath))
      await mkdir(this.config.snapshotPath, { recursive: true });

    await this.resumeFromLastOffset();
    console.log(`[DurableStream] Initialized at offset ${this.currentOffset}`);
  }

  private async resumeFromLastOffset(): Promise<void> {
    if (!existsSync(this.config.streamPath)) return;

    // Use Node.js fs/promises for cross-runtime compatibility
    const content = await readFile(this.config.streamPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      if (!line) continue;
      // Minimal try-catch for JSON parsing safety only
      try {
        const event = JSON.parse(line) as StreamEvent;
        this.eventStream.set(event.id, event);
        this.currentOffset = Math.max(this.currentOffset, event.metadata.offset);
        this.eventHistory.push(event);

        // Rehydrate state
        if (event.type === 'checkpoint.requested' && !event.checkpoint?.approvedAt) {
          this.pendingCheckpoints.set(event.checkpoint!.id, event.checkpoint!);
        }

        if (event.type === 'context.snapshot') {
          await this.rehydrateSnapshot(event);
        }
      } catch (e) {
        console.warn(`[DurableStream] Skipped malformed event line: ${line.slice(0, 50)}...`);
      }
    }

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private async rehydrateSnapshot(event: StreamEvent): Promise<void> {
    if (event.payload.context) {
      const context = event.payload.context as AgentContext;
      this.contextSnapshots.set(context.sessionId, context);
    } else if (event.payload.snapshotPath) {
      const path = event.payload.snapshotPath as string;
      if (existsSync(path)) {
        try {
          const content = await readFile(path, 'utf-8');
          const context = JSON.parse(content);
          this.contextSnapshots.set(context.sessionId, context);
        } catch {
          /* ignore bad snapshot */
        }
      }
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
    // Don't await subscribers to keep stream fast
    this.notifySubscribers(fullEvent).catch((err) =>
      console.error('[DurableStream] Subscriber failed', err)
    );

    return fullEvent;
  }

  private async persistEvent(event: StreamEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';

    // Use Node's appendFile for atomic append (Bun.write overwrites)
    await appendFile(this.config.streamPath, line, 'utf-8');

    if (await this.shouldRotateStream()) {
      await this.rotateStream();
    }
  }

  private async shouldRotateStream(): Promise<boolean> {
    if (!existsSync(this.config.streamPath)) return false;
    const fileStat = await stat(this.config.streamPath);
    return fileStat.size > this.config.maxStreamSizeMb * 1024 * 1024;
  }

  private async rotateStream(): Promise<void> {
    const timestamp = Date.now();
    const rotatedPath = this.config.streamPath.replace('.jsonl', `_${timestamp}.jsonl`);

    if (existsSync(this.config.streamPath)) {
      const content = await readFile(this.config.streamPath, 'utf-8');
      await writeFile(rotatedPath, content, 'utf-8'); // Archive current stream
      await writeFile(this.config.streamPath, '', 'utf-8'); // Reset stream
      this.currentOffset = 0;
      console.log(`[DurableStream] Rotated stream to ${rotatedPath}`);
    }
  }

  // --- Core Methods ---

  async progressTask(taskId: string, message: string, status: string): Promise<StreamEvent> {
    return this.append({
      type: 'task.progress',
      sessionId: taskId, // Using taskId as session grouping context
      agent: 'system',
      payload: { taskId, message, status },
      metadata: { sourceAgent: 'system' },
    });
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
      for (const callback of callbacks) callback(event);
    }

    const wildcardCallbacks = this.subscribers.get('*' as StreamEventType);
    if (wildcardCallbacks) {
      for (const callback of wildcardCallbacks) callback(event);
    }
  }

  // --- Context & Checkpoint Methods ---

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

    const snapshotId = `${sessionId}_${Date.now()}`;
    const snapshotPath = join(this.config.snapshotPath, `${snapshotId}.json`);

    await writeFile(snapshotPath, JSON.stringify(context, null, 2), 'utf-8');
    this.contextSnapshots.set(sessionId, context);

    return this.append({
      type: 'context.snapshot',
      sessionId,
      agent: agentName,
      payload: { snapshotId, snapshotPath },
      metadata: { sourceAgent: agentName },
    });
  }

  async restoreContext(sessionId: string): Promise<AgentContext | null> {
    const snapshot = this.contextSnapshots.get(sessionId);
    if (!snapshot) return null;

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
    if (!checkpoint) return false;

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
    if (!checkpoint) return false;

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

  // --- Helper Methods ---

  async spawnAgent(
    sessionId: string,
    parentSessionId: string | undefined,
    agentName: string,
    prompt: string
  ): Promise<StreamEvent> {
    return this.append({
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

    return this.append({
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
    // Only cleanup checkpoints for now
    const checkpoints = await readdir(this.config.checkpointPath);
    // ... filtering logic could be improved but keeping minimal changes
    for (const cp of checkpoints) {
      // Simple cleanup logic if needed
    }
    // Full cleanup usually managed by external tools or lifecycle
  }
}

// Global instance management
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
  globalOrchestrator = null;
  return Promise.resolve();
}
