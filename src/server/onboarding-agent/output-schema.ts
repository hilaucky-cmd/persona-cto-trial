import {
  SIGNAL_KEYS,
  SUGGESTED_ACTIONS,
  isModelProposal,
  isModelSignals,
  type ModelProposal,
  type ModelSignals,
  type SuggestedAction,
} from "@/lib/assistant/contract";
import { isOneOf, isRecord, isString } from "@/lib/onboarding/guards";
import { PROFILE_FIELDS } from "@/lib/onboarding/types";

export interface ModelTurnOutput {
  proposedUpdates: ModelProposal;
  signals: ModelSignals;
  assistantMessage: string;
  suggestedAction: SuggestedAction;
}

const nullableString = (description: string) => ({
  type: ["string", "null"],
  description,
});

/**
 * Strict Structured Outputs schema. Strict mode requires every property to be
 * listed as required, so "no change" is expressed as `null` rather than by
 * omitting the field. Properties are generated in order, so the extraction
 * comes before the reply that should reflect it.
 */
export const MODEL_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposedUpdates", "signals", "assistantMessage", "suggestedAction"],
  properties: {
    proposedUpdates: {
      type: "object",
      additionalProperties: false,
      required: [...PROFILE_FIELDS],
      properties: {
        agentName: nullableString("New name for the assistant, or null."),
        userName: nullableString("New name for the user, or null."),
        helpIntent: nullableString(
          "Short phrase for what the user wants help with, or null.",
        ),
      },
    },
    signals: {
      type: "object",
      additionalProperties: false,
      required: [...SIGNAL_KEYS],
      properties: Object.fromEntries(
        SIGNAL_KEYS.map((key) => [key, { type: "boolean" }]),
      ),
    },
    assistantMessage: {
      type: "string",
      description: "Your reply to the user.",
    },
    suggestedAction: {
      type: "string",
      enum: [...SUGGESTED_ACTIONS],
      description:
        "offer_call only when your reply invites the user to a voice call; offer_gmail only when your reply suggests connecting Gmail or the user asked to; otherwise none.",
    },
  },
} as const;

export function isModelTurnOutput(value: unknown): value is ModelTurnOutput {
  return (
    isRecord(value) &&
    isModelProposal(value.proposedUpdates) &&
    isModelSignals(value.signals) &&
    isString(value.assistantMessage) &&
    isOneOf(SUGGESTED_ACTIONS)(value.suggestedAction)
  );
}
