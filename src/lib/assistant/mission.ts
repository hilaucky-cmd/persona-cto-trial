import { normalizeMissionText } from "@/lib/onboarding/graduation";
import { isRecord } from "@/lib/onboarding/guards";
import type { OnboardingState } from "@/lib/onboarding/types";

export const MISSION_ENDPOINT = "/api/onboarding/mission";

/** Wording for the first-mission card. Presentational only. */
export interface MissionWording {
  mission: string;
  /** Optional line about how setup went, or `null`. */
  note: string | null;
}

export function isMissionWording(value: unknown): value is MissionWording {
  return (
    isRecord(value) &&
    normalizeMissionText(value.mission) === value.mission &&
    (value.note === null || normalizeMissionText(value.note) === value.note)
  );
}

const REQUEST_TIMEOUT_MS = 10_000;

/** The wording needs facts, not the conversation, so messages aren't sent. */
export async function requestMissionWording(
  state: OnboardingState,
  signal: AbortSignal,
): Promise<MissionWording> {
  const response = await fetch(MISSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: { ...state, messages: [] } }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`Mission request failed: ${response.status}`);
  const data: unknown = await response.json();
  if (!isMissionWording(data)) throw new Error("Mission response had an unexpected shape");
  return data;
}
