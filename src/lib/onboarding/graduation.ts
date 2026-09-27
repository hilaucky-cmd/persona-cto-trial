import { hasAttemptedCall } from "./selectors";
import type { OnboardingState } from "./types";

/*
 * Two different questions, kept apart on purpose:
 * - Assignment requirements (`getMissingRequirements`): facts only. A refused
 *   call is not an attempted call; declined Gmail is not connected Gmail.
 * - Product graduation (`getGraduation`): do we know enough to be useful, and
 *   has every external action been done, tried, or turned down by the user?
 *   Refusing something must never trap the user in setup.
 */

/** A call counts once it was really started, or the user said no to it. */
export type CallResolution = "attempted" | "declined" | "skipped" | "unresolved";
/** `attempted`: the user went to Google but it didn't connect. */
export type GmailResolution =
  | "connected"
  | "attempted"
  | "declined"
  | "skipped"
  | "unresolved";

export interface Graduation {
  agentName: boolean;
  userName: "known" | "skipped" | "missing";
  /** `unjudged`: carried over from before v5; the next user message decides. */
  intent: "concrete" | "vague" | "unjudged" | "missing";
  call: CallResolution;
  gmail: GmailResolution;
  skipRequested: boolean;
  /** Ready for the first mission. The only input to completing onboarding. */
  ready: boolean;
}

export function getGraduation(state: OnboardingState): Graduation {
  const { profile, preferences, understanding, gmail } = state;
  const skipRequested = understanding.wantsToSkipSetup;

  const call: CallResolution = hasAttemptedCall(state)
    ? "attempted"
    : preferences.call === "declined"
      ? "declined"
      : skipRequested
        ? "skipped"
        : "unresolved";

  const gmailResolution: GmailResolution =
    gmail.status === "connected"
      ? "connected"
      : gmail.status === "failed"
        ? "attempted"
        : preferences.gmail === "declined"
          ? "declined"
          : skipRequested
            ? "skipped"
            : "unresolved";

  const userName = profile.userName ? "known" : skipRequested ? "skipped" : "missing";
  const intent = !profile.helpIntent
    ? "missing"
    : understanding.helpIntentIsConcrete === null
      ? "unjudged"
      : understanding.helpIntentIsConcrete
        ? "concrete"
        : "vague";

  return {
    agentName: profile.agentName !== null,
    userName,
    intent,
    call,
    gmail: gmailResolution,
    skipRequested,
    // Skipping relaxes what we ask for, never what we need to be useful: an
    // agent name and a concrete intent are always required.
    ready:
      profile.agentName !== null &&
      intent === "concrete" &&
      userName !== "missing" &&
      call !== "unresolved" &&
      gmailResolution !== "unresolved",
  };
}

export const MAX_MISSION_LENGTH = 120;

/** Presentational text from the model: one short line, or `null`. */
export function normalizeMissionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim();
  return text.length >= 3 && text.length <= MAX_MISSION_LENGTH ? text : null;
}

/** Used whenever the model's wording is unavailable: the user's own words. */
export function fallbackMission(helpIntent: string): string {
  let text = helpIntent.replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "");
  if (text.length > MAX_MISSION_LENGTH) {
    const cut = text.slice(0, MAX_MISSION_LENGTH - 1);
    text = `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`;
  }
  return `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}`;
}
