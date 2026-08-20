import "server-only";

// ---------------------------------------------------------------------------
// OpenSubtitles REST API integration (server-only).
//
// Official API: https://api.opensubtitles.com/api/v1  (docs:
// https://opensubtitles.stoplight.io). This module is the ONLY place that talks
// to OpenSubtitles; the browser never sees the API key, username, or password.
// `import "server-only"` guarantees it can't be bundled into a client component.
//
// Auth model (from the official docs):
//   • Every request sends an `Api-Key` header + a descriptive `User-Agent`.
//   • GET /subtitles (search) needs ONLY the Api-Key.
//   • POST /login {username,password} → { token, base_url } (token ~24h).
//   • POST /download {file_id} needs Api-Key + `Authorization: Bearer <token>`
//     and counts against the account's daily download quota. Use the base_url
//     returned by /login for download calls.
//
// Credentials come from env vars — nothing is hard-coded:
//   OPENSUBTITLES_API_KEY   (required for search + download)
//   OPENSUBTITLES_USERNAME  (required for download only)
//   OPENSUBTITLES_PASSWORD  (required for download only)
//   OPENSUBTITLES_APP_NAME  (optional User-Agent, e.g. "Reelhouse v1.0")
// ---------------------------------------------------------------------------

const API_KEY = process.env.OPENSUBTITLES_API_KEY?.trim();
const USERNAME = process.env.OPENSUBTITLES_USERNAME?.trim();
const PASSWORD = process.env.OPENSUBTITLES_PASSWORD?.trim();
const USER_AGENT = process.env.OPENSUBTITLES_APP_NAME?.trim() || "Reelhouse v1.0";

const DEFAULT_HOST = "api.opensubtitles.com";

/** Search needs only the API key. */
export function isSearchConfigured(): boolean {
  return Boolean(API_KEY);
}

/** Downloading a selected subtitle additionally needs a user account. */
export function isDownloadConfigured(): boolean {
  return Boolean(API_KEY && USERNAME && PASSWORD);
}

export type OpenSubtitlesErrorCode =
  | "not_configured"
  | "auth"
  | "quota"
  | "upstream"
  | "network";

export class OpenSubtitlesError extends Error {
  code: OpenSubtitlesErrorCode;
  constructor(code: OpenSubtitlesErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "OpenSubtitlesError";
  }
}

// Client-facing, normalized result. Deliberately excludes anything sensitive —
// just what the picker UI needs plus the file_id required to download.
export interface SubtitleSearchResult {
  fileId: number;
  language: string; // ISO 639-1, e.g. "en"
  languageLabel: string; // e.g. "English"
  release: string; // release / file name
  downloads: number;
  hearingImpaired: boolean;
  hd: boolean;
  fromTrusted: boolean;
  aiTranslated: boolean;
  machineTranslated: boolean;
  fps?: number;
  uploadDate?: string;
  fileName?: string;
  /** Number of files in this entry (multi-CD releases have >1). */
  fileCount: number;
}

export interface SubtitleSearchParams {
  type: "movie" | "tv";
  tmdbId: number;
  season?: number;
  episode?: number;
  query?: string;
  /** Comma-separated ISO 639-1 codes; omit/"all" for every language. */
  languages?: string;
}

// Minimal ISO 639-1 → English name map for the common OpenSubtitles languages.
// Falls back to the uppercased code for anything not listed.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", "pt-br": "Portuguese (BR)", "pt-pt": "Portuguese (PT)",
  nl: "Dutch", pl: "Polish", ru: "Russian", uk: "Ukrainian", cs: "Czech",
  sk: "Slovak", ro: "Romanian", hu: "Hungarian", el: "Greek", tr: "Turkish",
  ar: "Arabic", he: "Hebrew", fa: "Persian", hi: "Hindi", bn: "Bengali",
  ta: "Tamil", te: "Telugu", ml: "Malayalam", th: "Thai", vi: "Vietnamese",
  id: "Indonesian", ms: "Malay", ja: "Japanese", ko: "Korean",
  zh: "Chinese", "zh-cn": "Chinese (Simplified)", "zh-tw": "Chinese (Traditional)",
  sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", is: "Icelandic",
  bg: "Bulgarian", hr: "Croatian", sr: "Serbian", sl: "Slovenian", et: "Estonian",
  lv: "Latvian", lt: "Lithuanian", ca: "Catalan", eu: "Basque", gl: "Galician",
};

