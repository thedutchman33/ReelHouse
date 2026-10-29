"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { CricketPlayer, Gender } from "@/lib/cricket/types";
import { formatNumber, playerNameKey } from "@/lib/cricket/shared";
import {
  internationalBatting,
  internationalBowling,
  summariseBatting,
  summariseBowling,
} from "@/lib/cricket/player-stats-summary";
import { BoardLogo } from "./BoardLogo";
import { usePlayerProfile } from "./use-player-profile";
import { EmptyState, Modal, PlayerAvatar, SectionHeading, Select } from "./ui";

const ROLE_OPTIONS = ["All roles", "Batter", "Bowler", "All-rounder", "Wicketkeeper Batter"];
const GRADE_ORDER = ["A", "B", "C", "D"];

// The ICC index is gender-independent and fetched once per browser tab.
let iccPhotosCache: Record<string, string> | null = null;
let iccPhotosRequest: Promise<Record<string, string>> | null = null;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function PlayerPortrait({
  player,
  fallback,
}: {
  player: CricketPlayer;
  fallback: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string | null>(player.imageUrl ?? fallback);
  useEffect(() => {
    setSrc(player.imageUrl ?? fallback);
    setFailed(false);
  }, [player.imageUrl, fallback]);

  if (!src || failed) {
    return (
      <span className="grid h-full w-full place-items-center">
        <span className="font-f1 text-5xl font-bold tracking-[0.08em] text-white/20">
          {initials(player.name)}
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={player.name}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => {
        if (fallback && src !== fallback) setSrc(fallback);
        else setFailed(true);
      }}
      className="h-full w-full object-contain object-bottom p-2 pb-0 transition-transform duration-500 ease-out group-hover:scale-[1.045]"
    />
  );
}

export default function PlayerDirectory({
  players,
  gender,
}: {
  players: CricketPlayer[];
  gender: Gender;
}) {
  const [role, setRole] = useState("All roles");
  const [selected, setSelected] = useState<CricketPlayer | null>(null);
  const [iccPhotos, setIccPhotos] = useState<Record<string, string>>(() => iccPhotosCache ?? {});
  const titleId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { data, loading, failed } = usePlayerProfile(selected);
  const facts = data?.facts ?? null;
  const stats = data?.stats ?? null;

  const filtered = useMemo(
    () => players.filter((player) => role === "All roles" || player.role === role),
    [players, role]
  );

  const gradedPlayers = useMemo(
    () => players.filter((player) => GRADE_ORDER.includes(player.grade ?? "")),
    [players]
  );
  const gradeGroups = useMemo(() => {
    const groups = GRADE_ORDER.map((grade) => ({
      grade,
      players: filtered.filter((player) => player.grade === grade),
    })).filter((group) => group.players.length > 0);
    // BCCI's directory also exposes uncapped/domestic names with no contract
    // grade. The reference page is the graded India squad, so those rows stay
    // off the card wall; a feed with no grades at all still shows its roster.
    if (groups.length === 0 && filtered.length > 0) {
      return [{ grade: "Squad", players: filtered }];
    }
    return groups;
  }, [filtered]);

  useEffect(() => {
    setRole("All roles");
    setSelected(null);
  }, [gender]);

  useEffect(() => {
    if (iccPhotosCache) {
      setIccPhotos(iccPhotosCache);
      return;
    }
    let active = true;
    iccPhotosRequest ??= fetch("/api/cricket/player-photos")
      .then(async (response) => {
        if (!response.ok) return {};
        const body = (await response.json()) as { photos?: Record<string, string> };
        return body.photos ?? {};
      })
      .catch(() => ({}))
      .then((photos) => {
        if (Object.keys(photos).length > 0) iccPhotosCache = photos;
        else iccPhotosRequest = null;
        return photos;
      });
    void iccPhotosRequest.then((photos) => {
      if (active) setIccPhotos(photos);
    });
    return () => {
      active = false;
    };
  }, []);

  const close = () => setSelected(null);

  const batting = stats
    ? summariseBatting(internationalBatting(stats.career.batting))
    : null;
  const bowling = stats
    ? summariseBowling(internationalBowling(stats.career.bowling))
    : null;
  const hasBat = Boolean(batting && internationalBatting(stats?.career.batting ?? []).length);
  const hasBowl = Boolean(
    bowling && internationalBowling(stats?.career.bowling ?? []).some((row) => row.innings > 0)
  );

  return (
    <section id="ck-players" aria-labelledby="ck-players-title" className="scroll-mt-28">
      <SectionHeading
        id="ck-players-title"
        eyebrow={`India squad · ${gender === "men" ? "Men" : "Women"}`}
        title="Player"
        accent="directory"
        right={
          <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[13px] font-medium tabular-nums text-white/45">
            {gradedPlayers.length || players.length} players
          </span>
        }
      />

      <div className="f1-card rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec] shadow-[0_0_6px_rgb(143_180_236/0.8)]" />
            Pick a portrait for the full profile
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/45">
              <BoardLogo team={{ name: "India", abbreviation: "IND" }} size="sm" />
              India only
            </span>
            <Select
              label="Role"
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS.map((option) => ({ value: option, label: option }))}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No players found" />
          </div>
        ) : (
          <div className="space-y-7 pt-5">
            {gradeGroups.map((group) => (
              <section key={group.grade} aria-label={`Grade ${group.grade}`}>
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/[0.07] pb-2">
                  <h3 className="font-f1 text-[24px] font-bold uppercase leading-none tracking-wide text-white">
                    Grade <span className="text-[#8fb4ec]">{group.grade}</span>
                  </h3>
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/30">
                    {group.players.length} {group.players.length === 1 ? "player" : "players"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
                  {group.players.map((player, index) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelected(player)}
                      className="ck-player-reveal group min-w-0 text-left focus-visible:outline-none"
                      style={{ animationDelay: `${Math.min(420, index * 35)}ms` }}
                    >
                      <span className="ck-player-card relative block aspect-[4/3] overflow-hidden rounded-lg border border-white/[0.09] bg-[radial-gradient(ellipse_at_50%_34%,#1a3b70_0%,#0d2247_42%,#071222_100%)] shadow-[0_14px_34px_-22px_rgb(0_0_0/0.9)]">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 opacity-60"
                          style={{
                            backgroundImage:
                              "linear-gradient(115deg, transparent 0 47%, rgba(143,180,236,0.12) 47.2% 47.8%, transparent 48% 100%), linear-gradient(72deg, transparent 0 68%, rgba(217,175,107,0.1) 68.2% 68.8%, transparent 69% 100%)",
                          }}
                        />
                        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#040b17]/85 to-transparent" />
                        <PlayerPortrait player={player} fallback={iccPhotos[playerNameKey(player.name)] ?? null} />
                        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/35 px-1.5 py-0.5 font-f1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#b9d7ff] backdrop-blur-sm">
                          IND
                        </span>
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 bg-gradient-to-r from-[#1d509e] via-[#8fb4ec] to-[#d9af6b] transition-transform duration-500 group-hover:scale-x-100 group-focus-visible:scale-x-100" />
                      </span>
                      <span className="mt-2 block min-w-0">
                        <span className="block truncate text-[14px] font-normal leading-snug text-white transition-colors group-hover:text-[#d7e6ff]">
                          {player.name}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-white/40">
                          <span className="truncate">{player.role}</span>
                          <span className="shrink-0 font-semibold uppercase tracking-[0.1em] text-[#8fb4ec]/80">
                            {player.grade ? `Grade ${player.grade}` : "Uncapped"}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Modal open={Boolean(selected)} onClose={close} labelledBy={titleId} size="md">
        {selected && (
          <div>
            <div className="flex flex-wrap items-start gap-4">
              <PlayerAvatar
                player={selected}
                fallbackImageUrl={iccPhotos[playerNameKey(selected.name)] ?? null}
                size={84}
                className="rounded-2xl"
              />
              <div className="min-w-0 flex-1">
                <h3 id={titleId} className="font-f1 text-xl font-bold uppercase leading-none tracking-wide text-white">
                  {selected.name}
                </h3>
                <p className="mt-1.5 flex items-center gap-2 text-[14px] font-normal text-[#8fb4ec]">
                  <BoardLogo team={{ name: "India", abbreviation: "IND" }} size="sm" />
                  {selected.role}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.grade && (
                    <span className="rounded-md border border-[#d9af6b]/30 bg-[#d9af6b]/10 px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#d9af6b]">
                      Grade {selected.grade}
                    </span>
                  )}
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/45">
                    {selected.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Born", facts?.born],
                ["Batting", facts?.battingStyle ?? selected.style],
                ["Bowling", facts?.bowlingStyle],
                ["Debut", facts?.debut],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</p>
                  <p className={`mt-0.5 text-[13px] font-normal ${value ? "text-white/80" : "text-white/25"}`}>
                    {value ?? "—"}
                  </p>
                </div>
              ))}
            </div>

            {loading && (
              <div className="mt-3 h-12 animate-pulse rounded-lg bg-white/[0.04]" aria-label="Loading player details" />
            )}
            {failed && (
              <p className="mt-3 text-[13px] text-white/40">Profile details unavailable.</p>
            )}

            {stats && (hasBat || hasBowl) && (
              <div className="mt-4 space-y-2.5 border-t border-white/[0.07] pt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-f1 text-[13px] font-bold uppercase tracking-[0.08em] text-white">
                    Signature numbers
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-white/25">
                    BCCI career
                  </span>
                </div>

                {hasBat && batting && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb4ec]">
                      Batting
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                      {[
                        ["Mat", formatNumber(batting.matches)],
                        ["Runs", formatNumber(batting.runs)],
                        ["Ave", batting.average?.toFixed(2) ?? "—"],
                        ["SR", batting.strikeRate?.toFixed(1) ?? "—"],
                        ["HS", batting.highScore ?? "—"],
                        ["100s", formatNumber(batting.hundreds)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">{label}</p>
                          <p className="mt-0.5 font-f1 text-[15px] font-bold leading-none tabular-nums text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasBowl && bowling && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d9af6b]">
                      Bowling
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                      {[
                        ["Wkts", formatNumber(bowling.wickets)],
                        ["Ave", bowling.average?.toFixed(2) ?? "—"],
                        ["Econ", bowling.economy?.toFixed(2) ?? "—"],
                        ["Best", bowling.best ?? "—"],
                        ["5W", formatNumber(bowling.fiveWickets)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">{label}</p>
                          <p className="mt-0.5 font-f1 text-[15px] font-bold leading-none tabular-nums text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
