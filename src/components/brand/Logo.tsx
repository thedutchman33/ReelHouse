import Link from "next/link";

// Site logo: the operator's racing wordmark (white REEL / red HOUSE) as a
// transparent PNG — the black source background was keyed out so the mark sits
// directly on the navbar glass and the footer.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${className}`}
      aria-label="Reelhouse home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Reelhouse"
        className="h-10 w-auto"
        draggable={false}
      />
    </Link>
  );
}
