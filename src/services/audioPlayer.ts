import type WebSocket from "ws";

import { logger } from "../logging/logger.js";

export interface AudioPlayerLike {
  readonly isPlaying: boolean;
  sendChunk(chunk: string): Promise<void>;
  markTtsDone(): void;
  stopAndClear(): Promise<void>;
}

type AudioPlayerOptions = {
  socket: WebSocket;
  streamSid: string;
  onDone?: () => void;
};

export class AudioPlayer implements AudioPlayerLike {
  private readonly socket: WebSocket;
  private readonly streamSid: string;
  private readonly onDone?: () => void;

  private readonly chunks: string[] = [];
  private running = false;
  private ttsDone = false;
  private index = 0;
  private loopPromise: Promise<void> | null = null;

  constructor(options: AudioPlayerOptions) {
    this.socket = options.socket;
    this.streamSid = options.streamSid;
    this.onDone = options.onDone;
  }

  get isPlaying(): boolean {
    return this.running;
  }

  async sendChunk(chunk: string): Promise<void> {
    if (!this.running) {
      this.startLoop();
    }

    this.chunks.push(chunk);
  }

  markTtsDone(): void {
    this.ttsDone = true;
  }

  async stopAndClear(): Promise<void> {
    this.running = false;
    this.ttsDone = false;
    this.index = 0;
    this.chunks.length = 0;

    if (this.loopPromise) {
      await this.loopPromise.catch(() => {});
      this.loopPromise = null;
    }

    await this.sendJson({
      event: "clear",
      streamSid: this.streamSid,
    });
  }

  private startLoop(): void {
    this.running = true;
    this.loopPromise = this.playLoop()
      .catch((err) => {
        logger.warn({ err }, "audio playback loop failed");
      })
      .finally(() => {
        this.running = false;
      });
  }

  private async playLoop(): Promise<void> {
    while (this.running) {
      if (this.index < this.chunks.length) {
        const payload = this.chunks[this.index];
        this.index += 1;

        await this.sendJson({
          event: "media",
          streamSid: this.streamSid,
          media: {
            payload,
          },
        });

        await this.sleep(20);
        continue;
      }

      if (this.ttsDone) {
        break;
      }

      await this.sleep(10);
    }

    if (this.running && this.onDone) {
      this.onDone();
    }

    this.running = false;
  }

  private async sendJson(payload: Record<string, unknown>): Promise<void> {
    if (this.socket.readyState !== this.socket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.socket.send(JSON.stringify(payload), (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
