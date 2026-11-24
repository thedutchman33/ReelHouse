import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  ClapperboardIcon,
  PlayIcon,
  SparklesIcon,
  StarIcon,
} from "@/components/library/icons";
import {
  WHATS_NEW_FEATURES,
  type WhatsNewFeature,
  type WhatsNewIconKey,
  type WhatsNewTone,
} from "@/lib/whats-new";

const TONE_STYLES: Record<
  WhatsNewTone,
  { icon: string; glow: string; line: string }
> = {
  red: {
    icon: "bg-[#fb0101]/12 text-[#ff9292] ring-[#fb0101]/25",
    glow: "from-[#fb0101]/15",
    line: "bg-[#fb0101]",
  },
  violet: {
    icon: "bg-violet-400/12 text-violet-300 ring-violet-300/20",
    glow: "from-violet-400/15",
    line: "bg-violet-400",
  },
  blue: {
    icon: "bg-sky-400/12 text-sky-300 ring-sky-300/20",
    glow: "from-sky-400/15",
    line: "bg-sky-400",
  },
  emerald: {
    icon: "bg-emerald-400/12 text-emerald-300 ring-emerald-300/20",
    glow: "from-emerald-400/15",
    line: "bg-emerald-400",
  },
  amber: {
    icon: "bg-amber-300/12 text-amber-200 ring-amber-300/20",
    glow: "from-amber-300/15",
    line: "bg-amber-300",
  },
  cyan: {
    icon: "bg-cyan-300/12 text-cyan-200 ring-cyan-300/20",
    glow: "from-cyan-300/15",
    line: "bg-cyan-300",
  },
  gold: {
    icon: "bg-yellow-300/12 text-yellow-200 ring-yellow-300/20",
    glow: "from-yellow-300/15",
    line: "bg-yellow-300",
  },
};

function ReviewIcon({ size = 20 }: { size?: number }) {
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
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function FlagIcon({ size = 20 }: { size?: number }) {
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
      <path d="M5 21V4" />
      <path d="M5 5h8l2 3h4v8h-5l-2-3H5" />
    </svg>
  );
}

function CricketIcon({ size = 20 }: { size?: number }) {
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
      <circle cx="12" cy="9" r="5" />
      <path d="m9 13-3 7M15 13l3 7M8 8.5c2.2 1.2 5.8 1.2 8 0M9.5 11.3c1.6.6 3.4.6 5 0" />
    </svg>
  );
}

function LayersIcon({ size = 20 }: { size?: number }) {
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
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function GameIcon({ size = 20 }: { size?: number }) {
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
      <path d="M7 8h10a5 5 0 0 1 4.7 6.7l-.5 1.4a3 3 0 0 1-5.2 1l-1.4-1.8H9.4L8 17.1a3 3 0 0 1-5.2-1l-.5-1.4A5 5 0 0 1 7 8Z" />
      <path d="M7 11v4M5 13h4M16 12h.01M18 14h.01" />
    </svg>
  );
}

function FeatureIcon({
  icon,
  size = 20,
}: {
  icon: WhatsNewIconKey;
  size?: number;
}): ReactNode {
  switch (icon) {
    case "clapper":
      return <ClapperboardIcon size={size} />;
    case "review":
      return <ReviewIcon size={size} />;
    case "layers":
      return <LayersIcon size={size} />;
    case "play":
      return <PlayIcon size={size} />;
    case "calendar":
      return <CalendarDaysIcon size={size} />;
    case "bookmark":
      return <BookmarkIcon size={size} />;
    case "bell":
      return <BellIcon size={size} />;
    case "flag":
      return <FlagIcon size={size} />;
    case "cricket":
      return <CricketIcon size={size} />;
    case "game":
      return <GameIcon size={size} />;
  }
}

