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

export default function AuthStatus({
  initialEmail,
  initialName = null,
}: {
  initialEmail: string | null;
  initialName?: string | null;
}) {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [name, setName] = useState<string | null>(initialName);
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

    // Reconcile with the live session on mount (the server-seeded value can be
    // stale if the token was refreshed since render).
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
    return (
      <Link href="/login" className="btn-primary h-9 px-4 text-sm">
        Sign in
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
        className={`flex h-9 items-center gap-2 rounded-full border pl-1 pr-2 transition sm:pr-2.5 ${
          open
            ? "border-accent/50 bg-surface"
            : "border-border bg-surface/70 hover:border-accent/40"
        }`}
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent ring-1 ring-inset ring-accent/30"
        >
          {initial(name, email)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm font-medium text-text sm:inline">
          {label}
        </span>
        <ChevronRightIcon
          size={13}
          className={`hidden shrink-0 text-muted transition sm:block ${
            open ? "-rotate-90" : "rotate-90"
          }`}
        />
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
