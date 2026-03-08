import { config } from "./config.js";
import { logger } from "./logging/logger.js";
import { buildServer } from "./server.js";
import { makeOutboundCall, normalizePhoneNumber } from "./twilio/client.js";

const start = async (): Promise<void> => {
  const app = await buildServer();

  await app.listen({
    host: "0.0.0.0",
    port: config.PORT,
  });

  logger.info({ port: config.PORT }, "server listening");

  const phoneNumberArg = process.argv[2];
  if (phoneNumberArg) {
    const number = normalizePhoneNumber(phoneNumberArg);
    const callSid = await makeOutboundCall(number);
    logger.info({ number, callSid }, "outbound call initiated");
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

start().catch((err: unknown) => {
  logger.error({ err }, "startup failed");
  process.exit(1);
});
