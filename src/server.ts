import Fastify, { type FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import type WebSocket from "ws";

import { runConversationOverTwilio } from "./conversation/runConversation.js";
import { logger } from "./logging/logger.js";
import { makeOutboundCall, normalizePhoneNumber } from "./twilio/client.js";
import { buildTwimlResponse } from "./twilio/twiml.js";

export const buildServer = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  await app.register(websocketPlugin);

  let activeCalls = 0;

  app.get("/health", async () => ({ status: "ok" }));

  app.route({
    method: ["GET", "POST"],
    url: "/twiml",
    handler: async (_request, reply) => {
      const xml = buildTwimlResponse();
      reply.header("content-type", "application/xml");
      reply.send(xml);
    },
  });

  app.route<{ Params: { phoneNumber: string } }>({
    method: ["GET", "POST"],
    url: "/call/:phoneNumber",
    handler: async (request, reply) => {
      const to = normalizePhoneNumber(request.params.phoneNumber);

      try {
        const callSid = await makeOutboundCall(to);
        return {
          status: "calling",
          to,
          callSid,
        };
      } catch (err) {
        logger.error({ err }, "failed to initiate outbound call");
        reply.status(500);
        return { error: "failed to initiate call" };
      }
    },
  });

  app.get(
    "/ws",
    { websocket: true },
    async (socket: WebSocket) => {
      activeCalls += 1;
      logger.info({ activeCalls }, "call connected");

      try {
        await runConversationOverTwilio(socket);
      } catch (err) {
        logger.error({ err }, "conversation loop failed");
      } finally {
        activeCalls -= 1;
        logger.info({ activeCalls }, "call ended");
      }
    },
  );

  return app;
};
