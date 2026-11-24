import type { ReactNode } from "react";

function ReviewIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function ExternalIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

/**
 * Opens the title's Moctale page, where its reviews and live Moctale Meter
 * votes live. The external mark makes that hand-off explicit before the click.
 */
export default function ReviewButton({
  href,
  title,
  variant = "hero",
  className = "",
}: {
  href: string;
  title: string;
  variant?: "hero" | "watch";
  className?: string;
}): ReactNode {
  const label = `Review ${title} on Moctale`;

  if (variant === "watch") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.14] bg-white/[0.045] px-2.5 py-1.5 text-[12px] font-semibold text-white/80 transition-colors hover:border-white/30 hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${className}`}
      >
        <ReviewIcon size={14} />
        <span>Review</span>
        <ExternalIcon size={11} />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-white/25 bg-white/[0.04] px-4 text-sm font-semibold text-white backdrop-blur transition hover:border-white/45 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:h-[54px] sm:gap-2.5 sm:px-5 ${className}`}
    >
      <ReviewIcon size={18} />
      <span>Review</span>
      <ExternalIcon size={13} />
    </a>
  );
}
