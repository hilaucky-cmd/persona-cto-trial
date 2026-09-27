"use client";

import { useEffect, useRef, useState } from "react";
import { useCall } from "@/components/call/CallProvider";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { requestMissionWording, type MissionWording } from "@/lib/assistant/mission";
import { fallbackMission } from "@/lib/onboarding/graduation";
import { MissionCard } from "./MissionCard";

/**
 * Wording for the card, refreshed when the facts it depends on change. Any
 * failure falls back to the user's own words: the card never depends on it.
 */
function useMissionWording(): MissionWording | null {
  const { state, getState } = useOnboarding();
  const key = JSON.stringify([
    state.profile.helpIntent,
    state.gmail.status,
    state.preferences.call,
    state.call.attempts.length,
    state.understanding.wantsToSkipSetup,
  ]);
  const [result, setResult] = useState<{ key: string; wording: MissionWording } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestMissionWording(getState(), controller.signal)
      .then((wording) => setResult({ key, wording }))
      .catch(() => {
        if (controller.signal.aborted) return;
        const intent = getState().profile.helpIntent ?? "";
        setResult({ key, wording: { mission: fallbackMission(intent), note: null } });
      });
    return () => controller.abort();
  }, [key, getState]);

  return result?.key === key ? result.wording : null;
}

/**
 * Shown once the graduation rule says the user is ready. Starting the mission
 * is the user's choice; the reducer checks the rule again before committing.
 */
export function MissionOffer() {
  const { state, actions } = useOnboarding();
  const { requestStatus, isAwaitingReply, takeTurn } = useConversation();
  const { phase } = useCall();
  const wording = useMissionWording();
  const cardRef = useRef<HTMLDivElement>(null);

  const hidden =
    phase !== "idle" ||
    state.call.status !== "idle" ||
    requestStatus === "pending" ||
    isAwaitingReply;
  const hasWording = wording !== null;

  // The chat only auto-scrolls on new timeline items, so the card must bring
  // itself into view when it appears (and again once its wording lands).
  useEffect(() => {
    if (!hidden) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [hidden, hasWording]);

  if (hidden) return null;

  function start() {
    if (!wording) return;
    if (actions.completeOnboarding(wording.mission, wording.note)) {
      void takeTurn({ callId: null, event: { type: "mission_started" } });
    }
  }

  return (
    <div ref={cardRef}>
      <MissionCard state={state} mission={wording?.mission ?? null} note={wording?.note ?? null}>
        <button
          type="button"
          onClick={start}
          disabled={!wording}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          Start mission →
        </button>
      </MissionCard>
    </div>
  );
}
