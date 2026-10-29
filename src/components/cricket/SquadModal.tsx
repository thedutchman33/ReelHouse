"use client";

import { useEffect, useId, useState } from "react";
import type { CricketMatch, Gender, MatchSquadsData } from "@/lib/cricket/types";
import { bcciPlayerImageUrl, formatDate, formatTime } from "@/lib/cricket/shared";
import { Modal, PlayerAvatar } from "./ui";

export default function SquadModal({
  match,
  gender,
  onClose,
}: {
  match: CricketMatch | null;
  gender: Gender;
  onClose: () => void;
}) {
  const titleId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [data, setData] = useState<MatchSquadsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!match) return;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setFailed(false);
    const query = new URLSearchParams({
      gid: match.gid,
      gender,
      home: match.teams[0]?.name ?? "",
      away: match.teams[1]?.name ?? "",
      date: match.date,
      format: match.format,
    });
    fetch(`/api/cricket/squad?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("squads unavailable");
        return (await response.json()) as MatchSquadsData;
      })
      .then((payload) => setData(payload))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [match, gender]);

  return (
    <Modal open={Boolean(match)} onClose={onClose} labelledBy={titleId} eyebrow="Match squads">
      {match && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8fb4ec]">
                {match.format} · {match.series}
              </p>
              <h3 id={titleId} className="mt-1 font-f1 text-[28px] font-bold uppercase leading-none tracking-wide text-white">
                {match.title}
              </h3>
              <p className="mt-1.5 text-[13px] text-white/45">
                {match.venue} · {formatDate(match.date)} · {formatTime(match.date)}
              </p>
            </div>
            <span className="rounded-md border border-[#8fb4ec]/25 bg-[#1d509e]/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#b9d7ff]">
              {data?.awaitingToss ? "Awaiting toss" : "Squad"}
            </span>
          </div>

          {loading && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy="true">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          )}

          {failed && !loading && (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-[13px] text-white/45">
              Squads are not published for this match yet.
            </p>
          )}

          {data && !loading && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.squads.map((squad) => {
                  const team = match.teams.find(
                    (entry) => entry.id === squad.teamId || entry.name === squad.teamName
                  );
                  return (
                  <section
                    key={squad.teamId}
                    className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2">
                      <p className="flex items-center gap-1.5 font-f1 text-[15px] font-bold uppercase tracking-wide text-white">
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#8fb4ec]">
                          {squad.teamCode}
                        </span>
                        {squad.teamName}
                      </p>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-white/30">
                        {squad.source === "xi"
                          ? "Playing XI"
                          : squad.source === "national"
                            ? "National squad"
                            : "Announced squad"}
                      </span>
                    </div>
                    {squad.players.length ? (
                      <ul className="max-h-[280px] space-y-1 overflow-y-auto pr-1 ck-scroll">
                        {squad.players.map((player, index) => (
                          <li
                            key={`${player.name}-${index}`}
                            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                          >
                            <PlayerAvatar
                              player={{
                                name: player.name,
                                imageUrl: player.imageUrl ?? bcciPlayerImageUrl(player.playerId),
                              }}
                              fallbackImageUrl={player.fallbackImageUrl ?? null}
                              colour={team?.primary ?? null}
                              size={26}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">
                              {player.name}
                            </span>
                            {player.captain && (
                              <span className="rounded bg-[#d9af6b]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#d9af6b]">
                                C
                              </span>
                            )}
                            {player.viceCaptain && (
                              <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">
                                VC
                              </span>
                            )}
                            {player.wicketkeeper && (
                              <span className="rounded bg-[#8fb4ec]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8fb4ec]">
                                WK
                              </span>
                            )}
                            <span className="shrink-0 text-[10.5px] uppercase tracking-[0.08em] text-white/30">
                              {player.role}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-1 py-5 text-center text-[12.5px] text-white/35">
                        Announced at the toss.
                      </p>
                    )}
                  </section>
                  );
                })}
              </div>
              {data.awaitingToss && (
                <p className="mt-3 text-[11.5px] leading-relaxed text-white/30">
                  The playing XI is confirmed at the toss. Until then this shows the announced
                  series squads, or the board&apos;s national list where no squad is published.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
