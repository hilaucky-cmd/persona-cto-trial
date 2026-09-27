import type { ModelSignals } from "@/lib/assistant/contract";
import type { OnboardingState, PreferenceStatus } from "./types";

type Preferences = OnboardingState["preferences"];

function preferenceFrom(
  wants: boolean,
  refuses: boolean,
): PreferenceStatus | null {
  if (wants === refuses) return null; // Neither, or contradictory.
  return wants ? "wants" : "declined";
}

/**
 * Records what the user said they want. A stated preference is never proof
 * that anything happened: Gmail connection and call attempts are separate.
 */
export function applySignals(
  preferences: Preferences,
  signals: ModelSignals,
): Preferences {
  const gmail =
    preferenceFrom(signals.userWantsGmail, signals.userRefusedGmail) ??
    preferences.gmail;
  const call =
    preferenceFrom(signals.userWantsCall, signals.userRefusedCall) ??
    preferences.call;
  return gmail === preferences.gmail && call === preferences.call
    ? preferences
    : { gmail, call };
}
