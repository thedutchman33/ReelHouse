"use client";

import { useCallback, useMemo } from "react";
import { useHistory, useTracked } from "@/lib/library";
import { monthKey } from "@/lib/calendar";
import { useLiveAlerts } from "@/lib/live-alerts";
import {
  buildTrackingNotifications,
  MAX_TRACKED_CALENDAR_IDS,
  trackedTmdbIds,
} from "@/lib/tracking";
import {
  dismissNotifications,
  isNotificationDismissed,
  isNotificationRead,
  markNotificationsRead,
  useNotificationDismissVersion,
  useNotificationReadVersion,
} from "@/lib/notification-reads";
import { useTrackingUpcoming } from "./use-tracking-upcoming";

export function useTrackingNotifications() {
  const tracked = useTracked();
  const history = useHistory();
  const ids = useMemo(() => trackedTmdbIds(tracked), [tracked]);
  const { shows, loading, error, reload, truncated } = useTrackingUpcoming(
    ids,
    monthKey()
  );
  const readVersion = useNotificationReadVersion();
  const dismissedVersion = useNotificationDismissVersion();
  const liveAlerts = useLiveAlerts();

  const notifications = useMemo(() => {
    void dismissedVersion;
    const releases = buildTrackingNotifications({
      entries: tracked,
      shows,
      progress: history.map((entry) => ({
        mediaId: entry.media.id,
        updatedAt: entry.updatedAt,
        episode: entry.episode,
      })),
    });
    return [...liveAlerts, ...releases].filter(
      (item) => !isNotificationDismissed(item.key)
    );
  }, [tracked, shows, history, dismissedVersion, liveAlerts]);

  const unreadCount = useMemo(() => {
    void readVersion;
    return notifications.filter((item) => !isNotificationRead(item.key)).length;
  }, [notifications, readVersion]);

  const markAllRead = useCallback(() => {
    markNotificationsRead(notifications.map((item) => item.key));
  }, [notifications]);

  const dismissNotification = useCallback((key: string) => {
    dismissNotifications([key]);
  }, []);

  const clearAll = useCallback(() => {
    dismissNotifications(notifications.map((item) => item.key));
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    reload,
    truncated: truncated || tracked.length > MAX_TRACKED_CALENDAR_IDS,
    ids,
    trackedCount: tracked.length,
    markAllRead,
    dismissNotification,
    clearAll,
  };
}
