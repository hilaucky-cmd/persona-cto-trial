import { toFile } from "openai";
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/contract";
import {
  AUDIO_EXTENSIONS,
  MAX_AUDIO_BYTES,
  baseMimeType,
  type TranscriptionErrorResponse,
  type TranscriptionResponse,
} from "@/lib/voice/transcription";
import { readBody } from "@/server/http";
import {
  OPENAI_TRANSCRIPTION_MODEL,
  getOpenAIClient,
  logOpenAIError,
} from "@/server/openai";

function errorResponse(status: number, error: string) {
  return Response.json({ error } satisfies TranscriptionErrorResponse, {
    status,
  });
}

/**
 * Turns one recorded utterance into text. Stateless: it never reads or
 * changes onboarding state. The transcript goes back to the browser, which
 * submits it through the normal turn endpoint as untrusted user input.
 */
export async function POST(request: Request) {
  const mimeType = baseMimeType(request.headers.get("content-type") ?? "");
  const extension = AUDIO_EXTENSIONS[mimeType];
  if (!extension) {
    return errorResponse(415, "Unsupported audio format");
  }

  const audio = await readBody(request, MAX_AUDIO_BYTES).catch(() => undefined);
  if (audio === null) {
    return errorResponse(413, "Recording too large");
  }
  if (!audio || audio.byteLength === 0) {
    return errorResponse(400, "Empty recording");
  }

  try {
    const result = await getOpenAIClient().audio.transcriptions.create({
      file: await toFile(audio, `speech.${extension}`, {
        type: mimeType,
      }),
      model: OPENAI_TRANSCRIPTION_MODEL,
      response_format: "json",
    });
    const text = result.text.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
    return Response.json({ text } satisfies TranscriptionResponse);
  } catch (error) {
    logOpenAIError("voice/transcribe", error);
    return errorResponse(502, "Transcription failed");
  }
}
