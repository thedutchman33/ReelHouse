"use client";

import { useEffect, useState } from "react";
import type { CricketPlayer, PlayerFacts, PlayerStatsData } from "@/lib/cricket/types";

export interface PlayerProfilePayload {
  gid: string;
  playerId: number | null;
  facts: PlayerFacts | null;
  stats: PlayerStatsData | null;
}

const cache = new Map<string, PlayerProfilePayload>();
const inflight = new Map<string, Promise<PlayerProfilePayload>>();

function keyOf(player: CricketPlayer): string {
  return `${player.id}:${player.playerId ?? ""}`;
}

function load(player: CricketPlayer): Promise<PlayerProfilePayload> {
  const key = keyOf(player);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(key);
  if (existing) return existing;

  const params = new URLSearchParams();
  if (player.id) params.set("gid", player.id);
  if (player.slug) params.set("slug", player.slug);
  if (player.playerId) params.set("playerId", String(player.playerId));

  const request = fetch(`/api/cricket/player?${params.toString()}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("player unavailable");
      const body = (await response.json()) as PlayerProfilePayload;
      cache.set(key, body);
      return body;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

export function usePlayerProfile(player: CricketPlayer | null) {
  const [data, setData] = useState<PlayerProfilePayload | null>(() =>
    player ? cache.get(keyOf(player)) ?? null : null
  );
  const [loading, setLoading] = useState(Boolean(player && !cache.has(keyOf(player))));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!player) {
      setData(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const cached = cache.get(keyOf(player));
    if (cached) {
      setData(cached);
      setLoading(false);
      setFailed(false);
      return;
    }

    let active = true;
    setData(null);
    setLoading(true);
    setFailed(false);
    load(player)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [player]);

  return { data, loading, failed };
}
