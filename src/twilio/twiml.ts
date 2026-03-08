import { config } from "../config.js";

const toWebSocketUrl = (url: string): string => {
  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  return url;
};

export const buildTwimlResponse = (): string => {
  const wsUrl = `${toWebSocketUrl(config.TWILIO_PUBLIC_URL)}/ws`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;
};
