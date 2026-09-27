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
import { requestAssistantTurn } from "@/lib/assistant/client";
import {
  MAX_MESSAGE_LENGTH,
  type SuggestedAction,
  type TurnEvent,
  type TurnResponse,
} from "@/lib/assistant/contract";
import { useOnboarding } from "./OnboardingProvider";

export type RequestStatus = "idle" | "pending" | "failed";

export interface TurnInput {
  /** The call this turn belongs to, or `null` for text. */
  callId: string | null;
  /** New user message (typed or transcribed). Omit for event-only turns. */
  userText?: string;
  event?: TurnEvent | null;
}

export type TurnResult =
  | { status: "committed"; reply: string; turn: TurnResponse }
  /** The reply arrived but no longer applied (e.g. the call ended). */
  | { status: "dropped" }
  /** Another turn is in flight, or the input was rejected. */
  | { status: "busy" }
  | { status: "failed" }
  | { status: "aborted" };

interface ConversationContextValue {
  requestStatus: RequestStatus;
  /** The latest message is from the user and has no reply yet. */
  isAwaitingReply: boolean;
  /** Most recent model output, kept for debugging. Not persisted. */
  lastTurn: TurnResponse | null;
  /** Id of the latest assistant message if the server allowed a call offer. */
  callOfferMessageId: string | null;
  /** Id of the latest assistant message if the server allowed a Gmail offer. */
  gmailOfferMessageId: string | null;
  /** Sends a typed message. Returns false if it was not sent. */
  send: (content: string) => boolean;
  /** Shared by text and voice: one in-flight turn at a time, same commit path. */
  takeTurn: (input: TurnInput) => Promise<TurnResult>;
  /** Abandons the in-flight turn; its reply will not be committed. */
  cancelPending: () => void;
  retry: () => void;
  reset: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(
  null,
);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const { state, isHydrated, getState, actions } = useOnboarding();
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("idle");
  const [lastTurn, setLastTurn] = useState<TurnResponse | null>(null);
  const [offer, setOffer] = useState<{
    messageId: string;
    action: Exclude<SuggestedAction, "none">;
  } | null>(null);
  // A ref, not state, so a second submit in the same tick is also blocked.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const takeTurn = useCallback(
    async ({ callId, userText, event = null }: TurnInput): Promise<TurnResult> => {
      if (!isHydrated || inFlight.current) return { status: "busy" };
      if (userText !== undefined && !actions.addMessage("user", userText, callId)) {
        return { status: "busy" };
      }
      const controller = new AbortController();
      inFlight.current = controller;
      setRequestStatus("pending");
      try {
        const turn = await requestAssistantTurn(
          getState(),
          event,
          controller.signal,
        );
        if (controller.signal.aborted) return { status: "aborted" };
        setLastTurn(turn);
        setRequestStatus("idle");
        const messageId = actions.commitAssistantReply(
          turn.assistantMessage,
          turn.acceptedUpdates,
          turn.signals,
          callId,
        );
        if (!messageId) return { status: "dropped" };
        setOffer(
          turn.suggestedAction === "none"
            ? null
            : { messageId, action: turn.suggestedAction },
        );
        return { status: "committed", reply: turn.assistantMessage, turn };
      } catch {
        if (controller.signal.aborted) return { status: "aborted" };
        setRequestStatus("failed");
        return { status: "failed" };
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [actions, getState, isHydrated],
  );

  const send = useCallback(
    (content: string) => {
      if (
        !isHydrated ||
        inFlight.current ||
        !content.trim() ||
        content.trim().length > MAX_MESSAGE_LENGTH ||
        getState().call.status !== "idle"
      ) {
        return false;
      }
      void takeTurn({ callId: null, userText: content });
      return true;
    },
    [getState, isHydrated, takeTurn],
  );

  const cancelPending = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setRequestStatus("idle");
  }, []);

  const retry = useCallback(() => {
    const current = getState();
    if (current.call.status === "idle" && current.messages.at(-1)?.role === "user") {
      void takeTurn({ callId: null });
    }
  }, [getState, takeTurn]);

  const reset = useCallback(() => {
    cancelPending();
    setLastTurn(null);
    setOffer(null);
    actions.reset();
  }, [actions, cancelPending]);

  const isAwaitingReply =
    isHydrated && state.messages.at(-1)?.role === "user";
  const callOfferMessageId = offer?.action === "offer_call" ? offer.messageId : null;
  const gmailOfferMessageId = offer?.action === "offer_gmail" ? offer.messageId : null;

  const value = useMemo(
    () => ({
      requestStatus,
      isAwaitingReply,
      lastTurn,
      callOfferMessageId,
      gmailOfferMessageId,
      send,
      takeTurn,
      cancelPending,
      retry,
      reset,
    }),
    [
      requestStatus,
      isAwaitingReply,
      lastTurn,
      callOfferMessageId,
      gmailOfferMessageId,
      send,
      takeTurn,
      cancelPending,
      retry,
      reset,
    ],
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "useConversation must be used within a ConversationProvider",
    );
  }
  return context;
}
