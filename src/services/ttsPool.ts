import { TTSService, type TTSServiceLike } from "./ttsService.js";

type TTSHandlers = {
  onAudio: (audioBase64: string) => Promise<void>;
  onDone: () => Promise<void>;
};

type Entry = {
  tts: TTSServiceLike;
  createdAt: number;
};

const noopHandlers: TTSHandlers = {
  onAudio: async () => {},
  onDone: async () => {},
};

export interface TTSPoolLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  get(handlers: TTSHandlers): Promise<TTSServiceLike>;
}

export class TTSPool implements TTSPoolLike {
  private readonly poolSize: number;
  private readonly ttlMs: number;

  private running = false;
  private readonly ready: Entry[] = [];
  private fillLoopPromise: Promise<void> | null = null;
  private fillLoopAbort: AbortController | null = null;
  private wakeFill: (() => void) | null = null;

  constructor(poolSize = 1, ttlSeconds = 8) {
    this.poolSize = poolSize;
    this.ttlMs = ttlSeconds * 1000;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.fillLoopAbort = new AbortController();
    this.fillLoopPromise = this.fillLoop(this.fillLoopAbort.signal);
  }

  async stop(): Promise<void> {
    this.running = false;

    this.fillLoopAbort?.abort();
    if (this.fillLoopPromise) {
      await this.fillLoopPromise;
      this.fillLoopPromise = null;
    }

    const entries = this.ready.splice(0, this.ready.length);
    await Promise.all(entries.map((entry) => entry.tts.cancel()));
  }

  async get(handlers: TTSHandlers): Promise<TTSServiceLike> {
    while (this.ready.length > 0) {
      const entry = this.ready.shift();
      if (!entry) {
        break;
      }

      const ageMs = Date.now() - entry.createdAt;
      if (ageMs < this.ttlMs) {
        entry.tts.bind(handlers);
        this.triggerFill();
        return entry.tts;
      }

      await entry.tts.cancel();
    }

    const tts = new TTSService(handlers);
    await tts.start();
    this.triggerFill();
    return tts;
  }

  private triggerFill(): void {
    if (this.wakeFill) {
      this.wakeFill();
      this.wakeFill = null;
    }
  }

  private async fillLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.evictStale();

      while (!signal.aborted && this.running && this.ready.length < this.poolSize) {
        const tts = new TTSService(noopHandlers);
        try {
          await tts.start();
          this.ready.push({ tts, createdAt: Date.now() });
        } catch {
          await tts.cancel();
          await this.sleep(1000, signal);
        }
      }

      await Promise.race([
        this.sleep(this.ttlMs / 2, signal),
        new Promise<void>((resolve) => {
          this.wakeFill = resolve;
        }),
      ]).catch(() => {});
    }
  }

  private async evictStale(): Promise<void> {
    const now = Date.now();
    const stale = this.ready.filter((entry) => now - entry.createdAt >= this.ttlMs);
    if (stale.length === 0) {
      return;
    }

    for (const entry of stale) {
      await entry.tts.cancel();
    }

    const fresh = this.ready.filter((entry) => now - entry.createdAt < this.ttlMs);
    this.ready.splice(0, this.ready.length, ...fresh);
  }

  private async sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);

      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(new Error("aborted"));
      };

      signal.addEventListener("abort", onAbort);
    });
  }
}
