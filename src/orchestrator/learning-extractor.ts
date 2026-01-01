/**
 * Event-Driven Learning Extraction Pipeline
 *
 * Automatically extracts learnings from completed workflows by analyzing
 * Durable Stream events. This system:
 * - Monitors event patterns for successful/unsuccessful approaches
 * - Detects user corrections and preference changes
 * - Extracts decisions and patterns from agent interactions
 * - Stores learnings in Memory Lane for future injection
 */

import type { StreamEvent, EventType } from '../durable-stream/types';
import { getDurableStream, DurableStream } from '../durable-stream/orchestrator';

export interface Learning {
  id: string;
  type: 'correction' | 'decision' | 'pattern' | 'anti_pattern' | 'preference' | 'insight';
  information: string;
  entities?: string[];
  confidence: number;
  sourceEventId: string;
  extractedAt: number;
}

export interface LearningExtractorConfig {
  /** Minimum confidence threshold for extracted learnings */
  minConfidence?: number;
  /** Maximum learnings to extract per session */
  maxLearnings?: number;
  /** Enable real-time extraction during session */
  realTime?: boolean;
  /** Entity extraction patterns */
  entityPatterns?: RegExp[];
}

const DEFAULT_CONFIG: Required<LearningExtractorConfig> = {
  minConfidence: 0.6,
  maxLearnings: 10,
  realTime: false,
  entityPatterns: [/\b[A-Z][a-z]+[A-Z]\w+/g, /\b[a-z]+_[a-z_]+/g],
};

