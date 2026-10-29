"use client";

import { useEffect, useState } from "react";
import type { Gender } from "@/lib/cricket/types";
import type {
  StatsH2HResponse,
  StatsPlayer,
  StatsRoster,
  StatsTeamH2HResponse,
} from "@/lib/cricket/stats-types";

function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(async (response) => {
    if (!response.ok) throw new Error("stats unavailable");
    return (await response.json()) as T;
  });
}

const rosterCache = new Map<Gender, StatsRoster>();
const rosterInflight = new Map<Gender, Promise<StatsRoster>>();

export function useStatsRoster(gender: Gender) {
  const [data, setData] = useState<StatsRoster | null>(() => rosterCache.get(gender) ?? null);
  const [loading, setLoading] = useState(() => !rosterCache.has(gender));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = rosterCache.get(gender);
    if (cached) {
      setData(cached);
      setLoading(false);
      setFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    let request = rosterInflight.get(gender);
    if (!request) {
      const controller = new AbortController();
      request = fetchJson<StatsRoster>(`/api/cricket/stats/roster?gender=${gender}`, controller.signal)
        .then((payload) => {
          rosterCache.set(gender, payload);
          return payload;
        })
        .finally(() => rosterInflight.delete(gender));
      rosterInflight.set(gender, request);
    }
    request
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
  }, [gender]);

  return { data, loading, failed };
}

const playerCache = new Map<number, StatsPlayer>();
const playerInflight = new Map<number, Promise<StatsPlayer>>();

export function useStatsPlayer(index: number | null) {
  const [data, setData] = useState<StatsPlayer | null>(() =>
    index == null ? null : playerCache.get(index) ?? null
  );
  const [loading, setLoading] = useState(index != null && !playerCache.has(index));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (index == null) {
      setData(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const cached = playerCache.get(index);
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
    let request = playerInflight.get(index);
    if (!request) {
      const controller = new AbortController();
      request = fetchJson<{ player: StatsPlayer }>(
        `/api/cricket/stats/player?index=${index}`,
        controller.signal
      )
        .then((payload) => {
          playerCache.set(index, payload.player);
          return payload.player;
        })
        .finally(() => playerInflight.delete(index));
      playerInflight.set(index, request);
    }
    request
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
  }, [index]);

  return { data, loading, failed };
}

export function usePlayerH2H(batter: number | null, bowler: number | null) {
  const [data, setData] = useState<StatsH2HResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (batter == null || bowler == null || batter === bowler) {
      setData(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetchJson<StatsH2HResponse>(
      `/api/cricket/stats/h2h?batter=${batter}&bowler=${bowler}`,
      controller.signal
    )
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [batter, bowler]);

  return { data, loading, failed };
}

export function useTeamH2H(teamA: string, teamB: string) {
  const [data, setData] = useState<StatsTeamH2HResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!teamA || !teamB || teamA === teamB) {
      setData(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetchJson<StatsTeamH2HResponse>(
      `/api/cricket/stats/team-h2h?a=${encodeURIComponent(teamA)}&b=${encodeURIComponent(teamB)}`,
      controller.signal
    )
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamA, teamB]);

  return { data, loading, failed };
}
