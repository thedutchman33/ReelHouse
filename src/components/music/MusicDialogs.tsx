"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MusicTrack, UserPlaylist } from "@/lib/music/types";
import { BROWSE_CATEGORIES, formatTrackCount } from "@/lib/music/utils";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { CheckIcon, MusicNoteIcon, PlusIcon, TrashIcon, XIcon } from "./icons";
import MusicArtwork from "./MusicArtwork";

export function DialogShell({
  title,
  subtitle,
  onClose,
  children,
  width = "520px",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="music-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-dialog-title"
        className="music-dialog"
        style={{ width }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <h2 id="music-dialog-title" className="text-2xl font-bold tracking-[-0.02em] text-white">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <XIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function PlaylistFormDialog({
  mode,
  initial,
  pendingTrack,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: UserPlaylist;
  pendingTrack?: MusicTrack | null;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const valid = title.trim().length > 0;

  return (
    <DialogShell
      title={mode === "edit" ? "Edit details" : "Create playlist"}
      subtitle={
        pendingTrack
          ? `“${pendingTrack.title}” will be added to this playlist.`
          : undefined
      }
      onClose={onClose}
    >
      <form
        className="px-6 pb-6 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onSubmit({ title: title.trim(), description: description.trim() });
        }}
      >
        <label className="mb-2 block text-[13px] font-semibold text-white" htmlFor="music-playlist-name">
          Name
        </label>
        <input
          id="music-playlist-name"
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, 120))}
          maxLength={120}
          placeholder="My playlist"
          className="music-modal-input"
          autoComplete="off"
        />
        <label
          className="mb-2 mt-5 block text-[13px] font-semibold text-white"
          htmlFor="music-playlist-description"
        >
          Description <span className="font-normal text-white/45">(optional)</span>
        </label>
        <textarea
          id="music-playlist-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 500))}
          maxLength={500}
          rows={4}
          placeholder="Give your playlist a description"
          className="music-modal-input resize-none"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "edit" ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function AddToPlaylistDialog({
  track,
  onClose,
  onNewPlaylist,
}: {
  track: MusicTrack;
  onClose: () => void;
  onNewPlaylist: (track: MusicTrack) => void;
}) {
  const { playlists, addTrackToPlaylist } = useMusicLibrary();
  const [busyId, setBusyId] = useState<string | null>(null);
  const sorted = [...playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  async function add(playlistId: string, name: string) {
    setBusyId(playlistId);
    const result = await addTrackToPlaylist(playlistId, track);
    setBusyId(null);
    if (result === "missing") {
      toast("That playlist could not be found.");
      return;
    }
    if (result === "exists") {
      toast(`Already in ${name}.`);
      onClose();
      return;
    }
    toast(`Added to ${name}`, { tone: "success" });
    onClose();
  }

  return (
    <DialogShell
      title="Add to playlist"
      subtitle={`“${track.title}” · ${track.artistName}`}
      onClose={onClose}
      width="440px"
    >
      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={() => onNewPlaylist(track)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition hover:bg-white/10"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-[#3e3e3e] text-white">
            <PlusIcon size={22} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">New playlist</span>
            <span className="mt-0.5 block text-xs text-white/45">Create one and add this song</span>
          </span>
        </button>
        <div className="mx-3 my-2 h-px bg-white/10" />
        <div className="max-h-[46vh] overflow-y-auto pr-1">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-white/45">
              You don’t have any playlists yet.
            </p>
          ) : (
            sorted.map((playlist) => {
              const already = playlist.tracks.some((item) => item.id === track.id);
              return (
                <button
                  key={playlist.id}
                  type="button"
                  disabled={busyId === playlist.id}
                  onClick={() => void add(playlist.id, playlist.title)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-60"
                >
                  <MusicArtwork
                    src={playlist.tracks[0]?.artworkUrl}
                    alt=""
                    seed={playlist.id}
                    className="h-12 w-12 shrink-0"
                    iconSize={18}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{playlist.title}</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {formatTrackCount(playlist.tracks.length)}
                    </span>
                  </span>
                  {busyId === playlist.id ? (
                    <span className="music-spin h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                  ) : already ? (
                    <span className="flex items-center gap-1 text-xs text-[#1ed760]">
                      <CheckIcon size={14} /> Added
                    </span>
                  ) : (
                    <PlusIcon size={18} className="text-white/55" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </DialogShell>
  );
}

export function ConfirmDialog({
  title,
  copy,
  confirmLabel = "Delete",
  danger = true,
  onClose,
  onConfirm,
}: {
  title: string;
  copy: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogShell title={title} onClose={onClose} width="420px">
      <div className="px-6 pb-6 pt-2">
        <p className="text-sm leading-relaxed text-white/60">{copy}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03]"
          >
            {danger && <TrashIcon size={15} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

export function MusicPreferencesDialog({ onClose }: { onClose: () => void }) {
  const { favoriteGenres, setFavoriteGenres } = useMusicLibrary();
  const [selected, setSelected] = useState<string[]>(favoriteGenres);
  const extraGenres = selected.filter(
    (genre) => !BROWSE_CATEGORIES.some((category) => category.title === genre)
  );
  const genres = [...BROWSE_CATEGORIES.map((category) => category.title), ...extraGenres];

  function toggle(genre: string) {
    setSelected((current) =>
      current.includes(genre)
        ? current.filter((item) => item !== genre)
        : current.length >= 5
          ? current
          : [...current, genre]
    );
  }

  return (
    <DialogShell
      title="Tune your recommendations"
      subtitle="Pick up to five genres. We blend these with your likes, follows, recently played tracks and playlists."
      onClose={onClose}
      width="580px"
    >
      <div className="px-6 pb-6 pt-3">
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = selected.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(genre)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-[#1ed760] bg-[#1ed760] text-black"
                    : "border-white/20 text-white/75 hover:border-white/55 hover:text-white"
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-white/45">
          {selected.length}/5 selected. Your existing library remains the strongest signal;
          genre choices help the shelf reach beyond artists you already follow.
        </p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
            className="rounded-full px-3 py-2 text-sm font-semibold text-white/55 transition hover:text-white disabled:opacity-35"
          >
            Clear
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setFavoriteGenres(selected);
                toast("Recommendations updated", { tone: "success" });
                onClose();
              }}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

export function NoPlaylistsDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell title="No playlists yet" onClose={onClose} width="420px">
      <div className="flex flex-col items-center px-6 pb-8 pt-2 text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white/60">
          <MusicNoteIcon size={26} />
        </span>
        <p className="text-sm leading-relaxed text-white/60">
          Create a playlist from the plus button in Your Library, then add songs from any track
          menu.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03]"
        >
          Got it
        </button>
      </div>
    </DialogShell>
  );
}
