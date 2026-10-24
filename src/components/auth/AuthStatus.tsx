"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "@/components/player/icons";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";

// ---------------------------------------------------------------------------
// Navbar account control.
//
// Seeded from the server (initialEmail / initialName) to avoid a flash, then kept
// in sync with the browser session via onAuthStateChange.
//
// The trigger shows an avatar + display name only: the address never appears in
// the navbar itself, where it would sit permanently on screen (and in every
// screenshot / screen-share). It is inside the menu, which the viewer opens
// deliberately.
//
// Every item here is a destination that actually exists. There is no profile or
// settings page in Reelhouse, so this menu does not pretend otherwise.
//
// Renders NOTHING when Supabase is not configured, so "local mode" looks exactly
// like Phase 1 (no accounts, no sign-in affordance).
// ---------------------------------------------------------------------------

/** Display name from Supabase user metadata, else a neutral label. */
function displayName(name: string | null): string {
  return name?.trim() || "Account";
}

/** Single initial for the avatar — name first, then the address, else a dot. */
function initial(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  return source.slice(0, 1).toUpperCase() || "·";
}

function metadataName(metadata: Record<string, unknown> | undefined): string | null {
  const value = metadata?.full_name ?? metadata?.name;
  return typeof value === "string" && value.trim() ? value : null;
}

const MENU_LINKS = [
  { href: "/my-list", label: "My List" },
  { href: "/my-list#history", label: "Watch History" },
];

export default function AuthStatus() {
  const configured = isSupabaseConfigured();
  // Session state comes entirely from the browser client (see the effect
  // below): the root layout no longer reads cookies server-side, which is
  // what lets every page render statically from the CDN. A signed-in viewer
  // may see the bare person icon for one hydration frame — a fair trade for
  // CDN-cached pages.
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { open, rootRef, triggerRef, toggle, close, setOpen } = usePopover();
  const menuRef = useRef<HTMLDivElement>(null);

  // Keyboard opens land on the first item, as a menu button should.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!configured) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    // Seed + reconcile with the live session on mount.
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setName(metadataName(data.user?.user_metadata));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setName(metadataName(session?.user?.user_metadata));
    });
    return () => subscription.unsubscribe();
  }, [configured]);

  if (!configured) return null;

  async function handleSignOut() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    close();
    await supabase.auth.signOut();
    setBusy(false);
    // Re-render server components so any user-scoped data clears.
    router.refresh();
  }

  if (!email) {
    // Bare icon trigger (reference navbar shows only a person glyph).
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className="grid h-10 w-10 place-items-center rounded-lg text-white/80 transition hover:bg-white/5 hover:text-white"
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" strokeLinecap="round" />
        </svg>
      </Link>
    );
  }

  const label = displayName(name);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`grid h-10 w-10 place-items-center rounded-lg transition ${
          open ? "bg-white/10" : "hover:bg-white/5"
        }`}
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent ring-1 ring-inset ring-accent/30"
        >
          {initial(name, email)}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="panel absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)]"
          role="menu"
          aria-label="Account"
          onKeyDown={(e) =>
            rovingKeyDown(
              e,
              Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
              )
            )
          }
        >
          {/* The address lives here, one deliberate click away. */}
          <div className="border-b border-border/70 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-text">{label}</p>
            <p className="truncate text-xs text-muted" title={email}>
              {email}
            </p>
          </div>

          <div className="p-1.5">
            {MENU_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => close()}
                className="menu-item"
              >
                {item.label}
              </Link>
            ))}

            <div className="menu-divider" role="none" />

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={busy}
              className="menu-item text-muted hover:text-danger disabled:opacity-60"
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
