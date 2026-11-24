"use client";

// A tiny app-wide toast queue. Follow/unfollow used to be silent, so a user had
// no confirmation that the bell actually changed anything. The host is mounted
// once in the root layout; callers only import `toast()`.

export interface ToastMessage {
  id: number;
  message: string;
  tone: "default" | "success";
}

let toasts: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function toast(
  message: string,
  options: { tone?: ToastMessage["tone"]; durationMs?: number } = {}
): void {
  const id = nextId++;
  const entry: ToastMessage = {
    id,
    message,
    tone: options.tone ?? "default",
  };
  toasts = [...toasts, entry].slice(-3);
  emit();

  const timer = setTimeout(() => {
    timers.delete(id);
    toasts = toasts.filter((item) => item.id !== id);
    emit();
  }, options.durationMs ?? 3200);
  timers.set(id, timer);
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastMessage[] {
  return toasts;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}
