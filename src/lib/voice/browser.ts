import type { CallFailure } from "@/lib/onboarding/types";
import { voiceDiagnostics as diag } from "./diagnostics";
import type { ListenResult, ListenStage, VoiceIO } from "./io";
import { requestTranscription } from "./transcription";

/*
 * Speech-to-text: the browser records one utterance and the server transcribes
 * it. Built-in browser recognition (Web Speech) isn't used: outside Google
 * Chrome it's missing or has no working service behind it — embedded
 * Chromium, for one, starts and then errors with "network" or never responds.
 */

// Speech detection works on the RMS level of the mic signal, sampled on a timer.
const TICK_MS = 50;
/** Sound must stay above the threshold this long to count as speech. */
const SPEECH_START_MS = 200;
/** A pause this long ends the utterance. */
const SPEECH_END_MS = 1_100;
const MAX_UTTERANCE_MS = 30_000;
/** Ignore the first moments of a listen so the tail of our own speech isn't heard. */
const SETTLE_MS = 300;
const MIN_THRESHOLD = 0.01;
const THRESHOLD_OVER_NOISE = 3;
/** While waiting, restart the recording this often so leading silence stays short. */
const ROLL_RECORDING_MS = 10_000;
const QUIET_NOTICE_MS = 15_000;
/** A mic that produces exact silence this long is muted or disconnected. */
const SILENT_MIC_MS = 8_000;
/** Recordings smaller than this can't hold intelligible speech. */
const MIN_RECORDING_BYTES = 1_000;

const RECORDER_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

interface Microphone {
  stream: MediaStream;
  track: MediaStreamTrack;
  context: AudioContext;
  analyser: AnalyserNode;
  mimeType: string | undefined;
}

let mic: Microphone | null = null;

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  );
}

function detectSupport() {
  const supported = {
    getUserMedia:
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== "undefined",
    audioContext: getAudioContextConstructor() !== null,
    speechSynthesis: typeof window !== "undefined" && !!window.speechSynthesis,
  };
  diag.update({ engine: "server transcription (OpenAI)", supported });
  return supported;
}

function pickMimeType(): string | undefined {
  return RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function release(target: Microphone) {
  target.stream.getTracks().forEach((track) => track.stop());
  void target.context.close().catch(() => {});
  if (mic === target) {
    mic = null;
    diag.update({ micTrack: null, audioContextState: null, level: 0 });
    diag.event("microphone released", "mic_closed");
  }
}

async function requestMicrophone(signal: AbortSignal): Promise<CallFailure | null> {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
    return "speech_unsupported";
  }
  // Created before any await, while still inside the user's click, so
  // browsers that gate audio on a gesture (Safari) let it run.
  const context = new AudioContextConstructor();
  diag.update({
    lastError: null,
    finalTranscript: null,
    uploadBytes: null,
    transcriptionMs: null,
  });
  diag.event("requesting microphone", "opening_mic");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    void context.close().catch(() => {});
    const name = error instanceof DOMException ? error.name : "";
    diag.error(`getUserMedia ${name || "failed"}`);
    return name === "NotAllowedError" || name === "SecurityError"
      ? "mic_permission_denied"
      : "mic_unavailable";
  }

  const track = stream.getAudioTracks()[0];
  const opened: Microphone = {
    stream,
    track,
    context,
    analyser: context.createAnalyser(),
    mimeType: pickMimeType(),
  };
  if (!track) {
    release(opened);
    diag.error("no audio track");
    return "mic_unavailable";
  }
  if (signal.aborted) {
    release(opened);
    return null;
  }

  await context.resume().catch(() => {});
  opened.analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(opened.analyser);
  // Nothing is captured until a listen turns the track on.
  track.enabled = false;
  track.addEventListener("ended", () => diag.error("microphone track ended"));
  mic = opened;
  signal.addEventListener("abort", () => release(opened), { once: true });

  diag.update({
    micTrack: track.label || "(unlabelled)",
    recorderMimeType: opened.mimeType ?? "(browser default)",
    audioContextState: context.state,
  });
  diag.event("microphone open", "mic_ready");
  return null;
}

