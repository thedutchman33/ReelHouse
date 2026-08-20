// Hydration probe — does the client bundle actually boot, and do React-only
// controls respond, when the page is loaded the way a PHONE loads it?
//
// A phone on the LAN reaches the dev server by IP (http://192.168.x.x:3000),
// never by `localhost`. Next.js 16 gates its dev-only endpoints on an origin
// allowlist (`allowedDevOrigins`, default ['**.localhost','localhost', <bound
// hostname>]) — see node_modules/next/dist/server/lib/router-utils/
// block-cross-site-dev.js. This probe compares the SAME dev server reached by
// `localhost` vs by LAN IP, records every console error / page exception /
// non-2xx response, and then real-taps a React-only <button> and a plain
// <a href> to see which of the two still work.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/hydration-probe.mjs http://localhost:3124 http://192.168.29.102:3124

import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASES = process.argv.slice(2);
if (BASES.length === 0) {
  console.error("usage: node hydration-probe.mjs <base-url> [<base-url> ...]");
  process.exit(1);
}

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "android-portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "android-landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

/**
 * Is React actually running? Three independent signals, so a single
 * implementation detail changing cannot make this lie:
 *  - a React root/fiber key on a real DOM node
 *  - the flight payload array the App Router streams in
 *  - whether a client component has run its effects (the navbar swaps class on scroll)
 */
const HYDRATED = function hydrated() {
  const hasFiber = (() => {
    const walk = document.querySelectorAll("body *");
    for (let i = 0; i < Math.min(walk.length, 400); i++) {
      for (const k in walk[i]) {
        if (k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$")) return true;
      }
    }
    return false;
  })();
  return {
    reactFiber: hasFiber,
    flight: Array.isArray(window.__next_f) ? window.__next_f.length : null,
    scriptTags: document.querySelectorAll("script[src]").length,
    styleSheets: document.styleSheets.length,
    // Did CSS actually apply? The navbar is `sticky` only via Tailwind.
    navbarPosition: (() => {
      const h = document.querySelector("header");
      return h ? getComputedStyle(h).position : null;
    })(),
  };
};

/** Geometry + hit-test of the VISIBLE instance of a control (skips sm:hidden clones). */
const VISIBLE_RECT = function visibleRect(selector) {
  const els = Array.from(document.querySelectorAll(selector));
  const el = els.find((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return {
    x: Math.round(cx),
    y: Math.round(cy),
    w: Math.round(r.width),
    h: Math.round(r.height),
    reachable: !!hit && (hit === el || el.contains(hit)),
    candidates: els.length,
  };
};

const STATE = function state() {
  return {
    url: location.pathname + location.search,
    searchOpen: !!document.querySelector('button[aria-label="Close search"]'),
    menuOpen: !!document.querySelector('[role="menu"]'),
  };
};

async function collectFor(session, base, route, profile) {
  const consoleErrors = [];
  const exceptions = [];
  const badResponses = [];
  const failed = [];

  const offs = [
    session.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") {
        consoleErrors.push(
          `${p.type}: ${(p.args ?? [])
            .map((a) => a.value ?? a.description ?? a.type)
            .join(" ")
            .slice(0, 300)}`
        );
      }
    }),
    session.on("Runtime.exceptionThrown", (p) => {
      exceptions.push(
        (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "?").slice(0, 400)
      );
    }),
    session.on("Network.responseReceived", (p) => {
      if (p.response.status >= 400) {
        badResponses.push(`${p.response.status} ${p.response.url.slice(0, 140)}`);
      }
    }),
    session.on("Network.loadingFailed", (p) => {
      failed.push(`${p.errorText} ${p.type}`);
    }),
  ];

  await session.goto(`${base}${route}`, { settleMs: 3000 });
  const h = await session.eval(HYDRATED);

  // React-only control: the mobile search toggle is a <button onClick>.
  const searchBtn = await session.eval(VISIBLE_RECT, 'button[aria-label="Search"]');
  let searchResult = "not rendered";
  if (searchBtn) {
    await session.tap(searchBtn.x, searchBtn.y);
    const after = await session.eval(STATE);
    searchResult = after.searchOpen ? "WORKED" : "DEAD";
  }

  // Plain <a href>: navigates with or without React.
  await session.goto(`${base}${route}`, { settleMs: 1800 });
  const signIn = await session.eval(VISIBLE_RECT, 'header a[href="/login"]');
  let signInResult = "not rendered";
  if (signIn) {
    await session.tap(signIn.x, signIn.y);
    await sleep(700);
    const after = await session.eval(STATE);
    signInResult = after.url === "/login" ? "WORKED" : `DEAD (url=${after.url})`;
  }

  for (const off of offs) if (typeof off === "function") off();

  return { h, searchBtn, searchResult, signIn, signInResult, consoleErrors, exceptions, badResponses, failed };
}

async function main() {
  const chrome = await launchChrome({ port: 9335 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Network.enable");

  for (const base of BASES) {
    console.log(`\n############ ${base} ############`);
    for (const profile of PROFILES) {
      await session.emulate(profile);
      const r = await collectFor(session, base, "/", profile);
      console.log(`\n  [${profile.name}]`);
      console.log(
        `    hydrated: reactFiber=${r.h.reactFiber} flight=${r.h.flight} scripts=${r.h.scriptTags} sheets=${r.h.styleSheets} header.position=${r.h.navbarPosition}`
      );
      console.log(
        `    Search <button> : ${r.searchBtn ? `${r.searchBtn.w}x${r.searchBtn.h} @${r.searchBtn.x},${r.searchBtn.y} reachable=${r.searchBtn.reachable} (of ${r.searchBtn.candidates} in DOM)` : "not rendered"} -> ${r.searchResult}`
      );
      console.log(
        `    Sign in <a>     : ${r.signIn ? `${r.signIn.w}x${r.signIn.h} @${r.signIn.x},${r.signIn.y} reachable=${r.signIn.reachable}` : "not rendered"} -> ${r.signInResult}`
      );
      if (r.badResponses.length) console.log(`    NON-2XX (${r.badResponses.length}):`);
      for (const b of r.badResponses.slice(0, 12)) console.log(`      ${b}`);
      if (r.failed.length) console.log(`    LOAD FAILURES (${r.failed.length}): ${r.failed.slice(0, 6).join(" | ")}`);
      if (r.exceptions.length) console.log(`    PAGE EXCEPTIONS (${r.exceptions.length}):`);
      for (const e of r.exceptions.slice(0, 6)) console.log(`      ${e.split("\n")[0]}`);
      if (r.consoleErrors.length) console.log(`    CONSOLE (${r.consoleErrors.length}):`);
      for (const c of r.consoleErrors.slice(0, 8)) console.log(`      ${c.split("\n")[0]}`);
    }
  }

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
