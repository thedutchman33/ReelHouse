// Native-surface geometry probe.
//
// The native matrix reported the player's own bottom control bar as "offscreen"
// in landscape and blocked in portrait. This measures the layers involved —
// viewport, the fixed player root, the stage that holds the video, the overlay,
// and the control bar itself — so the cause is read off numbers rather than
// guessed at.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/native-probe.mjs http://127.0.0.1:3125 /watch/movie/969681

import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3124";
const ROUTE = process.argv[3] ?? "/watch/movie/969681";

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

const MEASURE = function measure() {
  const short = (el) => {
    if (!el) return "none";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
    const aria = el.getAttribute && el.getAttribute("aria-label");
    return `${el.tagName.toLowerCase()}${cls}${aria ? `[${aria}]` : ""}`;
  };
  const box = (el) => {
    if (!el) return "not rendered";
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)} (bottom ${Math.round(r.bottom)})`;
  };

  const fs = document.querySelector('button[aria-label="Fullscreen"]');
  const bar = fs ? fs.parentElement : null;
  const overlay = bar ? bar.closest("div.absolute.inset-0") : null;
  const root = document.querySelector("div.fixed.inset-0");
  const video = document.querySelector("video");

  // Every ancestor of the control bar with a size, so an overflowing stage shows up.
  const chain = [];
  for (let n = fs; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    chain.push(`${short(n)} ${box(n)} {pos:${cs.position} ratio:${cs.aspectRatio} of:${cs.overflow}}`);
  }

  const visible = fs
    ? (() => {
        const r = fs.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      })()
    : false;

  return {
    viewport: `${innerWidth}x${innerHeight} (visual ${Math.round(visualViewport.width)}x${Math.round(visualViewport.height)}), scrollY ${Math.round(scrollY)}`,
    doc: `scrollHeight ${document.documentElement.scrollHeight}`,
    root: `${short(root)} ${box(root)}`,
    video: `${short(video)} ${box(video)}`,
    overlay: `${short(overlay)} ${box(overlay)}`,
    bar: `${short(bar)} ${box(bar)}`,
    fullscreenBtn: `${box(fs)} ${visible ? "IN VIEW" : "OUT OF VIEW"}`,
    overlayVisible: overlay ? getComputedStyle(overlay).opacity : "n/a",
    chain,
  };
};

async function main() {
  const chrome = await launchChrome({ port: 9347 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");

  for (const profile of PROFILES) {
    await session.emulate(profile);
    await session.goto(`${BASE}${ROUTE}`, { settleMs: 2800 });
    // Wake the idle-hiding overlay the way a pointer would, without pressing.
    await session.nudge(Math.round(profile.width / 2), Math.round(profile.height / 2));
    await sleep(400);
    const m = await session.eval(MEASURE);
    console.log(`\n=== [${profile.name}] ${profile.width}x${profile.height} ===`);
    console.log(`  viewport   : ${m.viewport}`);
    console.log(`  document   : ${m.doc}`);
    console.log(`  player root: ${m.root}`);
    console.log(`  <video>    : ${m.video}`);
    console.log(`  overlay    : ${m.overlay}  opacity=${m.overlayVisible}`);
    console.log(`  control bar: ${m.bar}`);
    console.log(`  Fullscreen : ${m.fullscreenBtn}`);
    console.log("  ancestors of the Fullscreen button, nearest first:");
    for (const line of m.chain) console.log(`    ${line}`);
  }

  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
