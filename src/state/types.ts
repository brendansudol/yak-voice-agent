export type Phase = "LISTENING" | "RESPONDING";

export type AppState = {
  phase: Phase;
  streamSid?: string;
};

export const initialState = (): AppState => ({
  phase: "LISTENING",
  streamSid: undefined,
});

export type StreamStartEvent = {
  type: "STREAM_START";
  streamSid: string;
};

export type StreamStopEvent = {
  type: "STREAM_STOP";
};

export type MediaEvent = {
  type: "MEDIA";
  audioBytes: Uint8Array;
};

export type FluxStartOfTurnEvent = {
  type: "FLUX_START_OF_TURN";
};

export type FluxEndOfTurnEvent = {
  type: "FLUX_END_OF_TURN";
  transcript: string;
};

export type AgentTurnDoneEvent = {
  type: "AGENT_TURN_DONE";
};

export type Event =
  | StreamStartEvent
  | StreamStopEvent
  | MediaEvent
  | FluxStartOfTurnEvent
  | FluxEndOfTurnEvent
  | AgentTurnDoneEvent;

export type FeedFluxAction = {
  type: "FEED_FLUX";
  audioBytes: Uint8Array;
};

export type StartAgentTurnAction = {
  type: "START_AGENT_TURN";
  transcript: string;
};

export type ResetAgentTurnAction = {
  type: "RESET_AGENT_TURN";
};

export type Action = FeedFluxAction | StartAgentTurnAction | ResetAgentTurnAction;
