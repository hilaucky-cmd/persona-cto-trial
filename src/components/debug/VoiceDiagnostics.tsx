"use client";

import { useSyncExternalStore } from "react";
import { voiceDiagnostics } from "@/lib/voice/diagnostics";

const yesNo = (value: boolean) => (value ? "yes" : "no");

/** Development-only readout of the live voice pipeline. */
export function VoiceDiagnostics({ className = "" }: { className?: string }) {
  const d = useSyncExternalStore(
    voiceDiagnostics.subscribe,
    voiceDiagnostics.getSnapshot,
    voiceDiagnostics.getServerSnapshot,
  );
  const supported = d.supported
    ? d.supported.getUserMedia && d.supported.mediaRecorder && d.supported.audioContext
    : null;

  const rows: [string, string][] = [
    ["speech-to-text", d.engine],
    [
      "recording supported",
      supported === null
        ? "not checked"
        : `${yesNo(supported)} (getUserMedia ${yesNo(d.supported!.getUserMedia)}, MediaRecorder ${yesNo(d.supported!.mediaRecorder)}, AudioContext ${yesNo(d.supported!.audioContext)})`,
    ],
    ["lifecycle", d.lifecycle],
    ["mic track", d.micTrack ?? "—"],
    ["audio context", d.audioContextState ?? "—"],
    ["recorder format", d.recorderMimeType ?? "—"],
    ["audio detected", yesNo(d.audioDetected)],
    ["speech detected", yesNo(d.speechDetected)],
    ["level / threshold", `${d.level.toFixed(3)} / ${d.speechThreshold.toFixed(3)}`],
    ["interim transcript", "n/a (server transcription returns final text only)"],
    ["final transcript", d.finalTranscript === null ? "—" : `"${d.finalTranscript}"`],
    [
      "last upload",
      d.uploadBytes === null
        ? "—"
        : `${(d.uploadBytes / 1024).toFixed(1)} KB${d.transcriptionMs === null ? "" : `, ${d.transcriptionMs} ms`}`,
    ],
    ["last event", d.lastEvent ?? "—"],
    ["last error", d.lastError ?? "—"],
  ];

  return (
    <dl
      className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] leading-snug ${className}`}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-neutral-400">{label}</dt>
          <dd className="break-words text-neutral-700">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
