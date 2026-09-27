"use client";

import type { ReactNode } from "react";
import { useCall } from "./CallProvider";

/** Takes the text conversation out of focus and the accessibility tree during a call. */
export function CallAwareShell({ children }: { children: ReactNode }) {
  const { phase } = useCall();
  return (
    <div inert={phase !== "idle"} className="contents">
      {children}
    </div>
  );
}
