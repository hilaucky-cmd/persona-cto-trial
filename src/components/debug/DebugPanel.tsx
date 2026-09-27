"use client";

import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useCall } from "@/components/call/CallProvider";
import { useGmailReturnCheck } from "@/components/gmail/GmailProvider";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import {
  getGraduation,
  type CallResolution,
  type GmailResolution,
  type Graduation,
} from "@/lib/onboarding/graduation";
import { getMissingRequirements } from "@/lib/onboarding/selectors";
import type { OnboardingState } from "@/lib/onboarding/types";
import {
  SIMULATED_SCENARIOS,
  simulator,
  type SimulatedScenario,
} from "@/lib/voice/simulated";
import { VoiceDiagnostics } from "./VoiceDiagnostics";

/** Development-only view of onboarding state and the latest model output. */
export function DebugPanel() {
  const { state, isHydrated } = useOnboarding();
  const { lastTurn, requestStatus } = useConversation();
  const [isOpen, setIsOpen] = useState(false);
  const readiness =
    state.status === "completed"
      ? "mission started"
      : getGraduation(state).ready
        ? "ready"
        : "not ready";

  return (
    <div className="fixed top-[4.25rem] right-3 z-50 flex flex-col items-end gap-2 font-mono text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="onboarding-debug-panel"
        className="rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1 text-neutral-500 backdrop-blur hover:text-neutral-900"
      >
        {isOpen ? "Hide state" : `State · ${readiness}`}
      </button>

      {isOpen && (
        <section
          id="onboarding-debug-panel"
          aria-label="Onboarding state (debug)"
          className="flex max-h-[75dvh] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="sticky top-0 z-10">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-100 bg-white px-3 py-2 text-neutral-600">
              <span>
                {isHydrated ? "hydrated" : "hydrating…"} · {state.status} ·
                request {requestStatus}
              </span>
              <ResetButton />
            </div>
            <GraduationSummary />
          </div>

          <GraduationSection />
          <GmailSection />
          <VoiceSection />

          <Section
            title="Authoritative state (reducer)"
            tone="neutral"
            note="Facts, preferences, and the model's persisted reading of the user, as the reducer holds them."
          >
            <Json value={state} />
          </Section>

          <Section
            title="Last model turn: proposed, NOT authoritative"
            tone="warning"
            note="Raw model output and signals. Only 'accepted' reaches the reducer, which validates again."
          >
            {lastTurn ? (
              <Json
                value={{
                  proposal: lastTurn.proposal,
                  signals: lastTurn.signals,
                  suggestedAction: lastTurn.suggestedAction,
                  accepted: lastTurn.acceptedUpdates,
                  rejected: lastTurn.rejectedUpdates,
                }}
              />
            ) : (
              <p className="px-3 py-2 text-neutral-500">No model turn yet.</p>
            )}
          </Section>
        </section>
      )}
    </div>
  );
}

/**
 * Wipes the whole session, including a real Gmail connection, so it takes a
 * second click. Browser automation can auto-accept `confirm()` dialogs.
 */
function ResetButton() {
  const { reset } = useConversation();
  const call = useCall();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-neutral-500">Erase session + Gmail link?</span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            reset();
          }}
          disabled={call.phase !== "idle"}
          className="rounded px-1.5 py-0.5 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          Erase
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={call.phase !== "idle"}
      title={call.phase !== "idle" ? "Hang up first" : undefined}
      className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      Reset
    </button>
  );
}

const CALL_LABELS: Record<CallResolution, string> = {
  attempted: "attempted",
  declined: "refused",
  skipped: "skipped (user asked to skip setup)",
  unresolved: "unresolved",
};

const GMAIL_LABELS: Record<GmailResolution, string> = {
  connected: "connected",
  attempted: "attempted (Google didn't connect)",
  declined: "refused",
  skipped: "skipped (user asked to skip setup)",
  unresolved: "unresolved",
};

