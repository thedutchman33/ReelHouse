"use client";

import { useSyncExternalStore } from "react";

// Notification state. The notifications themselves are derived from followed
// shows + episode dates, so only the read and dismissed keys need storing. Keys
// include the air date, so tomorrow's episode produces a fresh unread entry.
//
// This is device-local by design: the badge is a nudge, not account data. The
// follows themselves sync through Supabase.

const KEY = "reelhouse:tracking-notifications-read:v1";
const DISMISSED_KEY = "reelhouse:tracking-notifications-dismissed:v1";
const LIMIT = 200;

let seen = new Set<string>();
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

let dismissed = new Set<string>();
let dismissedLoaded = false;
let dismissedVersion = 0;
const dismissedListeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function emitDismissed(): void {
  dismissedVersion += 1;
  dismissedListeners.forEach((listener) => listener());
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      seen = new Set(parsed.filter((value): value is string => typeof value === "string"));
    }
  } catch {
    /* private mode / malformed value — start fresh */
  }
}

function loadDismissed(): void {
  if (dismissedLoaded || typeof window === "undefined") return;
  dismissedLoaded = true;
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      dismissed = new Set(
        parsed.filter((value): value is string => typeof value === "string")
      );
    }
  } catch {
    /* private mode / malformed value — start fresh */
  }
}

function persist(): void {
  try {
    const values = [...seen].slice(-LIMIT);
    seen = new Set(values);
    window.localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

function persistDismissed(): void {
  try {
    const values = [...dismissed].slice(-LIMIT);
    dismissed = new Set(values);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

export function isNotificationRead(key: string): boolean {
  load();
  return seen.has(key);
}

export function markNotificationsRead(keys: string[]): void {
  load();
  if (keys.length === 0) return;
  let changed = false;
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    changed = true;
  }
  if (!changed) return;
  persist();
  emit();
}

export function isNotificationDismissed(key: string): boolean {
  loadDismissed();
  return dismissed.has(key);
}

/** Hides notifications from the popup and page for this device. */
export function dismissNotifications(keys: string[]): void {
  loadDismissed();
  if (keys.length === 0) return;
  let changed = false;
  for (const key of keys) {
    if (dismissed.has(key)) continue;
    dismissed.add(key);
    changed = true;
  }
  if (!changed) return;
  persistDismissed();
  emitDismissed();
}

function subscribe(listener: () => void): () => void {
  load();
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      loaded = false;
      load();
      emit();
    }
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

function subscribeDismissed(listener: () => void): () => void {
  loadDismissed();
  dismissedListeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === DISMISSED_KEY) {
      dismissedLoaded = false;
      loadDismissed();
      emitDismissed();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    dismissedListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Re-renders the caller whenever the read set changes. */
export function useNotificationReadVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );
}

/** Re-renders the caller whenever the dismissed set changes. */
export function useNotificationDismissVersion(): number {
  return useSyncExternalStore(
    subscribeDismissed,
    () => dismissedVersion,
    () => 0
  );
}
