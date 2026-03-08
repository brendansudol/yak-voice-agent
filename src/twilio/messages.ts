import type { Event } from "../state/types.js";

export type TwilioIncomingMessage = {
  event?: string;
  start?: {
    streamSid?: string;
  };
  media?: {
    payload?: string;
  };
};

export const parseTwilioMessage = (data: TwilioIncomingMessage): Event | null => {
  if (data.event === "start") {
    const streamSid = data.start?.streamSid;
    if (streamSid && streamSid.length > 0) {
      return { type: "STREAM_START", streamSid };
    }
    return null;
  }

  if (data.event === "media") {
    const payload = data.media?.payload;
    if (!payload) {
      return null;
    }

    const audioBytes = Uint8Array.from(Buffer.from(payload, "base64"));
    return {
      type: "MEDIA",
      audioBytes,
    };
  }

  if (data.event === "stop") {
    return { type: "STREAM_STOP" };
  }

  return null;
};