function readLevel(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.sqrt(sum / buffer.length);
}

/** Records until stopped. `stop()` resolves the recording, or null if discarded. */
function startRecording(current: Microphone) {
  const recorder = new MediaRecorder(current.stream, {
    ...(current.mimeType ? { mimeType: current.mimeType } : {}),
    audioBitsPerSecond: 32_000,
  });
  const chunks: Blob[] = [];
  let failed = false;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    failed = true;
    diag.error("MediaRecorder error");
  };
  recorder.start();

  return {
    get failed() {
      return failed;
    },
    stop(keep: boolean): Promise<Blob | null> {
      return new Promise((resolve) => {
        if (recorder.state === "inactive") {
          return resolve(keep && chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
        }
        recorder.onstop = () =>
          resolve(keep ? new Blob(chunks, { type: recorder.mimeType }) : null);
        recorder.stop();
      });
    },
  };
}

function listen(
  onStage: (stage: ListenStage) => void,
  signal: AbortSignal,
): Promise<ListenResult> {
  if (!mic || mic.track.readyState === "ended") {
    diag.error("microphone not available for listening");
    return Promise.resolve({ type: "error", failure: "mic_unavailable" });
  }
  if (signal.aborted) return Promise.resolve({ type: "no_speech" });
  const current: Microphone = mic;

  return new Promise((resolve) => {
    const { track, analyser, context } = current;
    const buffer = new Float32Array(analyser.fftSize);
    track.enabled = true;
    let recording = startRecording(current);

    const startedAt = performance.now();
    let recordingStartedAt = startedAt;
    let lastTick = startedAt;
    let noiseFloor = 0.003;
    let aboveMs = 0;
    let belowMs = 0;
    let speechStartedAt: number | null = null;
    let audioDetected = false;
    let quietNotified = false;
    let lastLevelUpdate = 0;
    let settled = false;

    diag.update({
      audioDetected: false,
      speechDetected: false,
      audioContextState: context.state,
    });
    diag.event("listening", "waiting_for_speech");

    const timer = window.setInterval(tick, TICK_MS);
    signal.addEventListener("abort", onAbort, { once: true });

    function cleanup() {
      window.clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
      track.enabled = false;
      diag.update({ level: 0 });
    }

    function onAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      void recording.stop(false);
      diag.event("listen aborted", "mic_ready");
      resolve({ type: "no_speech" });
    }

    function fail(failure: CallFailure, reason: string) {
      if (settled) return;
      settled = true;
      cleanup();
      void recording.stop(false);
      diag.error(reason);
      resolve({ type: "error", failure });
    }

    function tick() {
      if (settled) return;
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const elapsed = now - startedAt;

      if (track.readyState === "ended") {
        return fail("mic_unavailable", "microphone disconnected");
      }
      if (recording.failed) return fail("speech_error", "recording failed");

      const level = readLevel(analyser, buffer);
      const threshold = Math.max(MIN_THRESHOLD, noiseFloor * THRESHOLD_OVER_NOISE);
      if (level > 1e-5 && !audioDetected) {
        audioDetected = true;
        diag.update({ audioDetected: true });
        diag.event("audio signal detected");
      }
      if (now - lastLevelUpdate > 100) {
        lastLevelUpdate = now;
        diag.update({ level, speechThreshold: threshold, audioContextState: context.state });
      }

      if (speechStartedAt === null) {
        if (!audioDetected && elapsed > SILENT_MIC_MS && context.state === "running") {
          return fail("mic_silent", "no signal from microphone");
        }
        if (level > threshold && elapsed > SETTLE_MS) {
          aboveMs += dt;
          if (aboveMs >= SPEECH_START_MS) {
            speechStartedAt = now;
            belowMs = 0;
            diag.update({ speechDetected: true });
            diag.event("speech started", "hearing_speech");
            onStage("hearing");
          }
          return;
        }
        aboveMs = 0;
        noiseFloor = noiseFloor * 0.95 + level * 0.05;
        if (!quietNotified && elapsed > QUIET_NOTICE_MS) {
          quietNotified = true;
          diag.event("no speech yet");
          onStage("quiet");
        }
        if (now - recordingStartedAt > ROLL_RECORDING_MS) {
          void recording.stop(false);
          recording = startRecording(current);
          recordingStartedAt = now;
        }
        return;
      }

      belowMs = level < threshold * 0.6 ? belowMs + dt : 0;
      if (belowMs >= SPEECH_END_MS || now - speechStartedAt > MAX_UTTERANCE_MS) {
        void finish();
      }
    }

    async function finish() {
      settled = true;
      cleanup();
      onStage("transcribing");
      diag.event("speech ended", "transcribing");
      const audio = await recording.stop(true);
      if (signal.aborted) return resolve({ type: "no_speech" });
      if (!audio || audio.size < MIN_RECORDING_BYTES) {
        diag.event("recording too short", "empty_transcript");
        return resolve({ type: "no_speech" });
      }

      diag.update({ uploadBytes: audio.size });
      const sentAt = performance.now();
      try {
        const result = await requestTranscription(audio, signal);
        diag.update({ transcriptionMs: Math.round(performance.now() - sentAt) });
        if (!result.ok) {
          diag.error(`transcription ${result.error}`);
          return resolve({ type: "error", failure: "speech_error" });
        }
        diag.update({ finalTranscript: result.text });
        if (!result.text) {
          diag.event("empty transcript", "empty_transcript");
          return resolve({ type: "no_speech" });
        }
        diag.event("transcribed", "transcribed");
        resolve({ type: "transcript", text: result.text });
      } catch (error) {
        if (signal.aborted) return resolve({ type: "no_speech" });
        diag.error(
          `transcription request ${error instanceof Error ? error.message : "failed"}`,
        );
        resolve({ type: "error", failure: "speech_error" });
      }
    }
  });
}

