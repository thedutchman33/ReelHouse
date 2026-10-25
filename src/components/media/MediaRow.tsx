"use client";

import { useRef } from "react";
import MediaCard from "./MediaCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import type { MediaRow as Row } from "@/types";

// Horizontal content rail — reference anatomy.
//
// Full-bleed rail with 24px/64px gutters, reference card widths, and arrows
// that occupy the right edge of the row on hover (inert while hidden so touch
// devices never have invisible buttons over the posters).
export default function MediaRow({
  row,
  eyebrow,
  linkRoot,
}: {
  row: Row;
  eyebrow?: string;
  /** Section-scoped link prefix, e.g. "/anime" — keeps the section context. */
  linkRoot?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (!row.items.length) return null;

  return (
    <section className="group/row relative mb-8">
      <div className="mx-auto mb-3 w-full max-w-[1480px] px-5 sm:px-6 md:px-16">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className={`font-sans font-bold text-text ${eyebrow ? "font-display text-3xl uppercase tracking-wide sm:text-4xl" : "text-lg sm:text-xl"}`}>
          {row.title}
        </h2>
      </div>

      <div ref={scroller} className="row-scroll px-5 sm:px-6 md:px-16">
        {row.items.map((item, i) =>
          row.ranked ? (
            <div key={item.id} className="flex shrink-0 items-end">
              <span
                aria-hidden
                // pb-6 lines the numeral up with the bottom of the POSTER.
                className="select-none pb-6 font-display text-[5.5rem] leading-[0.8] text-transparent sm:text-[6.5rem]"
                style={{ WebkitTextStroke: "2px rgb(var(--rh-border))" }}
              >
                {i + 1}
              </span>
              <div className="-ml-3 w-[120px] sm:w-[150px]">
                <MediaCard item={item} linkRoot={linkRoot} />
              </div>
            </div>
          ) : (
            <div key={item.id} className="rail-item">
              <MediaCard item={item} linkRoot={linkRoot} />
            </div>
          )
        )}
      </div>

      {/* Edge arrows — revealed on row hover/focus, inset into the rail's
          gutters. Inert while hidden, so on touch (where hover never happens)
          they cannot intercept taps; touch scrolls by swiping. */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label={`Scroll ${row.title} left`}
        className="hover-reveal absolute bottom-[32%] left-0 top-[32%] z-10 hidden w-9 place-items-center rounded-r-md border border-white/10 bg-bg/80 text-text backdrop-blur-sm transition hover:bg-bg sm:grid"
      >
        <ChevronLeftIcon size={20} />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label={`Scroll ${row.title} right`}
        className="hover-reveal absolute bottom-[32%] right-0 top-[32%] z-10 hidden w-9 place-items-center rounded-l-md border border-white/10 bg-bg/80 text-text backdrop-blur-sm transition hover:bg-bg sm:grid"
      >
        <ChevronRightIcon size={20} />
      </button>
    </section>
  );
}
