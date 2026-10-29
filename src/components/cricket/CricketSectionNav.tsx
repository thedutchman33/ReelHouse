"use client";

import { useEffect, useState, type MouseEvent } from "react";

const SECTIONS = [
  { id: "ck-calendar", label: "Calendars" },
  { id: "ck-match-centre", label: "Matches" },
  { id: "ck-rankings", label: "Rankings" },
  { id: "ck-players", label: "Players" },
] as const;

const ACTIVE_LINE_PX = 24;

export default function CricketSectionNav() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const header = document.querySelector("header");
      const line = (header?.getBoundingClientRect().bottom ?? 0) + ACTIVE_LINE_PX;
      let current: string | null = null;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= line) current = section.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const header = document.querySelector("header");
    const offset = (header?.getBoundingClientRect().bottom ?? 0) + 16;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - offset,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <nav
      aria-label="Cricket sections"
      className="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-white/[0.08] bg-[rgb(12_13_14/0.82)] p-1 shadow-[0_8px_28px_rgb(0_0_0/0.35)] backdrop-blur-xl no-scrollbar"
    >
      {SECTIONS.map((section) => {
        const current = active === section.id;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => jump(event, section.id)}
            aria-current={current ? "location" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white max-[360px]:px-1.5 ${
              current
                ? "bg-[#1d509e]/25 text-white ring-1 ring-inset ring-[#3f78d8]/50"
                : "text-white/60 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
