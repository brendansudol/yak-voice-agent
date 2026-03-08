import type WebSocket from "ws";

import { Agent } from "../agent/agent.js";
import { logger } from "../logging/logger.js";
import { processEvent } from "../state/processEvent.js";
import { initialState, type Event } from "../state/types.js";
import { FluxService } from "../services/fluxService.js";
import { TTSPool } from "../services/ttsPool.js";
import { parseTwilioMessage } from "../twilio/messages.js";
import { AsyncQueue } from "../utils/asyncQueue.js";

export const runConversationOverTwilio = async (socket: WebSocket): Promise<void> => {
  const eventQueue = new AsyncQueue<Event>();
  const ttsPool = new TTSPool(1, 8);

  const flux = new FluxService({
    onStartOfTurn: async () => {
      eventQueue.push({ type: "FLUX_START_OF_TURN" });
    },
    onEndOfTurn: async (transcript) => {
      eventQueue.push({ type: "FLUX_END_OF_TURN", transcript });
    },
  });

  let agent: Agent | null = null;
  let state = initialState();
  let streamSid: string | undefined;
  let stopped = false;

  const pushStop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    eventQueue.push({ type: "STREAM_STOP" });
  };

  const onMessage = (raw: WebSocket.RawData): void => {
    try {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      const parsed = JSON.parse(text) as Parameters<typeof parseTwilioMessage>[0];
      const event = parseTwilioMessage(parsed);
      if (event) {
        eventQueue.push(event);
      }
    } catch (err) {
      logger.warn({ err }, "failed to parse twilio websocket payload");
    }
  };

  const onClose = (): void => {
    pushStop();
  };

  const onError = (err: Error): void => {
    logger.warn({ err }, "twilio websocket error");
    pushStop();
  };

  socket.on("message", onMessage);
  socket.on("close", onClose);
  socket.on("error", onError);

  try {
    while (true) {
      const event = await eventQueue.pop();

      if (event.type === "STREAM_START") {
        streamSid = event.streamSid;
        await flux.start();
        await ttsPool.start();
        agent = new Agent({
          socket,
          streamSid: event.streamSid,
          ttsPool,
          onDone: () => {
            eventQueue.push({ type: "AGENT_TURN_DONE" });
          },
        });
      }

      const result = processEvent(state, event);
      state = result.state;

      for (const action of result.actions) {
        if (action.type === "FEED_FLUX") {
          await flux.send(action.audioBytes);
          continue;
        }

        if (action.type === "START_AGENT_TURN") {
          await agent?.startTurn(action.transcript);
          continue;
        }

        if (action.type === "RESET_AGENT_TURN") {
          await agent?.cancelTurn();
        }
      }

      if (event.type === "STREAM_STOP") {
        break;
      }
    }
  } finally {
    socket.off("message", onMessage);
    socket.off("close", onClose);
    socket.off("error", onError);

    try {
      await agent?.cleanup();
    } catch (err) {
      logger.warn({ err }, "agent cleanup failed");
    }

    await Promise.allSettled([ttsPool.stop(), flux.stop()]);

    logger.info({ streamSid }, "conversation ended");
  }
};
