// Focused navbar / popover probe.
//
// The sweep in audit.mjs hit-tests at scroll-top only. This one dispatches REAL
// touch events, and repeats every probe in the scrolled state where the navbar
// swaps to `.glass` (backdrop-blur-xl) — the state the report singles out.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/navbar-probe.mjs http://127.0.0.1:PORT

import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3123";

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "android-portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "android-landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

const WIRE = function wire() {
  window.__log = [];
  if (!window.__wired) {
    window.__wired = true;
    const tag = (e) => {
      const t = e.target;
      const name =
        (t.getAttribute && t.getAttribute("aria-label")) ||
        (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 22) ||
        t.tagName;
      return `${e.type}->${t.tagName.toLowerCase()}"${name}"`;
    };
    for (const type of ["touchstart", "pointerdown", "mousedown", "click"]) {
      document.addEventListener(type, (e) => window.__log.push(tag(e)), true);
    }
  }
  return true;
};

const STATE = function state() {
  const q = (s) => document.querySelector(s);
  return {
    url: location.pathname + location.search,
    scrollY: Math.round(window.scrollY),
    glass: !!document.querySelector("header.glass"),
    searchFieldOpen: !!q('button[aria-label="Close search"]'),
    accountMenuOpen: !!q('[role="menu"]'),
    providerListOpen: !!q('[role="listbox"]'),
    log: (window.__log || []).slice(),
  };
};

/** Centre of a control, in viewport coordinates, or null when absent. */
const RECT = function rect(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const describe = (n) =>
    n
      ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${
          typeof n.className === "string" && n.className
            ? `.${n.className.trim().split(/\s+/).slice(0, 4).join(".")}`
            : ""
        }`
      : "null";
  return {
    x: Math.round(cx),
    y: Math.round(cy),
    w: Math.round(r.width),
    h: Math.round(r.height),
    reachable: !!hit && (hit === el || el.contains(hit)),
    hit: describe(hit),
  };
};

async function probe(session, label, selector, expectation) {
  const geo = await session.eval(RECT, selector);
  if (!geo) {
    console.log(`    ${label.padEnd(20)} : not rendered`);
    return;
  }
  await session.eval(WIRE);
  const before = await session.eval(STATE);
  await session.tap(geo.x, geo.y);
  const after = await session.eval(STATE);
  const changed = expectation(before, after);
  console.log(
    `    ${label.padEnd(20)} : ${geo.w}x${geo.h} @${geo.x},${geo.y} reachable=${geo.reachable} hit=${geo.hit}`
  );
  console.log(
    `      tap -> ${changed ? "WORKED" : "NO EFFECT"}  url=${after.url} glass=${after.glass} searchOpen=${after.searchFieldOpen} menu=${after.accountMenuOpen} listbox=${after.providerListOpen}`
  );
  console.log(`      events: ${after.log.length ? after.log.join(" | ") : "(none)"}`);
}

async function run(session, profile, route, scrollTo) {
  await session.goto(`${BASE}${route}`, { settleMs: 2200 });
  if (scrollTo) {
    await session.eval(`window.scrollTo(0, ${scrollTo}); true`);
    await sleep(500);
  }
  const head = await session.eval(STATE);
  console.log(
    `\n  [${profile.name}] ${route} scrollY=${head.scrollY} glass=${head.glass}`
  );

  await probe(
    session,
    "navbar Search btn",
    'button[aria-label="Search"]',
    (b, a) => a.searchFieldOpen && !b.searchFieldOpen
  );
  await run_reset(session, route, scrollTo);

  await probe(session, "navbar Sign in", 'header a[href="/login"]', (b, a) => a.url === "/login");
  await run_reset(session, route, scrollTo);

  await probe(session, "navbar Movies", 'header a[href="/movies"]', (b, a) => a.url === "/movies");
  await run_reset(session, route, scrollTo);

  await probe(session, "navbar Logo", 'header a[aria-label="Reelhouse home"]', (b, a) => a.url === "/");
  await run_reset(session, route, scrollTo);

  await probe(
    session,
    "search input focus",
    'header input[type="search"]',
    () => true
  );
}

async function run_reset(session, route, scrollTo) {
  await session.goto(`${BASE}${route}`, { settleMs: 1400 });
  if (scrollTo) {
    await session.eval(`window.scrollTo(0, ${scrollTo}); true`);
    await sleep(400);
  }
}

async function main() {
  const chrome = await launchChrome({ port: 9334 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");

  for (const profile of PROFILES) {
    await session.emulate(profile);
    console.log(`\n=== ${profile.name} (${profile.width}x${profile.height}) ===`);
    await run(session, profile, "/", 0);
    await run(session, profile, "/", 600);
    await run(session, profile, "/movies", 0);
  }

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
