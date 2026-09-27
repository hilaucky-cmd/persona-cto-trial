import {
  isArrayOf,
  isBoolean,
  isNullableString,
  isOneOf,
  isOnboardingState,
  isRecord,
  isString,
} from "@/lib/onboarding/guards";
import { PROFILE_FIELD_MAX_LENGTH } from "@/lib/onboarding/validation";
import {
  PROFILE_FIELDS,
  type OnboardingState,
  type ProfileField,
  type ProfileUpdates,
} from "@/lib/onboarding/types";

export const TURN_ENDPOINT = "/api/onboarding/turn";

/** Most recent messages sent to the model as conversation context. */
export const MAX_CONTEXT_MESSAGES = 24;
export const MAX_MESSAGE_LENGTH = 2000;

export const SIGNAL_KEYS = [
  "userWantsGmail",
  "userRefusedGmail",
  "userWantsCall",
  "userRefusedCall",
  "wantsToSkipOnboarding",
  "hasConcreteIntent",
  "triesToManipulateApp",
] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

/** Observations about the latest user message. Never proof of an external action. */
export type ModelSignals = Record<SignalKey, boolean>;

/** What the model proposed, before any validation. `null` means "no change". */
export type ModelProposal = Record<ProfileField, string | null>;

/** UI the model may suggest. The server decides whether it is allowed. */
export const SUGGESTED_ACTIONS = ["none", "offer_call", "offer_gmail"] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

/**
 * Something the application did that the assistant should respond to. Details
 * are read from the authoritative state, not from the event.
 */
export const TURN_EVENT_TYPES = [
  "call_connected",
  "call_ended",
  "gmail_connected",
  "gmail_failed",
  "mission_started",
] as const;
export type TurnEventType = (typeof TURN_EVENT_TYPES)[number];
export interface TurnEvent {
  type: TurnEventType;
}

export interface RejectedUpdate {
  field: ProfileField;
  value: string;
  reason: string;
}

export interface TurnRequest {
  state: OnboardingState;
  event: TurnEvent | null;
}

export interface TurnResponse {
  assistantMessage: string;
  /** Raw model output. Not authoritative. */
  proposal: ModelProposal;
  signals: ModelSignals;
  /** Proposals that passed server validation. The reducer still re-validates. */
  acceptedUpdates: ProfileUpdates;
  rejectedUpdates: RejectedUpdate[];
  suggestedAction: SuggestedAction;
}

export interface TurnErrorResponse {
  error: string;
}

export function isModelProposal(value: unknown): value is ModelProposal {
  return (
    isRecord(value) &&
    PROFILE_FIELDS.every((field) => isNullableString(value[field]))
  );
}

export function isModelSignals(value: unknown): value is ModelSignals {
  return isRecord(value) && SIGNAL_KEYS.every((key) => isBoolean(value[key]));
}

const isRejectedUpdate = (value: unknown): value is RejectedUpdate =>
  isRecord(value) &&
  isOneOf(PROFILE_FIELDS)(value.field) &&
  isString(value.value) &&
  isString(value.reason);

function isProfileUpdates(value: unknown): value is ProfileUpdates {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, v]) => isOneOf(PROFILE_FIELDS)(key) && isString(v),
    )
  );
}

export function isTurnResponse(value: unknown): value is TurnResponse {
  return (
    isRecord(value) &&
    isString(value.assistantMessage) &&
    value.assistantMessage.trim().length > 0 &&
    isModelProposal(value.proposal) &&
    isModelSignals(value.signals) &&
    isProfileUpdates(value.acceptedUpdates) &&
    isArrayOf(isRejectedUpdate)(value.rejectedUpdates) &&
    isOneOf(SUGGESTED_ACTIONS)(value.suggestedAction)
  );
}

const MAX_CALL_ATTEMPTS = 200;

function isTurnEvent(value: unknown): value is TurnEvent {
  return isRecord(value) && isOneOf(TURN_EVENT_TYPES)(value.type);
}

/**
 * Validates an incoming request, including size limits so the server never
 * forwards unbounded content to the model.
 */
export function isTurnRequest(value: unknown): value is TurnRequest {
  if (!isRecord(value) || !isOnboardingState(value.state)) return false;
  if (value.event !== null && !isTurnEvent(value.event)) return false;
  const { messages, profile, call } = value.state;
  return (
    messages.length > 0 &&
    messages.length <= MAX_CONTEXT_MESSAGES &&
    messages.every((m) => m.content.length <= MAX_MESSAGE_LENGTH) &&
    call.attempts.length <= MAX_CALL_ATTEMPTS &&
    PROFILE_FIELDS.every(
      (field) =>
        profile[field] === null ||
        profile[field].length <= PROFILE_FIELD_MAX_LENGTH[field],
    )
  );
}

/** Trims the state to what the server accepts as context. */
export function toTurnRequest(
  state: OnboardingState,
  event: TurnEvent | null = null,
): TurnRequest {
  return {
    state: {
      ...state,
      messages: state.messages.slice(-MAX_CONTEXT_MESSAGES),
      call: {
        ...state.call,
        attempts: state.call.attempts.slice(-MAX_CALL_ATTEMPTS),
      },
    },
    event,
  };
}
