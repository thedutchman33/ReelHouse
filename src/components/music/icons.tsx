import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function StrokeIcon({
  size = 20,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

function FillIcon({
  size = 20,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Reelhouse Music mark: a green disc with a note and signal bars. */
export function MusicBrandMark({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <circle cx="16" cy="16" r="16" fill="#1ed760" />
      <path
        d="M20.4 8.8v11.8a3.05 3.05 0 1 1-2-2.86V11.5l-5.7 1.25v8.55a3.05 3.05 0 1 1-2-2.86V10.7l9.7-2.13Z"
        fill="#07130c"
      />
      <path d="M23.8 10.4h1.8M24.7 8.5v3.8" stroke="#07130c" strokeWidth="1.15" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

/** Official Spotify mark. Rendered monochrome, as approved for dark UI. */
export function SpotifyIcon({ size = 20, ...rest }: IconProps) {
  return (
    <FillIcon size={size} {...rest}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0Zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02Zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2Zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3Z" />
    </FillIcon>
  );
}

export const HomeIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) =>
  filled ? (
    <FillIcon {...p}>
      <path d="M13.1 3.4a1.35 1.35 0 0 0-1.8.05L4.1 10.3A2 2 0 0 0 3.5 11.8v7.7A2.5 2.5 0 0 0 6 22h4.2a1 1 0 0 0 1-1v-4.3a.8.8 0 0 1 .8-.8h4a.8.8 0 0 1 .8.8V21a1 1 0 0 0 1 1H18a2.5 2.5 0 0 0 2.5-2.5v-7.7a2 2 0 0 0-.6-1.5l-6.8-6.9Z" />
    </FillIcon>
  ) : (
    <StrokeIcon {...p}>
      <path d="m3.9 11 7.2-7.3a1.3 1.3 0 0 1 1.8 0l7.2 7.3a2 2 0 0 1 .6 1.4v7.7a2.4 2.4 0 0 1-2.4 2.4H15.6v-5.2h-3.2v5.2H6.3a2.4 2.4 0 0 1-2.4-2.4v-7.7a2 2 0 0 1 .6-1.4Z" />
    </StrokeIcon>
  );

export const SearchIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="10.8" cy="10.8" r="7.2" />
    <path d="m16.2 16.2 4.4 4.4" />
  </StrokeIcon>
);

export const LibraryIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) =>
  filled ? (
    <FillIcon {...p}>
      <path d="M4.7 3.2h2.2a1 1 0 0 1 1 1v15.6a1 1 0 0 1-1 1H4.7a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1Zm5.7 0h2.2a1 1 0 0 1 1 1v15.6a1 1 0 0 1-1 1h-2.2a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1Zm7.7.7 1.9-.5a1 1 0 0 1 1.2.7l4 14.5a1 1 0 0 1-.7 1.2l-1.9.5a1 1 0 0 1-1.2-.7l-4-14.5a1 1 0 0 1 .7-1.2Z" />
    </FillIcon>
  ) : (
    <StrokeIcon {...p}>
      <path d="M4.5 4.1h2.7v16H4.5zM9.8 4.1H12.5v16H9.8z" />
      <path d="m15.5 5.8 2.7-.7 4 15.2-2.7.7z" />
    </StrokeIcon>
  );

export const PlusIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 5v14M5 12h14" />
  </StrokeIcon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </StrokeIcon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </StrokeIcon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m6 9 6 6 6-6" />
  </StrokeIcon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m15 18-6-6 6-6" />
  </StrokeIcon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m9 18 6-6-6-6" />
  </StrokeIcon>
);

export const PlayIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <path d="M7.2 4.4v15.2a1.1 1.1 0 0 0 1.7.93l11.1-7.6a1.1 1.1 0 0 0 0-1.86L8.9 3.47a1.1 1.1 0 0 0-1.7.93Z" />
  </FillIcon>
);

export const PauseIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <rect x="5.5" y="4" width="4.6" height="16" rx="1.1" />
    <rect x="13.9" y="4" width="4.6" height="16" rx="1.1" />
  </FillIcon>
);

export const PreviousIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <path d="M5 4.5a1 1 0 0 1 2 0v15a1 1 0 1 1-2 0v-15Zm13.8.2a1.1 1.1 0 0 0-1.7-.93L8.9 10.2a2.1 2.1 0 0 0 0 3.58l8.2 6.42a1.1 1.1 0 0 0 1.7-.93V4.7Z" />
  </FillIcon>
);

export const NextIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <path d="M17 4.5a1 1 0 0 1 2 0v15a1 1 0 1 1-2 0v-15ZM5.2 4.7a1.1 1.1 0 0 1 1.7-.93l8.2 6.43a2.1 2.1 0 0 1 0 3.58l-8.2 6.42a1.1 1.1 0 0 1-1.7-.93V4.7Z" />
  </FillIcon>
);

export const ShuffleIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M16 4h4v4M20 4l-6.1 6.1M4 20l5.3-5.3M16 20h4v-4M20 20l-4.5-4.5M4 4l4.1 4.1" />
  </StrokeIcon>
);

export const RepeatIcon = ({ one = false, ...p }: IconProps & { one?: boolean }) => (
  <StrokeIcon {...p}>
    <path d="m17 3 3 3-3 3" />
    <path d="M4 11V9a3 3 0 0 1 3-3h13" />
    <path d="m7 21-3-3 3-3" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4" />
    {one ? <path d="M12.4 9.4 11.2 10v4.6" /> : null}
  </StrokeIcon>
);

