import type { OnboardingState } from "@/lib/onboarding/types";
import {
  TURN_ENDPOINT,
  isTurnResponse,
  toTurnRequest,
  type TurnEvent,
  type TurnResponse,
} from "./contract";

const REQUEST_TIMEOUT_MS = 45_000;

export async function requestAssistantTurn(
  state: OnboardingState,
  event: TurnEvent | null,
  signal: AbortSignal,
): Promise<TurnResponse> {
  const response = await fetch(TURN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toTurnRequest(state, event)),
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    throw new Error(`Turn request failed with status ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isTurnResponse(data)) {
    throw new Error("Turn response had an unexpected shape");
  }
  return data;
}
