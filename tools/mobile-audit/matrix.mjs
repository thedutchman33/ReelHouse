// Functional tap matrix.
//
// The other probes in here measure GEOMETRY (is the control where it looks like
// it is, and does a tap at its centre reach it). This one measures BEHAVIOUR:
// every row locates a real control, dispatches a real single-finger touch at its
// centre, and then asserts that a NAMED piece of page state actually changed.
// A row only passes when the assertion it declared is satisfied — "the page
// still looks fine" is not a pass.
//
// Assertions are per-field, not "something changed", because the home page hero
// rotates its <h1> on a 7s timer: a whole-page signature would drift on its own
// and hand out free passes.
//
// Investigation tooling. Not application code — nothing here ships, and it is
// outside both the build and the test suite.
//
//   node tools/mobile-audit/matrix.mjs http://192.168.29.102:3124
//   node tools/mobile-audit/matrix.mjs http://127.0.0.1:3125 --set=native
//   node tools/mobile-audit/matrix.mjs http://127.0.0.1:3124 --row=Genre

import { writeFileSync } from "node:fs";
import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const argv = process.argv.slice(2);
const BASE = argv.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3124";
const SET = (argv.find((a) => a.startsWith("--set=")) ?? "--set=main").slice(6);
const ROW = (argv.find((a) => a.startsWith("--row=")) ?? "--row=").slice(6);

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

// ---------------------------------------------------------------------------
// Page-side helpers
// ---------------------------------------------------------------------------

/**
 * Find one control and describe how a touch at its centre would actually land.
 *
 * Only elements that are really painted are considered — a zero-size or
 * display:none/visibility:hidden node is skipped. That matters here because the
 * navbar renders BOTH tiers of its two-tier layout and hides one with `sm:`
 * classes, so a naive `header a[href="/movies"]` matches an invisible duplicate
 * and reports a 0x0 phantom failure.
 */
const LOCATE = function locate(spec) {
  const describe = (el) => {
    if (!el) return "nothing";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "";
    return el.tagName.toLowerCase() + cls;
  };

  let pool;
  if (spec.pick) {
    const picked = new Function(spec.pick)();
    pool = Array.isArray(picked) ? picked : picked ? [picked] : [];
  } else {
    pool = Array.from(document.querySelectorAll(spec.css));
  }
  const total = pool.length;

  const painted = pool.filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  });

  const match = painted.filter((el) => {
    const aria = el.getAttribute("aria-label") || "";
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (spec.aria != null && aria !== spec.aria) return false;
    if (spec.ariaStarts != null && !aria.startsWith(spec.ariaStarts)) return false;
    if (spec.text != null && text !== spec.text) return false;
    if (spec.textStarts != null && !text.startsWith(spec.textStarts)) return false;
    return true;
  });

  const el = match[spec.nth ?? 0];
  if (!el) return { found: false, painted: painted.length, total };

  // Tap coordinates have to be the ones a finger would use, so bring the control
  // fully into view first (`center` also keeps it out from under the sticky bar).
  const first = el.getBoundingClientRect();
  if (first.top < 8 || first.bottom > innerHeight - 8) {
    el.scrollIntoView({ block: "center", inline: "center" });
  }
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const inView = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
  const cs = getComputedStyle(el);
  const hitEl = inView ? document.elementFromPoint(x, y) : null;

  return {
    found: true,
    matches: match.length,
    total,
    x,
    y,
    inView,
    tag: el.tagName.toLowerCase(),
    label: (el.getAttribute("aria-label") || (el.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 44),
    rect: {
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.left),
      y: Math.round(r.top),
    },
    disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
    pointerEvents: cs.pointerEvents,
    touchAction: cs.touchAction,
    hit: !inView ? "offscreen" : hitEl === el || el.contains(hitEl) ? "self" : describe(hitEl),
  };
};

/**
 * Named pieces of observable state. Each check names the field it expects its tap
 * to move, so an unrelated field drifting (the hero rotator) cannot fake a pass.
 */
