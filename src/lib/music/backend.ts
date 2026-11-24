import "server-only";

const DEFAULT_TIMEOUT_MS = 45_000;

export function musicBackendBase(): string {
  const value =
    process.env.MUSIC_BACKEND_URL?.trim() ||
    process.env.MUSIC_BACKEND_PUBLIC_URL?.trim() ||
    "";
  if (!value) {
    throw new Error("MUSIC_BACKEND_URL is not configured");
  }
  return value.replace(/\/+$/, "");
}

export async function backendFetch(
  path: string,
  init: RequestInit & { next?: { revalidate?: number } } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(`${musicBackendBase()}${path}`, {
      ...init,
      cache: init.cache ?? (init.next ? undefined : "no-store"),
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function backendJson<T>(
  path: string,
  options: {
    revalidate?: number;
    auth?: string | null;
    headers?: HeadersInit;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const response = await backendFetch(path, {
    headers: {
      Accept: "application/json",
      ...(options.auth ? { Authorization: options.auth } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.revalidate !== undefined
      ? { next: { revalidate: options.revalidate } }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Music backend returned ${response.status}`);
  }
  return (await response.json()) as T;
}

export function encodePath(value: string): string {
  return encodeURIComponent(value.trim());
}
