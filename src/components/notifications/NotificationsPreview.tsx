"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BellIcon, ChevronLeftIcon, XIcon } from "@/components/library/icons";
import { logTrackingEvent } from "@/lib/library";
import NotificationArtwork from "./NotificationArtwork";
import { markNotificationsRead } from "@/lib/notification-reads";
import type { TrackingNotification } from "@/lib/tracking";

const PREVIEW_LIMIT = 5;

/** "Thursday, Nov 27" — both the weekday and the calendar date. */
function dayAndDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

interface NotificationsPreviewProps {
  notifications: TrackingNotification[];
  trackedCount: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  onNavigate: () => void;
  onDismiss: (key: string) => void;
  onClearAll: () => void;
  surface: "bell" | "account";
  backLabel: string;
}

/**
 * Compact notification panel shared by the navbar bell and the account menu.
 * Its only path to the full page is the "View all notifications" footer link.
 */
export default function NotificationsPreview({
  notifications,
  trackedCount,
  loading,
  error,
  onRetry,
  onBack,
  onNavigate,
  onDismiss,
  onClearAll,
  surface,
  backLabel,
}: NotificationsPreviewProps) {
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    logTrackingEvent({
      eventType: "notification_open",
      metadata: { surface },
    });
  }, [surface]);

  useEffect(() => {
    if (loading) return;
    markNotificationsRead(notifications.map((item) => item.key));
  }, [loading, notifications]);

  const visible = notifications.slice(0, PREVIEW_LIMIT);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
        <button
          type="button"
          data-notifications-back
          onClick={onBack}
          aria-label={backLabel}
          className="-ml-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ChevronLeftIcon size={17} />
        </button>
        <h2 className="text-[15px] font-bold leading-none text-white">Notifications</h2>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="mx-1 h-px bg-white/[0.08]" />

      {error && visible.length === 0 ? (
        <div className="px-3 py-5 text-center">
          <p className="text-[13px] font-medium text-white/80">
            Couldn&apos;t load alerts
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-[12px] font-semibold text-accent transition hover:text-accent/80"
          >
            Try again
          </button>
        </div>
      ) : loading && visible.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12.5px] text-white/45">
          Checking your shows…
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <BellIcon size={20} className="mx-auto text-white/25" />
          <p className="mt-2 text-[13px] font-semibold text-white/80">
            {trackedCount === 0 ? "No followed shows yet" : "You're all caught up"}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-white/40">
            {trackedCount === 0
              ? "Follow a show, or wait for an F1 or cricket live window to open."
              : "Release-day episodes and live F1/cricket alerts will appear here."}
          </p>
        </div>
      ) : (
        <div className="rh-stagger max-h-[min(60vh,430px)] overflow-y-auto overscroll-contain pt-1">
          {visible.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-2 rounded-lg pr-1 transition hover:bg-white/[0.04]"
            >
              <Link
                href={item.href}
                onClick={() => {
                  logTrackingEvent({
                    eventType: "notification_click",
                    mediaId: item.mediaId,
                    metadata: { key: item.key, surface, kind: item.kind, sport: item.sport },
                  });
                  onNavigate();
                }}
                className="flex min-w-0 flex-1 items-start gap-4 rounded-lg px-3 py-2.5"
              >
                <NotificationArtwork
                  item={item}
                  className="h-12 w-8 overflow-hidden rounded-[4px]"
                  sizes="32px"
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold leading-snug text-white">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-white/55">
                    {item.body}
                  </p>
                  <p className="mt-1 text-[12px] font-medium leading-none text-white/40">
                    {item.kind === "live" ? "Live now" : dayAndDate(item.date)}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => onDismiss(item.key)}
                aria-label={`Dismiss notification for ${item.media?.title ?? item.title}`}
                title="Dismiss"
                className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/30 transition hover:bg-white/[0.06] hover:text-white"
              >
                <XIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mx-1 mt-1 border-t border-white/[0.08] px-2 pb-1 pt-3 text-center">
        <Link
          href="/notifications"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent transition hover:text-accent/80"
        >
          View all notifications
          <span aria-hidden="true" className="text-[15px] leading-none">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
