import type { Action, AppState, Event } from "./types.js";

export const processEvent = (
  state: AppState,
  event: Event,
): { state: AppState; actions: Action[] } => {
  if (event.type === "STREAM_START") {
    return {
      state: { ...state, streamSid: event.streamSid, phase: "LISTENING" },
      actions: [],
    };
  }

  if (event.type === "STREAM_STOP") {
    const actions: Action[] = [];
    if (state.phase === "RESPONDING") {
      actions.push({ type: "RESET_AGENT_TURN" });
    }
    return { state, actions };
  }

  if (event.type === "MEDIA") {
    return {
      state,
      actions: [{ type: "FEED_FLUX", audioBytes: event.audioBytes }],
    };
  }

  if (event.type === "FLUX_END_OF_TURN") {
    const transcript = event.transcript.trim();
    if (transcript.length > 0 && state.phase === "LISTENING") {
      return {
        state: { ...state, phase: "RESPONDING" },
        actions: [{ type: "START_AGENT_TURN", transcript }],
      };
    }
    return { state, actions: [] };
  }

  if (event.type === "FLUX_START_OF_TURN") {
    if (state.phase === "RESPONDING") {
      return {
        state: { ...state, phase: "LISTENING" },
        actions: [{ type: "RESET_AGENT_TURN" }],
      };
    }
    return { state, actions: [] };
  }

  if (event.type === "AGENT_TURN_DONE") {
    if (state.phase === "RESPONDING") {
      return {
        state: { ...state, phase: "LISTENING" },
        actions: [],
      };
    }
    return { state, actions: [] };
  }

  return { state, actions: [] };
};
