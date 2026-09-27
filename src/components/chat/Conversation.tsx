import { CallAwareShell } from "@/components/call/CallAwareShell";
import { CallButton } from "@/components/call/CallButton";
import { CallOverlay } from "@/components/call/CallOverlay";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export function Conversation() {
  return (
    <>
      <CallAwareShell>
        <div className="flex h-dvh flex-col bg-white text-neutral-900">
          <header className="shrink-0 border-b border-neutral-100">
            <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-5">
              <span className="text-[15px] font-semibold tracking-tight">
                Persona
              </span>
              <CallButton />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <MessageList />
          </main>

          <footer className="shrink-0 bg-white">
            <Composer />
          </footer>
        </div>
      </CallAwareShell>
      <CallOverlay />
    </>
  );
}