/** Every predicate that keeps `getGraduation(state).ready` false, with the fields it read. */
function graduationBlockers(state: OnboardingState, g: Graduation): string[] {
  const blockers: string[] = [];
  if (!g.agentName) blockers.push("agent name: none");
  if (g.userName === "missing") blockers.push("user name: none");
  if (g.intent === "missing") blockers.push("intent: none");
  if (g.intent === "vague") blockers.push("intent: not concrete yet");
  if (g.intent === "unjudged") blockers.push("intent: from before v5, judged on next user message");
  if (g.call === "unresolved") {
    blockers.push(`call: 0 attempts, preference ${state.preferences.call}`);
  }
  if (g.gmail === "unresolved") {
    blockers.push(`gmail: ${state.gmail.status}, preference ${state.preferences.gmail}`);
  }
  return blockers;
}

/** Mirrors the conditions under which the timeline renders the payoff card. */
function describePayoffCard(
  state: OnboardingState,
  g: Graduation,
  callPhase: string,
  requestStatus: string,
  isAwaitingReply: boolean,
): string {
  if (state.status === "completed") return "mission started";
  if (!g.ready) return "hidden: graduation not ready";
  if (callPhase !== "idle" || state.call.status !== "idle") return "hidden: call in progress";
  if (requestStatus === "pending") return "hidden: reply pending";
  if (isAwaitingReply) return "hidden: latest message not answered yet";
  return "rendered";
}

/** Always visible at the top of the panel: every graduation predicate at a glance. */
function GraduationSummary() {
  const { state } = useOnboarding();
  const g = getGraduation(state);
  const blockers = graduationBlockers(state, g);
  const rows: [string, string, boolean][] = [
    ["agent", g.agentName ? "yes" : "no", g.agentName],
    ["user", g.userName === "known" ? "yes" : g.userName === "skipped" ? "skipped" : "no", g.userName !== "missing"],
    ["intent", g.intent === "concrete" ? "yes" : `no (${g.intent})`, g.intent === "concrete"],
    ["gmail", GMAIL_LABELS[g.gmail], g.gmail !== "unresolved"],
    ["call", CALL_LABELS[g.call], g.call !== "unresolved"],
  ];
  return (
    <div className="border-b border-neutral-100 bg-white px-3 py-2">
      <p className={`font-semibold ${g.ready ? "text-emerald-700" : "text-red-700"}`}>
        productReady: {g.ready ? "yes" : "no"} · onboardingStatus: {state.status}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-neutral-700">
        {rows.map(([label, value, ok]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd className={ok ? "text-neutral-900" : "text-red-700"}>{value}</dd>
          </div>
        ))}
        <dt className="text-neutral-500">blocking</dt>
        <dd className={blockers.length > 0 ? "text-red-700" : "text-neutral-900"}>
          {blockers.length > 0 ? blockers.join("; ") : "none"}
        </dd>
      </dl>
    </div>
  );
}

function GraduationSection() {
  const { state } = useOnboarding();
  const { requestStatus, isAwaitingReply } = useConversation();
  const call = useCall();
  const g = getGraduation(state);
  const blockers = graduationBlockers(state, g);
  const missing = getMissingRequirements(state);
  return (
    <Section
      title="Graduation (deterministic rule)"
      tone="neutral"
      note="Ready = agent name + concrete intent + user name (or skip) + call and Gmail each done, tried, declined, or skipped. Refusals never count as done."
    >
      <Json
        value={{
          productReady: g.ready ? "yes" : "no",
          blockingReasons: blockers.length > 0 ? blockers : "none",
          agentName: g.agentName ? "yes" : "no",
          userName: g.userName === "known" ? "yes" : g.userName === "skipped" ? "skipped" : "no",
          meaningfulIntent: g.intent === "concrete" ? "yes" : `no (${g.intent})`,
          gmail: GMAIL_LABELS[g.gmail],
          call: CALL_LABELS[g.call],
          payoffCard: describePayoffCard(state, g, call.phase, requestStatus, isAwaitingReply),
          selectorInputs: {
            "call.attempts.length": state.call.attempts.length,
            "preferences.call": state.preferences.call,
            "gmail.status": state.gmail.status,
            "preferences.gmail": state.preferences.gmail,
            "understanding.helpIntentIsConcrete": state.understanding.helpIntentIsConcrete,
            "understanding.wantsToSkipSetup": state.understanding.wantsToSkipSetup,
          },
          assignmentFactsMissing: missing.length > 0 ? missing : "none",
        }}
      />
    </Section>
  );
}

