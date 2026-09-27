import "server-only";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import {
  MAX_CONTEXT_MESSAGES,
  MAX_MESSAGE_LENGTH,
  SIGNAL_KEYS,
  type ModelProposal,
  type ModelSignals,
  type RejectedUpdate,
  type SuggestedAction,
  type TurnEvent,
  type TurnResponse,
} from "@/lib/assistant/contract";
import { applySignals } from "@/lib/onboarding/preferences";
import {
  PROFILE_FIELDS,
  type OnboardingState,
  type ProfileUpdates,
} from "@/lib/onboarding/types";
import {
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  getOpenAIClient,
} from "@/server/openai";
import { buildModelInput } from "./context";
import { ONBOARDING_INSTRUCTIONS } from "./instructions";
import { looksLikeStateManipulation } from "./manipulation";
import { MODEL_TURN_SCHEMA, isModelTurnOutput } from "./output-schema";
import { validateProposal } from "./proposals";

/** The model returned something unusable. Safe to retry. */
export class ModelOutputError extends Error {
  name = "ModelOutputError";
}

function findRefusal(response: OpenAIResponse): string | null {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") return part.refusal;
    }
  }
  return null;
}

export async function runOnboardingTurn(
  state: OnboardingState,
  event: TurnEvent | null,
): Promise<TurnResponse> {
  const conversation = state.messages.slice(-MAX_CONTEXT_MESSAGES);
  const latest = conversation.at(-1);
  // Facts and preferences can only come from something the user said. On an
  // event-only turn (e.g. the call connecting) there is nothing new to learn.
  const hasNewUserMessage = latest?.role === "user";
  const flaggedByApp = hasNewUserMessage && looksLikeStateManipulation(latest.content);

  const response = await getOpenAIClient().responses.create({
    model: OPENAI_MODEL,
    reasoning: { effort: OPENAI_REASONING_EFFORT },
    instructions: ONBOARDING_INSTRUCTIONS,
    input: buildModelInput(state, conversation, event, flaggedByApp),
    text: {
      format: {
        type: "json_schema",
        name: "onboarding_turn",
        strict: true,
        schema: MODEL_TURN_SCHEMA,
      },
    },
    // Includes reasoning tokens, so leave headroom beyond the short reply.
    max_output_tokens: 2000,
    store: false,
  });

  if (response.status === "incomplete") {
    throw new ModelOutputError(
      `Incomplete response: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }
  if (findRefusal(response) !== null) {
    throw new ModelOutputError("Model refused to respond");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new ModelOutputError("Output was not valid JSON");
  }
  if (!isModelTurnOutput(parsed)) {
    throw new ModelOutputError("Output did not match the schema");
  }

  const assistantMessage = parsed.assistantMessage.trim();
  if (!assistantMessage || assistantMessage.length > MAX_MESSAGE_LENGTH) {
    throw new ModelOutputError("Assistant message was empty or too long");
  }

  // A message that tries to rewrite the rules or the app's state isn't a
  // trustworthy statement of who the user is or what they want, so nothing in
  // it is committed, not even a name it slips in.
  const manipulation =
    hasNewUserMessage && (flaggedByApp || parsed.signals.triesToManipulateApp);
  const { accepted, rejected } = !hasNewUserMessage
    ? rejectAll(parsed.proposedUpdates, "no new user message")
    : manipulation
      ? rejectAll(parsed.proposedUpdates, "message tries to change the app's rules or state")
      : validateProposal(parsed.proposedUpdates, state.profile, conversation);
  const signals = !hasNewUserMessage
    ? NO_SIGNALS
    : manipulation
      ? { ...NO_SIGNALS, triesToManipulateApp: true }
      : parsed.signals;

  return {
    assistantMessage,
    proposal: parsed.proposedUpdates,
    signals,
    acceptedUpdates: accepted,
    rejectedUpdates: rejected,
    suggestedAction: allowedAction(parsed.suggestedAction, state, event, accepted, signals),
  };
}

function allowedAction(
  action: SuggestedAction,
  state: OnboardingState,
  event: TurnEvent | null,
  accepted: ProfileUpdates,
  signals: ModelSignals,
): SuggestedAction {
  if (state.status === "completed") return "none";
  if (action === "offer_call" && canOfferCall(state, event, accepted, signals)) {
    return action;
  }
  if (action === "offer_gmail" && canOfferGmail(state, event, signals)) {
    return action;
  }
  return "none";
}

const NO_SIGNALS = Object.fromEntries(
  SIGNAL_KEYS.map((key) => [key, false]),
) as ModelSignals;

function rejectAll(proposal: ModelProposal, reason: string) {
  const rejected: RejectedUpdate[] = PROFILE_FIELDS.flatMap((field) => {
    const value = proposal[field];
    return value === null ? [] : [{ field, value, reason }];
  });
  return { accepted: {}, rejected };
}

/**
 * The app decides whether a call offer is shown: only in reply to the user or
 * after a call, the assistant must have a name, no call may be in progress,
 * and the user must not have declined.
 */
function canOfferCall(
  state: OnboardingState,
  event: TurnEvent | null,
  accepted: ProfileUpdates,
  signals: ModelSignals,
): boolean {
  return (
    (event === null || event.type === "call_ended") &&
    state.call.status === "idle" &&
    Boolean(accepted.agentName ?? state.profile.agentName) &&
    applySignals(state.preferences, signals).call !== "declined"
  );
}

/**
 * The Connect Gmail button needs the screen, so it's only offered in text
 * replies to the user or right after a call, never mid-call, and never once
 * the user has declined (unless this very message changed that).
 */
function canOfferGmail(
  state: OnboardingState,
  event: TurnEvent | null,
  signals: ModelSignals,
): boolean {
  return (
    (event === null || event.type === "call_ended") &&
    state.call.status === "idle" &&
    state.gmail.status !== "connected" &&
    applySignals(state.preferences, signals).gmail !== "declined"
  );
}
