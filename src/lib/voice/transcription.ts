/** Contract for `POST /api/voice/transcribe`. The body is the raw audio. */

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** Recorder formats the server accepts, mapped to the file extension OpenAI expects. */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

export interface TranscriptionResponse {
  text: string;
}

export interface TranscriptionErrorResponse {
  error: string;
}

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function requestTranscription(
  audio: Blob,
  signal: AbortSignal,
): Promise<TranscriptionResult> {
  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": audio.type },
    body: audio,
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as TranscriptionErrorResponse).error)
        : "Unknown error";
    return { ok: false, error: `HTTP ${response.status}: ${error}` };
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as TranscriptionResponse).text !== "string"
  ) {
    return { ok: false, error: "Malformed transcription response" };
  }
  return { ok: true, text: (body as TranscriptionResponse).text };
}
