import OpenAI from "openai";

import { config } from "../config.js";
import { logger } from "../logging/logger.js";

const SYSTEM_PROMPT =
  "You are a helpful voice assistant. Keep responses concise and conversational. Avoid markdown and bullets.";

type LLMCallbacks = {
  onToken: (token: string) => Promise<void>;
  onDone: () => Promise<void>;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface LLMServiceLike {
  readonly history: ChatMessage[];
  start(userMessage: string): Promise<void>;
  cancel(): Promise<void>;
}

export class LLMService implements LLMServiceLike {
  private readonly callbacks: LLMCallbacks;
  private readonly client: OpenAI;

  private task: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private running = false;
  private messages: ChatMessage[] = [];

  constructor(callbacks: LLMCallbacks) {
    this.callbacks = callbacks;
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }

  get history(): ChatMessage[] {
    return [...this.messages];
  }

  async start(userMessage: string): Promise<void> {
    if (this.running) {
      await this.cancel();
    }

    this.messages.push({ role: "user", content: userMessage });
    this.running = true;
    this.abortController = new AbortController();
    this.task = this.generate(this.abortController.signal);
    await Promise.resolve();
  }

  async cancel(): Promise<void> {
    this.running = false;
    this.abortController?.abort();

    if (this.task) {
      try {
        await this.task;
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          logger.warn({ err }, "llm cancel observed non-abort error");
        }
      }
    }

    this.task = null;
    this.abortController = null;
  }

  private async generate(signal: AbortSignal): Promise<void> {
    let assistantResponse = "";

    try {
      const stream = await this.client.chat.completions.create({
        model: config.LLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...this.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 500,
      }, {
        signal,
      });

      for await (const chunk of stream) {
        if (!this.running) {
          break;
        }

        const token = chunk.choices[0]?.delta?.content;
        if (!token) {
          continue;
        }

        assistantResponse += token;
        await this.callbacks.onToken(token);
      }

      if (this.running && assistantResponse.length > 0) {
        this.messages.push({ role: "assistant", content: assistantResponse });
      }

      if (this.running) {
        await this.callbacks.onDone();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      logger.error({ err }, "llm generation failed");
      if (this.running) {
        await this.callbacks.onDone();
      }
    } finally {
      this.running = false;
      this.task = null;
      this.abortController = null;
    }
  }
}
