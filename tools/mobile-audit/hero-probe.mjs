// Hero chrome probe — the rotator dots sit in a band the home page deliberately
// pulls its content over, so this measures the dots AND the action row they sit
// under, then real-taps a dot to prove the handler actually runs.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/hero-probe.mjs http://127.0.0.1:3124

import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3124";

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "android-portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "android-landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

/** Bring the dot row fully on-screen; in landscape the hero is taller than the viewport. */
const SCROLL_TO_DOTS = function scrollToDots() {
  const d = document.querySelector('button[aria-label^="Show "]');
  if (!d) return null;
  d.scrollIntoView({ block: "center" });
  return true;
};

const MEASURE = function measure() {
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const pts = [
      ["centre", r.left + r.width / 2, r.top + r.height / 2],
      ["top", r.left + r.width / 2, r.top + 2],
      ["bottom", r.left + r.width / 2, r.bottom - 2],
    ];
    const out = pts.map(([where, x, y]) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return `${where}:offscreen`;
      const h = document.elementFromPoint(x, y);
      if (!h) return `${where}:nothing`;
      if (h === el || el.contains(h)) return `${where}:self`;
      const cls = typeof h.className === "string" ? `.${h.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
      return `${where}:BLOCKED(${h.tagName.toLowerCase()}${cls})`;
    });
    return {
      rect: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`,
      hits: out.join(" "),
    };
  };

  const rows = [];
  const push = (name, el) => {
    if (!el) return rows.push({ name, rect: "not rendered", hits: "" });
    rows.push({ name, ...hit(el) });
  };

  // Hero action row — must NOT be affected by the enlarged dot targets.
  const actions = Array.from(document.querySelectorAll("section.relative a, section.relative button"));
  push("Play", actions.find((a) => (a.textContent || "").trim() === "Play"));
  push("More Info", actions.find((a) => (a.textContent || "").trim() === "More Info"));
  push(
    "My List (hero)",
    actions.find((a) => /My List|In My List/.test((a.getAttribute("aria-label") || "") + (a.textContent || "")))
  );

  const dots = Array.from(document.querySelectorAll('button[aria-label^="Show "]'));
  dots.forEach((d, i) => push(`dot ${i}${d.getAttribute("aria-current") === "true" ? " (active)" : ""}`, d));

  const h1 = document.querySelector("h1");
  return { rows, title: h1 ? h1.textContent.trim() : null, dotCount: dots.length };
};

const DOT_POINT = function dotPoint(i) {
  const d = document.querySelectorAll('button[aria-label^="Show "]')[i];
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return {
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
    label: d.getAttribute("aria-label"),
  };
};

const TITLE = function title() {
  const h1 = document.querySelector("h1");
  return h1 ? h1.textContent.trim() : null;
};

async function main() {
  const chrome = await launchChrome({ port: 9337 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");

  for (const profile of PROFILES) {
    await session.emulate(profile);
    await session.goto(`${BASE}/`, { settleMs: 2600 });
    await session.eval(SCROLL_TO_DOTS);
    await sleep(600);

    const m = await session.eval(MEASURE);
    console.log(`\n=== [${profile.name}] hero "${m.title}" — ${m.dotCount} dots ===`);
    for (const r of m.rows) console.log(`  ${r.name.padEnd(16)} ${String(r.rect).padEnd(22)} ${r.hits}`);

    // Functional proof: tapping a non-active dot must swap the hero title.
    const target = m.dotCount > 1 ? 2 % m.dotCount : 0;
    const pt = await session.eval(DOT_POINT, target);
    if (!pt) {
      console.log("  tap: no dot rendered");
      continue;
    }
    const before = await session.eval(TITLE);
    await session.tap(pt.x, pt.y);
    await sleep(500);
    const after = await session.eval(TITLE);
    console.log(
      `  TAP "${pt.label}" @${pt.x},${pt.y}: "${before}" -> "${after}"  ${before !== after ? "WORKED" : "NO CHANGE"}`
    );
  }

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
