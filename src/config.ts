import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3040),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  TWILIO_PUBLIC_URL: z.string().url(),

  DEEPGRAM_API_KEY: z.string().min(1),
  DEEPGRAM_FLUX_WS_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),

  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1).default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_MODEL_ID: z.string().min(1).default("eleven_turbo_v2_5"),
});

export type AppConfig = z.infer<typeof envSchema>;

const isTestEnv =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1";

const withTestFallbacks = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  if (!isTestEnv) {
    return env;
  }

  return {
    ...env,
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID ?? "test_twilio_account_sid",
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN ?? "test_twilio_auth_token",
    TWILIO_PHONE_NUMBER: env.TWILIO_PHONE_NUMBER ?? "+10000000000",
    TWILIO_PUBLIC_URL: env.TWILIO_PUBLIC_URL ?? "https://example.ngrok-free.app",
    DEEPGRAM_API_KEY: env.DEEPGRAM_API_KEY ?? "test_deepgram_api_key",
    OPENAI_API_KEY: env.OPENAI_API_KEY ?? "test_openai_api_key",
    ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY ?? "test_elevenlabs_api_key",
  };
};

export const config: AppConfig = envSchema.parse(withTestFallbacks(process.env));
