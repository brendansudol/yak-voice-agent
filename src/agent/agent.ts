import type WebSocket from "ws";

import {
  AudioPlayer,
  type AudioPlayerLike,
} from "../services/audioPlayer.js";
import {
  LLMService,
  type ChatMessage,
  type LLMServiceLike,
} from "../services/llmService.js";
import {
  type TTSPoolLike,
} from "../services/ttsPool.js";
import type { TTSServiceLike } from "../services/ttsService.js";

type AgentOptions = {
  socket: WebSocket;
  streamSid: string;
  ttsPool: TTSPoolLike;
  onDone: () => void;
};

type AgentDependencies = {
  createLLM?: (callbacks: {
    onToken: (token: string) => Promise<void>;
    onDone: () => Promise<void>;
  }) => LLMServiceLike;
  createPlayer?: (options: {
    socket: WebSocket;
    streamSid: string;
    onDone: () => void;
  }) => AudioPlayerLike;
};

export class Agent {
  private readonly socket: WebSocket;
  private readonly streamSid: string;
  private readonly ttsPool: TTSPoolLike;
  private readonly onDone: () => void;
  private readonly createPlayer: AgentDependencies["createPlayer"];

  private readonly llm: LLMServiceLike;
  private tts: TTSServiceLike | null = null;
  private player: AudioPlayerLike | null = null;
  private active = false;

  constructor(options: AgentOptions, dependencies: AgentDependencies = {}) {
    this.socket = options.socket;
    this.streamSid = options.streamSid;
    this.ttsPool = options.ttsPool;
    this.onDone = options.onDone;

    this.createPlayer =
      dependencies.createPlayer ??
      ((playerOptions) => new AudioPlayer(playerOptions));

    const createLLM =
      dependencies.createLLM ??
      ((callbacks) => new LLMService(callbacks));

    this.llm = createLLM({
      onToken: async (token) => this.onLLMToken(token),
      onDone: async () => this.onLLMDone(),
    });
  }

  get isTurnActive(): boolean {
    return this.active;
  }

  get history(): ChatMessage[] {
    return this.llm.history;
  }

  async startTurn(transcript: string): Promise<void> {
    if (this.active) {
      await this.cancelTurn();
    }

    this.active = true;

    this.tts = await this.ttsPool.get({
      onAudio: async (audioBase64) => this.onTTSAudio(audioBase64),
      onDone: async () => this.onTTSDone(),
    });

    this.player = this.createPlayer?.({
      socket: this.socket,
      streamSid: this.streamSid,
      onDone: () => this.onPlaybackDone(),
    }) ?? null;

    await this.llm.start(transcript);
  }

  async cancelTurn(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.active = false;

    await this.llm.cancel();

    if (this.tts) {
      await this.tts.cancel();
      this.tts = null;
    }

    if (this.player) {
      await this.player.stopAndClear();
      this.player = null;
    }
  }

  async cleanup(): Promise<void> {
    if (this.active) {
      await this.cancelTurn();
    }
  }

  private async onLLMToken(token: string): Promise<void> {
    if (!this.active || !this.tts) {
      return;
    }

    await this.tts.send(token);
  }

  private async onLLMDone(): Promise<void> {
    if (!this.active || !this.tts) {
      return;
    }

    await this.tts.flush();
  }

  private async onTTSAudio(audioBase64: string): Promise<void> {
    if (!this.active || !this.player) {
      return;
    }

    await this.player.sendChunk(audioBase64);
  }

  private async onTTSDone(): Promise<void> {
    if (!this.active || !this.player) {
      return;
    }

    this.player.markTtsDone();
  }

  private onPlaybackDone(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.tts = null;
    this.player = null;
    this.onDone();
  }
}
