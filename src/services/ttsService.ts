import WebSocket, { type RawData } from "ws";

import { config } from "../config.js";
import { logger } from "../logging/logger.js";

type TTSCallbacks = {
  onAudio: (audioBase64: string) => Promise<void>;
  onDone: () => Promise<void>;
};

export interface TTSServiceLike {
  bind(callbacks: TTSCallbacks): void;
  start(): Promise<void>;
  send(text: string): Promise<void>;
  flush(): Promise<void>;
  cancel(): Promise<void>;
}

const createTtsUrl = (): string => {
  const params = new URLSearchParams({
    model_id: config.ELEVENLABS_MODEL_ID,
    output_format: "ulaw_8000",
  });

  return `wss://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}/stream-input?${params.toString()}`;
};

export class TTSService implements TTSServiceLike {
  private callbacks: TTSCallbacks;
  private ws: WebSocket | null = null;
  private running = false;
  private doneNotified = false;

  constructor(callbacks: TTSCallbacks) {
    this.callbacks = callbacks;
  }

  bind(callbacks: TTSCallbacks): void {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(createTtsUrl());

      const onError = (err: Error): void => {
        ws.removeAllListeners();
        reject(err);
      };

      ws.once("error", onError);
      ws.once("open", () => {
        ws.off("error", onError);
        this.ws = ws;
        this.running = true;
        this.doneNotified = false;
        ws.on("message", (raw: RawData) => {
          void this.handleMessage(raw);
        });
        ws.on("close", () => {
          this.running = false;
          this.ws = null;
          void this.notifyDoneOnce();
        });
        ws.on("error", (err) => {
          logger.warn({ err }, "tts websocket error");
        });
        resolve();
      });
    });

    await this.sendJson({
      text: " ",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      xi_api_key: config.ELEVENLABS_API_KEY,
    });
  }

  async send(text: string): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.sendJson({
      text,
      try_trigger_generation: true,
    });
  }

  async flush(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.sendJson({
      text: "",
      flush: true,
    });
  }

  async cancel(): Promise<void> {
    this.running = false;

    if (!this.ws) {
      return;
    }

    const ws = this.ws;
    this.ws = null;

    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      return;
    }

    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  }

  private async sendJson(payload: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.ws?.send(JSON.stringify(payload), (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }).catch((err: unknown) => {
      logger.warn({ err }, "failed to send tts payload");
    });
  }

  private async handleMessage(raw: RawData): Promise<void> {
    let parsed: unknown;

    try {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      parsed = JSON.parse(text);
    } catch (err) {
      logger.warn({ err }, "failed to parse tts message");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    const data = parsed as { audio?: string; isFinal?: boolean };

    if (data.audio && data.audio.length > 0) {
      await this.callbacks.onAudio(data.audio);
    }

    if (data.isFinal === true) {
      await this.notifyDoneOnce();
    }
  }

  private async notifyDoneOnce(): Promise<void> {
    if (this.doneNotified) {
      return;
    }

    this.doneNotified = true;
    await this.callbacks.onDone();
  }
}
