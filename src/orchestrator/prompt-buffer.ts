import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('prompt-buffer');

export interface DeferredPrompt {
  id: string;
  targetSessionId: string;
  agent: string;
  prompt: string;
  messageID?: string;
  createdAt: number;
  attempts: number;
}

export class PromptBuffer {
  private static instance: PromptBuffer;
  private buffer: Map<string, DeferredPrompt[]> = new Map();

  private constructor() {}

  static getInstance(): PromptBuffer {
    if (!PromptBuffer.instance) {
      PromptBuffer.instance = new PromptBuffer();
    }
    return PromptBuffer.instance;
  }

  async enqueue(prompt: Omit<DeferredPrompt, 'attempts'> | DeferredPrompt): Promise<void> {
    const queue = this.buffer.get(prompt.targetSessionId) || [];
    const attempts = (prompt as DeferredPrompt).attempts ?? 0;
    queue.push({ ...(prompt as any), attempts });
    this.buffer.set(prompt.targetSessionId, queue);

    log.info(
      { targetSessionId: prompt.targetSessionId, agent: prompt.agent, messageID: prompt.messageID },
      'Enqueued deferred prompt'
    );
  }

  hasPrompts(sessionId: string): boolean {
    const queue = this.buffer.get(sessionId);
    return !!queue && queue.length > 0;
  }

  flush(sessionId: string): DeferredPrompt[] {
    const queue = this.buffer.get(sessionId) || [];
    this.buffer.delete(sessionId);
    if (queue.length > 0) {
      log.info({ sessionId, count: queue.length }, 'Flushed deferred prompts');
    }
    return queue;
  }

  clear(): void {
    this.buffer.clear();
  }
}