export function languageLabel(code: string): string {
  if (!code) return "Unknown";
  const key = code.toLowerCase();
  return LANGUAGE_NAMES[key] ?? code.toUpperCase();
}

function baseHeaders(): Record<string, string> {
  return {
    "Api-Key": API_KEY as string,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
}

// --- Server-side diagnostics -------------------------------------------------
// Logs ONLY non-sensitive request/response metadata to the server console.
// NEVER logs the API key, username, password, JWT, a signed link's query
// string, or subtitle file contents.
function logDiag(scope: string, fields: Record<string, unknown>) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  console.info(`[opensubtitles] ${scope}${parts ? " " + parts : ""}`);
}

// Just the hostname of a URL — NEVER the path or query. A download link carries
// its signed, single-use token in the PATH, so only the hostname is safe to log.
function hostnameOf(url: string | undefined): string {
  if (!url) return "(none)";
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
}

// Fetch with a per-attempt timeout and a few retries on transient NETWORK
// failures (connection reset, timeout, DNS blip). Does NOT retry on an HTTP
// error status — callers handle those. Reachability to OpenSubtitles is
// intermittent on some networks, and the signed download link lives on a
// DIFFERENT host (www.opensubtitles.com) than the API (api.opensubtitles.com),
// so either hop can drop independently; a couple of quick retries smooth over
// the blips instead of surfacing a one-off reset to the user.
async function fetchResilient(
  url: string,
  init: RequestInit,
  opts: { label: string; timeoutMs?: number; attempts?: number }
): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 15000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const timedOut = e instanceof Error && e.name === "AbortError";
      logDiag(`${opts.label}.attempt_failed`, {
        attempt,
        of: attempts,
        error: timedOut ? `timeout after ${timeoutMs}ms` : causeOf(e),
      });
      // Quick linear backoff before the next attempt (400ms, 800ms, …).
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 400));
    }
  }
  throw lastErr;
}

// A short, non-sensitive description of a thrown fetch error, including undici's
// underlying cause code (e.g. ECONNRESET, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT).
function causeOf(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: { code?: string } }).cause;
    return `${e.name}: ${e.message}${cause?.code ? ` (${cause.code})` : ""}`;
  }
  return String(e);
}

// Non-sensitive error message from an OpenSubtitles JSON error body.
function osMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown; errors?: unknown };
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
    if (Array.isArray(b.errors)) return b.errors.map(String).join("; ");
  }
  return undefined;
}

// ------------------------------- SEARCH ------------------------------------

/**
 * Search OpenSubtitles for the given title/episode. Requires only the API key.
 * Returns results sorted by download count (most-used first).
 */
