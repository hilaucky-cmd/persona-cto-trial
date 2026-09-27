import {
  isTurnRequest,
  type TurnErrorResponse,
  type TurnRequest,
} from "@/lib/assistant/contract";
import { getOpenAttempt } from "@/lib/onboarding/selectors";
import { readJson } from "@/server/http";
import { runOnboardingTurn } from "@/server/onboarding-agent/run-turn";
import { logOpenAIError } from "@/server/openai";

const MAX_BODY_BYTES = 256 * 1024;

function errorResponse(status: number, error: string) {
  return Response.json({ error } satisfies TurnErrorResponse, { status });
}

/**
 * Rejects requests whose state can't have come from the reducer, e.g. a voice
 * message for a call that isn't live. Not a security boundary (the state is
 * client-held), but it keeps the model's view of calls coherent.
 */
function findInconsistency({ state, event }: TurnRequest): string | null {
  const last = state.messages.at(-1);
  const open = getOpenAttempt(state);
  if (event === null && last?.role !== "user") {
    return "Last message must be from the user";
  }
  // A transcript from a call that just ended may still be unanswered.
  if (last?.callId && !state.call.attempts.some((a) => a.id === last.callId)) {
    return "Voice message for an unknown call";
  }
  if (event?.type === "call_connected" && state.call.status !== "active") {
    return "No active call";
  }
  if (
    event?.type === "call_ended" &&
    (open !== null || !state.call.attempts.at(-1)?.endedAt)
  ) {
    return "No ended call";
  }
  if (
    (event?.type === "gmail_connected" || event?.type === "gmail_failed") &&
    state.call.status !== "idle"
  ) {
    return "Gmail events happen outside calls";
  }
  if (event?.type === "gmail_connected" && state.gmail.status !== "connected") {
    return "Gmail is not connected";
  }
  if (event?.type === "gmail_failed" && state.gmail.status !== "failed") {
    return "No failed Gmail attempt";
  }
  if (
    event?.type === "mission_started" &&
    (state.status !== "completed" || state.call.status !== "idle")
  ) {
    return "No mission started";
  }
  return null;
}

export async function POST(request: Request) {
  const json = await readJson(request, MAX_BODY_BYTES);
  if (!json.ok) {
    return json.status === 413
      ? errorResponse(413, "Request too large")
      : errorResponse(400, "Invalid JSON");
  }
  const body = json.value;

  if (!isTurnRequest(body)) {
    return errorResponse(400, "Invalid request");
  }
  const inconsistency = findInconsistency(body);
  if (inconsistency) {
    return errorResponse(400, inconsistency);
  }

  try {
    return Response.json(await runOnboardingTurn(body.state, body.event));
  } catch (error) {
    logOpenAIError("onboarding/turn", error);
    return errorResponse(502, "The assistant couldn't respond");
  }
}
