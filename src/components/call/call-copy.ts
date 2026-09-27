import type { CallAttempt, CallFailure } from "@/lib/onboarding/types";

/** Plain-language reasons, written by the app so they never depend on the model. */
export const FAILURE_EXPLANATIONS: Record<CallFailure, string> = {
  mic_permission_denied:
    "Microphone access is blocked. You can allow it in your browser's site settings and try again.",
  mic_unavailable: "No working microphone was found.",
  mic_silent:
    "Your microphone isn't picking up any sound. Check that it isn't muted and the right input is selected.",
  speech_unsupported:
    "This browser can't record audio for voice calls. A recent Chrome, Edge, Safari, or Firefox will work.",
  speech_error: "Voice transcription stopped working.",
  synthesis_failed: "This browser couldn't play audio.",
  assistant_unavailable: "The assistant stopped responding.",
};

/** Failures that retrying in the same browser won't fix. */
export const PERMANENT_FAILURES: ReadonlySet<CallFailure> = new Set([
  "speech_unsupported",
  "synthesis_failed",
]);

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function describeAttempt(attempt: CallAttempt): {
  title: string;
  detail: string | null;
} {
  const connected = attempt.connectedAt !== null;
  switch (attempt.endReason) {
    case "user_ended":
      return connected && attempt.endedAt
        ? {
            title: `Call ended · ${formatDuration(
              Date.parse(attempt.endedAt) - Date.parse(attempt.connectedAt!),
            )}`,
            detail: null,
          }
        : { title: "Call cancelled", detail: null };
    case "failed":
      return {
        title: connected ? "Call dropped" : "Call didn't connect",
        detail: attempt.failure ? FAILURE_EXPLANATIONS[attempt.failure] : null,
      };
    case "interrupted":
      return {
        title: "Call interrupted",
        detail: "The page was reloaded during the call.",
      };
    default:
      return { title: "Call", detail: null };
  }
}
