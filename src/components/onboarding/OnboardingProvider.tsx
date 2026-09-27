"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { ModelSignals } from "@/lib/assistant/contract";
import type { GmailConnectionResult } from "@/lib/gmail/connection";
import { createId } from "@/lib/id";
import {
  createInitialState,
  onboardingReducer,
  type OnboardingAction,
} from "@/lib/onboarding/reducer";
import {
  loadOnboardingState,
  saveOnboardingState,
} from "@/lib/onboarding/storage";
import type {
  CallEndReason,
  CallFailure,
  MessageRole,
  OnboardingState,
  ProfileField,
  ProfileUpdates,
} from "@/lib/onboarding/types";

export interface OnboardingActions {
  /** Returns false if the reducer rejected the message. */
  addMessage: (
    role: MessageRole,
    content: string,
    callId?: string | null,
  ) => boolean;
  /** Returns the committed message's id, or `null` if it was rejected. */
  commitAssistantReply: (
    content: string,
    updates: ProfileUpdates,
    signals: ModelSignals,
    callId: string | null,
  ) => string | null;
  setProfileField: (field: ProfileField, value: string) => void;
  /**
   * Commits the outcome the server verified for a Google authorization.
   * Returns whether it changed the state.
   */
  applyGmailResult: (result: GmailConnectionResult) => boolean;
  /** Returns the new attempt's id, or `null` if a call is already open. */
  startCall: () => string | null;
  connectCall: (attemptId: string) => void;
  endCall: (
    attemptId: string,
    reason: CallEndReason,
    failure?: CallFailure | null,
  ) => void;
  /** The user turned down an offer with its button. */
  declineOffer: (offer: "call" | "gmail") => void;
  /** Returns false unless the graduation rule allows it. */
  completeOnboarding: (mission: string, note: string | null) => boolean;
  reset: () => void;
}

interface OnboardingContextValue {
  state: OnboardingState;
  /** False until persisted state has been read on the client. */
  isHydrated: boolean;
  /**
   * Latest committed state, including actions dispatched since the last
   * render. For async flows that must not act on a stale closure.
   */
  getState: () => OnboardingState;
  actions: OnboardingActions;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const now = () => new Date().toISOString();

/** Pairs the domain state with whether it has been restored from storage. */
interface Store {
  isHydrated: boolean;
  state: OnboardingState;
}

// Server and first client render must match, so the pre-hydration state uses
// a fixed timestamp. It is replaced as soon as the client hydrates.
const PRE_HYDRATION_STORE: Store = {
  isHydrated: false,
  state: createInitialState(new Date(0).toISOString()),
};

function storeReducer(store: Store, action: OnboardingAction): Store {
  const state = onboardingReducer(store.state, action);
  const isHydrated = store.isHydrated || action.type === "hydrated";
  if (state === store.state && isHydrated === store.isHydrated) return store;
  return { isHydrated, state };
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [{ state, isHydrated }, dispatch] = useReducer(
    storeReducer,
    PRE_HYDRATION_STORE,
  );
  // Mirrors the reducer synchronously: every action goes through `commit`,
  // which applies the same pure reducer here and in React.
  const latest = useRef(PRE_HYDRATION_STORE.state);

  /** Returns whether the action changed the state. */
  const commit = useCallback((action: OnboardingAction) => {
    const before = latest.current;
    latest.current = onboardingReducer(before, action);
    dispatch(action);
    return latest.current !== before;
  }, []);

  const getState = useCallback(() => latest.current, []);

  useEffect(() => {
    commit({
      type: "hydrated",
      state: loadOnboardingState() ?? createInitialState(now()),
      now: now(),
    });
  }, [commit]);

  useEffect(() => {
    if (isHydrated) saveOnboardingState(state);
  }, [state, isHydrated]);

  const actions = useMemo<OnboardingActions>(
    () => ({
      addMessage: (role, content, callId = null) =>
        commit({
          type: "message_added",
          message: { id: createId(), role, content, createdAt: now(), callId },
        }),
      commitAssistantReply: (content, updates, signals, callId) => {
        const id = createId();
        const committed = commit({
          type: "assistant_replied",
          message: { id, role: "assistant", content, createdAt: now(), callId },
          updates,
          signals,
        });
        return committed ? id : null;
      },
      setProfileField: (field, value) => {
        commit({ type: "profile_field_set", field, value });
      },
      applyGmailResult: (result) => {
        if (result.status === "connected") {
          return commit({ type: "gmail_connected", email: result.email, at: now() });
        }
        if (result.status === "failed") {
          return commit({
            type: "gmail_connection_failed",
            reason: result.reason,
            at: now(),
          });
        }
        return false;
      },
      startCall: () => {
        const attemptId = createId();
        return commit({ type: "call_started", attemptId, at: now() })
          ? attemptId
          : null;
      },
      connectCall: (attemptId) => {
        commit({ type: "call_connected", attemptId, at: now() });
      },
      endCall: (attemptId, reason, failure = null) => {
        commit({ type: "call_ended", attemptId, at: now(), reason, failure });
      },
      declineOffer: (offer) => {
        commit({ type: "offer_declined", offer });
      },
      completeOnboarding: (mission, note) =>
        commit({ type: "onboarding_completed", mission, note, at: now() }),
      reset: () => {
        commit({ type: "reset", now: now() });
      },
    }),
    [commit],
  );

  const value = useMemo(
    () => ({ state, isHydrated, getState, actions }),
    [state, isHydrated, getState, actions],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
