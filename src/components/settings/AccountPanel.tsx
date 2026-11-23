"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DevicesIcon, UserIcon } from "@/components/account/icons";
import {
  avatarUrlFor,
  displayNameFor,
  useAuth,
} from "@/components/auth/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// ---------------------------------------------------------------------------
// Signed-in account section.
//
// Profile and Devices. Google and email are the supported sign-in methods;
// account sessions come from Supabase's browser client.
// ---------------------------------------------------------------------------

const INPUT =
  "nm-inset w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/20";
const GREEN =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-strong disabled:opacity-50";
const RED =
  "rounded-lg bg-rose-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50";
const QUIET =
  "rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50";

function AccountBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-28">
      <header className="mb-3 mt-1">
        <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 hidden text-[13px] text-muted sm:block">{description}</p>
        )}
      </header>
      <div className="space-y-2.5 lg:space-y-3">{children}</div>
    </section>
  );
}

function AccountRow({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="nm-raise-sm flex flex-col gap-2.5 rounded-xl px-3.5 py-3 sm:px-4 sm:py-4 md:flex-row md:items-center md:gap-4 md:px-5 md:py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground sm:text-sm">{title}</div>
        {description && (
          <div className="mt-1 text-[11px] leading-relaxed text-muted sm:text-xs">
            {description}
          </div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function formatWhen(value: string | undefined): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function browserLabel(): string {
  if (typeof navigator === "undefined") return "This browser";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const platform = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return platform ? `${browser} on ${platform}` : browser;
}

export default function AccountPanel() {
  const { user, refreshUser, signOut } = useAuth();
  const configured = isSupabaseConfigured();
  const email = user?.email ?? "";
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const metadata = user.user_metadata ?? {};
    setUsername(
      typeof metadata.username === "string"
        ? metadata.username
        : displayNameFor(user)
    );
    setAvatar(avatarUrlFor(user) ?? "");
    setAvatarFailed(false);
    setProfileMessage(null);
  }, [user]);

  useEffect(() => {
    if (!user || !configured) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  }, [user, configured]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileMessage(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setProfileMessage("Accounts aren't enabled on this deployment.");
      return;
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length > 32) {
      setProfileMessage("Usernames can be at most 32 characters.");
      return;
    }
    setProfileBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          username: cleanUsername || null,
          avatar_url: avatar.trim() || null,
        },
      });
      if (error) {
        setProfileMessage("Couldn't save your profile. Try again.");
        return;
      }
      await refreshUser();
      setProfileMessage("Profile saved.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function signOutOthers() {
    if (!window.confirm("Sign out of every other device?")) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setDeviceBusy(true);
    setDeviceMessage(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      setDeviceMessage(
        error ? "Couldn't sign out the other devices. Try again." : "Other devices signed out."
      );
    } finally {
      setDeviceBusy(false);
    }
  }

  const preview = avatar.trim();
  const initial = (username.trim() || email || "?").slice(0, 1).toUpperCase();

  return (
    <section id="account" className="scroll-mt-28">
      <header className="mb-3.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Account
        </h2>
        <p className="mt-0.5 hidden text-[13px] text-muted sm:block">
          Your profile and the devices you&apos;re signed in on.
        </p>
      </header>

      <div className="space-y-7">
        <AccountBlock title="Profile" description="How you appear across the site.">
          <form
            onSubmit={saveProfile}
            className="grid items-start gap-5 rounded-xl border border-white/[0.08] bg-card/40 p-5 md:grid-cols-[120px_1fr]"
          >
            <div className="flex flex-col items-center gap-2">
              {preview && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  className="h-28 w-28 rounded-2xl object-cover ring-2 ring-white/10"
                />
              ) : (
                <div className="grid h-28 w-28 place-items-center rounded-2xl bg-accent text-4xl font-bold text-white ring-2 ring-white/10">
                  {initial}
                </div>
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Avatar preview
              </span>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] text-muted">Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  maxLength={32}
                  placeholder="cooluser"
                  className={`mt-1 ${INPUT}`}
                />
                <span className="mt-1 block text-[10px] text-muted/70">
                  1–32 chars · letters, numbers, spaces, _ . -
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Avatar URL</span>
                <input
                  value={avatar}
                  onChange={(event) => {
                    setAvatar(event.target.value);
                    setAvatarFailed(false);
                  }}
                  placeholder="https://i.imgur.com/yourpfp.png"
                  className={`mt-1 ${INPUT}`}
                />
                <span className="mt-1 block text-[10px] text-muted/70">
                  Paste a direct image URL ending in .png/.jpg/.webp/.gif (we don&apos;t host images).
                </span>
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={profileBusy} className={GREEN}>
                  {profileBusy ? "Saving…" : "Save changes"}
                </button>
                {profileMessage && (
                  <span
                    className={`text-xs ${
                      profileMessage === "Profile saved." ? "text-primary" : "text-rose-300"
                    }`}
                  >
                    {profileMessage}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted/70">{email}</p>
            </div>
          </form>
        </AccountBlock>

        <AccountBlock
          title="Devices"
          description="Everywhere your account is signed in."
        >
          <AccountRow
            title={
              <span className="flex items-center gap-2">
                <DevicesIcon size={16} className="text-muted" />
                {browserLabel()}
              </span>
            }
            description={
              <>
                This device · current session
                {session?.expires_at
                  ? ` · expires ${formatWhen(new Date(session.expires_at * 1000).toISOString())}`
                  : ""}
              </>
            }
          >
            <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              This device
            </span>
          </AccountRow>

          <AccountRow
            title="Sign out everywhere else"
            description="Keeps you signed in here, signs out every other session."
          >
            <button
              type="button"
              onClick={() => void signOutOthers()}
              disabled={deviceBusy}
              className={RED}
            >
              {deviceBusy ? "Signing out…" : "Sign out others"}
            </button>
          </AccountRow>

          <AccountRow
            title={
              <span className="flex items-center gap-2">
                <UserIcon size={16} className="text-muted" />
                Account session
              </span>
            }
            description={`Last sign-in ${formatWhen(user?.last_sign_in_at ?? undefined)}`}
          >
            <button
              type="button"
              onClick={() => void signOut()}
              className={QUIET}
            >
              Sign out
            </button>
          </AccountRow>
          {deviceMessage && (
            <p className="px-1 text-xs text-primary/80">{deviceMessage}</p>
          )}
        </AccountBlock>
      </div>
    </section>
  );
}
