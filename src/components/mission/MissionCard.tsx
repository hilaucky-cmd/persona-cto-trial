import type { ReactNode } from "react";
import type { OnboardingState } from "@/lib/onboarding/types";

/** The first-mission card: who the agent is, what it's for, what's connected. */
export function MissionCard({
  state,
  mission,
  note,
  children,
}: {
  state: OnboardingState;
  /** `null` while the wording is on its way. */
  mission: string | null;
  note: string | null;
  children: ReactNode;
}) {
  const { agentName, userName } = state.profile;
  const gmailConnected = state.gmail.status === "connected";
  const talked = state.call.attempts.some((a) => a.connectedAt !== null);

  return (
    <section
      aria-label="First mission"
      className="rounded-2xl border border-neutral-200 px-6 py-6 sm:px-7"
    >
      <p className="text-sm font-semibold tracking-[0.16em] text-neutral-900 uppercase">
        {agentName}
      </p>
      <p className="mt-0.5 text-sm text-neutral-500">
        {userName ? `${userName}'s proactive AI` : "Your proactive AI"}
      </p>

      <p className="mt-7 text-[11px] font-medium tracking-[0.16em] text-neutral-400 uppercase">
        First mission
      </p>
      {mission ? (
        <p className="mt-1.5 text-xl leading-snug font-semibold tracking-tight text-balance text-neutral-900 sm:text-2xl">
          {mission}
        </p>
      ) : (
        <div aria-hidden="true" className="mt-2.5 flex flex-col gap-2">
          <span className="h-5 w-4/5 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />
          <span className="h-5 w-1/2 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />
        </div>
      )}
      {note && <p className="mt-2 text-sm text-neutral-500">{note}</p>}

      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <li className={gmailConnected ? "text-neutral-900" : "text-neutral-400"}>
          {gmailConnected ? "Gmail connected ✓" : "Gmail not connected"}
        </li>
        {talked && <li className="text-neutral-900">Voice ✓</li>}
      </ul>

      <div className="mt-6">{children}</div>
    </section>
  );
}