/** Emoji and pictographs are read out literally by most voices. */
function toSpeakable(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Chrome can garbage-collect an utterance mid-speech and never fire `end`,
// so keep a reference until it finishes.
let speaking: SpeechSynthesisUtterance | null = null;

function speak(text: string, signal: AbortSignal): Promise<boolean> {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth) return Promise.resolve(false);
  const speakable = toSpeakable(text);
  if (!speakable) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (signal.aborted) return resolve(true);
    const utterance = new SpeechSynthesisUtterance(speakable);
    utterance.lang = navigator.language || "en-US";
    speaking = utterance;

    // Some browsers occasionally never fire `end`. Don't hang the call.
    const watchdog = window.setTimeout(
      () => finish(true),
      5_000 + speakable.length * 120,
    );
    const stop = () => {
      synth.cancel();
      finish(true);
    };
    function finish(ok: boolean) {
      window.clearTimeout(watchdog);
      signal.removeEventListener("abort", stop);
      if (speaking === utterance) speaking = null;
      resolve(ok);
    }

    utterance.onend = () => finish(true);
    utterance.onerror = (event) =>
      // `canceled`/`interrupted` come from our own cancel().
      finish(event.error === "canceled" || event.error === "interrupted");
    signal.addEventListener("abort", stop, { once: true });

    synth.cancel(); // Clear anything stuck in the queue.
    synth.speak(utterance);
  });
}

export const browserVoice: VoiceIO = {
  checkSupport: () => {
    const supported = detectSupport();
    if (!supported.getUserMedia || !supported.mediaRecorder || !supported.audioContext) {
      diag.error("browser can't record audio");
      return "speech_unsupported";
    }
    if (!supported.speechSynthesis) return "synthesis_failed";
    return null;
  },
  requestMicrophone,
  listen,
  speak,
};
