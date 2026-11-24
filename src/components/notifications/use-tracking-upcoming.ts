"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTrackingUpcoming } from "@/lib/tracking-client";
import type { TrackedShowStatus } from "@/lib/tracking";

interface State {
  shows: TrackedShowStatus[];
  nextUp: unknown;
  truncated: boolean;
  loading: boolean;
  error: boolean;
}

export function useTrackingUpcoming(ids: number[], month: string) {
  const idsKey = ids.join(",");
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State>({
    shows: [],
    nextUp: null,
    truncated: false,
    loading: ids.length > 0,
    error: false,
  });

  useEffect(() => {
    if (!idsKey) {
      setState({
        shows: [],
        nextUp: null,
        truncated: false,
        loading: false,
        error: false,
      });
      return;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true, error: false }));

    fetchTrackingUpcoming(ids, month, version > 0)
      .then((data) => {
        if (!active) return;
        setState({
          shows: data.shows ?? [],
          nextUp: data.nextUp ?? null,
          truncated: Boolean(data.truncated),
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: true,
        }));
      });

    return () => {
      active = false;
    };
    // idsKey covers the array identity; version powers explicit retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, month, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  return { ...state, reload };
}
