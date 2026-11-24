"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeftIcon,
  BellIcon,
  CalendarDaysIcon,
  SearchIcon,
  XIcon,
} from "@/components/library/icons";
import { logTrackingEvent } from "@/lib/library";
import {
  daysUntil,
  episodeCode,
  episodeWhen,
  type TrackingNotification,
} from "@/lib/tracking";
import { toast } from "@/lib/toast";
import NotificationArtwork from "./NotificationArtwork";
import { useTrackingNotifications } from "./use-tracking-notifications";

function groupFor(item: TrackingNotification): "live" | "today" | "week" | "later" {
  if (item.kind === "live") return "live";
  const diff = daysUntil(item.date);
  if (diff <= 0) return "today";
  if (diff <= 7) return "week";
  return "later";
}

const GROUPS = [
  { key: "live" as const, label: "Live now" },
  { key: "today" as const, label: "Today" },
  { key: "week" as const, label: "This week" },
  { key: "later" as const, label: "Later" },
];

function NotificationCard({
  item,
  onDismiss,
}: {
  item: TrackingNotification;
  onDismiss: (key: string) => void;
}) {
  const isLive = item.kind === "live";
  return (
    <div
      className={`group flex items-center gap-2 rounded-xl border p-2.5 pr-1.5 transition ${
        isLive
          ? "border-accent/30 bg-accent/[0.06] hover:border-accent/45 hover:bg-accent/[0.09]"
          : "border-white/[0.09] bg-white/[0.035] hover:border-white/[0.14] hover:bg-white/[0.06]"
      }`}
    >
      <Link
        href={item.href}
        onClick={() => {
          logTrackingEvent({
            eventType: "notification_click",
            mediaId: item.mediaId,
            metadata: { key: item.key, surface: "page", kind: item.kind, sport: item.sport },
          });
        }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <NotificationArtwork
          item={item}
          className="h-[74px] w-[50px] overflow-hidden rounded-md"
          sizes="50px"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
              {isLive ? "Live" : item.kind === "new" ? "New" : "Upcoming"}
            </span>
            <span className="text-[11px] font-medium text-muted">
              {isLive ? "Live now" : episodeWhen(item.date)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-text">
            {item.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.body}</p>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onDismiss(item.key)}
        aria-label={`Dismiss notification for ${item.media?.title ?? item.title}`}
        title="Dismiss"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/[0.06] hover:text-danger"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const {
    notifications,
    trackedCount,
    loading,
    error,
    reload,
    truncated,
    markAllRead,
    dismissNotification,
    clearAll,
  } = useTrackingNotifications();
  const marked = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      logTrackingEvent({
        eventType: "notification_open",
        metadata: { surface: "page" },
      });
    }
  }, []);

  useEffect(() => {
    if (marked.current || loading) return;
    marked.current = true;
    markAllRead();
  }, [loading, markAllRead]);

  const grouped = useMemo(() => {
    const map = new Map<string, TrackingNotification[]>();
    for (const item of notifications) {
      const key = groupFor(item);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [notifications]);

  const liveCount = notifications.filter((item) => item.kind === "live").length;
  const releaseCount = notifications.length - liveCount;

  return (
    <div className="red-accent w-full px-6 pb-12 pt-24 md:px-16">
      <Link
        href="/my-list"
        className="nm-raise-sm inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-muted transition hover:text-text"
      >
        <ArrowLeftIcon size={16} />
        Back
      </Link>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">
            Your alerts
          </p>
          <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wider text-text md:text-5xl">
            Notifications
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Release-day episodes from series you follow, plus live F1 and
            cricket alerts when a Watch Live window opens. Adding a show
            mid-season doesn&apos;t backfill earlier episodes. Alerts disappear
            once you watch, dismiss, or clear them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/calendar?view=tracking"
            className="btn-ghost h-10 gap-2 px-4 py-0 text-sm"
          >
            <BellIcon size={15} />
            Following
          </Link>
          <Link
            href="/calendar"
            className="btn-ghost h-10 gap-2 px-4 py-0 text-sm"
          >
            <CalendarDaysIcon size={15} />
            Calendar
          </Link>
        </div>
      </div>

      <div className="nm-raise-sm mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Today&apos;s releases
          </p>
          <p className="mt-1 text-sm text-text">
            <span className="font-display text-2xl">{releaseCount}</span>{" "}
            {releaseCount === 1 ? "episode" : "episodes"} released today from{" "}
            <span className="font-semibold">{trackedCount}</span>{" "}
            {trackedCount === 1 ? "show" : "shows"}.
          </p>
        </div>
        {liveCount > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Live channels
            </p>
            <p className="mt-1 text-sm text-text">
              <span className="font-display text-2xl">{liveCount}</span> live{" "}
              now
            </p>
          </div>
        )}
      </div>

      {truncated && (
        <p className="mt-3 text-xs text-muted">
          You follow more than 100 shows — alerts cover your 100 most recent
          follows.
        </p>
      )}

      {trackedCount === 0 && notifications.length === 0 && !loading ? (
        <div className="nm-inset mt-6 rounded-2xl px-6 py-14 text-center md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <BellIcon size={30} className="text-accent" />
            <h2 className="mt-3 text-sm font-semibold text-text">
              Follow a show to get alerts
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tap the bell on any series or anime page. Its schedule appears in
              your calendar, and release-day alerts appear here.
            </p>
            <Link
              href="/calendar?view=tracking"
              className="btn-accent mt-5 h-10 px-5 py-0 text-sm"
            >
              Open Following
            </Link>
          </div>
        </div>
      ) : error && liveCount === 0 ? (
        <div className="nm-inset mt-6 rounded-2xl px-6 py-12 text-center">
          <p className="text-sm font-semibold text-text">
            Couldn&apos;t load your episode alerts
          </p>
          <p className="mt-1 text-sm text-muted">
            Your follows are safe — this is only the schedule request.
          </p>
          <button
            type="button"
            onClick={reload}
            className="btn-ghost mt-4 h-9 px-4 py-0 text-sm"
          >
            Try again
          </button>
        </div>
      ) : loading && liveCount === 0 && notifications.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Checking your shows…</p>
      ) : notifications.length === 0 ? (
        <div className="nm-inset mt-6 rounded-2xl px-6 py-14 text-center md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <BellIcon size={30} className="text-accent" />
            <h2 className="mt-3 text-sm font-semibold text-text">
              Nothing new right now
            </h2>
            <p className="mt-1 text-sm text-muted">
              Release-day episodes and live F1/cricket alerts appear here and
              disappear once you watch, dismiss, or clear them.
            </p>
            <Link
              href="/calendar?view=tracking"
              className="btn-ghost mt-5 h-10 px-5 py-0 text-sm"
            >
              See your following timeline
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {GROUPS.map((group) => {
            const items = grouped.get(group.key) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                  {group.label}
                </h2>
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {items.map((item) => (
                    <NotificationCard
                      key={item.key}
                      item={item}
                      onDismiss={dismissNotification}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/calendar?view=tracking"
          className="btn-ghost h-10 gap-2 px-4 py-0 text-sm"
        >
          <SearchIcon size={15} />
          Manage follows &amp; alerts
        </Link>
        <button
          type="button"
          onClick={() => {
            markAllRead();
            toast("All notifications marked as read.", { tone: "success" });
          }}
          className="btn-ghost h-10 px-4 py-0 text-sm"
        >
          Mark all read
        </button>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearAll();
              toast("Notifications cleared.", { tone: "success" });
            }}
            className="btn-ghost h-10 gap-2 px-4 py-0 text-sm"
          >
            <XIcon size={14} />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
