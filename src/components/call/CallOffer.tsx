"use client";

import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { NotNowButton } from "@/components/chat/NotNowButton";
import { PERMANENT_FAILURES } from "./call-copy";
import { useCall } from "./CallProvider";
import { PhoneIcon } from "./icons";

/**
 * Inline call button under the latest message, shown when the assistant just
 * offered a call (and the server allowed it) or right after a call ended.
 * Typing is always the other option; this never blocks the composer.
 */
export function CallOffer() {
  const { state, actions } = useOnboarding();
  const { callOfferMessageId, send } = useConversation();
  const { canStart, start } = useCall();

  const lastMessage = state.messages.at(-1);
  const lastAttempt = state.call.attempts.at(-1);
  const offered = callOfferMessageId !== null && lastMessage?.id === callOfferMessageId;
  // No user activity since the last call ended: offer to call back.
  const justEnded =
    lastAttempt?.endedAt != null &&
    !state.messages.some(
      (m) => m.role === "user" && m.callId === null && m.createdAt > lastAttempt.endedAt!,
    ) &&
    !(lastAttempt.failure && PERMANENT_FAILURES.has(lastAttempt.failure));

  if (!canStart || !(offered || justEnded)) return null;

  // Declining is recorded by the app, then said in the chat like any reply.
  function decline() {
    actions.declineOffer("call");
    send("Not now, let's keep texting.");
  }

  return (
    <div className="flex items-center gap-3 text-sm text-neutral-500">
      <button
        type="button"
        onClick={start}
        className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 font-medium text-neutral-900 transition-colors hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        <PhoneIcon />
        {justEnded && !offered ? "Call back" : `Call ${state.profile.agentName}`}
      </button>
      {state.call.attempts.length === 0 ? (
        <NotNowButton onClick={decline} />
      ) : (
        <span>or keep typing</span>
      )}
    </div>
  );
}