export async function searchSubtitles(
  params: SubtitleSearchParams
): Promise<SubtitleSearchResult[]> {
  if (!API_KEY) {
    throw new OpenSubtitlesError("not_configured", "OpenSubtitles API key is not configured.");
  }

  const url = new URL(`https://${DEFAULT_HOST}/api/v1/subtitles`);
  const q = url.searchParams;

  if (params.type === "tv" && params.season != null && params.episode != null) {
    // For an episode, match the parent show's TMDB id + season/episode.
    q.set("parent_tmdb_id", String(params.tmdbId));
    q.set("season_number", String(params.season));
    q.set("episode_number", String(params.episode));
    q.set("type", "episode");
  } else {
    q.set("tmdb_id", String(params.tmdbId));
    q.set("type", "movie");
  }

  if (params.query?.trim()) q.set("query", params.query.trim());
  if (params.languages && params.languages !== "all") {
    // API wants a sorted, comma-separated, lowercased list.
    const langs = params.languages
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
      .sort();
    if (langs.length) q.set("languages", langs.join(","));
  }
  q.set("order_by", "download_count");
  q.set("order_direction", "desc");

  let res: Response;
  try {
    res = await fetchResilient(
      url.toString(),
      { headers: baseHeaders(), cache: "no-store" },
      { label: "search", timeoutMs: 15000 }
    );
  } catch (e) {
    logDiag("search.fetch_failed", {
      host: DEFAULT_HOST,
      endpoint: "/api/v1/subtitles",
      error: causeOf(e),
    });
    throw new OpenSubtitlesError(
      "network",
      `Couldn't reach OpenSubtitles to search (${DEFAULT_HOST}). This is usually a temporary network/ISP issue — please try again.`
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new OpenSubtitlesError("auth", "OpenSubtitles rejected the API key.");
  }
  if (!res.ok) {
    throw new OpenSubtitlesError("upstream", `OpenSubtitles search failed (${res.status}).`);
  }

  const json = (await res.json()) as { data?: RawSubtitle[] };
  const data = Array.isArray(json.data) ? json.data : [];

  const results: SubtitleSearchResult[] = [];
  for (const item of data) {
    const a = item?.attributes;
    const file = a?.files?.[0];
    if (!a || !file?.file_id) continue; // need a downloadable file id
    const lang = (a.language ?? "").toLowerCase();
    results.push({
      fileId: file.file_id,
      language: lang,
      languageLabel: languageLabel(lang),
      release: a.release || file.file_name || a.feature_details?.title || "Untitled release",
      downloads: a.download_count ?? 0,
      hearingImpaired: Boolean(a.hearing_impaired),
      hd: Boolean(a.hd),
      fromTrusted: Boolean(a.from_trusted),
      aiTranslated: Boolean(a.ai_translated),
      machineTranslated: Boolean(a.machine_translated),
      fps: a.fps || undefined,
      uploadDate: a.upload_date || undefined,
      fileName: file.file_name || undefined,
      fileCount: a.files?.length ?? 1,
    });
  }
  return results;
}

// ------------------------------- DOWNLOAD ----------------------------------

// Cached login token (valid ~24h). Kept in module memory so we don't re-login
// on every download. base_url tells us which host to hit for downloads.
let cachedAuth: { token: string; baseUrl: string; expires: number } | null = null;

async function login(): Promise<{ token: string; baseUrl: string }> {
  if (cachedAuth && cachedAuth.expires > Date.now()) {
    return { token: cachedAuth.token, baseUrl: cachedAuth.baseUrl };
  }
  if (!API_KEY || !USERNAME || !PASSWORD) {
    throw new OpenSubtitlesError(
      "not_configured",
      "OpenSubtitles account (username + password) is required to download subtitles."
    );
  }

  const endpoint = "/api/v1/login";
  let res: Response;
  try {
    res = await fetchResilient(
      `https://${DEFAULT_HOST}${endpoint}`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        cache: "no-store",
      },
      { label: "login", timeoutMs: 15000 }
    );
  } catch (e) {
    logDiag("login.fetch_failed", { host: DEFAULT_HOST, endpoint, error: causeOf(e) });
    throw new OpenSubtitlesError(
      "network",
      `Couldn't reach OpenSubtitles to sign in (${DEFAULT_HOST}). This is usually a temporary network/ISP issue — please try again.`
    );
  }

  // Read the body once as text so a non-sensitive error message can be logged on
  // failure without consuming the response stream twice.
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined; // non-JSON error page
  }
  logDiag("login.response", {
    endpoint,
    status: res.status,
    contentType,
    message: osMessage(body) ?? "",
  });

  if (res.status === 401 || res.status === 403) {
    throw new OpenSubtitlesError("auth", "OpenSubtitles login failed — check the username/password.");
  }
  if (!res.ok) {
    throw new OpenSubtitlesError("upstream", `OpenSubtitles login failed (${res.status}).`);
  }

  const json = (body ?? {}) as { token?: string; base_url?: string };
  if (!json.token) {
    throw new OpenSubtitlesError("auth", "OpenSubtitles login returned no token.");
  }
  const baseUrl = json.base_url?.replace(/^https?:\/\//, "").trim() || DEFAULT_HOST;
  logDiag("login.ok", { baseUrl });
  // Refresh a little before the ~24h expiry.
  cachedAuth = { token: json.token, baseUrl, expires: Date.now() + 23 * 60 * 60 * 1000 };
  return { token: json.token, baseUrl };
}

export interface SubtitleDownload {
  vtt: string;
  fileName: string;
  /** Downloads remaining in the account's daily quota (if reported). */
  remaining?: number;
}

/**
 * Resolve a temporary download link for a subtitle file, fetch it, and return
 * it as WebVTT. Requires a configured account. Counts against the daily quota.
 */
