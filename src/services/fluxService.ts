import WebSocket, { type RawData } from "ws";

import { config } from "../config.js";
import { logger } from "../logging/logger.js";

type FluxCallbacks = {
  onEndOfTurn: (transcript: string) => Promise<void>;
  onStartOfTurn: () => Promise<void>;
  onInterim?: (transcript: string) => Promise<void>;
};

type FluxTurnInfoMessage = {
  type?: string;
  event?: string;
  transcript?: string;
};

type FluxResultsMessage = {
  type?: string;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
};

const defaultFluxUrl =
  "wss://agent.deepgram.com/v1/listen?model=flux-general-en&encoding=mulaw&sample_rate=8000";

export class FluxService {
  private readonly callbacks: FluxCallbacks;
  private ws: WebSocket | null = null;
  private running = false;

  constructor(callbacks: FluxCallbacks) {
    this.callbacks = callbacks;
  }

  get isActive(): boolean {
    return this.running && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const url = config.DEEPGRAM_FLUX_WS_URL ?? defaultFluxUrl;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
        },
      });

      const onError = (err: Error): void => {
        ws.removeAllListeners();
        reject(err);
      };

      ws.once("error", onError);
      ws.once("open", () => {
        ws.off("error", onError);
        this.ws = ws;
        this.running = true;
        ws.on("message", (raw: RawData) => {
          void this.handleMessage(raw);
        });
        ws.on("close", () => {
          this.running = false;
          this.ws = null;
        });
        ws.on("error", (err) => {
          logger.warn({ err }, "flux websocket error");
        });
        resolve();
      });
    });

    logger.info("flux connected");
  }

  async send(audioBytes: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.ws?.send(Buffer.from(audioBytes), (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }).catch((err: unknown) => {
      logger.warn({ err }, "failed to send audio to flux");
    });
  }

  async stop(): Promise<void> {
    this.running = false;

    if (!this.ws) {
      return;
    }

    const ws = this.ws;
    this.ws = null;

    if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });

    logger.info("flux disconnected");
  }

  private async handleMessage(raw: RawData): Promise<void> {
    let parsed: unknown;

    try {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      parsed = JSON.parse(text);
    } catch (err) {
      logger.warn({ err }, "failed to parse flux message");
      return;
    }

    const turnInfo = parsed as FluxTurnInfoMessage;
    if (turnInfo.type === "TurnInfo") {
      if (turnInfo.event === "StartOfTurn") {
        await this.callbacks.onStartOfTurn();
        return;
      }

      if (turnInfo.event === "EndOfTurn") {
        const transcript = (turnInfo.transcript ?? "").trim();
        await this.callbacks.onEndOfTurn(transcript);
        return;
      }
    }

    if (this.callbacks.onInterim) {
      const results = parsed as FluxResultsMessage;
      const transcript = results.channel?.alternatives?.[0]?.transcript?.trim();
      if (results.type === "Results" && transcript) {
        await this.callbacks.onInterim(transcript);
      }
    }
  }
}
