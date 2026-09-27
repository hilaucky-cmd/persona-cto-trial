import { getGraduation } from "@/lib/onboarding/graduation";
import { isOnboardingState, isRecord } from "@/lib/onboarding/guards";
import { readJson } from "@/server/http";
import { writeMissionWording } from "@/server/onboarding-agent/mission";
import { logOpenAIError } from "@/server/openai";

const MAX_BODY_BYTES = 64 * 1024;

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Suggests wording for the first-mission card. It never changes any state. */
export async function POST(request: Request) {
  const json = await readJson(request, MAX_BODY_BYTES);
  if (!json.ok) {
    return json.status === 413
      ? errorResponse(413, "Request too large")
      : errorResponse(400, "Invalid JSON");
  }
  const body = json.value;
  if (!isRecord(body) || !isOnboardingState(body.state)) {
    return errorResponse(400, "Invalid request");
  }
  if (!getGraduation(body.state).ready) {
    return errorResponse(400, "Not ready for a first mission");
  }

  try {
    return Response.json(await writeMissionWording(body.state));
  } catch (error) {
    logOpenAIError("onboarding/mission", error);
    return errorResponse(502, "No mission wording");
  }
}