const STATE = function state() {
  const txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const list = (sel, n) =>
    Array.from(document.querySelectorAll(sel))
      .slice(0, n)
      .map((el) => el.getAttribute("aria-label") || txt(el))
      .join(" | ");
  const field = document.querySelector('header input[type="search"]');
  const active = document.activeElement;

  return {
    url: location.pathname + location.search,
    h1: txt(document.querySelector("h1")).slice(0, 44),
    expanded: String(document.querySelectorAll('[aria-expanded="true"]').length),
    menus: String(document.querySelectorAll('[role="menu"],[role="listbox"]').length),
    // The episode drawer stays mounted and flips aria-hidden, so this is how an
    // opened drawer shows up.
    shown: String(document.querySelectorAll('[aria-hidden="false"]').length),
    alerts: list('[role="alert"]', 2).slice(0, 70),
    wl: list('button[aria-label*="My List"]', 2).slice(0, 90),
    // WatchlistButton has two variants: the 36x36 "icon" one on cards carries the
    // aria-label read above, while the "full" one in the detail/home hero has no
    // aria-label at all — it reports itself through its visible text and
    // aria-pressed, so that is what a tap on it has to move.
    wlFull: Array.from(document.querySelectorAll("button"))
      .filter((b) => /^(In )?My List$/.test(txt(b)))
      .map((b) => `${txt(b)}:${b.getAttribute("aria-pressed")}`)
      .join(" | ")
      .slice(0, 90),
    searchField: field && field.getBoundingClientRect().width > 0 ? "yes" : "no",
    dialog: txt(document.querySelector('[role="dialog"] h3')).slice(0, 44),
    provider: txt(
      document.querySelector('button[aria-label="Change playback provider"] span.truncate')
    ).slice(0, 30),
    // Player controls whose own label reports the state they toggle.
    ctl: Array.from(document.querySelectorAll("button[aria-label]"))
      .map((b) => b.getAttribute("aria-label"))
      .filter((l) => /fullscreen|^play$|^pause$|subtitle|player settings/i.test(l))
      .join(","),
    fullscreen: document.fullscreenElement ? "yes" : "no",
    // Reported, never asserted on: a tap always moves focus, so comparing it
    // would pass every row.
    _focus: active
      ? active.tagName.toLowerCase() +
        (active.getAttribute("aria-label") ? `[${active.getAttribute("aria-label")}]` : "") +
        (active.id ? `#${active.id}` : "")
      : "none",
  };
};

