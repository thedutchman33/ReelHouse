"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaType, SubtitleTrack } from "@/types";
import { ChevronLeftIcon, CheckIcon, SearchIcon, SpinnerIcon } from "./icons";

// Language filter options (value = ISO 639-1, or "all").
const LANG_OPTIONS: { code: string; label: string }[] = [
  { code: "all", label: "All languages" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

// Shape returned by /api/subtitles/search (mirrors the server's normalized item,
// re-declared here because the server module is server-only).
interface ApiResult {
  fileId: number;
  language: string;
  languageLabel: string;
  release: string;
  downloads: number;
  hearingImpaired: boolean;
  hd: boolean;
  fromTrusted: boolean;
  aiTranslated: boolean;
  machineTranslated: boolean;
  fps?: number;
  uploadDate?: string;
  fileName?: string;
  fileCount: number;
}

type SearchState =
  | { kind: "loading" }
  | { kind: "ok"; results: ApiResult[]; canDownload: boolean }
  | { kind: "empty"; canDownload: boolean }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

// Small metadata pill.
function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={[
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tone === "accent"
          ? "bg-accent/15 text-accent ring-accent/30"
          : "bg-surface text-muted ring-border",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

// Subtitle search view: query OpenSubtitles for the current title/episode, list
// results with language + metadata, and load a selection as a WebVTT track.
export default function SubtitleSearch({
  type,
  tmdbId,
  title,
  season,
  episode,
  activeUrl,
  onBack,
  onLoaded,
}: {
  type: MediaType;
  tmdbId: number;
  title: string;
  season?: number;
  episode?: number;
  activeUrl: string | null;
  onBack: () => void;
  onLoaded: (track: SubtitleTrack) => void;
}) {
  const [language, setLanguage] = useState("all");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "loading" });

  // Per-row download status.
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ kind: "loading" });
    setRowError(null);

    const params = new URLSearchParams({ type, tmdbId: String(tmdbId) });
    if (type === "tv" && season != null && episode != null) {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    if (language !== "all") params.set("languages", language);
    if (query.trim()) params.set("query", query.trim());

    try {
      const res = await fetch(`/api/subtitles/search?${params.toString()}`, {
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (ctrl.signal.aborted) return;

      if (data.status === "not_configured") {
        setState({ kind: "not_configured" });
      } else if (data.status === "ok") {
        const results: ApiResult[] = Array.isArray(data.results) ? data.results : [];
        setState(
          results.length
            ? { kind: "ok", results, canDownload: Boolean(data.canDownload) }
            : { kind: "empty", canDownload: Boolean(data.canDownload) }
        );
      } else {
        setState({ kind: "error", message: data.message || "Subtitle search failed." });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState({ kind: "error", message: "Couldn't reach the subtitle service." });
    }
  }, [type, tmdbId, season, episode, language, query]);

  // Auto-search on open and whenever the language filter or episode changes.
  // (query is applied on submit, not on every keystroke.)
  useEffect(() => {
    runSearch();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tmdbId, season, episode, language]);

  const useSubtitle = async (r: ApiResult) => {
    setDownloadingId(r.fileId);
    setRowError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/subtitles/download?fileId=${r.fileId}`);
      const data = await res.json();

      if (data.status === "ok" && typeof data.vtt === "string") {
        const blob = new Blob([data.vtt], { type: "text/vtt" });
        const url = URL.createObjectURL(blob);
        onLoaded({ label: r.languageLabel, srcLang: r.language || "sub", url });
        setLoadedId(r.fileId);
        if (typeof data.remaining === "number") {
          setNotice(`Loaded “${r.languageLabel}”. ${data.remaining} download(s) left today.`);
        } else {
          setNotice(`Loaded “${r.languageLabel}” into the player.`);
        }
      } else if (data.status === "not_configured") {
        setRowError({ id: r.fileId, message: data.message || "An OpenSubtitles account is required to load subtitles." });
      } else if (data.status === "quota") {
        setRowError({ id: r.fileId, message: data.message || "Daily download limit reached." });
      } else {
        setRowError({ id: r.fileId, message: data.message || "Couldn't load this subtitle." });
      }
    } catch {
      setRowError({ id: r.fileId, message: "Couldn't reach the subtitle service." });
    } finally {
      setDownloadingId(null);
    }
  };

  const contextLine =
    type === "tv" && season != null && episode != null
      ? `${title} · S${season} · E${episode}`
      : title;

  return (
    <div className="flex h-full flex-col">
      {/* Header — back to the subtitle list */}
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-2 text-sm font-medium text-muted transition hover:text-text"
      >
        <ChevronLeftIcon size={18} />
        Back to subtitles
      </button>

      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text">Search subtitles</h3>
        <p className="mt-0.5 truncate text-xs text-muted" title={contextLine}>
          {contextLine}
        </p>
      </div>

      {/* Controls: language + refine query */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="sub-lang" className="sr-only">
            Language
          </label>
          <select
            id="sub-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-text outline-none transition focus:border-accent/70"
          >
            {LANG_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2 focus-within:border-accent/70">
            <SearchIcon size={16} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Refine by release (optional)"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
          <button type="submit" className="btn-ghost px-3 py-2 text-sm">
            Search
          </button>
        </form>
      </div>

      {notice && (
        <p className="mb-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent ring-1 ring-inset ring-accent/25">
          {notice}
        </p>
      )}

      {/* Results / states */}
      <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
        {state.kind === "loading" && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <SpinnerIcon size={18} /> Searching OpenSubtitles…
          </div>
        )}

        {state.kind === "not_configured" && (
          <div className="rounded-xl border border-border bg-surface-2/40 p-4 text-sm text-muted">
            <p className="font-medium text-text">Subtitle search isn&apos;t configured</p>
            <p className="mt-1">
              Add an OpenSubtitles API key on the server (env var{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-[11px]">OPENSUBTITLES_API_KEY</code>)
              to enable search. See <code className="rounded bg-surface px-1 py-0.5 text-[11px]">.env.local.example</code>.
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
            <p className="font-medium text-text">Couldn&apos;t search subtitles</p>
            <p className="mt-1 text-muted">{state.message}</p>
            <button type="button" onClick={runSearch} className="btn-ghost mt-3 px-3 py-1.5 text-sm">
              Try again
            </button>
          </div>
        )}

        {state.kind === "empty" && (
          <div className="rounded-xl border border-border bg-surface-2/40 p-4 text-sm text-muted">
            <p className="font-medium text-text">No subtitles found</p>
            <p className="mt-1">
              Nothing matched {contextLine}
              {language !== "all" ? " in this language" : ""}. Try another language or refine the search.
            </p>
          </div>
        )}

        {state.kind === "ok" && (
          <>
            {!state.canDownload && (
              <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted ring-1 ring-inset ring-border">
                Preview only — add an OpenSubtitles account (username + password) on the server to load
                these into the player.
              </p>
            )}
            {state.results.map((r) => {
              const isLoaded = loadedId === r.fileId;
              const isDownloading = downloadingId === r.fileId;
              return (
                <div
                  key={r.fileId}
                  className={[
                    "rounded-xl border px-3 py-3 text-sm transition",
                    isLoaded
                      ? "border-accent/70 bg-accent/10"
                      : "border-border bg-surface-2/40",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-text">{r.languageLabel}</span>
                        <Chip>{(r.language || "sub").toUpperCase()}</Chip>
                        {r.hd && <Chip>HD</Chip>}
                        {r.hearingImpaired && <Chip>CC</Chip>}
                        {r.fromTrusted && <Chip tone="accent">Trusted</Chip>}
                        {(r.aiTranslated || r.machineTranslated) && <Chip>Auto</Chip>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted" title={r.release}>
                        {r.release}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {r.downloads.toLocaleString()} downloads
                        {r.fileCount > 1 ? ` · ${r.fileCount} files` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => useSubtitle(r)}
                      disabled={isDownloading || !state.canDownload}
                      className={[
                        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                        isLoaded
                          ? "bg-accent/20 text-accent"
                          : state.canDownload
                          ? "btn-primary"
                          : "cursor-not-allowed bg-surface text-muted ring-1 ring-inset ring-border",
                      ].join(" ")}
                    >
                      {isDownloading ? (
                        <span className="flex items-center gap-1">
                          <SpinnerIcon size={14} /> Loading
                        </span>
                      ) : isLoaded ? (
                        <span className="flex items-center gap-1">
                          <CheckIcon size={14} /> Loaded
                        </span>
                      ) : (
                        "Use"
                      )}
                    </button>
                  </div>

                  {rowError?.id === r.fileId && (
                    <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger ring-1 ring-inset ring-danger/25">
                      {rowError.message}
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
