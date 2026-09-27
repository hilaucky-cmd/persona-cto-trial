"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import {
  OAUTH_RETURN_PARAM,
  OAUTH_RETURN_VALUE,
  fetchGmailConnectionResult,
} from "@/lib/gmail/connection";

/** Outcome of the check made when the page loads after visiting Google. */
export type ReturnCheck =
  | "not_returning"
  | "connected"
  | "failed"
  | "no_result"
  | "check_failed";

const GmailContext = createContext<ReturnCheck>("not_returning");

/** Removes the return hint so a refresh or shared URL doesn't re-check. */
function consumeReturnParam(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(OAUTH_RETURN_PARAM) !== OAUTH_RETURN_VALUE) return false;
  url.searchParams.delete(OAUTH_RETURN_PARAM);
  window.history.replaceState(window.history.state, "", url);
  return true;
}

/**
 * Picks up the result of a Google authorization when the user comes back.
 * The URL only says "check"; the outcome comes from the server, which read it
 * from a signed, HttpOnly, one-time cookie set by the OAuth callback.
 */
export function GmailProvider({ children }: { children: ReactNode }) {
  const { isHydrated, actions } = useOnboarding();
  const { takeTurn } = useConversation();
  const [returnCheck, setReturnCheck] = useState<ReturnCheck>("not_returning");
  const checked = useRef(false);

  useEffect(() => {
    if (!isHydrated || checked.current) return;
    checked.current = true;
    if (!consumeReturnParam()) return;

    fetchGmailConnectionResult()
      .then((result) => {
        if (result.status === "none") {
          setReturnCheck("no_result");
          return;
        }
        setReturnCheck(result.status);
        if (actions.applyGmailResult(result)) {
          void takeTurn({
            callId: null,
            event: {
              type: result.status === "connected" ? "gmail_connected" : "gmail_failed",
            },
          });
        }
      })
      .catch(() => setReturnCheck("check_failed"));
  }, [actions, isHydrated, takeTurn]);

  return <GmailContext.Provider value={returnCheck}>{children}</GmailContext.Provider>;
}

export function useGmailReturnCheck(): ReturnCheck {
  return useContext(GmailContext);
}
