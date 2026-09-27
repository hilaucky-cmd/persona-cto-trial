import type { CallFailure } from "@/lib/onboarding/types";
import { setVoiceOverride, type ListenResult, type VoiceIO } from "./io";

/**
 * Development-only stand-in for the microphone and speaker. Transcripts are
 * typed into the debug panel; speech output is a short delay. Lets the full
 * call flow run in any browser, including automated ones.
 */

export const SIMULATED_SCENARIOS = [
  "works",
  "mic_permission_denied",
  "mic_unavailable",
  "mic_silent",
  "speech_unsupported",
  "speech_error",
  "synthesis_failed",
] as const;
export type SimulatedScenario = (typeof SIMULATED_SCENARIOS)[number];

export interface SimulatorSnapshot {
  enabled: boolean;
  scenario: SimulatedScenario;
  listening: boolean;
  lastSpoken: string | null;
}

let snapshot: SimulatorSnapshot = {
  enabled: false,
  scenario: "works",
  listening: false,
  lastSpoken: null,
};
const listeners = new Set<() => void>();
let pendingListen: ((result: ListenResult) => void) | null = null;

function update(patch: Partial<SimulatorSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export const simulator = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  setEnabled(enabled: boolean) {
    setVoiceOverride(enabled ? simulatedVoice : null);
    update({ enabled });
  },
  setScenario(scenario: SimulatedScenario) {
    update({ scenario });
  },
  /** Delivers a transcript as if the user had spoken it. */
  say(text: string): boolean {
    if (!pendingListen) return false;
    pendingListen({ type: "transcript", text });
    return true;
  },
  /** Ends the current listen with nothing heard. */
  silence(): boolean {
    if (!pendingListen) return false;
    pendingListen({ type: "no_speech" });
    return true;
  },
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const failureFor = (scenario: SimulatedScenario): CallFailure | null =>
  scenario === "works" ? null : scenario;

const simulatedVoice: VoiceIO = {
  checkSupport: () =>
    snapshot.scenario === "speech_unsupported" ? "speech_unsupported" : null,

  async requestMicrophone(signal) {
    await delay(400, signal);
    const failure = failureFor(snapshot.scenario);
    return failure === "mic_permission_denied" || failure === "mic_unavailable"
      ? failure
      : null;
  },

  listen(onStage, signal) {
    const scenario = snapshot.scenario;
    if (scenario === "speech_error" || scenario === "mic_silent") {
      return delay(600, signal).then(() =>
        signal.aborted
          ? { type: "no_speech" as const }
          : { type: "error" as const, failure: scenario },
      );
    }
    return new Promise((resolve) => {
      if (signal.aborted) return resolve({ type: "no_speech" });
      const finish = (result: ListenResult) => {
        if (pendingListen !== finish) return;
        pendingListen = null;
        update({ listening: false });
        if (result.type === "transcript") {
          onStage("hearing");
          onStage("transcribing");
        }
        resolve(result);
      };
      pendingListen = finish;
      update({ listening: true });
      signal.addEventListener("abort", () => finish({ type: "no_speech" }), {
        once: true,
      });
    });
  },

  async speak(text, signal) {
    if (snapshot.scenario === "synthesis_failed") return false;
    update({ lastSpoken: text });
    await delay(Math.min(600 + text.length * 15, 3_000), signal);
    return true;
  },
};
