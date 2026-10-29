import Link from "next/link";

// ---------------------------------------------------------------------------
// More on Reelhouse — the three non-film sections, in the same tile anatomy as
// the provider rail: one logo per dark rounded card, no caption, the whole tile
// a link. It sits between the provider block and My Feed.
// ---------------------------------------------------------------------------

const SECTIONS = [
  {
    href: "/f1",
    label: "Formula 1",
    logo: "/f1/brand/f1-logo.svg",
    logoClass: "h-[34px] w-auto max-w-[124px]",
  },
  {
    href: "/cricket",
    label: "Cricket",
    logo: "/cricket/brand/bcci-logo.svg",
    logoClass: "h-11 w-11",
  },
] as const;

export default function MoreOnReelhouse() {
  return (
    <section aria-label="More on Reelhouse" className="mb-10">
      <div className="container-rh">
        <h2 className="font-display text-xl uppercase tracking-[0.06em] text-text md:text-2xl">
          More on Reelhouse
        </h2>

        <div className="mt-4 flex flex-wrap gap-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              aria-label={`Open ${section.label} on Reelhouse`}
              className="group flex h-[80px] w-[164px] items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface transition-transform duration-200 hover:-translate-y-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={section.logo}
                alt=""
                draggable={false}
                className={`${section.logoClass} object-contain transition duration-300 group-hover:scale-[1.04]`}
              />
            </Link>
          ))}

          <Link
            href="/games"
            aria-label="Open Games on Reelhouse"
            className="group flex h-[80px] w-[164px] items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface transition-transform duration-200 hover:-translate-y-0.5"
          >
            <GamesLogo />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Arcade mark for the games directory: a yellow pad + the section wordmark. */
function GamesLogo() {
  return (
    <span className="flex items-center gap-2.5 text-[#facc15] transition duration-300 group-hover:scale-[1.04]">
      <svg
        viewBox="0 0 64 40"
        className="h-9 w-auto"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 5h28c7.2 0 11.4 6.2 13.3 15.2l1.6 8.1c.8 4-2.2 7.3-6.2 6.3-3-.7-5-2.4-7-4.5l-2.5-2.6H18.8l-2.5 2.6c-2 2.1-4 3.8-7 4.5-4 1-7-2.3-6.2-6.3l1.6-8.1C6.6 11.2 10.8 5 18 5Z" />
        <path d="M19 14v9M14.5 18.5h9" />
        <circle cx="42.5" cy="15.5" r="1.9" fill="currentColor" stroke="none" />
        <circle cx="48" cy="21" r="1.9" fill="currentColor" stroke="none" />
      </svg>
      <span className="font-display text-xl font-black uppercase tracking-[0.12em]">
        Games
      </span>
    </span>
  );
}
