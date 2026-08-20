// Mobile interaction audit — runs the real app in Chrome under phone emulation
// and hit-tests every interactive element.
//
// Investigation tooling. Not application code; not part of the build or tests.
//
//   node tools/mobile-audit/audit.mjs http://127.0.0.1:PORT [--tap]

import { writeFileSync } from "node:fs";
import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3123";
const DO_TAP = process.argv.includes("--tap");

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  {
    name: "android-portrait",
    width: 412,
    height: 915,
    dpr: 2.625,
    mobile: true,
    touch: true,
    ua: ANDROID_UA,
  },
  {
    name: "android-landscape",
    width: 915,
    height: 412,
    dpr: 2.625,
    mobile: true,
    touch: true,
    ua: ANDROID_UA,
  },
];

// ---------------------------------------------------------------------------
// In-page collector. Everything below runs inside the browser.
// ---------------------------------------------------------------------------

const COLLECT = function collect() {
  const SEL = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="option"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="switch"]',
    "[onclick]",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const describe = (el) => {
    if (!el) return null;
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 6).join(".")}`
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const chain = (el) => {
    const out = [];
    let n = el;
    while (n && n !== document.documentElement && out.length < 8) {
      const cs = getComputedStyle(n);
      out.push({
        node: describe(n),
        position: cs.position,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        transform: cs.transform === "none" ? "none" : "yes",
        overflow: `${cs.overflowX}/${cs.overflowY}`,
        backdrop: cs.backdropFilter && cs.backdropFilter !== "none" ? cs.backdropFilter : "none",
        opacity: cs.opacity,
        isolation: cs.isolation,
        filter: cs.filter === "none" ? "none" : "yes",
        contain: cs.contain,
      });
      n = n.parentElement;
    }
    return out;
  };

  const label = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (txt) return txt.slice(0, 48);
    const ph = el.getAttribute("placeholder");
    if (ph) return `[placeholder] ${ph.slice(0, 30)}`;
    const t = el.getAttribute("type");
    return t ? `[${el.tagName.toLowerCase()}:${t}]` : `[${el.tagName.toLowerCase()}]`;
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const results = [];
  const nodes = Array.from(document.querySelectorAll(SEL));
  nodes.forEach((el, index) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const rendered = r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";

    // Sample the centre plus four inset quadrant points, so a control that is
    // only PARTLY covered is not reported as fine.
    const ix = Math.max(1, Math.min(r.width / 4, 12));
    const iy = Math.max(1, Math.min(r.height / 4, 12));
    const points = [
      ["centre", r.left + r.width / 2, r.top + r.height / 2],
      ["top-left", r.left + ix, r.top + iy],
      ["top-right", r.right - ix, r.top + iy],
      ["bottom-left", r.left + ix, r.bottom - iy],
      ["bottom-right", r.right - ix, r.bottom - iy],
    ];

    const samples = points.map(([where, x, y]) => {
      if (x < 0 || y < 0 || x >= vw || y >= vh) {
        return { where, x: Math.round(x), y: Math.round(y), outcome: "offscreen" };
      }
      const hit = document.elementFromPoint(x, y);
      if (!hit) return { where, x: Math.round(x), y: Math.round(y), outcome: "nothing" };
      if (hit === el || el.contains(hit)) {
        return { where, x: Math.round(x), y: Math.round(y), outcome: "self" };
      }
      // Whatever sits on top — plus its ancestry, which is where the cause lives.
      return {
        where,
        x: Math.round(x),
        y: Math.round(y),
        outcome: hit.contains(el) ? "ancestor" : "blocked",
        hit: describe(hit),
        hitRect: {
          x: Math.round(hit.getBoundingClientRect().left),
          y: Math.round(hit.getBoundingClientRect().top),
          w: Math.round(hit.getBoundingClientRect().width),
          h: Math.round(hit.getBoundingClientRect().height),
        },
        hitChain: chain(hit),
      };
    });

    results.push({
      index,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      type: el.getAttribute("type"),
      href: el.getAttribute("href"),
      label: label(el),
      rendered,
      rect: {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      css: {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        touchAction: cs.touchAction,
        userSelect: cs.userSelect,
        tapHighlight: cs.webkitTapHighlightColor || null,
        cursor: cs.cursor,
      },
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      ariaLabel: el.getAttribute("aria-label"),
      samples,
      selfChain: chain(el).slice(0, 5),
    });
  });

  const meta = document.querySelector('meta[name="viewport"]');

  return {
    page: {
      url: location.pathname + location.search,
      innerWidth: vw,
      innerHeight: vh,
      layoutWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      visualScale: window.visualViewport ? window.visualViewport.scale : null,
      dpr: window.devicePixelRatio,
      viewportMeta: meta ? meta.getAttribute("content") : null,
      matchesSm: window.matchMedia("(min-width: 640px)").matches,
      matchesMd: window.matchMedia("(min-width: 768px)").matches,
      matchesLg: window.matchMedia("(min-width: 1024px)").matches,
      hoverNone: window.matchMedia("(hover: none)").matches,
      pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
      maxTouchPoints: navigator.maxTouchPoints,
      bodyClass: document.body.className,
    },
    elements: results,
  };
};

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function summarise(profileName, snap) {
  const bad = snap.elements.filter(
    (e) =>
      e.rendered &&
      !e.disabled &&
      e.samples.some((s) => s.outcome === "blocked" || s.outcome === "ancestor")
  );
  const tiny = snap.elements.filter(
    (e) => e.rendered && !e.disabled && (e.rect.w < 24 || e.rect.h < 24)
  );
  const noPointer = snap.elements.filter((e) => e.rendered && e.css.pointerEvents === "none");
  return { profileName, page: snap.page, counts: { total: snap.elements.length, blocked: bad.length, tiny: tiny.length, noPointer: noPointer.length }, bad, tiny, noPointer };
}

async function main() {
  const chrome = await launchChrome({ port: 9333 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Network.enable");

  // Discover a real detail/watch target from the movies grid rather than
  // hard-coding a TMDB id.
  await session.emulate(PROFILES[0]);
  await session.goto(`${BASE}/movies`, { settleMs: 2500 });
  const discovered = await session.eval(() => {
    const a = document.querySelector('a[href^="/movie/"]');
    return a ? a.getAttribute("href") : null;
  });
  const detail = discovered ?? "/movie/550";
  const tmdbId = detail.split("/").pop();

  const ROUTES = [
    "/",
    "/movies",
    "/tv-shows",
    "/my-list",
    "/search?q=dune",
    "/login",
    "/forgot-password",
    "/reset-password",
    detail,
    `/watch/movie/${tmdbId}`,
  ];

  const report = { base: BASE, detail, routes: ROUTES, runs: [] };

  for (const profile of PROFILES) {
    await session.emulate(profile);
    for (const route of ROUTES) {
      await session.goto(`${BASE}${route}`, { settleMs: 2200 });
      const snap = await session.eval(COLLECT);
      const sum = summarise(profile.name, snap);
      report.runs.push({ profile: profile.name, route, ...sum });
      const p = snap.page;
      console.log(
        `[${profile.name}] ${route}  inner=${p.innerWidth}x${p.innerHeight} layout=${p.layoutWidth} sm=${p.matchesSm} lg=${p.matchesLg} overflowX=${p.horizontalOverflow} meta=${JSON.stringify(p.viewportMeta)} elems=${sum.counts.total} blocked=${sum.counts.blocked} tiny=${sum.counts.tiny}`
      );
      for (const b of sum.bad) {
        const s = b.samples.find((x) => x.outcome === "blocked" || x.outcome === "ancestor");
        console.log(
          `      BLOCKED  <${b.tag}> "${b.label}" rect=${b.rect.x},${b.rect.y} ${b.rect.w}x${b.rect.h}  at ${s.where}(${s.x},${s.y}) -> ${s.outcome} ${s.hit} rect=${s.hitRect.x},${s.hitRect.y} ${s.hitRect.w}x${s.hitRect.h}`
        );
      }
    }
  }

  writeFileSync(
    "tools/mobile-audit/report.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );
  console.log("\nWrote tools/mobile-audit/report.json");

  if (DO_TAP) {
    console.log("\n=== live tap probes (android-portrait) ===");
    await session.emulate(PROFILES[1]);
    await session.goto(`${BASE}/`, { settleMs: 2200 });
    const probes = await session.eval(() => {
      const pick = (fn) => {
        const el = fn();
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      };
      return {
        searchBtn: pick(() => document.querySelector('button[aria-label="Search"]')),
        signIn: pick(() => document.querySelector('a[href="/login"]')),
        movies: pick(() => document.querySelector('a[href="/movies"]')),
      };
    });
    for (const [name, pt] of Object.entries(probes)) {
      if (!pt) {
        console.log(`  ${name}: not rendered`);
        continue;
      }
      await session.eval(() => {
        window.__hits = [];
        if (!window.__wired) {
          window.__wired = true;
          for (const t of ["touchstart", "pointerdown", "click"]) {
            document.addEventListener(
              t,
              (e) => window.__hits.push(`${t}:${e.target.tagName}.${(e.target.getAttribute && e.target.getAttribute("aria-label")) || (e.target.textContent || "").trim().slice(0, 20)}`),
              true
            );
          }
        }
        return true;
      });
      await session.tap(pt.x, pt.y);
      const hits = await session.eval(() => ({ hits: window.__hits, url: location.pathname, searchOpen: !!document.querySelector('button[aria-label="Close search"]') }));
      console.log(`  ${name} tap@${pt.x},${pt.y} -> ${JSON.stringify(hits)}`);
      await session.goto(`${BASE}/`, { settleMs: 1500 });
    }
  }

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
