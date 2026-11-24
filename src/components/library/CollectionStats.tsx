"use client";

import Link from "next/link";
import {
  BellIcon,
  CalendarDaysIcon,
  EyeIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/library/icons";

// Reference Collections row: four stat cards that are destinations, not
// in-page filters. Watched/Liked/Disliked open their own collection pages;
// Calendar opens /calendar.
export default function CollectionStats({
  watchedCount,
  likedCount,
  dislikedCount,
  trackedCount,
  weekCount,
}: {
  watchedCount: number;
  likedCount: number;
  dislikedCount: number;
  trackedCount: number;
  weekCount: number;
}) {
  const cards = [
    {
      href: "/my-list/watched",
      name: "Watched",
      count: watchedCount,
      hint: "Marked as watched",
      icon: EyeIcon,
      accent: false,
      suffix: undefined,
    },
    {
      href: "/my-list/liked",
      name: "Liked",
      count: likedCount,
      hint: "You gave a thumbs up",
      icon: ThumbsUpIcon,
      accent: false,
      suffix: undefined,
    },
    {
      href: "/my-list/disliked",
      name: "Disliked",
      count: dislikedCount,
      hint: "You gave a thumbs down",
      icon: ThumbsDownIcon,
      accent: false,
      suffix: undefined,
    },
    {
      href: "/calendar?view=tracking",
      name: "Following",
      count: trackedCount,
      hint: "Shows you follow",
      icon: BellIcon,
      accent: false,
      suffix: undefined,
    },
    {
      href: "/calendar",
      name: "Calendar",
      count: weekCount,
      hint: "Releases this week",
      icon: CalendarDaysIcon,
      accent: true,
      suffix: "this week",
    },
  ];

  return (
    <section aria-labelledby="collections-label" className="mb-8">
      <p
        id="collections-label"
        className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-muted"
      >
        Collections
      </p>
      <div className="grid max-w-[1120px] grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.name}
              href={card.href}
              aria-label={`${card.name} — ${card.count}`}
              className="nm-raise-sm group rounded-2xl p-4 text-left transition-transform duration-300 hover:-translate-y-0.5"
            >
              <span className="flex items-center gap-2 text-muted">
                <Icon size={16} className={card.accent ? "text-accent" : undefined} />
                <span className="truncate text-sm font-semibold text-text">
                  {card.name}
                </span>
              </span>
              <span className="mt-3 block font-display text-3xl leading-none text-text md:text-4xl">
                {card.count}
                {card.suffix && (
                  <span className="ml-1 font-sans text-sm font-medium text-muted">
                    {card.suffix}
                  </span>
                )}
              </span>
              <span className="mt-2 block truncate text-[11px] text-muted">
                {card.hint}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
