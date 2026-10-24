"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderDescriptor } from "@/lib/playback/types";

// Servers panel (reference anatomy + reverse-engineered logic):
//  • Mbps + TEST — the reference measures with Cloudflare's public speed-test
//    endpoints (observed live: `speed.cloudflare.com/__down?during=idle&bytes=0`
//    warm-up, then `?bytes=100000`); Mbps is computed from the timed 100 KB
//    download. Replicated exactly — real measurement, nothing hardcoded.
//  • Re-check — the reference calls `api/server-status?force=1`; ReelHouse's
//    equivalents are a server-plan refresh (router.refresh) plus a real
//    per-provider reachability probe (no-cors fetch to each provider origin —
//    resolves when the network path is open, rejects when it is not).
//  • Chip rail — real providers; dot = availability, active ringed with check.

const WARMUP_URL = "https://speed.cloudflare.com/__down?during=idle&bytes=0";
const MEASURE_URL = "https://speed.cloudflare.com/__down?bytes=100000";
const MEASURE_BYTES = 100000;

/** Cloudflare speed test, identical endpoints to the reference (observed). */
async function measureMbps(): Promise<number | null> {
  try {
    await fetch(WARMUP_URL, { cache: "no-store" });
    const start = performance.now();
    const res = await fetch(`${MEASURE_URL}&_=${Date.now()}`, { cache: "no-store" });
    await res.arrayBuffer();
    const seconds = (performance.now() - start) / 1000;
    if (seconds <= 0) return null;
    return Math.max(0.1, Math.round(((MEASURE_BYTES * 8) / seconds / 1e6) * 10) / 10);
  } catch {
    return null;
  }
}

/** Real per-provider reachability: a no-cors fetch resolves only if the
    network path to the provider's origin is open. */
async function probeOrigin(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(origin, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    window.clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

export default function ServerPanel({
  providers,
  selectedId,
  onSelect,
  embedUrls,
}: {
  providers: ProviderDescriptor[];
  selectedId: string;
  onSelect: (providerId: string) => void;
  /** Expanded embed URL per provider id — the probe targets its origin. */
  embedUrls: Record<string, string>;
}) {
  const router = useRouter();
  // Providers only — the built-in surface is never offered as a choice.
  const listed = providers.filter((p) => !p.isBuiltIn);
  const [mbps, setMbps] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  // Live per-provider reachability, layered over the server plan's availability.
  const [reachable, setReachable] = useState<Record<string, boolean>>({});
  const measureTimer = useRef<number | null>(null);

  const runTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    const value = await measureMbps();
    setMbps(value);
    setTesting(false);
  }, [testing]);

  // Measure once on mount, like the reference panel.
  useEffect(() => {
    void runTest();
    return () => {
      if (measureTimer.current) window.clearTimeout(measureTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recheck = async () => {
    if (rechecking) return;
    setRechecking(true);
    // Reference: force-fetch server status. Ours: re-run the server plan and
    // probe each provider's origin live.
    router.refresh();
    const results = await Promise.all(
      listed.map(async (p) => {
        const url = embedUrls[p.id];
        return [p.id, url ? await probeOrigin(url) : p.available] as const;
      })
    );
    setReachable(Object.fromEntries(results));
    setRechecking(false);
  };

  if (listed.length === 0) return null;
  const selected = listed.find((p) => p.id === selectedId);

  const isOnline = (p: ProviderDescriptor) =>
    p.id in reachable ? reachable[p.id] : p.available;

  return (
    <div
      id="server-list"
      className="nm-glass relative overflow-hidden rounded-2xl"
    >
      {/* Header (reference anatomy) */}
      <div className="flex items-center gap-2.5 px-4 pt-2">
        <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.24em] text-foreground/40">
          Servers
        </p>
        <p className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
          {selected?.displayName ?? "Select a server"}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-foreground/45">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
          <span className="tabular-nums text-foreground/70">
            {mbps !== null ? `${mbps} Mbps` : "— Mbps"}
          </span>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            className="rounded-md px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent/80 transition-colors hover:text-accent disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test"}
          </button>
          <a href="/faq" className="font-medium text-accent/80 transition-colors hover:text-accent">
            FAQ →
          </a>
          <button
            type="button"
            aria-label="Re-check server status"
            title="Re-check server status"
            onClick={() => void recheck()}
            disabled={rechecking}
            className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-foreground/35 transition-colors hover:bg-white/[0.07] hover:text-foreground/80 disabled:opacity-40"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={rechecking ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chip rail */}
      <div className="group/servers relative">
        <div className="no-scrollbar -mx-0 flex gap-1.5 overflow-x-auto px-3 py-2">
          {listed.map((p) => {
            const active = p.id === selectedId;
            const online = isOnline(p);
            return (
              <button
                key={p.id}
                type="button"
                aria-current={active || undefined}
                disabled={!p.available}
                onClick={() => onSelect(p.id)}
                title={p.available ? p.displayName : (p.unavailableReason ?? "Unavailable")}
                // nm-raise-sm / nm-raise = the reference's neumorphic "3D box"
                // behind each server chip (exact shadow values from their CSS).
                className={`nm-tab inline-flex shrink-0 items-center gap-2 rounded-[8px] px-[11px] py-[4px] text-[12px] transition ${
                  active
                    ? "nm-raise font-semibold text-foreground ring-1 ring-accent/40"
                    : p.available
                      ? "nm-raise-sm font-medium text-foreground/70 hover:text-foreground"
                      : "cursor-not-allowed font-medium text-foreground/35 opacity-60"
                }`}
              >
                <span
                  role="img"
                  title={online ? "Online" : "Offline"}
                  aria-label={`Server status: ${online ? "Online" : "Offline"}`}
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(52,211,153,0.14)] ${
                    online ? "bg-emerald-400" : "bg-rose-500/60"
                  }`}
                />
                <span className="whitespace-nowrap tracking-[-0.01em]">{p.displayName}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-accent">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
