import { MAX_MESSAGE_LENGTH, type ModelSignals } from "@/lib/assistant/contract";
import { isPlausibleEmail } from "@/lib/gmail/connection";
import { fallbackMission, getGraduation, normalizeMissionText } from "./graduation";
import { applySignals } from "./preferences";
import { getOpenAttempt, isCallActive } from "./selectors";
import {
  PROFILE_FIELDS,
  type CallEndReason,
  type CallFailure,
  type GmailFailure,
  type Message,
  type OnboardingProfile,
  type OnboardingState,
  type ProfileField,
  type ProfileUpdates,
  type Timestamp,
  type Understanding,
} from "./types";
import { validateProfileValue } from "./validation";

export const GREETING = "Before we start — what should I call myself?";

export function createInitialState(now: Timestamp): OnboardingState {
  return {
    status: "not_started",
    mode: "text",
    profile: {
      agentName: null,
      userName: null,
      helpIntent: null,
    },
    preferences: { gmail: "unknown", call: "unknown" },
    understanding: { helpIntentIsConcrete: false, wantsToSkipSetup: false },
    gmail: {
      status: "not_connected",
      email: null,
      connectedAt: null,
      lastFailure: null,
    },
    call: { status: "idle", attempts: [] },
    completion: null,
    messages: [
      {
        id: "greeting",
        role: "assistant",
        content: GREETING,
        createdAt: now,
        callId: null,
      },
    ],
  };
}

export type OnboardingAction =
  | { type: "hydrated"; state: OnboardingState; now: Timestamp }
  | { type: "reset"; now: Timestamp }
  | { type: "message_added"; message: Message }
  | {
      type: "assistant_replied";
      message: Message;
      updates: ProfileUpdates;
      signals: ModelSignals;
    }
  | { type: "profile_field_set"; field: ProfileField; value: string }
  // The user pressed "Not now" on an offer.
  | { type: "offer_declined"; offer: "call" | "gmail" }
  // Dispatched only with the server-verified outcome of a Google authorization.
  | { type: "gmail_connected"; email: string; at: Timestamp }
  | { type: "gmail_connection_failed"; reason: GmailFailure; at: Timestamp }
  | { type: "call_started"; attemptId: string; at: Timestamp }
  | { type: "call_connected"; attemptId: string; at: Timestamp }
  | {
      type: "call_ended";
      attemptId: string;
      at: Timestamp;
      reason: CallEndReason;
      failure: CallFailure | null;
    }
  | {
      type: "onboarding_completed";
      mission: string;
      note: string | null;
      at: Timestamp;
    };

/**
 * Applies only known profile fields, and only values that pass validation.
 * Anything else in `updates` is ignored.
 */
function applyProfileUpdates(
  profile: OnboardingProfile,
  updates: ProfileUpdates,
): OnboardingProfile {
  let next = profile;
  for (const field of PROFILE_FIELDS) {
    if (updates[field] === undefined) continue;
    const result = validateProfileValue(field, updates[field]);
    if (result.ok && result.value !== next[field]) {
      next = { ...next, [field]: result.value };
    }
  }
  return next;
}

/**
 * Concreteness belongs to a specific helpIntent: it sticks until the intent
 * changes, then the model's latest reading decides again.
 */
function applyUnderstanding(
  understanding: Understanding,
  signals: ModelSignals,
  previousIntent: string | null,
  intent: string | null,
): Understanding {
  const helpIntentIsConcrete =
    intent !== null &&
    (intent === previousIntent
      ? understanding.helpIntentIsConcrete === true || signals.hasConcreteIntent
      : signals.hasConcreteIntent);
  const wantsToSkipSetup = understanding.wantsToSkipSetup || signals.wantsToSkipOnboarding;
  return helpIntentIsConcrete === understanding.helpIntentIsConcrete &&
    wantsToSkipSetup === understanding.wantsToSkipSetup
    ? understanding
    : { helpIntentIsConcrete, wantsToSkipSetup };
}

/** Voice messages are only accepted while their call is live. */
function acceptsMessage(state: OnboardingState, message: Message): boolean {
  return message.callId === null || isCallActive(state, message.callId);
}

/**
 * A call can't survive a page reload: the microphone and speech session are
 * gone. Close any open attempt as interrupted instead of restoring it.
 */
