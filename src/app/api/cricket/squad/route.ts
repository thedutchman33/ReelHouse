import { NextResponse } from "next/server";
import type { Gender, MatchFormat, MatchSquad, MatchSquadsData } from "@/lib/cricket/types";
import {
  fetchBcciMatchSquads,
  fetchBcciPlayers,
  fetchBcciSquads,
  isBcciGid,
} from "@/lib/cricket/providers/bcci";
import { fetchIccIndianPlayerPhotos } from "@/lib/cricket/providers/icc-players";
import { fetchIccPlayerPhotos } from "@/lib/cricket/providers/icc-rankings";
import { playerNameKey } from "@/lib/cricket/shared";
import {
  fetchTourSquads,
  squadTeamName,
} from "@/lib/cricket/providers/wikipedia-squads";

function roleLabel(value: string | undefined): string {
  const role = value?.trim().toLowerCase() ?? "";
  if (role.includes("wicket")) return "Wicketkeeper";
  if (role.includes("all")) return "All-rounder";
  if (role.includes("bowl")) return "Bowler";
  if (role.includes("bat")) return "Batter";
  return value?.trim() || "";
}

const cleanName = (value: string) =>
  value.replace(/[^\p{L} .()\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);

const cleanFormat = (value: string): MatchFormat | null =>
  value === "Test" || value === "ODI" || value === "T20I" ? value : null;

const teamKey = (value: string) => value.replace(/\s+Women$/i, "").trim().toLowerCase();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gid = searchParams.get("gid")?.trim() ?? "";
  const gender: Gender = searchParams.get("gender") === "women" ? "women" : "men";
  const home = cleanName(searchParams.get("home") ?? "");
  const away = cleanName(searchParams.get("away") ?? "");
  const date = searchParams.get("date") ?? "";
  const format = cleanFormat(searchParams.get("format") ?? "");
  if (!isBcciGid(gid)) {
    return NextResponse.json({ error: "bad_match" }, { status: 400 });
  }

  try {
    const { teams, awaitingToss } = await fetchBcciMatchSquads(gid);
    const squads: MatchSquad[] = teams.map((team) => ({
      teamId: team.team_id,
      teamName: team.name,
      teamCode: team.abbreviation ?? team.name.slice(0, 3).toUpperCase(),
      source: (team.player ?? []).length ? "xi" : "squad",
      players: (team.player ?? [])
        .slice()
        .sort((a, b) => Number(a.is_captain ? -1 : 0) - Number(b.is_captain ? -1 : 0))
        .map((player) => ({
          playerId: player.player_id ?? null,
          name: player.known_as || player.name,
          role: roleLabel(player.player_role),
          captain: player.is_captain === "1",
          viceCaptain: false,
          wicketkeeper: player.is_keeper === "1",
        })),
    }));

    // Before the toss BCCI has no XI. Prefer the announced tour squads (both
    // boards' lists, cited on the tour article); fall back to BCCI's own
    // national squad for India when no announcement can be read.
    if (awaitingToss) {
      const announced =
        home && away && date
          ? await fetchTourSquads({ home, away, date }).catch(() => [])
          : [];

      if (announced.length && format) {
        for (const squad of squads) {
          const match = announced.find((entry) => {
            if (entry.format !== format) return false;
            const name = squadTeamName(entry.teamCode);
            return name !== null && teamKey(name) === teamKey(squad.teamName);
          });
          if (!match) continue;
          squad.source = "squad";
          squad.players = match.players.map((player) => ({
            playerId: null,
            name: player.name,
            role: "",
            captain: player.captain,
            viceCaptain: player.viceCaptain,
            wicketkeeper: player.wicketkeeper,
          }));
        }
      }

      const fallback = await fetchBcciSquads(gender).catch(() => []);
      const india = squads.find((squad) =>
        gender === "women" ? /^india women$/i.test(squad.teamName) : /^india$/i.test(squad.teamName)
      );
      if (india && india.players.length === 0 && fallback.length) {
        india.source = "national";
        india.players = fallback;
      }
    }

    // An announced squad comes from the tour article without BCCI ids, so the
    // client has no portrait to build. Resolve those names against the board's
    // directory (India) and ICC's player feed (both sides) so the calendar's
    // squad card shows faces instead of initials.
    if (squads.some((squad) => squad.players.some((player) => !player.playerId))) {
      const [directory, registered, iccPhotos] = await Promise.all([
        fetchBcciPlayers(gender).catch(() => []),
        fetchIccIndianPlayerPhotos().catch(() => new Map<string, string>()),
        fetchIccPlayerPhotos().catch(() => new Map<string, string>()),
      ]);
      const boardPhotos = new Map(
        directory.flatMap((player) =>
          player.imageUrl ? [[playerNameKey(player.name), player.imageUrl] as const] : []
        )
      );
      for (const squad of squads) {
        const india =
          gender === "women" ? /^india women$/i.test(squad.teamName) : /^india$/i.test(squad.teamName);
        for (const player of squad.players) {
          const key = playerNameKey(player.name);
          // BCCI's asset is sharper, but it 404s for players without a squad
          // portrait; the ICC headshot is then tried on the image error.
          const alternate =
            (india ? registered.get(key) : undefined) ?? iccPhotos.get(key) ?? null;
          const primary = (india ? boardPhotos.get(key) : undefined) ?? alternate;
          player.imageUrl = primary;
          player.fallbackImageUrl = alternate && alternate !== primary ? alternate : null;
        }
      }
    }

    const payload: MatchSquadsData = { gid, squads, awaitingToss };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" },
    });
  } catch {
    return NextResponse.json(
      { error: "squads_unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
