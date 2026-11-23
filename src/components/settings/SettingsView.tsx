"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  HelpIcon,
  MonitorIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/account/icons";
import { SearchIcon } from "@/components/player/icons";
import Flag from "@/components/account/Flag";
import { FeedbackButton } from "@/components/feedback/FeedbackDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  COUNTRIES,
  LANGUAGES,
  QUALITY_MODES,
  countryOption,
  languageOption,
  updateSettings,
  useSettings,
} from "@/lib/preferences";
import {
  clearHistory,
  resetWatchPreferences,
  useContinueWatching,
  useWatchlist,
} from "@/lib/library";
import { usePopover } from "@/lib/use-popover";
import AccountPanel from "./AccountPanel";

const GREEN_BUTTON =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-strong disabled:opacity-50";
const RED_BUTTON =
  "rounded-lg bg-rose-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50";
const QUIET_BUTTON =
  "rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  /** Kept on the call sites for the reference copy; top-level sections are title-only. */
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <header className="mb-3.5">
        {/* The reference's top-level settings sections are title-only; the
            descriptions live inside the nested account cards. */}
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h2>
      </header>
      <div className="space-y-2.5 lg:space-y-3">{children}</div>
    </section>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
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

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-label={label}
      aria-pressed={value}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        value ? "bg-accent" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          value ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

interface Choice {
  value: string;
  label: string;
  sub?: string;
  cc?: string;
}

