import type { CallAttempt, OnboardingState } from "./types";

export type OnboardingRequirement =
  | "agentName"
  | "userName"
  | "helpIntent"
  | "gmailConnected"
  | "callAttempted";

export function hasAttemptedCall(state: OnboardingState): boolean {
  return state.call.attempts.length > 0;
}

/** The attempt for the call in progress, if there is one. */
export function getOpenAttempt(state: OnboardingState): CallAttempt | null {
  if (state.call.status === "idle") return null;
  const last = state.call.attempts.at(-1);
  return last && last.endedAt === null ? last : null;
}

export function isCallActive(state: OnboardingState, attemptId: string): boolean {
  return (
    state.call.status === "active" && getOpenAttempt(state)?.id === attemptId
  );
}

export function getMissingRequirements(
  state: OnboardingState,
): OnboardingRequirement[] {
  const missing: OnboardingRequirement[] = [];
  if (!state.profile.agentName) missing.push("agentName");
  if (!state.profile.userName) missing.push("userName");
  if (!state.profile.helpIntent) missing.push("helpIntent");
  if (state.gmail.status !== "connected") missing.push("gmailConnected");
  if (!hasAttemptedCall(state)) missing.push("callAttempted");
  return missing;
}
