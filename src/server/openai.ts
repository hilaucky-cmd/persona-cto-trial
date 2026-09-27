import "server-only";
import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";

/** Model used for the onboarding conversation. Change it here. */
export const OPENAI_MODEL = "gpt-6-luna";
export const OPENAI_REASONING_EFFORT: ReasoningEffort = "low";

/** Model that turns call audio into text. */
export const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

let client: OpenAI | null = null;

/** Reads `OPENAI_API_KEY` from the server environment. */
export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  client ??= new OpenAI({ timeout: 20_000, maxRetries: 1 });
  return client;
}

/**
 * Logs enough to debug without leaking secrets. OpenAI error messages can
 * echo part of the API key (e.g. on 401), so only structured fields are logged.
 */
export function logOpenAIError(scope: string, error: unknown): void {
  if (error instanceof OpenAI.APIError) {
    console.error(`[${scope}] OpenAI API error`, {
      status: error.status,
      code: error.code,
      type: error.type,
      requestId: error.requestID,
    });
  } else if (error instanceof Error) {
    console.error(`[${scope}]`, error.name, error.message);
  } else {
    console.error(`[${scope}] Unknown error`);
  }
}
