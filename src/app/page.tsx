import dynamic from "next/dynamic";
import { CallProvider } from "@/components/call/CallProvider";
import { Conversation } from "@/components/chat/Conversation";
import { GmailProvider } from "@/components/gmail/GmailProvider";
import { ConversationProvider } from "@/components/onboarding/ConversationProvider";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

// The conditional import keeps the debug panel out of production bundles.
const DebugPanel =
  process.env.NODE_ENV === "development"
    ? dynamic(() =>
        import("@/components/debug/DebugPanel").then((mod) => mod.DebugPanel),
      )
    : null;

export default function Home() {
  return (
    <OnboardingProvider>
      <ConversationProvider>
        <CallProvider>
          <GmailProvider>
            <Conversation />
            {DebugPanel && <DebugPanel />}
          </GmailProvider>
        </CallProvider>
      </ConversationProvider>
    </OnboardingProvider>
  );
}
