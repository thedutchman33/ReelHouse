// Shared inline SVG icons for the player. Stroke-based and driven by
// `currentColor` so they inherit text color; sized via the `size` prop.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M7 4.5v15a1 1 0 0 0 1.54.84l11.5-7.5a1 1 0 0 0 0-1.68L8.54 3.66A1 1 0 0 0 7 4.5z" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);

// Rewind 10s — a counter-clockwise arc with "10" in the middle.
export const Rewind10Icon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 4 7.5 7.5 11 11" />
    <path d="M7.6 7.5H14a6 6 0 1 1-6 6" />
    <text x="12" y="15.5" fontSize="7" fontWeight="700" stroke="none" fill="currentColor" textAnchor="middle">10</text>
  </Svg>
);

// Forward 10s — a clockwise arc with "10" in the middle.
export const Forward10Icon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 4l3.5 3.5L13 11" />
    <path d="M16.4 7.5H10a6 6 0 1 0 6 6" />
    <text x="12" y="15.5" fontSize="7" fontWeight="700" stroke="none" fill="currentColor" textAnchor="middle">10</text>
  </Svg>
);

export const NextEpisodeIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M5 4.5v15a1 1 0 0 0 1.55.83L16 13.5V19a1 1 0 0 0 2 0V5a1 1 0 0 0-2 0v5.5L6.55 3.67A1 1 0 0 0 5 4.5z" />
  </Svg>
);

export const EpisodesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <rect x="3" y="12" width="18" height="8" rx="1.5" />
    <path d="M8 16h8" />
  </Svg>
);

export const SubtitlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M7 11h4M7 15h7M15 11h2" />
  </Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a1.6 1.6 0 0 0 .32 1.77l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V19a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1-1.47 1.6 1.6 0 0 0-1.77.32l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.6 1.6 0 0 0 4.6 13a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.11a1.6 1.6 0 0 0 1.47-1 1.6 1.6 0 0 0-.32-1.77l-.05-.05A2 2 0 1 1 7.04 2.6l.05.05a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V1a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.6 1.6 0 0 0-.32 1.77V7a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.49 1z" />
  </Svg>
);

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </Svg>
);

// "Additional source" — stacked layers / servers.
export const SourceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
  </Svg>
);

export const FullscreenExitIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4v3a1 1 0 0 1-1 1H4M16 4v3a1 1 0 0 0 1 1h3M8 20v-3a1 1 0 0 0-1-1H4M16 20v-3a1 1 0 0 1 1-1h3" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5S3.5 14.8 3.5 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.5 2.2c0 5.9-8.5 11.6-8.5 11.6z" />
  </Svg>
);

export const HeartFilledIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M12 20.5S3.5 14.8 3.5 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.5 2.2c0 5.9-8.5 11.6-8.5 11.6z" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
);

export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);

export const SpinnerIcon = ({ size = 24, className = "", ...rest }: IconProps) => (
  <Svg size={size} className={`animate-spin ${className}`} {...rest}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Svg>
);
