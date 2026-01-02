import { addLearning, DEFAULT_LEDGER_PATH, loadLedger, saveLedger } from './ledger';
import { getDurableStream } from '../durable-stream';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('ledger-projector');

export interface LedgerProjectorConfig {
  ledgerPath?: string;
}

export class LedgerProjector {
  private offset = 0;
  private ledgerPath: string;
  private subscribed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: LedgerProjectorConfig = {}) {
    this.ledgerPath = config.ledgerPath ?? DEFAULT_LEDGER_PATH;
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    const stream = getDurableStream();
    if (!stream.isInitialized() || this.subscribed) return;

    // Project learnings shortly after they're emitted, without doing file writes
    // in the middle of OpenCode tool/message processing.
    stream.subscribe('ledger.learning.extracted', () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.project().catch(() => {});
      }, 250);
    });

    this.subscribed = true;
  }

  /**
   * Project selected Durable Stream events into LEDGER.md.
   * Runs on safe triggers (e.g. session.idle) to avoid hot-path writes.
   */
  async project(): Promise<void> {
    const stream = getDurableStream();
    if (!stream.isInitialized()) return;

    // In case the stream initialized after this projector was constructed.
    this.setupSubscriptions();

    const history = stream.getEventHistory();
    if (this.offset > history.length) this.offset = 0;

    const events = history.slice(this.offset);
    this.offset = history.length;

    if (events.length === 0) return;

    let ledger;
    try {
      ledger = await loadLedger(this.ledgerPath);
    } catch {
      return;
    }

    let changed = false;

    for (const e of events as any[]) {
      if (e.type === 'ledger.learning.extracted') {
        const payload = e.payload as any;
        const type = payload?.learningType as
          | 'pattern'
          | 'antiPattern'
          | 'decision'
          | 'preference'
          | undefined;
        const content = payload?.learningContent as string | undefined;

        if (!type || !content) continue;

        const list =
          type === 'pattern'
            ? ledger.learnings.patterns
            : type === 'antiPattern'
              ? ledger.learnings.antiPatterns
              : type === 'decision'
                ? ledger.learnings.decisions
                : ledger.learnings.preferences;

        if (list.some((l: any) => l.content === content)) continue;
        addLearning(ledger, type, content);
        changed = true;
      }
    }

    if (!changed) return;

    try {
      await saveLedger(ledger, this.ledgerPath);
    } catch (err) {
      log.error({ err }, 'Failed to project ledger updates');
    }
  }
}

let globalProjector: LedgerProjector | null = null;

export function getLedgerProjector(config?: LedgerProjectorConfig): LedgerProjector {
  if (!globalProjector) {
    globalProjector = new LedgerProjector(config);
  }
  return globalProjector;
}
