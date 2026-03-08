import { describe, expect, it } from "vitest";

import { processEvent } from "../src/state/processEvent.js";
import { initialState, type AppState } from "../src/state/types.js";

const listeningState: AppState = {
  phase: "LISTENING",
  streamSid: "stream-1",
};

const respondingState: AppState = {
  phase: "RESPONDING",
  streamSid: "stream-1",
};

describe("processEvent", () => {
  it("sets stream sid on STREAM_START", () => {
    const result = processEvent(initialState(), {
      type: "STREAM_START",
      streamSid: "stream-2",
    });

    expect(result.state.phase).toBe("LISTENING");
    expect(result.state.streamSid).toBe("stream-2");
    expect(result.actions).toEqual([]);
  });

  it("forwards MEDIA to flux in listening", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = processEvent(listeningState, {
      type: "MEDIA",
      audioBytes: bytes,
    });

    expect(result.actions).toEqual([{ type: "FEED_FLUX", audioBytes: bytes }]);
  });

  it("forwards MEDIA to flux in responding", () => {
    const bytes = new Uint8Array([9]);
    const result = processEvent(respondingState, {
      type: "MEDIA",
      audioBytes: bytes,
    });

    expect(result.actions).toEqual([{ type: "FEED_FLUX", audioBytes: bytes }]);
  });

  it("starts agent turn on FLUX_END_OF_TURN while listening", () => {
    const result = processEvent(listeningState, {
      type: "FLUX_END_OF_TURN",
      transcript: "hello there",
    });

    expect(result.state.phase).toBe("RESPONDING");
    expect(result.actions).toEqual([
      { type: "START_AGENT_TURN", transcript: "hello there" },
    ]);
  });

  it("ignores empty FLUX_END_OF_TURN", () => {
    const result = processEvent(listeningState, {
      type: "FLUX_END_OF_TURN",
      transcript: "  ",
    });

    expect(result.state.phase).toBe("LISTENING");
    expect(result.actions).toEqual([]);
  });

  it("resets agent on FLUX_START_OF_TURN while responding", () => {
    const result = processEvent(respondingState, {
      type: "FLUX_START_OF_TURN",
    });

    expect(result.state.phase).toBe("LISTENING");
    expect(result.actions).toEqual([{ type: "RESET_AGENT_TURN" }]);
  });

  it("moves back to listening on AGENT_TURN_DONE", () => {
    const result = processEvent(respondingState, {
      type: "AGENT_TURN_DONE",
    });

    expect(result.state.phase).toBe("LISTENING");
    expect(result.actions).toEqual([]);
  });

  it("resets agent on STREAM_STOP while responding", () => {
    const result = processEvent(respondingState, {
      type: "STREAM_STOP",
    });

    expect(result.actions).toEqual([{ type: "RESET_AGENT_TURN" }]);
  });
});
