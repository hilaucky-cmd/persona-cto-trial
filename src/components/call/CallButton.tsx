"use client";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useCall } from "./CallProvider";
import { PhoneIcon } from "./icons";

/** Always-available way to start a call once the assistant has a name. */
export function CallButton() {
  const { state, isHydrated } = useOnboarding();
  const { canStart, start } = useCall();
  const { agentName } = state.profile;

  if (!isHydrated || !agentName) {
    return <span className="text-sm text-neutral-500">Getting started</span>;
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={!canStart}
      aria-label={`Call ${agentName}`}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <PhoneIcon />
      Call
    </button>
  );
}
