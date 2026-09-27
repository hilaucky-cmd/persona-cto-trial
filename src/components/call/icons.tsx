const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function PhoneIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M6.6 3.5H4.4a1 1 0 0 0-1 1.1 12.5 12.5 0 0 0 12 12 1 1 0 0 0 1.1-1v-2.2a1 1 0 0 0-.8-1l-2.4-.5a1 1 0 0 0-1 .3l-.9 1a9.6 9.6 0 0 1-3.6-3.6l1-.9a1 1 0 0 0 .3-1l-.5-2.4a1 1 0 0 0-1-.8Z" />
    </svg>
  );
}

export function MailIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.5" />
      <path d="m3.5 5.5 6.5 5 6.5-5" />
    </svg>
  );
}

export function HangUpIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M2.6 11.6c4.3-3.5 10.5-3.5 14.8 0 .4.3.4.9.1 1.3l-1.3 1.5a.9.9 0 0 1-1.1.2l-2.1-1.1a.9.9 0 0 1-.5-.8v-1.4a10 10 0 0 0-5 0v1.4a.9.9 0 0 1-.5.8l-2.1 1.1a.9.9 0 0 1-1.1-.2l-1.3-1.5c-.3-.4-.3-1 .1-1.3Z" />
    </svg>
  );
}

export function MicIcon({
  off = false,
  className = "size-4",
}: {
  off?: boolean;
  className?: string;
}) {
  return (
    <svg {...iconProps} className={className}>
      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
      {off && <path d="M3.5 3.5l13 13" />}
    </svg>
  );
}
