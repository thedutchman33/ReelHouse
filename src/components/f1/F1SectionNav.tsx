"use client";

import { useEffect, useState, type MouseEvent } from "react";

// The three long-form stops on /f1. Rendered as an extension of the site
// navbar (see Navbar), so it is fixed with it and clears its own height when
// jumping. Telemetry also has to bring its tab forward — the panel is not in
// the DOM while the Session view is active.

const SECTIONS = [
  { id: "f1-analytics", label: "Analytics" },
  { id: "f1-tabs-anchor", label: "Telemetry", telemetry: true },
  { id: "f1-standings", label: "Standings" },
] as const;

/** How far below the fixed header a section counts as "in view". */
const ACTIVE_LINE_PX = 24;

export default function F1SectionNav() {
  const [active, setActive] = useState<string | null>(null);

  // Scroll-spy: the last section whose top has passed the reading line. Body
  // resizes cover the dashboard's late data (charts/sections grow after load).
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

  const jump = (event: MouseEvent<HTMLAnchorElement>, section: (typeof SECTIONS)[number]) => {
    const target = document.getElementById(section.id);
    if (!target) return; // fall back to the plain anchor jump

    event.preventDefault();
    if ("telemetry" in section) {
      window.dispatchEvent(new CustomEvent("f1:open-telemetry"));
    }

    // The bar lives inside the fixed header, so its bottom edge is exactly the
    // chrome the target has to clear.
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
      aria-label="Formula 1 sections"
      className="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-white/[0.08] bg-[rgb(12_13_14/0.82)] p-1 shadow-[0_8px_28px_rgb(0_0_0/0.35)] backdrop-blur-xl no-scrollbar"
    >
      {SECTIONS.map((section) => {
        const current = active === section.id;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => jump(event, section)}
            aria-current={current ? "location" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white max-[360px]:px-1.5 ${
              current
                ? "bg-[#e10600]/15 text-white ring-1 ring-inset ring-[#e10600]/35"
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