const CORRECTION_PATTERNS = [
  /no[,.]?\s+(do|use|try|make|don't|instead|actually)/i,
  /that's (wrong|incorrect|not right)/i,
  /not what i (asked|meant|wanted)/i,
  /instead[,.]?\s+(use|do|try)/i,
  /prefer[s]?\s+.+\s+(over|instead|rather)/i,
  /actually[,.]?\s+(i want|use|it should)/i,
  /i said\s+/i,
  /please (don't|no)/i,
];

const SUCCESS_PATTERNS = [
  /perfect/i,
  /that.?s (right|correct|exactly)/i,
  /works?( now)?/i,
  /good (job|job!|work)/i,
  /thank(s| you)/i,
  /exactly (what i|what we)/i,
  /looks good/i,
  /awesome/i,
  /great/i,
  /ship it/i,
];

const FAILURE_PATTERNS = [
  /that.?s (wrong|incorrect|not right)/i,
  /no,?\s+(that|it|this)/i,
  /don.?t do that/i,
  /stop/i,
  /cancel/i,
  /never mind/i,
  /start over/i,
  /error/i,
  /fail/i,
  /broken/i,
  /didn.?t work/i,
];

export class LearningExtractor {
  private config: Required<LearningExtractorConfig>;
  private stream: DurableStream;
  private subscriptions: Map<string, () => void> = new Map();
  private extractedLearnings: Learning[] = [];

  constructor(config?: LearningExtractorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stream = getDurableStream();
  }

  async initialize(): Promise<void> {
    await this.stream.initialize();
  }

  async extractFromSession(sessionId: string): Promise<Learning[]> {
    await this.initialize();

    const events = await this.stream.getStreamEvents(sessionId);
    this.extractedLearnings = [];

    for (const event of events) {
      const learnings = this.analyzeEvent(event);
      this.extractedLearnings.push(...learnings);
    }

    return this.getTopLearnings();
  }

  async extractFromEvents(events: StreamEvent[]): Promise<Learning[]> {
    this.extractedLearnings = [];

    for (const event of events) {
      const learnings = this.analyzeEvent(event);
      this.extractedLearnings.push(...learnings);
    }

    return this.getTopLearnings();
  }

  private analyzeEvent(event: StreamEvent): Learning[] {
    const learnings: Learning[] = [];
    const payload = event.payload as any;
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload);

    if (!content) return learnings;

    for (const pattern of CORRECTION_PATTERNS) {
      if (pattern.test(content)) {
        learnings.push({
          id: `correction_${event.id}`,
          type: 'correction',
          information: this.extractContext(content, pattern),
          entities: this.extractEntities(content),
          confidence: 0.9,
          sourceEventId: event.id,
          extractedAt: Date.now(),
        });
        break;
      }
    }

    for (const pattern of FAILURE_PATTERNS) {
      if (pattern.test(content)) {
        learnings.push({
          id: `failure_${event.id}`,
          type: 'anti_pattern',
          information: `Detected failure/rejection: "${content.slice(0, 100)}..."`,
          confidence: 0.8,
          sourceEventId: event.id,
          extractedAt: Date.now(),
        });
        break;
      }
    }

    for (const pattern of SUCCESS_PATTERNS) {
      if (pattern.test(content)) {
        learnings.push({
          id: `success_${event.id}`,
          type: 'pattern',
          information: `Detected success/approval: "${content.slice(0, 100)}..."`,
          confidence: 0.8,
          sourceEventId: event.id,
          extractedAt: Date.now(),
        });
        break;
      }
    }

    if (event.type === 'agent.completed' && payload?.result) {
      learnings.push({
        id: `decision_${event.id}`,
        type: 'decision',
        information: `Agent completed: ${payload.result.slice(0, 200)}`,
        entities: this.extractEntities(payload.result),
        confidence: 0.7,
        sourceEventId: event.id,
        extractedAt: Date.now(),
      });
    }

    if (event.type === 'agent.failed' && payload?.error) {
      learnings.push({
        id: `anti_pattern_${event.id}`,
        type: 'anti_pattern',
        information: `Agent failed: ${payload.error}`,
        entities: this.extractEntities(payload.error),
        confidence: 0.8,
        sourceEventId: event.id,
        extractedAt: Date.now(),
      });
    }

    if (event.type === 'checkpoint.approved' && payload?.selected_option) {
      learnings.push({
        id: `preference_${event.id}`,
        type: 'preference',
        information: `User approved: ${payload.selected_option}`,
        confidence: 0.85,
        sourceEventId: event.id,
        extractedAt: Date.now(),
      });
    }

    if (event.type === 'checkpoint.rejected') {
      learnings.push({
        id: `preference_${event.id}`,
        type: 'anti_pattern',
        information: `User rejected: ${payload.reason || 'no reason provided'}`,
        confidence: 0.8,
        sourceEventId: event.id,
        extractedAt: Date.now(),
      });
    }

    return learnings;
  }

  private extractContext(content: string, matchedPattern: RegExp): string {
    const match = content.match(matchedPattern);
    if (match) {
      return `User correction: "${match[0]}"`;
    }
    return `Correction detected in: ${content.slice(0, 100)}`;
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];
    const seen = new Set<string>();

    for (const pattern of this.config.entityPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          if (match.length > 3 && match.length < 50 && !seen.has(match)) {
            seen.add(match);
            entities.push(match);
          }
        }
      }
    }

    return entities.slice(0, 5);
  }

  private getTopLearnings(): Learning[] {
    return this.extractedLearnings
      .filter((l) => l.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxLearnings);
  }

  startRealTimeExtraction(onLearning: (learning: Learning) => void): () => void {
    const eventTypes: EventType[] = [
      'agent.completed',
      'agent.failed',
      'checkpoint.approved',
      'checkpoint.rejected',
      'lifecycle.session.error',
    ];

    const handlers: (() => void)[] = [];

    for (const eventType of eventTypes) {
      const handler = (event: StreamEvent) => {
        const learnings = this.analyzeEvent(event);
        for (const learning of learnings) {
          if (learning.confidence >= this.config.minConfidence) {
            onLearning(learning);
          }
        }
      };
      handlers.push(this.stream.subscribe(eventType, handler));
    }

    const cleanup = () => {
      for (const unsub of handlers) {
        unsub();
      }
    };

    this.subscriptions.set('realtime', cleanup);
    return cleanup;
  }

  stopRealTimeExtraction(): void {
    const cleanup = this.subscriptions.get('realtime');
    if (cleanup) {
      cleanup();
      this.subscriptions.delete('realtime');
    }
  }

  getExtractedLearnings(): Learning[] {
    return this.extractedLearnings;
  }

  clearLearnings(): void {
    this.extractedLearnings = [];
  }

  async shutdown(): Promise<void> {
    this.stopRealTimeExtraction();
    this.extractedLearnings = [];
  }
}

let globalExtractor: LearningExtractor | null = null;

export function getLearningExtractor(config?: LearningExtractorConfig): LearningExtractor {
  if (!globalExtractor) {
    globalExtractor = new LearningExtractor(config);
  }
  return globalExtractor;
}

export async function initializeLearningExtractor(
  config?: LearningExtractorConfig
): Promise<LearningExtractor> {
  const extractor = getLearningExtractor(config);
  await extractor.initialize();
  return extractor;
}

export async function shutdownLearningExtractor(): Promise<void> {
  if (globalExtractor) {
    await globalExtractor.shutdown();
    globalExtractor = null;
  }
}

export async function extractSessionLearnings(sessionId: string): Promise<Learning[]> {
  const extractor = await initializeLearningExtractor();
  return extractor.extractFromSession(sessionId);
}

export async function extractEventLearnings(events: StreamEvent[]): Promise<Learning[]> {
  const extractor = await initializeLearningExtractor();
  return extractor.extractFromEvents(events);
}
