/**
 * Bump when the persisted shape of `OnboardingState` changes, and add a
 * migration from the previous version in `storage.ts`.
 */
export const ONBOARDING_STATE_VERSION = 5;

// Runtime lists double as the source of truth for the union types and for
// validating persisted data.
export const INTERACTION_MODES = ["text", "call"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/**
 * `connected` is set only from a Google authorization the server verified;
 * `failed` means the latest attempt ended without connecting.
 */
export const GMAIL_CONNECTION_STATUSES = [
  "not_connected",
  "connected",
  "failed",
] as const;
export type GmailConnectionStatus = (typeof GMAIL_CONNECTION_STATUSES)[number];

export const GMAIL_FAILURES = [
  // The user cancelled or denied consent on Google's screen.
  "cancelled",
  // The callback's state didn't match the flow this browser started (e.g. a stale tab).
  "invalid_state",
  "missing_code",
  "token_exchange_failed",
  // Google's identity token failed validation, or the email isn't verified.
  "identity_unverified",
  "network_error",
  // Google returned an error other than a denial.
  "google_error",
  "not_configured",
] as const;
export type GmailFailure = (typeof GMAIL_FAILURES)[number];

/**
 * State of the current call. `connecting` covers the microphone permission
 * check; `active` means the microphone is open and the conversation running.
 */
export const CALL_STATUSES = ["idle", "connecting", "active"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_END_REASONS = [
  "user_ended",
  "failed",
  // The page was reloaded or closed while the call was open.
  "interrupted",
] as const;
export type CallEndReason = (typeof CALL_END_REASONS)[number];

export const CALL_FAILURES = [
  "mic_permission_denied",
  "mic_unavailable",
  // The microphone is open but produces no signal (muted or wrong input).
  "mic_silent",
  // The browser can't record audio, or transcription failed mid-call.
  "speech_unsupported",
  "speech_error",
  // Speech synthesis is missing or failed.
  "synthesis_failed",
  // The assistant request failed during the call.
  "assistant_unavailable",
] as const;
export type CallFailure = (typeof CALL_FAILURES)[number];

export const MESSAGE_ROLES = ["assistant", "user"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** What the user has said they want. Never proof that anything happened. */
export const PREFERENCE_STATUSES = ["unknown", "wants", "declined"] as const;
export type PreferenceStatus = (typeof PREFERENCE_STATUSES)[number];

/** ISO-8601 timestamp string. */
export type Timestamp = string;

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Timestamp;
  /** The call this message was spoken on, or `null` for text. */
  callId: string | null;
}

export interface CallAttempt {
  id: string;
  startedAt: Timestamp;
  connectedAt: Timestamp | null;
  endedAt: Timestamp | null;
  endReason: CallEndReason | null;
  failure: CallFailure | null;
}

/** Holds no tokens: those never leave the server. */
export interface GmailConnection {
  status: GmailConnectionStatus;
  /** Verified email of the connected Google account. */
  email: string | null;
  connectedAt: Timestamp | null;
  lastFailure: { reason: GmailFailure; at: Timestamp } | null;
}

/**
 * Facts collected during onboarding. These are set only through explicit
 * actions, never inferred from message text.
 */
export interface OnboardingProfile {
  agentName: string | null;
  userName: string | null;
  helpIntent: string | null;
}

export const PROFILE_FIELDS = ["agentName", "userName", "helpIntent"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Replacement values for profile fields. Omitted fields are unchanged. */
export type ProfileUpdates = Partial<Record<ProfileField, string>>;

/**
 * The model's reading of the user's own words, kept so it survives refresh.
 * Like preferences, never proof that anything happened.
 */
export interface Understanding {
  /**
   * The current helpIntent is specific enough to act on. `null`: not judged
   * yet (a helpIntent stored before v5), which is not the same as vague.
   */
  helpIntentIsConcrete: boolean | null;
  /** The user asked to skip or stop setup. */
  wantsToSkipSetup: boolean;
}

/** Set once, when the user starts their first mission. */
export interface Completion {
  at: Timestamp;
  /** Presentational wording shown on the mission card. */
  mission: string;
  note: string | null;
}

export interface OnboardingState {
  /** `completed` exactly when `completion` is set. */
  status: OnboardingStatus;
  mode: InteractionMode;
  profile: OnboardingProfile;
  preferences: {
    gmail: PreferenceStatus;
    call: PreferenceStatus;
  };
  understanding: Understanding;
  gmail: GmailConnection;
  call: {
    status: CallStatus;
    attempts: CallAttempt[];
  };
  completion: Completion | null;
  messages: Message[];
}