function closeInterruptedCall(
  state: OnboardingState,
  now: Timestamp,
): OnboardingState {
  if (state.call.status === "idle" && state.mode === "text") return state;
  const open = getOpenAttempt(state);
  return {
    ...state,
    mode: "text",
    call: {
      status: "idle",
      attempts: state.call.attempts.map((attempt) =>
        attempt === open
          ? { ...attempt, endedAt: now, endReason: "interrupted" as const }
          : attempt,
      ),
    },
  };
}

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case "hydrated":
      return closeInterruptedCall(action.state, action.now);

    case "reset":
      return createInitialState(action.now);

    case "message_added": {
      const content = action.message.content.trim();
      // The server refuses longer messages, so storing one would block every turn.
      if (
        !content ||
        content.length > MAX_MESSAGE_LENGTH ||
        !acceptsMessage(state, action.message)
      ) {
        return state;
      }
      return {
        ...state,
        status:
          state.status === "not_started" && action.message.role === "user"
            ? "in_progress"
            : state.status,
        messages: [...state.messages, { ...action.message, content }],
      };
    }

    case "assistant_replied": {
      // The reply, its profile updates, and its preferences commit together
      // or not at all.
      const { message } = action;
      const content = message.content.trim();
      if (
        !content ||
        message.role !== "assistant" ||
        !acceptsMessage(state, message)
      ) {
        return state;
      }
      const profile = applyProfileUpdates(state.profile, action.updates);
      // Signals describe the user's latest message; a reply to an app event
      // alone carries none.
      const answersUser = state.messages.at(-1)?.role === "user";
      return {
        ...state,
        profile,
        preferences: applySignals(state.preferences, action.signals),
        understanding: answersUser
          ? applyUnderstanding(
              state.understanding,
              action.signals,
              state.profile.helpIntent,
              profile.helpIntent,
            )
          : state.understanding,
        messages: [...state.messages, { ...message, content }],
      };
    }

    case "profile_field_set": {
      const profile = applyProfileUpdates(state.profile, {
        [action.field]: action.value,
      });
      if (profile === state.profile) return state;
      return {
        ...state,
        profile,
        understanding:
          profile.helpIntent === state.profile.helpIntent
            ? state.understanding
            : { ...state.understanding, helpIntentIsConcrete: false },
      };
    }

    case "offer_declined":
      if (state.preferences[action.offer] === "declined") return state;
      if (action.offer === "gmail" && state.gmail.status === "connected") return state;
      return {
        ...state,
        preferences: { ...state.preferences, [action.offer]: "declined" },
      };

    case "gmail_connected":
      if (state.gmail.status === "connected" || !isPlausibleEmail(action.email)) {
        return state;
      }
      return {
        ...state,
        status: state.status === "not_started" ? "in_progress" : state.status,
        // Completing Google's consent is the clearest statement of preference.
        preferences: { ...state.preferences, gmail: "wants" },
        gmail: {
          ...state.gmail,
          status: "connected",
          email: action.email,
          connectedAt: action.at,
        },
      };

    case "gmail_connection_failed":
      // A stray failed attempt never undoes a verified connection.
      if (state.gmail.status === "connected") return state;
      return {
        ...state,
        gmail: {
          ...state.gmail,
          status: "failed",
          lastFailure: { reason: action.reason, at: action.at },
        },
      };

    case "call_started":
      // Ignores repeats (double clicks, re-renders) and overlapping calls.
      if (
        state.call.status !== "idle" ||
        state.call.attempts.some((a) => a.id === action.attemptId)
      ) {
        return state;
      }
      return {
        ...state,
        status: state.status === "not_started" ? "in_progress" : state.status,
        mode: "call",
        // Starting a call is the clearest possible statement of preference.
        preferences: { ...state.preferences, call: "wants" },
        call: {
          status: "connecting",
          attempts: [
            ...state.call.attempts,
            {
              id: action.attemptId,
              startedAt: action.at,
              connectedAt: null,
              endedAt: null,
              endReason: null,
              failure: null,
            },
          ],
        },
      };

    case "call_connected": {
      const open = getOpenAttempt(state);
      if (state.call.status !== "connecting" || open?.id !== action.attemptId) {
        return state;
      }
      return {
        ...state,
        call: {
          status: "active",
          attempts: state.call.attempts.map((a) =>
            a === open ? { ...a, connectedAt: action.at } : a,
          ),
        },
      };
    }

    case "call_ended": {
      const open = getOpenAttempt(state);
      if (open?.id !== action.attemptId) return state;
      return {
        ...state,
        mode: "text",
        call: {
          status: "idle",
          attempts: state.call.attempts.map((a) =>
            a === open
              ? {
                  ...a,
                  endedAt: action.at,
                  endReason: action.reason,
                  failure: action.reason === "failed" ? action.failure : null,
                }
              : a,
          ),
        },
      };
    }

    case "onboarding_completed": {
      // Only the graduation rule decides; the conversation never can.
      if (
        state.status === "completed" ||
        state.call.status !== "idle" ||
        !getGraduation(state).ready ||
        !state.profile.helpIntent
      ) {
        return state;
      }
      const mission =
        normalizeMissionText(action.mission) ?? fallbackMission(state.profile.helpIntent);
      return {
        ...state,
        status: "completed",
        completion: { at: action.at, mission, note: normalizeMissionText(action.note) },
      };
    }
  }
}