function ChoiceMenu({
  label,
  value,
  options,
  onChange,
  searchable = false,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const { open, rootRef, triggerRef, toggle, close } = usePopover();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const filtered = options.filter((option) => {
    const haystack = `${option.label} ${option.sub ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="nm-raise-sm nm-tab flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Flag cc={selected?.cc} className="h-5 w-7" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">
              {selected?.label}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted">
              {selected?.sub ?? (selected?.value === "auto" ? "Based on your location" : "")}
            </span>
          </span>
        </span>
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="nm-glass absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl shadow-2xl">
          {searchable && (
            <div className="border-b border-white/[0.08] p-2">
              <div className="relative">
                <SearchIcon
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search language…"
                  aria-label={label}
                  className="nm-inset w-full rounded-lg py-2 pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          )}
          <ul role="listbox" aria-label={label} className="no-scrollbar max-h-72 overflow-y-auto p-1">
            {filtered.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                      active
                        ? "bg-accent/10 text-foreground"
                        : "text-muted hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <Flag cc={option.cc} className="h-5 w-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{option.label}</span>
                      {option.sub && (
                        <span className="block truncate text-[11px] text-muted">
                          {option.sub}
                        </span>
                      )}
                    </span>
                    {active && <CheckIcon size={15} className="shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted">No matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function SettingsView() {
  const { user, ready, openAuth } = useAuth();
  const settings = useSettings();
  const watchlist = useWatchlist();
  const continueWatching = useContinueWatching();
  const [activeSection, setActiveSection] = useState("performance");

  const sectionIds = useMemo(
    () =>
      user
        ? ["account", "performance", "language", "privacy", "help"]
        : ["performance", "language", "privacy", "help"],
    [user]
  );

  useEffect(() => {
    if (!user) {
      setActiveSection("performance");
      return;
    }
    setActiveSection("account");
  }, [user]);

  useEffect(() => {
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const candidate = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (candidate?.target.id) setActiveSection(candidate.target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  const navItems = [
    ...(user
      ? [{ id: "account", label: "Account", icon: <UserIcon size={15} /> }]
      : []),
    { id: "performance", label: "Performance", icon: <MonitorIcon size={15} /> },
    { id: "language", label: "Language", icon: <GlobeIcon size={15} /> },
    { id: "privacy", label: "Privacy", icon: <SettingsIcon size={15} /> },
    { id: "help", label: "Help", icon: <HelpIcon size={15} /> },
  ];

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  const language = languageOption(settings.language);
  const country = countryOption(settings.country);

  if (!ready) {
    return (
      <div className="w-full max-w-[1104px] px-6 pt-[52px] md:px-16">
        <h1 className="font-display text-3xl uppercase tracking-tight text-foreground">
          Settings
        </h1>
        <div className="mt-8 h-64 animate-pulse rounded-2xl bg-surface/40" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1104px] px-6 pb-20 pt-[52px] md:px-16">
      <h1 className="font-display text-3xl uppercase tracking-tight text-foreground">
        Settings
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <aside className="flex min-w-0 flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start">
          <p className="mb-2 hidden px-3 text-[10px] uppercase tracking-[0.18em] text-muted/70 lg:block">
            Settings
          </p>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-card/40 px-2 py-1 lg:flex-col lg:overflow-visible lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollTo(item.id);
                  }}
                  className={`nm-tab group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs lg:py-2 lg:text-sm ${
                    active
                      ? "nm-raise-sm text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span
                    className={`shrink-0 ${
                      active ? "text-foreground" : "text-muted/70 group-hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

        </aside>

        <div className="min-w-0 space-y-8 lg:space-y-14">
          {user ? (
            <AccountPanel />
          ) : (
            <Section id="signin" title="Sign in">
              <Row title="Not signed in">
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className={GREEN_BUTTON}
                >
                  Sign in
                </button>
              </Row>
            </Section>
          )}

          <Section
            id="performance"
            title="Performance"
            description="One switch for speed vs. sharpness — sets image quality and effects together."
          >
            <div className="nm-glass rounded-2xl p-4">
              <div
                className="nm-inset grid grid-cols-4 gap-1.5 rounded-xl p-1"
                role="group"
                aria-label="Performance mode"
              >
                {QUALITY_MODES.map((mode) => {
                  const active = settings.quality === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateSettings({ quality: mode.value })}
                      className={`nm-tab flex flex-col items-center gap-0.5 rounded-lg px-2 py-2.5 font-semibold ${
                        active
                          ? "nm-raise text-primary"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm">{mode.label}</span>
                      <span
                        className={`text-[10px] font-medium ${
                          active ? "text-primary/70" : "text-muted"
                        }`}
                      >
                        {mode.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section
            id="language"
            title="Language"
            description="Beta — interface language and region. The catalog itself stays the same."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Language
                </p>
                <ChoiceMenu
                  label="Language"
                  value={settings.language}
                  searchable
                  options={LANGUAGES.map((option) => ({
                    value: option.value,
                    label: option.label,
                    sub: option.native,
                    cc: option.cc,
                  }))}
                  onChange={(value) => updateSettings({ language: value })}
                />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Country / Region
                </p>
                <ChoiceMenu
                  label="Country or region"
                  value={settings.country}
                  options={COUNTRIES.map((option) => ({
                    value: option.value,
                    label: option.label,
                    sub:
                      option.value === "auto"
                        ? "Based on your location"
                        : "Region preference",
                    cc: option.cc,
                  }))}
                  onChange={(value) => updateSettings({ country: value })}
                />
              </div>
            </div>
            <p className="sr-only">
              Selected {language.native} and {country.label}.
            </p>
          </Section>

          <Section
            id="privacy"
            title="Privacy & data"
            description="Control what we keep on this browser."
          >
            <Row
              title="Save watch history"
              description="Remembers what you watched so 'Continue watching' can show across devices."
            >
              <Toggle
                value={settings.saveHistory}
                onChange={(value) => updateSettings({ saveHistory: value })}
                label="Save watch history"
              />
            </Row>
            <Row
              title="Hide mature content"
              description="Filter adult and softcore titles out of rows, search results and recommendations on this browser."
            >
              <Toggle
                value={settings.hideMature}
                onChange={(value) => updateSettings({ hideMature: value })}
                label="Hide mature content"
              />
            </Row>
            <Row
              title="Continue watching"
              description={`${continueWatching.length} ${
                continueWatching.length === 1 ? "title" : "titles"
              } stored on this device.`}
            >
              <button
                type="button"
                disabled={continueWatching.length === 0}
                onClick={() => {
                  if (window.confirm("Clear all continue-watching items?")) clearHistory();
                }}
                className={RED_BUTTON}
              >
                Clear
              </button>
            </Row>
            <Row
              title="My List"
              description={`${watchlist.length} ${
                watchlist.length === 1 ? "title" : "titles"
              } saved.`}
            >
              <Link href="/my-list" className={QUIET_BUTTON}>
                Open
              </Link>
            </Row>
            <Row
              title="Reset watch preferences"
              description="Clears your taste DNA, every view/like/dislike signal, and personalised home rows. Recommendations restart from scratch."
            >
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset all watch preferences? Your local watch history and rating signals will be permanently deleted."
                    )
                  ) {
                    resetWatchPreferences();
                  }
                }}
                className={RED_BUTTON}
              >
                Reset
              </button>
            </Row>
          </Section>

          <Section
            id="help"
            title="Help & feedback"
            description="Quick links into the help center, plus a direct line to us."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["FAQ index", "/faq"],
                ["Content source", "/faq"],
                ["Search availability", "/faq"],
                ["Playback issues", "/faq"],
                ["Important notice", "/faq"],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="nm-raise-sm nm-tab rounded-lg px-4 py-3 text-sm text-muted hover:text-foreground"
                >
                  {label} →
                </Link>
              ))}
            </div>
            <Row
              title="Send feedback"
              description="Tell us what to fix or improve. Your feedback goes directly to the Reelhouse team."
            >
              <FeedbackButton className={GREEN_BUTTON}>Write feedback</FeedbackButton>
            </Row>
          </Section>

          <Section
            id="appearance"
            title="Themes"
            description="Reelhouse's cinematic dark theme."
          >
            <Row
              title="Reelhouse Dark"
              description="The current site theme: near-black surfaces with emerald accents."
            >
              <span className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-foreground">
                Active
              </span>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
