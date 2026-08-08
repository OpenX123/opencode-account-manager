// ============================================================
// 图标集 — 内联 SVG（stroke 风格统一，告别 emoji）
// ============================================================

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 16V4M12 4 7 9M12 4l5 5" />
    <path d="M5 20h14" />
  </svg>
);

export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 12h6" />
    <path d="M9.5 8.5h-1A3.5 3.5 0 0 0 5 12v0a3.5 3.5 0 0 0 3.5 3.5h1" />
    <path d="M14.5 8.5h1A3.5 3.5 0 0 0 19 12v0a3.5 3.5 0 0 0-3.5 3.5h-1" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 5h5v5" />
    <path d="M19 5 10 14" />
    <path d="M19 14v5H5V5h5" />
  </svg>
);

export const IconCard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="M2 10h20" />
    <path d="M6 15h4" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M5 7 6 20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
);

export const IconKey = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2 20 3M17 6l2 2M15 8l2 2" />
  </svg>
);

export const IconStop = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
);

export const IconDot = (p: IconProps) => (
  <svg {...base(p)} strokeWidth={0} fill="currentColor">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
  </svg>
);

export const IconChain = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="3" />
    <circle cx="7" cy="17" r="3" />
    <circle cx="17" cy="12" r="3" />
    <path d="M9.5 8.5 14.5 11M9.5 15.5l5-2.5" />
  </svg>
);

export const IconRadar = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19.07 4.93A10 10 0 1 0 22 12" />
    <path d="M16.24 7.76A6 6 0 1 0 18 12" />
    <path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />
    <path d="M12 12 22 2" />
  </svg>
);

export const IconGift = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M5 12v9h14v-9" />
    <path d="M12 8S10.5 3 7.5 3 5 5.5 7 8h5zM12 8s1.5-5 4.5-5S19 5.5 17 8h-5z" />
  </svg>
);

export const IconSync = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const IconEyeOff = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m3 3 18 18" />
    <path d="M10.6 6.15A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16.6 16.6 0 0 1-2.1 2.75M6.2 6.2C3.85 7.9 2.5 12 2.5 12s3.5 6 9.5 6a9.4 9.4 0 0 0 3-.48" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const IconSun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
  </svg>
);

export const IconMoon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />
  </svg>
);
