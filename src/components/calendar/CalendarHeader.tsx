"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  BellIcon,
  CalendarDaysIcon,
} from "@/components/library/icons";

export type CalendarViewMode = "calendar" | "tracking";

export default function CalendarHeader({
  mode,
  monthOffset,
}: {
  mode: CalendarViewMode;
  monthOffset: number;
}) {
  const calendarHref = `/calendar${monthOffset > 0 ? `?m=${monthOffset}` : ""}`;
  const trackingHref = `/calendar?view=tracking${
    monthOffset > 0 ? `&m=${monthOffset}` : ""
  }`;

  return (
    <>
      <Link
        href="/my-list"
        className="nm-raise-sm inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-muted transition hover:text-text"
      >
        <ArrowLeftIcon size={16} />
        Back
      </Link>

      <div className="mt-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">
          {mode === "tracking" ? "Your shows" : "Coming soon"}
        </p>
        <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wider text-text md:text-5xl">
          {mode === "tracking" ? "Following" : "Release Calendar"}
        </h1>
      </div>

      <div className="nm-inset mt-5 inline-flex items-center gap-1 rounded-xl p-1">
        <Link
          href={calendarHref}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
            mode === "calendar"
              ? "nm-raise-sm text-accent"
              : "text-muted hover:text-text"
          }`}
        >
          <CalendarDaysIcon size={16} />
          Calendar
        </Link>
        <Link
          href={trackingHref}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
            mode === "tracking"
              ? "nm-raise-sm text-accent"
              : "text-muted hover:text-text"
          }`}
        >
          <BellIcon size={16} />
          Following
        </Link>
      </div>
    </>
  );
}
