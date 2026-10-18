import type { ReactNode } from 'react';

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const Icons = {
  cursor: () => (
    <Svg>
      <path d="M12 3v18M3 12h18" />
    </Svg>
  ),
  trend: () => (
    <Svg>
      <path d="M4 19 20 5" />
      <circle cx="4" cy="19" r="1.8" fill="currentColor" />
      <circle cx="20" cy="5" r="1.8" fill="currentColor" />
    </Svg>
  ),
  hline: () => (
    <Svg>
      <path d="M6 12h16" />
      <circle cx="5" cy="12" r="2.2" fill="currentColor" />
    </Svg>
  ),
  rect: () => (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <circle cx="4" cy="6" r="1.6" fill="currentColor" />
      <circle cx="20" cy="18" r="1.6" fill="currentColor" />
    </Svg>
  ),
  fib: () => (
    <Svg>
      <path d="M3 5h18M3 10h18M3 14h18M3 19h18" />
      <path d="M5 19 19 5" strokeDasharray="2 2" />
    </Svg>
  ),
  long: () => (
    <Svg>
      <rect x="4" y="4" width="16" height="8" fill="rgba(8,153,129,.35)" stroke="#089981" />
      <rect x="4" y="12" width="16" height="6" fill="rgba(242,54,69,.35)" stroke="#f23645" />
    </Svg>
  ),
  short: () => (
    <Svg>
      <rect x="4" y="6" width="16" height="6" fill="rgba(242,54,69,.35)" stroke="#f23645" />
      <rect x="4" y="12" width="16" height="8" fill="rgba(8,153,129,.35)" stroke="#089981" />
    </Svg>
  ),
  ruler: () => (
    <Svg>
      <path d="M3 17 17 3l4 4L7 21Z" />
      <path d="M7 13l2 2M10 10l2 2M13 7l2 2" />
    </Svg>
  ),
  scissors: () => (
    <Svg size={18}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </Svg>
  ),
  barClose: () => (
    <Svg size={18}>
      <path d="M5 5l7 7-7 7" />
      <path d="M15 4v16" strokeWidth={2} />
      <path d="M19 8v8" />
    </Svg>
  ),
  fastForward: () => (
    <Svg size={16}>
      <path d="M4 5v14l8-7Z" fill="currentColor" />
      <path d="M12 5v14l8-7Z" fill="currentColor" />
    </Svg>
  ),
  camera: () => (
    <Svg size={18}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  ),
  chart: () => (
    <Svg size={18}>
      <path d="M4 19h16M6 16l4-5 3 3 5-7" />
    </Svg>
  ),
  magnet: () => (
    <Svg>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 8h3M15 8h3" />
      <path d="M9 4v8a3 3 0 0 0 6 0V4" />
    </Svg>
  ),
  eye: () => (
    <Svg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  eyeOff: () => (
    <Svg>
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Svg>
  ),
  trash: () => (
    <Svg>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
    </Svg>
  ),
  play: () => (
    <Svg size={18}>
      <path d="M7 4v16l13-8Z" fill="currentColor" />
    </Svg>
  ),
  pause: () => (
    <Svg size={18}>
      <path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" />
    </Svg>
  ),
  stepFwd: () => (
    <Svg size={18}>
      <path d="M6 5v14l9-7Z" fill="currentColor" />
      <path d="M18 5v14" strokeWidth={2.2} />
    </Svg>
  ),
  stepBack: () => (
    <Svg size={18}>
      <path d="M18 5v14l-9-7Z" fill="currentColor" />
      <path d="M6 5v14" strokeWidth={2.2} />
    </Svg>
  ),
  calendar: () => (
    <Svg size={18}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
  list: () => (
    <Svg size={18}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  ),
  settings: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Svg>
  ),
  fullscreen: () => (
    <Svg size={18}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  ),
  exitFullscreen: () => (
    <Svg size={18}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </Svg>
  ),
  sessions: () => (
    <Svg size={18}>
      <rect x="3" y="5" width="5" height="14" rx="1" />
      <rect x="10" y="5" width="5" height="14" rx="1" />
      <rect x="17" y="5" width="4" height="14" rx="1" />
    </Svg>
  ),
  sessionNext: () => (
    <Svg size={18}>
      <path d="M5 5l7 7-7 7M13 5l7 7-7 7" />
    </Svg>
  ),
  stay: () => (
    <Svg size={18}>
      <path d="M5 4h14M8 4v6l-3 4h14l-3-4V4M12 14v6" />
    </Svg>
  ),
  lock: () => (
    <Svg size={18}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  unlock: () => (
    <Svg size={18}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-1.8" />
    </Svg>
  ),
  clone: () => (
    <Svg size={18}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </Svg>
  ),
  back: () => (
    <Svg size={18}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  ),
  close: () => (
    <Svg size={16}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  logo: () => (
    <svg width="22" height="22" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#1a1d23" />
      <path d="M8 20v-8M14 24V9M20 18v-6M26 14V7" stroke="#2962ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
};
