"use client";

import { useRef } from "react";
import MediaCard from "./MediaCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import type { MediaRow as Row } from "@/types";

export default function MediaRow({ row }: { row: Row }) {
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (!row.items.length) return null;

  return (
    <section className="group/row py-4">
      <div className="container-rh mb-3 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold sm:text-xl">{row.title}</h2>
        {/* Arrows fade in on hover, and also on keyboard focus so they are
            reachable without a pointer. Inert while hidden — otherwise two
            invisible buttons sit in this header on any touch device wide enough
            for `sm:`, which is a phone in landscape. Touch scrolls the row by
            swiping it. */}
        <div className="hover-reveal hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={`Scroll ${row.title} left`}
            className="icon-btn"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={`Scroll ${row.title} right`}
            className="icon-btn"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      <div className="container-rh">
        <div ref={scroller} className="row-scroll no-scrollbar">
          {row.items.map((item, i) =>
            row.ranked ? (
              <div key={item.id} className="flex shrink-0 items-end gap-0">
                <span
                  aria-hidden
                  // pb-10 lines the numeral up with the bottom of the POSTER, not
                  // the card's caption below it.
                  className="select-none pb-10 font-display text-[5.5rem] font-black leading-[0.8] text-transparent sm:text-[7rem]"
                  style={{ WebkitTextStroke: "2px rgb(var(--rh-border))" }}
                >
                  {i + 1}
                </span>
                <div className="-ml-3 w-[120px] sm:w-[150px]">
                  <MediaCard item={item} />
                </div>
              </div>
            ) : (
              <div key={item.id} className="w-[150px] shrink-0 sm:w-[170px] lg:w-[190px]">
                <MediaCard item={item} />
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