function ArrowIcon({ size = 15 }: { size?: number }) {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function StatusPill({ status }: { status: WhatsNewFeature["status"] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
        status === "New"
          ? "bg-accent text-accent-ink"
          : "border border-white/10 bg-white/[0.04] text-white/50"
      }`}
    >
      {status}
    </span>
  );
}

function FeatureCard({ feature }: { feature: WhatsNewFeature }) {
  const tone = TONE_STYLES[feature.tone];

  return (
    <Link
      href={feature.href}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111213]/85 p-5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#151617]"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${tone.glow} to-transparent opacity-0 transition duration-300 group-hover:opacity-100`}
      />

      <span className="relative flex items-start justify-between gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ring-inset ${tone.icon}`}
        >
          <FeatureIcon icon={feature.icon} />
        </span>
        <StatusPill status={feature.status} />
      </span>

      <span className="relative mt-5 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
        {feature.tag}
      </span>
      <span className="relative mt-1.5 block font-display text-2xl uppercase leading-none tracking-wide text-text">
        {feature.title}
      </span>
      <span className="relative mt-2.5 block text-[13px] leading-relaxed text-muted">
        {feature.description}
      </span>

      <span className="relative mt-4 flex flex-wrap gap-1.5">
        {feature.highlights.map((highlight) => (
          <span
            key={highlight}
            className="rounded-md border border-white/[0.09] bg-white/[0.035] px-2 py-1 text-[10px] font-semibold text-white/60"
          >
            {highlight}
          </span>
        ))}
      </span>

      <span className="relative mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-semibold text-accent">
        {feature.cta}
        <ArrowIcon />
      </span>
    </Link>
  );
}

export default function WhatsNewView() {
  const [featured, ...rest] = WHATS_NEW_FEATURES;

  return (
    <div className="container-rh pb-16 pt-[calc(var(--rh-nav-h)+1.5rem)]">
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0d0e]/85 px-5 py-7 shadow-card sm:px-8 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-accent/15 blur-[100px]" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-[90px]" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(70%_80%_at_80%_20%,#000_10%,transparent_100%)]" />
        </div>

        <div className="relative">
          <p className="eyebrow flex items-center gap-2">
            <SparklesIcon size={13} className="text-accent" />
            Platform · What&apos;s new
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-5xl font-black uppercase leading-none tracking-wide text-white sm:text-6xl">
            What&apos;s New
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-[15px]">
            Reelhouse is built for the whole watch: trailers that play in the
            feed, community verdicts that go beyond a star score, three film
            industries in one library, and live sport beside them. These are
            the features already doing the work.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/trailers"
              className="btn-accent h-10 px-4 py-0 text-sm"
            >
              <PlayIcon size={14} />
              Explore the trailer space
            </Link>
            <Link
              href="/calendar"
              className="btn-ghost h-10 px-4 py-0 text-sm"
            >
              <CalendarDaysIcon size={15} />
              Open release calendar
            </Link>
            <span className="inline-flex h-10 items-center rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {WHATS_NEW_FEATURES.length} features
            </span>
          </div>
        </div>
      </header>

      {featured && (
        <Link
          href={featured.href}
          className="group relative mt-4 block overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101112]/90 shadow-card transition duration-300 hover:border-accent/35 hover:bg-[#141516]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(720px_360px_at_82%_0%,rgba(251,1,1,0.15),transparent_68%)]"
          />
          <div className="relative grid gap-7 p-5 sm:p-7 lg:grid-cols-[1fr_340px] lg:items-center lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusPill status={featured.status} />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                  {featured.tag}
                </span>
              </div>
              <h2 className="mt-3 max-w-2xl font-display text-3xl uppercase leading-none tracking-wide text-white sm:text-4xl">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {featured.description}
              </p>
              <span className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition group-hover:bg-accent-strong">
                {featured.cta}
                <ArrowIcon />
              </span>
            </div>

            <div
              aria-hidden="true"
              className="relative hidden h-44 lg:block"
            >
              <div className="absolute left-0 top-6 h-32 w-52 -rotate-6 overflow-hidden rounded-xl border border-white/15 bg-[#181a1a] shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_55%)]" />
                <ClapperboardIcon
                  size={30}
                  className="absolute left-4 top-4 text-white/30"
                />
              </div>
              <div className="absolute right-0 top-0 h-36 w-56 rotate-3 overflow-hidden rounded-xl border border-white/15 bg-[#1b1d1c] shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(251,1,1,0.2),transparent_60%)]" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-xl">
                    <PlayIcon size={19} />
                  </span>
                </span>
              </div>
              <div className="absolute bottom-0 left-10 h-24 w-48 -rotate-2 overflow-hidden rounded-xl border border-white/10 bg-[#151716] shadow-xl">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.15)_20%,rgba(255,255,255,0.15)_22%,transparent_22%)] [background-size:18px_18px]" />
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">The rest of the platform</p>
          <h2 className="mt-1 font-display text-3xl uppercase leading-none tracking-wide text-text sm:text-4xl">
            More than a catalogue
          </h2>
        </div>
        <span className="pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {rest.length} more reasons
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rest.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>

      <p className="mt-8 flex items-center gap-2 text-[11px] text-white/35">
        <StarIcon size={11} className="text-accent/70" />
        Every feature here is already live in Reelhouse.
      </p>
    </div>
  );
}
