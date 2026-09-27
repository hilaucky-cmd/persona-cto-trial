/**
 * Observable state of the voice pipeline, for the development diagnostics
 * view. Holds no audio and nothing secret; production never renders it.
 */

export type VoiceLifecycle =
  | "idle"
  | "opening_mic"
  | "mic_ready"
  | "waiting_for_speech"
  | "hearing_speech"
  | "transcribing"
  | "transcribed"
  | "empty_transcript"
  | "error"
  | "mic_closed";

export interface VoiceDiagnostics {
  engine: string;
  supported: {
    getUserMedia: boolean;
    mediaRecorder: boolean;
    audioContext: boolean;
    speechSynthesis: boolean;
  } | null;
  lifecycle: VoiceLifecycle;
  micTrack: string | null;
  recorderMimeType: string | null;
  audioContextState: string | null;
  /** RMS of the latest sample window, 0–1. */
  level: number;
  /** Level above which sound counts as speech. */
  speechThreshold: number;
  /** Any non-zero signal from the mic during the current listen. */
  audioDetected: boolean;
  speechDetected: boolean;
  finalTranscript: string | null;
  uploadBytes: number | null;
  transcriptionMs: number | null;
  lastEvent: string | null;
  lastError: string | null;
}

const INITIAL: VoiceDiagnostics = {
  engine: "none",
  supported: null,
  lifecycle: "idle",
  micTrack: null,
  recorderMimeType: null,
  audioContextState: null,
  level: 0,
  speechThreshold: 0,
  audioDetected: false,
  speechDetected: false,
  finalTranscript: null,
  uploadBytes: null,
  transcriptionMs: null,
  lastEvent: null,
  lastError: null,
};

let snapshot = INITIAL;
const listeners = new Set<() => void>();

export const voiceDiagnostics = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => INITIAL,
  update(patch: Partial<VoiceDiagnostics>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  },
  /** Records a lifecycle event, optionally moving to a new lifecycle state. */
  event(name: string, lifecycle?: VoiceLifecycle) {
    const time = new Date().toISOString().slice(11, 23);
    voiceDiagnostics.update({
      lastEvent: `${time} ${name}`,
      ...(lifecycle ? { lifecycle } : {}),
    });
  },
  error(message: string) {
    voiceDiagnostics.update({ lastError: message });
    voiceDiagnostics.event(`error: ${message}`, "error");
  },
};