function GmailSection() {
  const { state } = useOnboarding();
  const returnCheck = useGmailReturnCheck();
  return (
    <Section
      title="Gmail"
      tone="neutral"
      note="Set only from a server-verified Google result. Tokens are discarded on the server and never reach the browser."
    >
      <Json
        value={{
          status: state.gmail.status,
          email: state.gmail.email,
          connectedAt: state.gmail.connectedAt,
          lastFailure: state.gmail.lastFailure,
          preference: state.preferences.gmail,
          returnCheck,
        }}
      />
    </Section>
  );
}

function VoiceSection() {
  const { state } = useOnboarding();
  const call = useCall();
  const sim = useSyncExternalStore(
    simulator.subscribe,
    simulator.getSnapshot,
    simulator.getSnapshot,
  );
  const [utterance, setUtterance] = useState("");

  function handleSay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (utterance.trim() && simulator.say(utterance)) setUtterance("");
  }

  return (
    <Section
      title="Voice"
      tone="neutral"
      note="Call truth comes from the reducer. Audio is sent to the server for transcription and never stored."
    >
      <Json
        value={{
          phase: call.phase,
          mode: state.mode,
          callStatus: state.call.status,
          attempts: state.call.attempts.length,
          lastFailure: call.lastFailure,
          factsLearnedByVoice: call.voiceFacts,
        }}
      />
      <VoiceDiagnostics className="px-3 pb-3" />
      <div className="flex flex-col gap-2 px-3 pb-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sim.enabled}
            disabled={call.phase !== "idle"}
            onChange={(event) => simulator.setEnabled(event.target.checked)}
          />
          Simulated microphone (no real audio)
        </label>
        {sim.enabled && (
          <>
            <label className="flex items-center gap-2">
              Scenario
              <select
                value={sim.scenario}
                onChange={(event) =>
                  simulator.setScenario(event.target.value as SimulatedScenario)
                }
                className="rounded border border-neutral-200 px-1 py-0.5"
              >
                {SIMULATED_SCENARIOS.map((scenario) => (
                  <option key={scenario} value={scenario}>
                    {scenario}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={handleSay} className="flex gap-2">
              <input
                aria-label="Simulated speech"
                value={utterance}
                onChange={(event) => setUtterance(event.target.value)}
                placeholder={sim.listening ? "Say something…" : "Mic is off"}
                className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1"
              />
              <button
                type="submit"
                disabled={!sim.listening}
                className="rounded bg-neutral-900 px-2 py-1 text-white disabled:opacity-40"
              >
                Say
              </button>
              <button
                type="button"
                disabled={!sim.listening}
                onClick={() => simulator.silence()}
                className="rounded border border-neutral-200 px-2 py-1 disabled:opacity-40"
              >
                Silence
              </button>
            </form>
            {sim.lastSpoken && (
              <p className="text-neutral-500">Last spoken: {sim.lastSpoken}</p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

function Section({
  title,
  note,
  tone,
  children,
}: {
  title: string;
  note: string;
  tone: "neutral" | "warning";
  children: ReactNode;
}) {
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/60 text-amber-900"
      : "border-neutral-100 text-neutral-700";
  return (
    <div className={`border-b ${styles}`}>
      <div className="px-3 pt-2 font-semibold">{title}</div>
      <div className="px-3 pb-1 opacity-70">{note}</div>
      {children}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto px-3 py-2 text-[11px] leading-relaxed text-neutral-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
