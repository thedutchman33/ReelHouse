"use client";

import { useEffect, useState } from "react";

/**
 * GP-Tempo's mobile gate — client-only `window.innerWidth < 768`, driven by
 * a matchMedia listener (their `Yn`). Charts use it to thin out ticks/axes.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(window.innerWidth < 768);
    mq.addEventListener("change", update);
    update();
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}