export async function downloadSubtitleVtt(fileId: number): Promise<SubtitleDownload> {
  const requestLink = async (auth: { token: string; baseUrl: string }) =>
    fetchResilient(
      `https://${auth.baseUrl}/api/v1/download`,
      {
        method: "POST",
        headers: { ...baseHeaders(), Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ file_id: fileId, sub_format: "webvtt" }),
        cache: "no-store",
      },
      { label: "download", timeoutMs: 15000 }
    );

  let auth = await login();
  let res: Response;
  try {
    res = await requestLink(auth);
    // A stale token → re-login once and retry.
    if (res.status === 401 || res.status === 403) {
      cachedAuth = null;
      auth = await login();
      res = await requestLink(auth);
    }
  } catch (e) {
    if (e instanceof OpenSubtitlesError) throw e;
    logDiag("download.request_failed", {
      host: auth.baseUrl,
      endpoint: "/api/v1/download",
      error: causeOf(e),
    });
    throw new OpenSubtitlesError(
      "network",
      `Couldn't reach OpenSubtitles to request the download (${auth.baseUrl}). This is usually a temporary network/ISP issue — please try again.`
    );
  }

  // Read the /download response body once as text so a safe error message can be
  // logged on failure without consuming the response stream twice.
  const dlContentType = res.headers.get("content-type") ?? "";
  const dlRaw = await res.text();
  let dlBody: unknown;
  try {
    dlBody = dlRaw ? JSON.parse(dlRaw) : undefined;
  } catch {
    dlBody = undefined; // non-JSON error page
  }
  logDiag("download.response", {
    host: auth.baseUrl,
    endpoint: "/api/v1/download",
    status: res.status,
    contentType: dlContentType,
    message: osMessage(dlBody) ?? "",
  });

  if (res.status === 406 || res.status === 429) {
    throw new OpenSubtitlesError(
      "quota",
      "OpenSubtitles daily download limit reached. Try again tomorrow or use a VIP account."
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new OpenSubtitlesError("auth", "OpenSubtitles rejected the download request.");
  }
  if (!res.ok) {
    throw new OpenSubtitlesError("upstream", `OpenSubtitles download failed (${res.status}).`);
  }

  const json = (dlBody ?? {}) as {
    link?: string;
    file_name?: string;
    remaining?: number;
    message?: string;
  };
  if (!json.link) {
    logDiag("download.no_link", { message: json.message ?? "" });
    throw new OpenSubtitlesError("upstream", json.message || "OpenSubtitles returned no download link.");
  }
  logDiag("download.link_ok", {
    linkHost: hostnameOf(json.link),
    fileName: json.file_name ?? "",
    remaining: typeof json.remaining === "number" ? json.remaining : "",
  });

  // Fetch the actual subtitle file from the temporary link (a DIFFERENT host —
  // typically www.opensubtitles.com — so this hop can fail even when the API is
  // reachable).
  let fileRes: Response;
  try {
    fileRes = await fetchResilient(
      json.link,
      { headers: { "User-Agent": USER_AGENT }, cache: "no-store" },
      { label: "download.file", timeoutMs: 20000 }
    );
  } catch (e) {
    logDiag("download.file_fetch_failed", { linkHost: hostnameOf(json.link), error: causeOf(e) });
    throw new OpenSubtitlesError(
      "network",
      `Couldn't fetch the subtitle file from ${hostnameOf(json.link)}. OpenSubtitles' API responded, but its file host wasn't reachable — usually a temporary network/ISP issue. Please try again.`
    );
  }
  const fileContentType = fileRes.headers.get("content-type") ?? "";
  logDiag("download.file_response", {
    linkHost: hostnameOf(json.link),
    status: fileRes.status,
    contentType: fileContentType,
  });
  if (!fileRes.ok) {
    throw new OpenSubtitlesError("upstream", `Subtitle file download failed (${fileRes.status}).`);
  }

  const raw = await fileRes.text();
  return {
    vtt: ensureVtt(raw),
    fileName: json.file_name || `subtitle-${fileId}.vtt`,
    remaining: typeof json.remaining === "number" ? json.remaining : undefined,
  };
}

// Normalize whatever the API returns to WebVTT. We request `webvtt`, but this is
// a safety net: convert SRT-style timestamps and guarantee a WEBVTT header.
// Exported (pure, no I/O) so it can be unit-tested directly.
export function ensureVtt(text: string): string {
  const body = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  if (/^WEBVTT/.test(body)) return body;
  const converted = body.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2"
  );
  return `WEBVTT\n\n${converted}`;
}

// Raw shapes from the OpenSubtitles /subtitles response (only fields we read).
interface RawSubtitle {
  attributes?: {
    language?: string;
    download_count?: number;
    hearing_impaired?: boolean;
    hd?: boolean;
    fps?: number;
    from_trusted?: boolean;
    ai_translated?: boolean;
    machine_translated?: boolean;
    upload_date?: string;
    release?: string;
    feature_details?: { title?: string };
    files?: { file_id?: number; file_name?: string }[];
  };
}
