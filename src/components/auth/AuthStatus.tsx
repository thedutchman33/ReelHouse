"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  BookOpenIcon,
  ChevronDownIcon,
  DevicesIcon,
  GaugeIcon,
  GlobeIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/account/icons";
import { displayNameFor, avatarUrlFor, useAuth } from "@/components/auth/AuthProvider";
import Flag from "@/components/account/Flag";
import { QUALITY_MODES, languageOption, useSettings, updateSettings } from "@/lib/preferences";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";

// ---------------------------------------------------------------------------
// Reference account control.
//
// Signed out, the person icon opens the same menu as 7reels: Sign in, Settings,
// Themes, Language, the quality switch, Notifications and Help. Signed in, the
// top of the menu becomes the profile summary and the same destinations remain,
// with the account shortcuts and Sign out.
// ---------------------------------------------------------------------------

const itemClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.05] hover:text-white";

const QUALITY_HINTS: Record<string, string> = {
  hd: "Full-resolution images",
  default: "Balanced image quality",
  performance: "Lower data usage",
  auto: "Adapts to your connection",
};

export default function AuthStatus() {
  const { user, ready, openAuth, signOut, accountMenuSignal } = useAuth();
  const { quality, language } = useSettings();
  const { open, rootRef, triggerRef, toggle, close, setOpen } = usePopover();
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"root" | "notifications">("root");
  const [busy, setBusy] = useState(false);
  const handledMenuSignal = useRef(accountMenuSignal);

  useEffect(() => {
    if (!user || accountMenuSignal === handledMenuSignal.current) return;
    handledMenuSignal.current = accountMenuSignal;
    setOpen(true);
  }, [user, accountMenuSignal, setOpen]);

  useEffect(() => {
    if (!open) {
      setView("root");
      return;
    }
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, view]);

  const label = displayNameFor(user);
  const avatar = avatarUrlFor(user);
  const initial = (label || user?.email || "·").slice(0, 1).toUpperCase();
  const currentLanguage = languageOption(language);
  const qualityHint = QUALITY_HINTS[quality] ?? QUALITY_HINTS.auto;

  async function handleSignOut() {
    setBusy(true);
    close();
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={user?.email ?? "Account"}
        className={`inline-flex h-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/5 hover:text-white w-10 ${
          open ? "bg-white/10" : ""
        }`}
      >
        {user ? (
          avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover ring-1 ring-inset ring-white/20"
            />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#10b981] text-[11px] font-bold text-white ring-1 ring-inset ring-white/15">
              {initial}
            </span>
          )
        ) : (
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="nm-glass absolute right-0 top-full z-50 mt-2 w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl p-2"
          onKeyDown={(event) =>
            rovingKeyDown(
              event,
              Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
              )
            )
          }
        >
          {view === "notifications" ? (
            <>
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-2 pb-2 pt-1">
                <button
                  type="button"
                  onClick={() => setView("root")}
                  className="rounded-md p-1 text-white/60 transition hover:bg-white/5 hover:text-white"
                  aria-label="Back to account menu"
                >
                  <ChevronDownIcon size={15} className="rotate-90" />
                </button>
                <p className="text-[13px] font-semibold text-white">Notifications</p>
              </div>
              <div className="px-3 py-8 text-center">
                <BellIcon size={22} className="mx-auto text-white/25" />
                <p className="mt-2 text-[12px] font-medium text-white/70">
                  You&apos;re all caught up
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                  New-release and account notices will appear here.
                </p>
              </div>
            </>
          ) : (
            <>
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-2 pb-3 pt-2">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-inset ring-white/15"
                      />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#10b981] text-base font-bold text-white">
                        {initial}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight text-white">
                        {label}
                      </p>
                      <p
                        className="mt-0.5 truncate text-[11px] leading-tight text-white/45"
                        title={user.email ?? undefined}
                      >
                        {user.email}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-inset ring-white/[0.05]">
                        <ShieldIcon size={10} />
                        Early Tester
                      </span>
                    </div>
                  </div>
                  <div className="mx-2 h-px bg-white/[0.08]" />

                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                    Account
                  </p>
                  <Link
                    href="/settings#account"
                    role="menuitem"
                    onClick={() => close()}
                    className={itemClass}
                  >
                    <DevicesIcon size={15} className="shrink-0 text-white/60" />
                    Devices
                  </Link>
                  <div className="mx-3 my-1.5 h-px bg-white/[0.08]" />
                </>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    openAuth("login");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <ArrowRightIcon size={15} />
                  Sign in
                </button>
              )}

              {!user && <div className="mx-3 h-px bg-white/[0.06]" />}

              <div className="pt-1">
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={() => close()}
                  className={itemClass}
                >
                  <SettingsIcon size={15} className="shrink-0 text-white/60" />
                  Settings
                </Link>
                <Link
                  href="/settings#appearance"
                  role="menuitem"
                  onClick={() => close()}
                  className={itemClass}
                >
                  <PaletteIcon size={15} className="shrink-0 text-white/60" />
                  Themes
                </Link>
                <Link
                  href="/settings#language"
                  role="menuitem"
                  onClick={() => close()}
                  className={itemClass}
                >
                  <GlobeIcon size={15} className="shrink-0 text-white/60" />
                  <span className="flex-1">Language</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                    <Flag cc={currentLanguage.cc} className="h-3.5 w-5" />
                    {currentLanguage.value.toUpperCase()}
                  </span>
                  <ChevronDownIcon size={13} className="text-white/35" />
                </Link>

                <div className="px-3 py-2">
                  <div className="mb-2 flex items-center gap-3 text-[13px] font-medium text-white/85">
                    <GaugeIcon size={15} className="shrink-0 text-white/60" />
                    <span className="flex-1">Quality</span>
                  </div>
                  <div
                    className="nm-inset flex gap-1 rounded-lg p-1"
                    role="group"
                    aria-label="Quality mode"
                  >
                    {["hd", "default", "performance"].map((value) => {
                      const mode = QUALITY_MODES.find((candidate) => candidate.value === value);
                      if (!mode) return null;
                      const active = quality === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateSettings({ quality: mode.value })}
                          className={`nm-tab flex-1 rounded-md px-1 py-1.5 text-[10.5px] font-semibold transition ${
                            active
                              ? "nm-raise text-primary"
                              : "text-white/45 hover:text-white"
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-snug text-white/35">{qualityHint}</p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setView("notifications")}
                  className={itemClass}
                >
                  <BellIcon size={15} className="shrink-0 text-white/60" />
                  Notifications
                </button>
                <Link
                  href="/faq"
                  role="menuitem"
                  onClick={() => close()}
                  className={itemClass}
                >
                  <BookOpenIcon size={15} className="shrink-0 text-white/60" />
                  Help &amp; FAQ
                </Link>
              </div>

              {user && (
                <>
                  <div className="mx-3 my-1 h-px bg-white/[0.08]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-300 transition-colors hover:bg-white/[0.05] hover:text-rose-200 disabled:opacity-60"
                  >
                    <LogOutIcon size={15} className="shrink-0" />
                    {busy ? "Signing out…" : "Sign out"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ready is consumed above through the stable empty trigger; keeping the
          read here documents that a session may still be resolving on mount. */}
      <span className="sr-only" aria-live="polite">
        {ready ? "" : "Checking account…"}
      </span>
    </div>
  );
}
