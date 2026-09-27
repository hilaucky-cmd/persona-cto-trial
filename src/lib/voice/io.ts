import type { CallFailure } from "@/lib/onboarding/types";

export type ListenResult =
  | { type: "transcript"; text: string }
  /** Nothing usable was heard, or the listen was aborted. Safe to listen again. */
  | { type: "no_speech" }
  | { type: "error"; failure: CallFailure };

/** Progress within one listen, for the call UI. */
export type ListenStage =
  /** Speech detected; recording until the user pauses. */
  | "hearing"
  /** A while has passed without any speech. */
  | "quiet"
  /** The user paused; the recording is being transcribed. Mic is off. */
  | "transcribing";

/**
 * Everything the call needs from the browser. Swappable so the call flow can
 * be exercised without a microphone.
 */
export interface VoiceIO {
  /** Returns why a call can't start in this browser, or `null`. */
  checkSupport(): CallFailure | null;
  /**
   * Opens the microphone for the call. Returns the failure, or `null` once
   * it's open. The microphone is released when `signal` aborts.
   */
  requestMicrophone(signal: AbortSignal): Promise<CallFailure | null>;
  /** Listens for one utterance. Resolves `no_speech` if aborted. */
  listen(
    onStage: (stage: ListenStage) => void,
    signal: AbortSignal,
  ): Promise<ListenResult>;
  /** Speaks the text. Resolves false if speech failed, true when done or aborted. */
  speak(text: string, signal: AbortSignal): Promise<boolean>;
}

let override: VoiceIO | null = null;

/** Dev-only testing seam: replaces the browser's speech APIs. */
export function setVoiceOverride(io: VoiceIO | null): void {
  override = io;
}

export function getVoiceOverride(): VoiceIO | null {
  return override;
}
