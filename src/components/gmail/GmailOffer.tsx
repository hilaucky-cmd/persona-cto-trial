"use client";

import { useEffect, useState } from "react";
import { MailIcon } from "@/components/call/icons";
import { NotNowButton } from "@/components/chat/NotNowButton";
import { useCall } from "@/components/call/CallProvider";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { GMAIL_CONNECT_ENDPOINT } from "@/lib/gmail/connection";

/**
 * Inline Connect Gmail button under the latest message. A plain form POST, so
 * the server builds the Google URL and only a user click can start it.
 *
 * Shown when the assistant just offered it (and the server allowed it), when
 * the user has said they want it, or right after an attempt didn't connect.
 */
export function GmailOffer() {
  const { state, actions } = useOnboarding();
  const { gmailOfferMessageId, requestStatus, isAwaitingReply, send } = useConversation();
  const { phase } = useCall();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Coming back with the browser's Back button restores this page as it was.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setIsRedirecting(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const { gmail, preferences } = state;
  const lastMessage = state.messages.at(-1);
  const offered =
    gmailOfferMessageId !== null && lastMessage?.id === gmailOfferMessageId;
  const wanted = preferences.gmail === "wants" && lastMessage?.role === "assistant";
  // No typed message since the last attempt failed: offer to try again.
  const justFailed =
    gmail.status === "failed" &&
    gmail.lastFailure !== null &&
    gmail.lastFailure.reason !== "not_configured" &&
    !state.messages.some(
      (m) => m.role === "user" && m.callId === null && m.createdAt > gmail.lastFailure!.at,
    );

  const canConnect =
    gmail.status !== "connected" &&
    state.call.status === "idle" &&
    phase === "idle" &&
    requestStatus !== "pending" &&
    !isAwaitingReply;
  const declined = preferences.gmail === "declined" && !offered;

  if (!canConnect || declined || !(offered || wanted || justFailed)) return null;

  // Declining is recorded by the app, then said in the chat like any reply.
  function decline() {
    actions.declineOffer("gmail");
    send("Not now, I'll skip Gmail for now.");
  }

  return (
    <form
      method="post"
      action={GMAIL_CONNECT_ENDPOINT}
      onSubmit={() => setIsRedirecting(true)}
      className="flex items-center gap-3 text-sm text-neutral-500"
    >
      <button
        type="submit"
        disabled={isRedirecting}
        className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 font-medium text-neutral-900 transition-colors hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-50"
      >
        <MailIcon />
        {isRedirecting ? "Opening Google…" : justFailed ? "Try connecting Gmail again" : "Connect Gmail"}
      </button>
      {!isRedirecting && <NotNowButton onClick={decline} />}
    </form>
  );
}
