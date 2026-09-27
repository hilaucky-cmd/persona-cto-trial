"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { getOpenAttempt } from "@/lib/onboarding/selectors";
import { voiceDiagnostics } from "@/lib/voice/diagnostics";
import { formatDuration } from "./call-copy";
import { useCall, type CallPhase } from "./CallProvider";
import { HangUpIcon, MicIcon } from "./icons";

// The conditional import keeps diagnostics out of production bundles.
const VoiceDiagnostics =
  process.env.NODE_ENV === "development"
    ? dynamic(() =>
        import("@/components/debug/VoiceDiagnostics").then(
          (mod) => mod.VoiceDiagnostics,
        ),
      )
    : null;

const PHASE_LABELS: Record<Exclude<CallPhase, "idle">, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  processing: "Thinking…",
  speaking: "Speaking",
};

/** Seconds since `since`, re-rendering once a second. */
function useElapsed(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since ? now - Date.parse(since) : 0;
}

export function CallOverlay() {
  const { phase } = useCall();
  if (phase === "idle") return null;
  return <ActiveCall phase={phase} />;
}

function ActiveCall({ phase }: { phase: Exclude<CallPhase, "idle"> }) {
  const { state } = useOnboarding();
  const { attemptId, hearing, notice, hangUp } = useCall();
  const hangUpRef = useRef<HTMLButtonElement>(null);

  const agentName = state.profile.agentName ?? "Assistant";
  const connectedAt = getOpenAttempt(state)?.connectedAt ?? null;
  const elapsed = useElapsed(connectedAt);
  const lastOnCall = state.messages.findLast((m) => m.callId === attemptId);
  // Captions of what the assistant last said on this call.
  const caption =
    state.messages.findLast(
      (m) => m.role === "assistant" && m.callId === attemptId,
    )?.content ?? null;
  // What the user just said, while the reply is on its way.
  const pendingUserText =
    phase === "processing" && lastOnCall?.role === "user"
      ? lastOnCall.content
      : null;
  const micOn = phase === "listening";

  useEffect(() => {
    hangUpRef.current?.focus();
    return () => {
      document
        .querySelector<HTMLInputElement>("[data-composer-input]")
        ?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") hangUp();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hangUp]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-title"
      aria-describedby="call-status"
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white text-neutral-900"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="text-sm text-neutral-500">Voice call</p>

        <div className="mt-12 flex flex-col items-center gap-5 sm:mt-16">
          <div
            aria-hidden="true"
            className={`flex size-24 items-center justify-center rounded-full bg-neutral-900 text-4xl font-medium text-white ring-offset-4 transition-shadow duration-300 ${
              phase === "speaking" ? "ring-4 ring-neutral-300" : "ring-0"
            }`}
          >
            {agentName.charAt(0).toUpperCase()}
          </div>
          <div className="text-center">
            <h2 id="call-title" className="text-3xl font-semibold tracking-tight">
              {agentName}
            </h2>
            <p
              id="call-status"
              role="status"
              className="mt-1.5 text-base text-neutral-500 tabular-nums"
            >
              {PHASE_LABELS[phase]}
              {connectedAt && (
                <span aria-hidden="true"> · {formatDuration(elapsed)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-10 flex min-h-32 w-full flex-col justify-end gap-3 text-center">
          {phase === "connecting" && (
            <p className="text-sm text-neutral-500">
              Your browser may ask to use your microphone.
            </p>
          )}
          {caption && (
            <p className="text-lg leading-relaxed text-neutral-700">
              <span className="sr-only">{agentName} said: </span>
              {caption}
            </p>
          )}
          {pendingUserText && (
            <p className="text-base leading-relaxed text-neutral-500">
              <span className="sr-only">You said: </span>
              <span aria-hidden="true">You: </span>
              {pendingUserText}
            </p>
          )}
          {micOn && notice && (
            <p role="status" className="text-sm text-neutral-500">
              {notice}
            </p>
          )}
          {state.preferences.gmail === "wants" && state.gmail.status !== "connected" && (
            <p className="text-sm text-neutral-500">
              Connect Gmail will be ready in the chat when you hang up.
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-col items-center gap-6 pt-10">
          <p
            className={`flex items-center gap-2 text-sm ${
              micOn ? "text-neutral-900" : "text-neutral-400"
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${
                micOn
                  ? "animate-pulse bg-emerald-500 motion-reduce:animate-none"
                  : "bg-neutral-300"
              }`}
            />
            <MicIcon off={!micOn} />
            {!micOn ? "Mic off" : hearing ? "Hearing you…" : "Mic on — go ahead"}
            {micOn && <MicLevel />}
          </p>
          <button
            ref={hangUpRef}
            type="button"
            onClick={hangUp}
            className="flex flex-col items-center gap-2 rounded-full text-sm text-neutral-600 focus-visible:outline-none [&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-offset-4 [&:focus-visible>span]:outline-neutral-900"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700">
              <HangUpIcon className="size-7" />
            </span>
            Hang up
          </button>
        </div>
      </div>
      {VoiceDiagnostics && (
        <details
          open
          className="mx-auto mb-4 w-[min(28rem,calc(100%-2rem))] rounded-lg border border-dashed border-neutral-300 p-2"
        >
          <summary className="cursor-pointer font-mono text-[11px] font-semibold text-neutral-500">
            Voice diagnostics (dev only)
          </summary>
          <VoiceDiagnostics className="mt-1" />
        </details>
      )}
    </div>
  );
}

/** Live input level, so it's visible that the microphone hears something. */
function MicLevel() {
  const { level, micTrack } = useSyncExternalStore(
    voiceDiagnostics.subscribe,
    voiceDiagnostics.getSnapshot,
    voiceDiagnostics.getServerSnapshot,
  );
  // Only the real microphone reports a level.
  if (micTrack === null) return null;
  const fill = Math.min(1, Math.sqrt(level) * 2.5);
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200"
    >
      <span
        className="block h-full rounded-full bg-emerald-500"
        style={{ width: `${Math.round(fill * 100)}%` }}
      />
    </span>
  );
}
