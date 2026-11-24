"use client";

import { useSyncExternalStore } from "react";
import { todayKey } from "@/lib/calendar";
import type { TrackingNotification } from "@/lib/tracking";

// Live F1 / cricket alerts are transient, unlike followed-show episode alerts:
// they are published when a Watch Live button unlocks and expire with its
// watch window. They still use the shared notification read/dismiss state, so
// the bell badge, account panel and /notifications page treat them the same.

const KEY = "reelhouse:live-alerts:v1";
const LIMIT = 20;
const EMPTY: TrackingNotification[] = [];

export type LiveAlertSport = "f1" | "cricket";

export interface LiveAlertInput {
  key: string;
  title: string;
  body: string;
  href: string;
  sport: LiveAlertSport;
  /** Epoch ms when the watch window closes; the alert is removed then. */
  expiresAt: number;
}

let alerts: TrackingNotification[] = [];
let snapshot: TrackingNotification[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

function asLiveAlert(value: unknown): TrackingNotification | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.kind !== "live") return null;
  if (
    typeof item.key !== "string" ||
    typeof item.title !== "string" ||
    typeof item.body !== "string" ||
    typeof item.href !== "string" ||
    typeof item.date !== "string" ||
    typeof item.expiresAt !== "number" ||
    !Number.isFinite(item.expiresAt)
  ) {
    return null;
  }
  if (item.sport !== "f1" && item.sport !== "cricket") return null;
  return {
    key: item.key,
    kind: "live",
    title: item.title,
    body: item.body,
    href: item.href,
    date: item.date,
    sport: item.sport,
    expiresAt: item.expiresAt,
  };
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(alerts));
  } catch {
    /* private mode / quota — alerts are best-effort */
  }
}

function emit(): void {
  snapshot = alerts;
  listeners.forEach((listener) => listener());
}

function scheduleRemoval(item: TrackingNotification): void {
  if (typeof window === "undefined" || typeof item.expiresAt !== "number") return;
  const previous = timers.get(item.key);
  if (previous) window.clearTimeout(previous);
  const delay = item.expiresAt - Date.now();
  if (delay <= 0) {
    timers.delete(item.key);
    remove(item.key);
    return;
  }
  const timer = window.setTimeout(() => {
    timers.delete(item.key);
    remove(item.key);
  }, Math.min(delay, 2_147_483_647));
  timers.set(item.key, timer);
}

function remove(key: string): void {
  const timer = timers.get(key);
  if (timer) {
    window.clearTimeout(timer);
    timers.delete(key);
  }
  const next = alerts.filter((item) => item.key !== key);
  if (next.length === alerts.length) return;
  alerts = next;
  persist();
  emit();
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    for (const timer of timers.values()) window.clearTimeout(timer);
    timers.clear();

    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      alerts = [];
      snapshot = EMPTY;
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      alerts = [];
      snapshot = EMPTY;
      return;
    }
    const now = Date.now();
    alerts = parsed
      .map(asLiveAlert)
      .filter(
        (item): item is TrackingNotification =>
          item !== null && (item.expiresAt ?? 0) > now
      )
      .slice(0, LIMIT);
    snapshot = alerts;
    for (const item of alerts) scheduleRemoval(item);
  } catch {
    alerts = [];
    snapshot = EMPTY;
  }
}

/** Add or refresh a live alert. Re-publishing an existing key is a no-op. */
export function publishLiveAlert(input: LiveAlertInput): void {
  if (typeof window === "undefined") return;
  load();

  const existing = alerts.find((item) => item.key === input.key);
  if (existing) {
    // F1 may learn a later session end while the button is already live.
    if (input.expiresAt > (existing.expiresAt ?? 0)) {
      const next = alerts.map((item) =>
        item.key === input.key ? { ...item, expiresAt: input.expiresAt } : item
      );
      alerts = next;
      persist();
      scheduleRemoval(next.find((item) => item.key === input.key)!);
      emit();
    }
    return;
  }

  const item: TrackingNotification = {
    key: input.key,
    kind: "live",
    title: input.title,
    body: input.body,
    href: input.href,
    date: todayKey(),
    sport: input.sport,
    expiresAt: input.expiresAt,
  };
  alerts = [item, ...alerts].slice(0, LIMIT);
  persist();
  scheduleRemoval(item);
  emit();
}

/** Remove a live alert immediately, e.g. when the button locks again. */
export function retireLiveAlert(key: string): void {
  if (typeof window === "undefined") return;
  load();
  remove(key);
}

function subscribe(listener: () => void): () => void {
  load();
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    loaded = false;
    load();
    emit();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot(): TrackingNotification[] {
  load();
  return snapshot;
}

export function useLiveAlerts(): TrackingNotification[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
