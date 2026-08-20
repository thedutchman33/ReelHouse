"use client";

import { useRef } from "react";
import type { SubtitleTrack } from "@/types";
import { CheckIcon, ChevronRightIcon, SearchIcon, SlidersIcon, UploadIcon } from "./icons";

function Row({
  onClick,
  children,
  active = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition",
        active
          ? "border-accent/70 bg-accent/10 text-text"
          : "border-border bg-surface-2/40 text-text hover:bg-surface-2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Subtitle selection: Off · track list · upload · (pinned) search + customize.
export default function SubtitlePanel({
  tracks,
  selected,
  onSelect,
  onUpload,
  onSearch,
  onCustomize,
}: {
  tracks: SubtitleTrack[];
  selected: string | null; // track.url, or null for Off
  onSelect: (url: string | null) => void;
  onUpload: (file: File) => void;
  onSearch: () => void;
  onCustomize: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
        <Row onClick={() => onSelect(null)} active={selected === null}>
          <span className="font-medium">Off</span>
          {selected === null ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              No subtitles
            </span>
          ) : (
            <CheckIcon size={18} className="text-transparent" />
          )}
        </Row>

        {tracks.map((t) => {
          const active = selected === t.url;
          return (
            <Row key={t.url} onClick={() => onSelect(t.url)} active={active}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{t.label}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted ring-1 ring-inset ring-border">
                  {t.srcLang}
                </span>
              </span>
              {active && <CheckIcon size={18} className="text-accent" />}
            </Row>
          );
        })}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2/30 px-4 py-3 text-left text-sm text-text transition hover:bg-surface-2"
        >
          <UploadIcon size={18} className="text-muted" />
          <span>
            <span className="block font-medium">Upload subtitles</span>
            <span className="block text-xs text-muted">.vtt or .srt — stays on this device</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".vtt,.srt,text/vtt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Pinned actions */}
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <Row onClick={onSearch}>
          <span className="flex items-center gap-3">
            <SearchIcon size={18} className="text-muted" />
            <span className="font-medium">Search subtitles</span>
          </span>
          <ChevronRightIcon size={18} className="text-muted" />
        </Row>
        <Row onClick={onCustomize}>
          <span className="flex items-center gap-3">
            <SlidersIcon size={18} className="text-muted" />
            <span className="font-medium">Customize appearance</span>
          </span>
          <ChevronRightIcon size={18} className="text-muted" />
        </Row>
      </div>
    </div>
  );
}
