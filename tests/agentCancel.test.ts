import type WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";

import { Agent } from "../src/agent/agent.js";
import type { AudioPlayerLike } from "../src/services/audioPlayer.js";
import type { LLMServiceLike } from "../src/services/llmService.js";
import type { TTSPoolLike } from "../src/services/ttsPool.js";
import type { TTSServiceLike } from "../src/services/ttsService.js";

describe("Agent cancel behavior", () => {
  it("cancels LLM, TTS, and Player on barge-in reset", async () => {
    const llmStart = vi.fn(async () => {});
    const llmCancel = vi.fn(async () => {});

    const llm: LLMServiceLike = {
      history: [],
      start: llmStart,
      cancel: llmCancel,
    };

    const tts: TTSServiceLike = {
      bind: vi.fn(),
      start: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
      cancel: vi.fn(async () => {}),
    };

    const poolGet = vi.fn(async () => tts);

    const ttsPool: TTSPoolLike = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      get: poolGet,
    };

    const player: AudioPlayerLike = {
      isPlaying: true,
      sendChunk: vi.fn(async () => {}),
      markTtsDone: vi.fn(),
      stopAndClear: vi.fn(async () => {}),
    };

    const agent = new Agent(
      {
        socket: {} as WebSocket,
        streamSid: "MZ123",
        ttsPool,
        onDone: vi.fn(),
      },
      {
        createLLM: () => llm,
        createPlayer: () => player,
      },
    );

    await agent.startTurn("hello");
    await agent.cancelTurn();

    expect(poolGet).toHaveBeenCalledOnce();
    expect(llmStart).toHaveBeenCalledWith("hello");
    expect(llmCancel).toHaveBeenCalledOnce();
    expect(tts.cancel).toHaveBeenCalledOnce();
    expect(player.stopAndClear).toHaveBeenCalledOnce();
  });
});
