"use client";

import { useEffect, useRef } from "react";
import { describeAttempt } from "@/components/call/call-copy";
import { CallOffer } from "@/components/call/CallOffer";
import { GMAIL_FAILURE_COPY } from "@/components/gmail/gmail-copy";
import { GmailOffer } from "@/components/gmail/GmailOffer";
import { MissionCard } from "@/components/mission/MissionCard";
import { MissionOffer } from "@/components/mission/MissionOffer";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { getGraduation } from "@/lib/onboarding/graduation";
import type {
  CallAttempt,
  Completion,
  GmailFailure,
  Message,
  OnboardingState,
} from "@/lib/onboarding/types";

type TimelineItem =
  | { kind: "message"; at: string; message: Message }
  | { kind: "call_start"; at: string; attempt: CallAttempt }
  | { kind: "call_end"; at: string; attempt: CallAttempt }
  | { kind: "gmail_connected"; at: string; email: string }
  | { kind: "gmail_failed"; at: string; reason: GmailFailure }
  | { kind: "mission"; at: string; completion: Completion };

/** Messages interleaved with call and Gmail markers, in time order. */
function buildTimeline(state: OnboardingState): TimelineItem[] {
  const items: TimelineItem[] = state.messages.map((message) => ({
    kind: "message",
    at: message.createdAt,
    message,
  }));
  for (const attempt of state.call.attempts) {
    if (attempt.connectedAt) {
      items.push({ kind: "call_start", at: attempt.connectedAt, attempt });
    }
    if (attempt.endedAt) {
      items.push({ kind: "call_end", at: attempt.endedAt, attempt });
    }
  }
  const { gmail } = state;
  if (gmail.lastFailure) {
    items.push({ kind: "gmail_failed", at: gmail.lastFailure.at, reason: gmail.lastFailure.reason });
  }
  if (gmail.status === "connected" && gmail.email && gmail.connectedAt) {
    items.push({ kind: "gmail_connected", at: gmail.connectedAt, email: gmail.email });
  }
  if (state.completion) {
    items.push({ kind: "mission", at: state.completion.at, completion: state.completion });
  }
  // Stable sort: on equal timestamps, messages stay ahead of markers.
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function MessageList() {
  const { state, isHydrated } = useOnboarding();
  const { requestStatus, isAwaitingReply, retry } = useConversation();
  const endRef = useRef<HTMLDivElement>(null);
  const timeline = buildTimeline(state);
  const itemCount = timeline.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [itemCount, isHydrated, requestStatus]);

  const showRetry = isAwaitingReply && requestStatus !== "pending";
  const offerMission = state.status !== "completed" && getGraduation(state).ready;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-10 pb-6 sm:pt-16">
      <div
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-busy={!isHydrated}
        className="flex flex-col gap-6"
      >
        {/* Wait for persisted state so a restored conversation doesn't flash the default one. */}
        {isHydrated &&
          timeline.map((item) => {
            switch (item.kind) {
              case "message":
                return <MessageItem key={item.message.id} message={item.message} />;
              case "call_start":
              case "call_end":
                return (
                  <CallMarker
                    key={`${item.kind}-${item.attempt.id}`}
                    kind={item.kind}
                    attempt={item.attempt}
                    agentName={state.profile.agentName}
                  />
                );
              case "gmail_connected":
                return (
                  <Marker key={`${item.kind}-${item.at}`} title="Gmail connected" detail={item.email} />
                );
              case "gmail_failed":
                return (
                  <Marker
                    key={`${item.kind}-${item.at}`}
                    title="Gmail not connected"
                    detail={GMAIL_FAILURE_COPY[item.reason]}
                  />
                );
              case "mission":
                return (
                  <MissionCard
                    key={item.kind}
                    state={state}
                    mission={item.completion.mission}
                    note={item.completion.note}
                  >
                    <p className="text-sm text-neutral-500">Mission started</p>
                  </MissionCard>
                );
            }
          })}
      </div>

      {requestStatus === "pending" && <ThinkingIndicator />}
      {showRetry && (
        <ReplyFailed failed={requestStatus === "failed"} onRetry={retry} />
      )}
      {isHydrated &&
        (offerMission ? (
          // A failed Gmail attempt counts toward graduation, so the retry
          // must stay reachable next to the card.
          <>
            <GmailOffer />
            <MissionOffer />
          </>
        ) : (
          <>
            <CallOffer />
            <GmailOffer />
          </>
        ))}
      <div ref={endRef} />
    </div>
  );
}

function CallMarker({
  kind,
  attempt,
  agentName,
}: {
  kind: "call_start" | "call_end";
  attempt: CallAttempt;
  agentName: string | null;
}) {
  const { title, detail } =
    kind === "call_start"
      ? { title: `Voice call${agentName ? ` with ${agentName}` : ""}`, detail: null }
      : describeAttempt(attempt);
  return <Marker title={title} detail={detail} />;
}

function Marker({ title, detail }: { title: string; detail: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="flex w-full items-center gap-3 text-xs font-medium tracking-wide text-neutral-400 uppercase">
        <span aria-hidden="true" className="h-px flex-1 bg-neutral-100" />
        <span>{title}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-neutral-100" />
      </div>
      {detail && <p className="text-sm text-neutral-500">{detail}</p>}
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  if (message.role === "assistant") {
    return (
      <p className="max-w-[90%] text-lg leading-relaxed tracking-[-0.01em] whitespace-pre-wrap text-neutral-900 sm:text-xl">
        <span className="sr-only">Assistant: </span>
        {message.content}
      </p>
    );
  }

  return (
    <p className="max-w-[85%] self-end rounded-2xl bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-neutral-900 sm:text-base">
      <span className="sr-only">You: </span>
      {message.content}
    </p>
  );
}

function ThinkingIndicator() {
  return (
    <div role="status" className="flex items-center gap-1.5 py-2">
      <span className="sr-only">Assistant is replying</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-neutral-400 motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function ReplyFailed({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-neutral-500">
      <span>
        {failed ? "Couldn't get a reply." : "No reply yet."}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        Try again
      </button>
    </div>
  );
}
