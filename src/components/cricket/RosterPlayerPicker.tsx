"use client";

import { useMemo } from "react";
import type { CricketPlayer } from "@/lib/cricket/types";
import type { StatsPlayerSummary } from "@/lib/cricket/stats-types";
import { iccPortraitUrl, teamJerseyColour } from "@/lib/cricket/shared";
import PlayerPicker from "./PlayerPicker";

export default function RosterPlayerPicker({
  label,
  value,
  players,
  onChange,
  placeholder,
  accent,
  hideLabel,
}: {
  label: string;
  value: number | null;
  players: StatsPlayerSummary[];
  onChange: (index: number) => void;
  placeholder?: string;
  accent?: string;
  hideLabel?: boolean;
}) {
  const options = useMemo<CricketPlayer[]>(
    () =>
      players.map((player) => ({
        id: String(player.index),
        name: player.name,
        slug: player.id,
        gender: player.gender,
        role: player.role,
        grade: null,
        style: null,
        imageUrl: iccPortraitUrl(player.iccId),
        accent: teamJerseyColour(player.team),
        active: true,
      })),
    [players]
  );

  return (
    <PlayerPicker
      label={label}
      value={value == null ? "" : String(value)}
      players={options}
      onChange={(next) => onChange(Number(next))}
      placeholder={placeholder}
      accent={accent}
      hideLabel={hideLabel}
    />
  );
}
