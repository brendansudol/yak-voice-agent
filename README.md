# yak voice agent (TypeScript)

A shuo-style phone voice agent in TypeScript.

## Prerequisites

- Node.js 22+
- pnpm 10+
- ngrok
- Twilio account + phone number with Voice enabled
- Deepgram API key
- OpenAI API key
- ElevenLabs API key

## Architecture

- Twilio Media Streams over `WS /ws`
- Deepgram Flux for turn detection (`StartOfTurn` / `EndOfTurn`)
- OpenAI streaming LLM (`gpt-4o-mini` by default)
- ElevenLabs streaming TTS
- Pure state machine:
  - `LISTENING -> RESPONDING` on `FLUX_END_OF_TURN`
  - `RESPONDING -> LISTENING` on `AGENT_TURN_DONE`
  - Barge-in interrupt on `FLUX_START_OF_TURN`

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Fill required `.env` values:

- Required:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
  - `TWILIO_PUBLIC_URL`
  - `DEEPGRAM_API_KEY`
  - `OPENAI_API_KEY`
  - `ELEVENLABS_API_KEY`
- Optional:
  - `PORT` (default `3040`)
  - `LOG_LEVEL` (default `info`)
  - `LLM_MODEL` (default `gpt-4o-mini`)
  - `ELEVENLABS_VOICE_ID`
  - `ELEVENLABS_MODEL_ID`
  - `DEEPGRAM_FLUX_WS_URL`

4. Start ngrok:

```bash
ngrok http 3040
```

5. Set `TWILIO_PUBLIC_URL` in `.env` to the ngrok HTTPS URL.

6. Configure your Twilio phone number webhook:
- Twilio Console -> Phone Numbers -> Manage -> Active numbers -> `<your number>`
- In **Voice Configuration** set **A call comes in**:
  - URL: `https://<your-ngrok-domain>/twiml`
  - Method: `HTTP POST`

7. Run the server:

```bash
pnpm dev
```

Optional outbound test call (safer one-shot, with server already running):

```bash
curl -X POST http://localhost:3040/call/+15551234567
```

## Routes

- `GET /health`
- `GET|POST /twiml`
- `GET|POST /call/:phoneNumber` (dev only, no auth)
- `WS /ws`

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm typecheck`
- `pnpm test`

## Notes

- Twilio audio is treated as `mulaw/8000` end-to-end.
- If Deepgram Flux endpoint changes, set `DEEPGRAM_FLUX_WS_URL`.
- This repository is MVP-oriented; no auth, tracing API, or production hardening yet.
