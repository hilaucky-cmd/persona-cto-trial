import {
  CALL_END_REASONS,
  CALL_FAILURES,
  CALL_STATUSES,
  GMAIL_CONNECTION_STATUSES,
  GMAIL_FAILURES,
  INTERACTION_MODES,
  MESSAGE_ROLES,
  ONBOARDING_STATUSES,
  PREFERENCE_STATUSES,
  type CallAttempt,
  type Completion,
  type GmailConnection,
  type Message,
  type OnboardingState,
} from "./types";

export type Guard<T> = (value: unknown) => value is T;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isOneOf<T extends string>(options: readonly T[]): Guard<T> {
  return (value): value is T =>
    typeof value === "string" && (options as readonly string[]).includes(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isArrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(guard);
}

function isNullableOneOf<T extends string>(options: readonly T[]) {
  return (value: unknown): value is T | null =>
    value === null || isOneOf(options)(value);
}

export const isMessage: Guard<Message> = (value): value is Message =>
  isRecord(value) &&
  isString(value.id) &&
  isOneOf(MESSAGE_ROLES)(value.role) &&
  isString(value.content) &&
  isString(value.createdAt) &&
  isNullableString(value.callId);

const isCallAttempt: Guard<CallAttempt> = (value): value is CallAttempt =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.startedAt) &&
  isNullableString(value.connectedAt) &&
  isNullableString(value.endedAt) &&
  isNullableOneOf(CALL_END_REASONS)(value.endReason) &&
  isNullableOneOf(CALL_FAILURES)(value.failure);

const isGmailConnection: Guard<GmailConnection> = (
  value,
): value is GmailConnection =>
  isRecord(value) &&
  isOneOf(GMAIL_CONNECTION_STATUSES)(value.status) &&
  isNullableString(value.email) &&
  isNullableString(value.connectedAt) &&
  (value.lastFailure === null ||
    (isRecord(value.lastFailure) &&
      isOneOf(GMAIL_FAILURES)(value.lastFailure.reason) &&
      isString(value.lastFailure.at))) &&
  // Connected always carries the verified account; nothing else does.
  (value.status === "connected") ===
    (value.email !== null && value.connectedAt !== null);

const isCompletion = (value: unknown): value is Completion =>
  isRecord(value) &&
  isString(value.at) &&
  isString(value.mission) &&
  isNullableString(value.note);

export function isOnboardingState(value: unknown): value is OnboardingState {
  if (!isRecord(value)) return false;
  const { profile, preferences, understanding, gmail, call, completion } = value;
  return (
    isOneOf(ONBOARDING_STATUSES)(value.status) &&
    isOneOf(INTERACTION_MODES)(value.mode) &&
    isRecord(profile) &&
    isNullableString(profile.agentName) &&
    isNullableString(profile.userName) &&
    isNullableString(profile.helpIntent) &&
    isRecord(preferences) &&
    isOneOf(PREFERENCE_STATUSES)(preferences.gmail) &&
    isOneOf(PREFERENCE_STATUSES)(preferences.call) &&
    isRecord(understanding) &&
    (understanding.helpIntentIsConcrete === null ||
      isBoolean(understanding.helpIntentIsConcrete)) &&
    isBoolean(understanding.wantsToSkipSetup) &&
    isGmailConnection(gmail) &&
    isRecord(call) &&
    isOneOf(CALL_STATUSES)(call.status) &&
    isArrayOf(isCallAttempt)(call.attempts) &&
    (completion === null || isCompletion(completion)) &&
    (value.status === "completed") === (completion !== null) &&
    isArrayOf(isMessage)(value.messages)
  );
}
