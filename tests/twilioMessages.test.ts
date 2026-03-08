import { describe, expect, it } from "vitest";

import { parseTwilioMessage } from "../src/twilio/messages.js";

describe("parseTwilioMessage", () => {
  it("parses start event", () => {
    const event = parseTwilioMessage({
      event: "start",
      start: { streamSid: "MZ123" },
    });

    expect(event).toEqual({ type: "STREAM_START", streamSid: "MZ123" });
  });

  it("parses media event with base64 payload", () => {
    const payload = Buffer.from([0, 1, 2]).toString("base64");

    const event = parseTwilioMessage({
      event: "media",
      media: { payload },
    });

    expect(event).toEqual({
      type: "MEDIA",
      audioBytes: new Uint8Array([0, 1, 2]),
    });
  });

  it("parses stop event", () => {
    const event = parseTwilioMessage({ event: "stop" });
    expect(event).toEqual({ type: "STREAM_STOP" });
  });

  it("returns null for unknown event", () => {
    const event = parseTwilioMessage({ event: "connected" });
    expect(event).toBeNull();
  });
});
