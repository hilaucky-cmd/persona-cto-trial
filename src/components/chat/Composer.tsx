"use client";

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useConversation } from "@/components/onboarding/ConversationProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/contract";

export function Composer() {
  const { state, isHydrated } = useOnboarding();
  const placeholder =
    state.status === "completed" && state.profile.agentName
      ? `Message ${state.profile.agentName}…`
      : "Type your answer…";
  const { requestStatus, send } = useConversation();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const isPending = requestStatus === "pending";
  const canSend = isHydrated && !isPending && draft.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    if (send(draft)) setDraft("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter while an IME composition is open confirms the composition instead.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-2xl px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-6"
    >
      <label htmlFor={inputId} className="sr-only">
        Message
      </label>
      <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pr-1.5 pl-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors focus-within:border-neutral-400">
        <input
          ref={inputRef}
          id={inputId}
          data-composer-input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={MAX_MESSAGE_LENGTH}
          autoComplete="off"
          enterKeyHint="send"
          disabled={!isHydrated}
          // 16px minimum prevents iOS Safari from zooming on focus.
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
          </svg>
        </button>
      </div>
    </form>
  );
}
