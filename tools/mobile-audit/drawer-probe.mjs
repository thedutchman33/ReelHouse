// Episode-drawer blocker probe.
//
// The tap matrix reported that a touch at the centre of the drawer's "Close
// episodes" button lands on an <svg> that is not inside that button. This probe
// answers *which* element gets the touch and *why* it wins, by walking both
// elements' ancestors and printing the position/z-index of every one that takes
// part in stacking.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/drawer-probe.mjs http://127.0.0.1:3124 /watch/tv/108978?s=1&e=1

import { ANDROID_UA, launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3124";
const ROUTE = process.argv[3] ?? "/watch/tv/108978?s=1&e=1";

const PROFILES = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null },
  { name: "portrait", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
  { name: "landscape", width: 915, height: 412, dpr: 2.625, mobile: true, touch: true, ua: ANDROID_UA },
];

const OPEN_DRAWER = function openDrawer() {
  const b = document.querySelector('button[aria-label="Episodes"]');
  if (!b) return "no Episodes button";
  b.click();
  return "clicked";
};

const MEASURE = function measure() {
  const short = (el) => {
    if (!el) return "none";
    const cls = typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    const aria = el.getAttribute && el.getAttribute("aria-label");
    return `${el.tagName.toLowerCase()}${cls}${aria ? `[${aria}]` : ""}`;
  };

  // Every ancestor that participates in stacking, nearest first.
  const stack = (el) => {
    const out = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position !== "static" || cs.zIndex !== "auto" || cs.transform !== "none") {
        out.push(`${short(n)} {pos:${cs.position} z:${cs.zIndex}}`);
      }
    }
    return out;
  };

  const report = (name, el) => {
    if (!el) return { name, line: "not rendered" };
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    const self = hit === el || el.contains(hit);
    const row = {
      name,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`,
      point: `${x},${y}`,
      hit: self ? "self" : short(hit),
      self,
      mine: stack(el),
    };
    if (!self && hit) {
      row.theirs = stack(hit);
      // The button the blocker actually belongs to, if any.
      const owner = hit.closest("button,a");
      row.owner = owner ? short(owner) : "none";
    }
    return row;
  };

  const drawer = document.querySelector('[role="dialog"][aria-label="Episodes"]');
  const q = (sel, root = drawer) => (root ? root.querySelector(sel) : null);

  const rows = [
    report("Close episodes", q('button[aria-label="Close episodes"]')),
    report("Autoplay toggle", q('button[aria-label="Autoplay next episode"]')),
    report("Season menu", q('button[aria-haspopup="listbox"]')),
    report("Search field", q("input")),
    report("First episode", q("ul button, li button, article button, button.group")),
  ];

  const layer = drawer ? drawer.parentElement : null;
  return {
    drawerOpen: !!drawer,
    layer: layer ? `${short(layer)} {z:${getComputedStyle(layer).zIndex}}` : "none",
    chrome: (() => {
      const ep = document.querySelector('button[aria-label="Episodes"]');
      if (!ep) return "no Episodes button";
      const bar = ep.closest("div.absolute,div.pointer-events-none");
      return bar ? `${short(bar)} {z:${getComputedStyle(bar).zIndex}}` : "no bar";
    })(),
    rows,
  };
};

async function main() {
  const chrome = await launchChrome({ port: 9343 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");

  for (const profile of PROFILES) {
    await session.emulate(profile);
    await session.goto(`${BASE}${ROUTE}`, { settleMs: 2600 });
    const opened = await session.eval(OPEN_DRAWER);
    await sleep(700);
    const m = await session.eval(MEASURE);

    console.log(`\n=== [${profile.name}] ${profile.width}x${profile.height} — Episodes ${opened} ===`);
    console.log(`  drawer layer : ${m.layer}`);
    console.log(`  chrome bar   : ${m.chrome}`);
    for (const r of m.rows) {
      if (r.line) {
        console.log(`  ${r.name.padEnd(16)} ${r.line}`);
        continue;
      }
      console.log(
        `  ${r.name.padEnd(16)} ${r.rect.padEnd(20)} tap@${r.point.padEnd(9)} -> ${r.self ? "SELF" : `BLOCKED by ${r.hit}`}`
      );
      if (!r.self) {
        console.log(`      blocker belongs to: ${r.owner}`);
        console.log(`      its stack        : ${r.theirs.join(" < ")}`);
        console.log(`      my stack         : ${r.mine.join(" < ")}`);
      }
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
