"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/contract";
import type {
  CallEndReason,
  CallFailure,
  ProfileUpdates,
} from "@/lib/onboarding/types";
import { browserVoice } from "@/lib/voice/browser";
import {
  getVoiceOverride,
  type ListenResult,
  type ListenStage,
} from "@/lib/voice/io";

/** What the call is doing right now. The mic is open only while `listening`. */
export type CallPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking";

interface CallContextValue {
  phase: CallPhase;
  /** Attempt id of the call in progress. */
  attemptId: string | null;
  /** Speech detected while listening. */
  hearing: boolean;
  /** Short guidance shown while listening, e.g. after an unintelligible turn. */
  notice: string | null;
  /** Why the most recent call failed, for the in-page explanation. */
  lastFailure: CallFailure | null;
  /** Profile facts accepted from voice turns this session. Debug only. */
  voiceFacts: ProfileUpdates;
  canStart: boolean;
  start: () => void;
  hangUp: () => void;
}

interface Session {
  attemptId: string;
  controller: AbortController;
}

// A listen that ends this fast repeatedly isn't listening at all.
const QUICK_LISTEN_MS = 500;
const MAX_QUICK_LISTENS = 5;

const NOTICE_MISSED = "Sorry, I didn't catch that. Try again.";
const NOTICE_QUIET =
  "Not hearing anything yet. Check your microphone, or hang up to keep typing.";

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { state, isHydrated, actions } = useOnboarding();
  const { requestStatus, takeTurn, cancelPending } = useConversation();
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [hearing, setHearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastFailure, setLastFailure] = useState<CallFailure | null>(null);
  const [voiceFacts, setVoiceFacts] = useState<ProfileUpdates>({});
  // Every async step checks it still belongs to the current session, so a
  // late result from a hung-up call can never act.
  const sessionRef = useRef<Session | null>(null);

  const canStart =
    isHydrated &&
    phase === "idle" &&
    state.call.status === "idle" &&
    state.profile.agentName !== null &&
    requestStatus !== "pending";

  const rememberVoiceFacts = useCallback((updates: ProfileUpdates) => {
    if (Object.keys(updates).length > 0) {
      setVoiceFacts((facts) => ({ ...facts, ...updates }));
    }
  }, []);

  const endSession = useCallback(
    (session: Session, reason: CallEndReason, failure: CallFailure | null) => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      // Stops the mic, cancels speech, and abandons any pending reply.
      session.controller.abort();
      cancelPending();
      actions.endCall(session.attemptId, reason, failure);
      setPhase("idle");
      setAttemptId(null);
      setHearing(false);
      setNotice(null);
      setLastFailure(failure);
      // If the assistant itself was unreachable, another request would most
      // likely fail too; the timeline explains what happened instead.
      if (failure !== "assistant_unavailable") {
        void takeTurn({ callId: null, event: { type: "call_ended" } }).then(
          (result) => {
            if (result.status === "committed") {
              rememberVoiceFacts(result.turn.acceptedUpdates);
            }
          },
        );
      }
    },
    [actions, cancelPending, rememberVoiceFacts, takeTurn],
  );

  // Recorded on the next task, not immediately: a reload cancels in-flight
  // requests before the page goes away, and those errors must not be saved as
  // the call failing. An unloading page runs no further tasks, so the attempt
  // stays open and the next load closes it as interrupted.
  const fail = useCallback(
    (session: Session, failure: CallFailure) => {
      window.setTimeout(() => endSession(session, "failed", failure), 0);
    },
    [endSession],
  );

  const run = useCallback(
    async (session: Session) => {
      const { attemptId, controller } = session;
      const { signal } = controller;
      const live = () => sessionRef.current === session;
      const io = getVoiceOverride() ?? browserVoice;

      const unsupported = io.checkSupport();
      if (unsupported) return fail(session, unsupported);

      const micFailure = await io.requestMicrophone(signal);
      if (!live()) return;
      if (micFailure) return fail(session, micFailure);

      actions.connectCall(attemptId);
      setPhase("processing");
      let result = await takeTurn({
        callId: attemptId,
        event: { type: "call_connected" },
      });

      while (live()) {
        if (result.status !== "committed") {
          return fail(session, "assistant_unavailable");
        }
        rememberVoiceFacts(result.turn.acceptedUpdates);

        setPhase("speaking");
        const spoke = await io.speak(result.reply, signal);
        if (!live()) return;
        if (!spoke) return fail(session, "synthesis_failed");

        const onStage = (stage: ListenStage) => {
          if (!live()) return;
          if (stage === "hearing") {
            setHearing(true);
            setNotice(null);
          } else if (stage === "quiet") {
            setNotice(NOTICE_QUIET);
          } else {
            setHearing(false);
            setPhase("processing");
          }
        };
        let heard: ListenResult;
        let quickListens = 0;
        let missed = false;
        do {
          setPhase("listening");
          setHearing(false);
          setNotice(missed ? NOTICE_MISSED : null);
          const startedAt = Date.now();
          heard = await io.listen(onStage, signal);
          if (!live()) return;
          if (heard.type === "no_speech" && Date.now() - startedAt < QUICK_LISTEN_MS) {
            if (++quickListens >= MAX_QUICK_LISTENS) {
              return fail(session, "speech_error");
            }
          } else {
            quickListens = 0;
          }
          missed = true;
        } while (heard.type === "no_speech");
        setNotice(null);

        if (heard.type === "error") {
          return fail(session, heard.failure);
        }

        setPhase("processing");
        result = await takeTurn({
          callId: attemptId,
          userText: heard.text.slice(0, MAX_MESSAGE_LENGTH),
        });
      }
    },
    [actions, fail, rememberVoiceFacts, takeTurn],
  );

  const start = useCallback(() => {
    if (sessionRef.current || !canStart) return;
    const id = actions.startCall();
    if (!id) return;
    const session: Session = { attemptId: id, controller: new AbortController() };
    sessionRef.current = session;
    setPhase("connecting");
    setAttemptId(id);
    setHearing(false);
    setNotice(null);
    setLastFailure(null);
    void run(session);
  }, [actions, canStart, run]);

  const hangUp = useCallback(() => {
    const session = sessionRef.current;
    if (session) endSession(session, "user_ended", null);
  }, [endSession]);

  // Leaving the page mid-call: release the mic and speech. The persisted
  // attempt is closed as interrupted on the next load.
  useEffect(
    () => () => {
      sessionRef.current?.controller.abort();
      sessionRef.current = null;
    },
    [],
  );

  const value = useMemo(
    () => ({
      phase,
      attemptId,
      hearing,
      notice,
      lastFailure,
      voiceFacts,
      canStart,
      start,
      hangUp,
    }),
    [
      phase,
      attemptId,
      hearing,
      notice,
      lastFailure,
      voiceFacts,
      canStart,
      start,
      hangUp,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
