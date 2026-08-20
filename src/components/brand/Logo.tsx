import Link from "next/link";

export default function Logo({
  className = "",
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Reelhouse home">
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0 transition-transform duration-300 group-hover:rotate-[24deg]"
      >
        <circle cx="16" cy="16" r="13.5" stroke="rgb(var(--rh-accent))" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="3.2" fill="rgb(var(--rh-accent))" />
        <circle cx="16" cy="7.4" r="2.1" fill="rgb(var(--rh-accent))" />
        <circle cx="16" cy="24.6" r="2.1" fill="rgb(var(--rh-accent))" />
        <circle cx="7.4" cy="16" r="2.1" fill="rgb(var(--rh-accent))" />
        <circle cx="24.6" cy="16" r="2.1" fill="rgb(var(--rh-accent))" />
      </svg>
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-tight text-text">
          Reel<span className="text-accent">house</span>
        </span>
      )}
    </Link>
  );
}
