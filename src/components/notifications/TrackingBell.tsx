"use client";

import { BellIcon } from "@/components/library/icons";
import { usePopover } from "@/lib/use-popover";
import NotificationsPreview from "./NotificationsPreview";
import { useTrackingNotifications } from "./use-tracking-notifications";

/**
 * Navbar bell. Opens the compact notification preview; the preview's
 * "View all notifications" link is the only route to the full page.
 */
export default function TrackingBell() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    reload,
    trackedCount,
    dismissNotification,
    clearAll,
  } = useTrackingNotifications();
  const { open, rootRef, triggerRef, toggle, close } = usePopover();

  return (
    <div ref={rootRef} className="red-accent relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications — ${unreadCount} unread`
            : "Notifications"
        }
        title="Notifications"
        className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/80 transition hover:bg-white/5 hover:text-white min-[360px]:h-9 min-[360px]:w-9 sm:h-10 sm:w-10 ${
          open ? "bg-white/10 text-white" : ""
        }`}
      >
        <BellIcon size={21} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-ink ring-2 ring-[rgb(12_13_14)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="nm-glass rh-pop rh-pop-right absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh_-_5rem)] w-[min(352px,calc(100vw_-_3rem))] max-w-[calc(100vw_-_1.5rem)] overflow-y-auto overscroll-contain rounded-2xl p-2 max-sm:right-[-2.875rem]"
        >
          <NotificationsPreview
            notifications={notifications}
            trackedCount={trackedCount}
            loading={loading}
            error={error}
            onRetry={reload}
            onBack={() => close(true)}
            onNavigate={close}
            onDismiss={dismissNotification}
            onClearAll={clearAll}
            surface="bell"
            backLabel="Close notifications preview"
          />
        </div>
      )}
    </div>
  );
}