export const VolumeIcon = ({ muted = false, ...p }: IconProps & { muted?: boolean }) => (
  <StrokeIcon {...p}>
    <path d="M5 9.5v5h3.3l4.2 3.4V6.1L8.3 9.5H5Z" fill="currentColor" stroke="none" />
    {muted ? (
      <>
        <path d="m16 9 4 4M20 9l-4 4" />
      </>
    ) : (
      <>
        <path d="M15.5 8.4a5.1 5.1 0 0 1 0 7.2" />
        <path d="M18 6a8.4 8.4 0 0 1 0 12" />
      </>
    )}
  </StrokeIcon>
);

export const QueueIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M4 6h12M4 12h12M4 18h8" />
    <path d="M18 13v7a2 2 0 1 0 2-2" />
    <path d="M18 13.4 21 12.5V17" />
  </StrokeIcon>
);

export const NowPlayingIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M8 14.5v-5l5 2.5-5 2.5Z" fill="currentColor" stroke="none" />
  </StrokeIcon>
);

export const MicIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  </StrokeIcon>
);

export const HeartIcon = ({
  filled = false,
  ...p
}: IconProps & { filled?: boolean }) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  >
    <path d="M12 20.4S3.5 15.3 3.5 9.3A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.5 3.1c0 6-8.5 11.1-8.5 11.1Z" />
  </svg>
);

export const MoreIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </FillIcon>
);

export const ClockIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 7.5V12l3 1.8" />
  </StrokeIcon>
);

export const PinIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m14.5 3.5 6 6-2.2 2.2-1-1-4.7 4.7.4 3.1-1.3 1.3-3-3-3.2 3.2-1.1-1.1 3.2-3.2-3-3 1.3-1.3 3.1.4 4.7-4.7-1-1 2.8-2.6Z" />
  </StrokeIcon>
);

export const CheckIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </StrokeIcon>
);

export const CheckCircleIcon = ({ filled = true, ...p }: IconProps & { filled?: boolean }) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    aria-hidden="true"
    {...p}
  >
    <circle cx="12" cy="12" r="10" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.7} />
    <path d="m7.5 12.3 3 3 6-6.4" fill="none" stroke={filled ? "#121212" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const XIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </StrokeIcon>
);

export const ListIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r=".8" fill="currentColor" />
    <circle cx="4" cy="12" r=".8" fill="currentColor" />
    <circle cx="4" cy="18" r=".8" fill="currentColor" />
  </StrokeIcon>
);

export const GridIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
  </StrokeIcon>
);

export const SortIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M4 7h10M4 12h7M4 17h4" />
    <path d="m17 5 3 3 3-3M20 8v11" />
  </StrokeIcon>
);

export const MusicNoteIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M9 18V5l10-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </StrokeIcon>
);

export const DevicesIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="2.8" y="4.5" width="13.4" height="9.5" rx="1.5" />
    <path d="M7 20h5M9.5 14v6" />
    <rect x="17" y="9" width="4.2" height="8.5" rx="1" />
  </StrokeIcon>
);

export const FullscreenIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M8.5 3.5h-5v5M15.5 3.5h5v5M8.5 20.5h-5v-5M15.5 20.5h5v-5" />
  </StrokeIcon>
);

export const ExternalIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M14 4h6v6M20 4 10 14" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </StrokeIcon>
);

export const VerifiedIcon = (p: IconProps) => (
  <FillIcon {...p}>
    <path d="m12 1.8 2.6 2 3.2.4 1.2 3 2.4 2.2-.8 3.1.8 3.1-2.4 2.2-1.2 3-3.2.4-2.6 2-2.6-2-3.2-.4-1.2-3-2.4-2.2.8-3.1-.8-3.1L4.9 7l.1-3.2 3.2-.4 2.6-2Z" />
    <path d="m7.7 12.2 2.7 2.7 5.9-6.1" fill="none" stroke="#121212" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </FillIcon>
);

export const TrashIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M3.5 6.5h17M9 6.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1h7a1.5 1.5 0 0 0 1.5-1l1-13M10 10.5v6M14 10.5v6" />
  </StrokeIcon>
);

export const EditIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M4 20h4.2L20 8.2a2.2 2.2 0 0 0-3.1-3.1L5 16.9 4 20Z" />
    <path d="m14.8 6.2 3 3" />
  </StrokeIcon>
);

export const SettingsIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.2 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.84 15H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.1A1.7 1.7 0 0 0 10 2.9V2.8a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.87 1.6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 9v.1a1.7 1.7 0 0 0 1.7 1.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.87Z" />
  </StrokeIcon>
);

export const UserIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
  </StrokeIcon>
);

export const ShareIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.4 10.8 7.2-4.3M8.4 13.2l7.2 4.3" />
  </StrokeIcon>
);

export const InfoIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10.8v5.4M12 7.6h.01" />
  </StrokeIcon>
);

export const PlusCircleIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </StrokeIcon>
);

export const DownloadIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
  </StrokeIcon>
);

export const BellIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
    <path d="M10 21h4" />
  </StrokeIcon>
);

export const FriendsIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.4 2.4-5.6 5.5-5.6s5.5 2.2 5.5 5.6" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M17.2 14.8c2 .5 3.3 2.2 3.3 5.2" />
  </StrokeIcon>
);

export const MinimizeIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M9 3.5v5.5H3.5M15 3.5V9h5.5M9 20.5V15H3.5M15 20.5V15h5.5" />
  </StrokeIcon>
);

export const PanelLeftIcon = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M9.5 4v16M15 9l-3 3 3 3" />
  </StrokeIcon>
);