const READ_VALUE = function readValue(spec) {
  const el = Array.from(document.querySelectorAll(spec.css)).find(
    (n) => n.getBoundingClientRect().width > 0
  );
  return el ? String(el.value ?? "") : null;
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const NAV = (href) => ({ css: `header nav a[href="${href}"]` });

function mainChecks(ids) {
  const movie = `/movie/${ids.movie}`;
  const tv = `/tv/${ids.tv}`;
  const watchMovie = `/watch/movie/${ids.movie}`;
  const watchTv = `/watch/tv/${ids.tv}?s=1&e=1`;

  return [
    // ---- navigation -----------------------------------------------------
    {
      row: "Search",
      only: ["portrait"],
      route: "/",
      note: "portrait has no field until the toggle is tapped",
      steps: [
        { label: "toggle", tap: { css: "header button", aria: "Search" }, want: "searchField" },
        { label: "type", type: { css: 'header input[type="search"]' }, text: "matrix" },
        { label: "submit (Enter)", key: "Enter", want: "url" },
      ],
    },
    {
      row: "Search",
      only: ["desktop", "landscape"],
      route: "/",
      note: "field is inline from sm: up",
      steps: [
        { label: "type", type: { css: 'header input[type="search"]' }, text: "matrix" },
        { label: "submit (Enter)", key: "Enter", want: "url" },
      ],
    },
    {
      row: "Sign In",
      route: "/",
      steps: [
        { label: "navbar link", tap: { css: 'header a[href="/login"]' }, want: "url" },
        { label: "email", type: { css: "#email" }, text: "audit-probe@example.invalid" },
        { label: "password", type: { css: "#password" }, text: "not-a-real-password-9Z" },
        { label: "submit", tap: { css: 'form button[type="submit"]' }, want: "alerts", waitMs: 9000 },
      ],
    },
    { row: "Movies", route: "/", steps: [{ tap: NAV("/movies"), want: "url" }] },
    { row: "TV Shows", route: "/", steps: [{ tap: NAV("/tv-shows"), want: "url" }] },
    { row: "My List", route: "/", steps: [{ tap: NAV("/my-list"), want: "url" }] },
    {
      row: "Account",
      route: "/",
      skip: "no signed-in session available: signed out the navbar renders the Sign in link, and creating an account would write to the hosted Supabase project",
    },
    { row: "Logo", route: "/movies", steps: [{ tap: { css: "header a", aria: "Reelhouse home" }, want: "url" }] },

    // ---- browse + filters ----------------------------------------------
    {
      row: "Filters",
      only: ["portrait"],
      route: "/movies",
      note: "single sheet below md:; three separate dropdowns at md: and up",
      steps: [{ tap: { css: "button", text: "Filters" }, want: "expanded" }],
    },
    {
      row: "Genre",
      only: ["desktop", "landscape"],
      route: "/movies",
      steps: [
        { label: "open", tap: { css: 'button[aria-haspopup="menu"]', textStarts: "Genre" }, want: "expanded" },
        { label: "choose", tap: { css: '[role="menu"][aria-label="Genre"] a[role="menuitem"]', nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Genre",
      only: ["portrait"],
      route: "/movies",
      steps: [
        { label: "open sheet", tap: { css: "button", text: "Filters" }, want: "expanded" },
        { label: "choose", tap: { pick: SHEET_LINKS("Genre"), nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Year",
      only: ["desktop", "landscape"],
      route: "/movies",
      steps: [
        { label: "open", tap: { css: 'button[aria-haspopup="menu"]', textStarts: "Year" }, want: "expanded" },
        { label: "choose", tap: { css: '[role="menu"][aria-label="Year"] a[role="menuitem"]', nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Year",
      only: ["portrait"],
      route: "/movies",
      steps: [
        { label: "open sheet", tap: { css: "button", text: "Filters" }, want: "expanded" },
        { label: "choose", tap: { pick: SHEET_LINKS("Year"), nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Sort",
      only: ["desktop", "landscape"],
      route: "/movies",
      steps: [
        { label: "open", tap: { css: 'button[aria-haspopup="menu"]', textStarts: "Sort by" }, want: "expanded" },
        { label: "choose", tap: { css: '[role="menu"][aria-label="Sort by"] a[role="menuitem"]', nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Sort",
      only: ["portrait"],
      route: "/movies",
      steps: [
        { label: "open sheet", tap: { css: "button", text: "Filters" }, want: "expanded" },
        { label: "choose", tap: { pick: SHEET_LINKS("Sort by"), nth: 1 }, want: "url" },
      ],
    },
    {
      row: "Clear Filters",
      only: ["desktop", "landscape"],
      route: "/movies",
      note: "only rendered once a filter is active, so the filter is set first",
      steps: [
        { label: "open Genre", tap: { css: 'button[aria-haspopup="menu"]', textStarts: "Genre" }, want: "expanded" },
        { label: "set genre", tap: { css: '[role="menu"][aria-label="Genre"] a[role="menuitem"]', nth: 1 }, want: "url" },
        { label: "clear", tap: { css: "a", text: "Clear Filters" }, want: "url" },
      ],
    },
    {
      row: "Clear Filters",
      only: ["portrait"],
      route: "/movies",
      steps: [
        { label: "open sheet", tap: { css: "button", text: "Filters" }, want: "expanded" },
        { label: "set genre", tap: { pick: SHEET_LINKS("Genre"), nth: 1 }, want: "url" },
        { label: "re-open sheet", tap: { css: "button", text: "Filters" }, want: "expanded" },
        { label: "clear", tap: { css: "a", text: "Clear Filters" }, want: "url" },
      ],
    },
    {
      row: "Pagination",
      route: "/movies",
      steps: [{ tap: { css: 'nav[aria-label="Pagination"] a', textStarts: "Next" }, want: "url" }],
    },
    { row: "Poster card", route: "/movies", steps: [{ tap: { css: 'a[href^="/movie/"]' }, want: "url" }] },

    // ---- home ------------------------------------------------------------
    { row: "Play", route: "/", note: "hero", steps: [{ tap: { css: "section a", text: "Play" }, want: "url" }] },
    { row: "More Info", route: "/", steps: [{ tap: { css: "section a", text: "More Info" }, want: "url" }] },
    {
      row: "Hero dots",
      route: "/",
      note: "rotator: the title must become the one the dot names, so the 7s auto-advance cannot fake a pass",
      steps: [{ tap: { css: 'button[aria-label^="Show "]', nth: 2 }, want: "h1", matchLabel: "h1", waitMs: 1500 }],
    },

    // ---- detail ----------------------------------------------------------
    { row: "Play", route: movie, note: "detail", steps: [{ tap: { css: "a", textStarts: "Play" }, want: "url" }] },
    {
      row: "Add to List",
      route: movie,
      note: 'detail hero uses WatchlistButton variant="full" — visible text, no aria-label (the 36x36 aria-labelled one belongs to a card)',
      steps: [
        { label: "add", tap: { css: "button", text: "My List" }, want: "wlFull" },
        { label: "remove again", tap: { css: "button", text: "In My List" }, want: "wlFull" },
      ],
    },
    {
      row: "Episode",
      route: tv,
      note: "detail: season picker is a native <select> (platform picker, not scriptable); the episode row is the real navigation",
      steps: [{ tap: { pick: EPISODE_LINKS }, want: "url" }],
    },

    // ---- playback (embed surface: this deployment has provider slots configured) --
    {
      row: "Provider",
      route: watchMovie,
      steps: [
        { label: "open", tap: { css: "button", aria: "Change playback provider" }, want: "expanded" },
        { label: "choose other", tap: { css: 'button[role="option"]:not([disabled])', nth: 1 }, want: "provider" },
      ],
    },
    {
      row: "Episode",
      route: watchTv,
      note: "player drawer",
      steps: [
        { label: "open drawer", tap: { css: "button", aria: "Episodes" }, want: "shown" },
        { label: "season menu", tap: { css: 'button[aria-haspopup="listbox"]', textStarts: "Season" }, want: "expanded" },
        { label: "pick season", tap: { css: '[role="listbox"] button[role="option"]', nth: 1 }, want: "dialog" },
        { label: "close drawer", tap: { css: "button", aria: "Close episodes" }, want: "shown" },
      ],
    },
    { row: "Back", route: watchMovie, steps: [{ tap: { css: "a", aria: "Back" }, want: "url" }] },
    {
      row: "Fullscreen",
      route: watchMovie,
      skip: "embed surface: fullscreen belongs to the provider's own player inside the iframe (CLAUDE.md) — see the --set=native run for Reelhouse's own control",
    },
    {
      row: "Subtitles",
      route: watchMovie,
      skip: "embed surface: subtitles belong to the provider's own player inside the iframe (CLAUDE.md) — see the --set=native run",
    },
    {
      row: "Settings",
      route: watchMovie,
      skip: "embed surface: quality/settings belong to the provider's own player inside the iframe (CLAUDE.md) — see the --set=native run",
    },

    // ---- search page + footer -------------------------------------------
    {
      row: "Clear search",
      route: "/search?q=matrix",
      note: "clears local state rather than the URL, so the assertion is the field's own value",
      steps: [
        {
          tap: { css: "button", aria: "Clear search" },
          expectValue: { css: 'input[aria-label="Search movies and series"]', value: "" },
        },
      ],
    },
    {
      row: "Footer links",
      route: "/",
      steps: [{ tap: { css: 'nav[aria-label="Browse"] a', text: "All Titles" }, want: "url" }],
    },
  ];
}

/** Links inside one labelled group of the phone filter sheet. */
function SHEET_LINKS(label) {
  return `
    const sections = Array.from(document.querySelectorAll('.panel section'));
    const section = sections.find((s) => {
      const p = s.querySelector('p');
      return p && p.textContent.trim() === ${JSON.stringify(label)};
    });
    return section ? Array.from(section.querySelectorAll('a')) : [];
  `;
}

/** Episode rows on a TV detail page — scoped, so the hero Play link is not picked. */
const EPISODE_LINKS = `
  const sections = Array.from(document.querySelectorAll('section'));
  const section = sections.find((s) => {
    const h = s.querySelector('h2');
    return h && h.textContent.trim() === 'Episodes';
  });
  return section ? Array.from(section.querySelectorAll('a[href*="/watch/"]')) : [];
`;

/**
 * Reelhouse's OWN player surface. Reachable only with no provider slot
 * configured, which is why this set runs against a separate server started with
 * the five slots neutralised in its process environment — no file, and no
 * provider configuration, is touched.
 */
function nativeChecks(ids) {
  const watchMovie = `/watch/movie/${ids.movie}`;
  return [
    {
      row: "Play",
      route: watchMovie,
      wake: true,
      note: "native surface transport",
      steps: [{ tap: { css: "button", ariaStarts: "Pl" }, want: "ctl" }],
    },
    {
      row: "Subtitles",
      route: watchMovie,
      wake: true,
      note: 'opens PlayerSettings (role="dialog", aria-hidden toggled) on its subtitles tab — not a menu',
      steps: [{ tap: { css: "button", aria: "Subtitles & audio" }, want: "shown" }],
    },
    {
      row: "Settings",
      route: watchMovie,
      wake: true,
      note: "the same sheet as Subtitles & audio, opened on its quality tab",
      steps: [{ tap: { css: "button", aria: "Player settings" }, want: "shown" }],
    },
    {
      row: "Fullscreen",
      route: watchMovie,
      wake: true,
      steps: [{ tap: { css: "button", ariaStarts: "Fullscreen" }, want: ["fullscreen", "ctl"] }],
    },
    {
      row: "Back",
      route: watchMovie,
      wake: true,
      steps: [{ tap: { css: "a", aria: "Back to details" }, want: "url" }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function diff(before, after) {
  return Object.keys(after).filter((k) => !k.startsWith("_") && before[k] !== after[k]);
}

async function settle(session, before, wanted, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let after = await session.eval(STATE);
  while (Date.now() < deadline) {
    const changed = diff(before, after);
    if (wanted.every((w) => changed.includes(w))) return { after, changed };
    await sleep(150);
    after = await session.eval(STATE);
  }
  return { after, changed: diff(before, after) };
}

/**
 * Locate, but tolerate a control that only exists after the previous step's
 * navigation has painted (the login fields, for instance). Polling here is not
 * leniency: the element still has to be really present, painted and hit-testable
 * — it just may not be in the document the instant the step starts.
 */
async function locate(session, spec, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let found = await session.eval(LOCATE, spec);
  while (!found.found && Date.now() < deadline) {
    await sleep(200);
    found = await session.eval(LOCATE, spec);
  }
  return found;
}

/**
 * One step, one attempt. A step that reports "the wanted field never moved" is
 * retried once by the caller — the home hero swaps its `<h1>` block on a 7s timer
 * and re-mounts the action row with it, so a tap can legitimately land on an
 * element React replaced microseconds earlier. A retry is only safe because the
 * failure being retried is "nothing changed": the page state is still the one the
 * step started from, so re-tapping a toggle cannot double-toggle it.
 */
async function attemptStep(session, step, profile) {
  const spec = step.tap ?? step.type ?? null;
  const wanted = step.want ? (Array.isArray(step.want) ? step.want : [step.want]) : [];
  const out = { label: step.label ?? step.row ?? "tap", wanted };

  if (step.key) {
    const before = await session.eval(STATE);
    await session.pressKey(step.key);
    const { after, changed } = await settle(session, before, wanted, step.waitMs ?? 4000);
    out.action = `key ${step.key}`;
    out.changed = changed;
    out.detail = wanted.map((w) => `${w}: ${JSON.stringify(before[w])} -> ${JSON.stringify(after[w])}`);
    out.ok = wanted.every((w) => changed.includes(w));
    return out;
  }

  const found = await locate(session, spec);
  out.found = found;
  if (!found.found) {
    out.ok = false;
    out.why = `no painted match (painted=${found.painted} of ${found.total} in DOM)`;
    return out;
  }
  out.where = `<${found.tag}> "${found.label}" ${found.rect.w}x${found.rect.h}@${found.rect.x},${found.rect.y}`;
  out.probe = `hit=${found.hit} pe=${found.pointerEvents} touch-action=${found.touchAction}${
    found.disabled ? " DISABLED" : ""
  }`;

  if (found.hit !== "self") {
    out.ok = false;
    out.why = `a touch at its centre lands on ${found.hit}`;
    return out;
  }
  if (found.disabled) {
    out.ok = false;
    out.why = "control is disabled";
    return out;
  }

  const before = await session.eval(STATE);
  // The same synthetic single-finger touch in every profile, so desktop is a true
  // control rather than a differently-driven run.
  await session.tap(found.x, found.y);
  out.action = `tap @${found.x},${found.y}`;

  if (step.type) {
    await session.type(step.text);
    const value = await session.eval(READ_VALUE, spec);
    out.action += ` + type ${JSON.stringify(step.text)}`;
    out.detail = [`field value now ${JSON.stringify(value)}`];
    out.ok = value === step.text;
    if (!out.ok) out.why = `field did not accept the text (value=${JSON.stringify(value)})`;
    return out;
  }

  const { after, changed } = await settle(session, before, wanted, step.waitMs ?? 4000);
  out.changed = changed;
  out.detail = wanted.map((w) => `${w}: ${JSON.stringify(before[w])} -> ${JSON.stringify(after[w])}`);
  out.ok = wanted.every((w) => changed.includes(w));
  if (!out.ok) out.why = `${wanted.join("+")} did not change (changed: ${changed.join(",") || "nothing"})`;

  // The control names the state it should produce (a rotator dot names its
  // title), so a coincidental change elsewhere cannot pass for a working tap.
  if (out.ok && step.matchLabel) {
    const expected = found.label.replace(/^Show /, "");
    const got = after[step.matchLabel] ?? "";
    out.detail.push(`${step.matchLabel} vs dot label: ${JSON.stringify(got)} / ${JSON.stringify(expected)}`);
    if (!got.startsWith(expected.slice(0, 20))) {
      out.ok = false;
      out.why = `${step.matchLabel} became ${JSON.stringify(got)}, not the control's own ${JSON.stringify(expected)}`;
    }
  }

  // For controls whose effect is local component state rather than a field in
  // STATE (the search-page clear button), assert on the value directly.
  if (step.expectValue) {
    const value = await session.eval(READ_VALUE, step.expectValue);
    out.detail = [...(out.detail ?? []), `value now ${JSON.stringify(value)}`];
    out.ok = value === step.expectValue.value;
    if (!out.ok) out.why = `value is ${JSON.stringify(value)}, expected ${JSON.stringify(step.expectValue.value)}`;
  }
  return out;
}

/**
 * A step, with one retry reserved strictly for "the wanted field never moved".
 * Every other failure — covered control, disabled control, no such control, wrong
 * resulting value — is reported as-is on the first attempt.
 */
async function runStep(session, step, profile) {
  const first = await attemptStep(session, step, profile);
  if (first.ok || first.changed === undefined) return first;

  const second = await attemptStep(session, step, profile);
  second.retried = true;
  if (second.ok) second.detail = [...(second.detail ?? []), "passed on a second attempt"];
  else second.why = `${second.why} (twice)`;
  return second;
}

async function main() {
  const chrome = await launchChrome({ port: 9341 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");

  // Ids come from the live catalogue, so nothing here hard-codes a title.
  await session.emulate(PROFILES[0]);
  await session.goto(`${BASE}/movies`, { settleMs: 2200 });
  const movieHref = await session.eval(function pick() {
    const a = document.querySelector('a[href^="/movie/"]');
    return a ? a.getAttribute("href") : null;
  });
  await session.goto(`${BASE}/tv-shows`, { settleMs: 2200 });
  const tvHref = await session.eval(function pick() {
    const a = document.querySelector('a[href^="/tv/"]');
    return a ? a.getAttribute("href") : null;
  });
  const ids = {
    movie: movieHref ? movieHref.split("/")[2] : null,
    tv: tvHref ? tvHref.split("/")[2] : null,
  };
  if (!ids.movie || !ids.tv) throw new Error(`Could not discover ids (movie=${movieHref} tv=${tvHref})`);
  console.log(`base ${BASE} · set ${SET} · movie ${ids.movie} · tv ${ids.tv}`);

  const checks = (SET === "native" ? nativeChecks(ids) : mainChecks(ids)).filter(
    (c) => !ROW || c.row.toLowerCase().includes(ROW.toLowerCase())
  );

  const results = [];
  for (const profile of PROFILES) {
    await session.emulate(profile);
    console.log(`\n########## ${profile.name} ${profile.width}x${profile.height} ##########`);

    for (const check of checks) {
      const key = `${check.row}${check.note ? ` (${check.note.split(":")[0]})` : ""}`;
      if (check.only && !check.only.includes(profile.name)) continue;
      if (check.skip) {
        results.push({ profile: profile.name, row: check.row, key, status: "n/a", why: check.skip });
        console.log(`\n-- ${key}: n/a — ${check.skip}`);
        continue;
      }

      console.log(`\n-- ${key} @ ${check.route}`);
      await session.goto(`${BASE}${check.route}`, { settleMs: 2200 });
      const steps = [];
      let ok = true;
      for (const step of check.steps) {
        if (check.wake) {
          await session.nudge(Math.round(profile.width / 2), Math.round(profile.height / 2));
        }
        let res;
        try {
          res = await runStep(session, step, profile);
        } catch (err) {
          res = { label: step.label ?? "tap", ok: false, why: `probe error: ${err.message}` };
        }
        steps.push(res);
        console.log(
          `   ${res.ok ? "PASS" : "FAIL"} ${String(res.label).padEnd(14)} ${res.where ?? ""}` +
            (res.probe ? `\n        ${res.probe}` : "") +
            (res.action ? `\n        ${res.action}` : "") +
            (res.detail ? res.detail.map((d) => `\n        ${d}`).join("") : "") +
            (res.why ? `\n        WHY: ${res.why}` : "")
        );
        if (!res.ok) {
          ok = false;
          break; // later steps depend on this one having worked
        }
      }
      results.push({
        profile: profile.name,
        row: check.row,
        key,
        status: ok ? "pass" : "fail",
        steps,
      });
    }
  }

  // Matrix
  const rows = [...new Set(results.map((r) => r.key))];
  const cell = (row, profile) => {
    const r = results.find((x) => x.key === row && x.profile === profile);
    if (!r) return "—";
    if (r.status === "n/a") return "n/a";
    return r.status === "pass" ? "PASS" : "FAIL";
  };
  console.log(`\n\n===== MATRIX (${SET}) =====`);
  console.log(`${"ROW".padEnd(30)}${"DESKTOP".padEnd(10)}${"PORTRAIT".padEnd(10)}LANDSCAPE`);
  for (const row of rows) {
    console.log(
      row.padEnd(30) +
        cell(row, "desktop").padEnd(10) +
        cell(row, "portrait").padEnd(10) +
        cell(row, "landscape")
    );
  }
  const failed = results.filter((r) => r.status === "fail");
  console.log(`\n${results.length} cells · ${failed.length} failing · ${results.filter((r) => r.status === "n/a").length} n/a`);
  for (const f of failed) {
    const bad = f.steps.find((s) => !s.ok);
    console.log(`  FAIL [${f.profile}] ${f.key} — ${bad?.label}: ${bad?.why}`);
  }

  writeFileSync(
    `tools/mobile-audit/matrix-${SET}.json`,
    JSON.stringify({ base: BASE, set: SET, ids, results }, null, 2)
  );

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
