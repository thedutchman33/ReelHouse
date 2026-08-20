// Desktop reveal-on-hover regression probe.
//
// The mobile fix for the card/row "reveal" controls was to pair `opacity-0` with
// `pointer-events-none` (the `.hover-reveal` utility in globals.css): an
// invisible-but-hittable control was swallowing taps meant for the poster
// underneath. Making something inert is easy to over-apply, so this checks the
// other half of the contract on a real desktop profile — that the same control
// still becomes visible AND clickable on hover, and on focus for a keyboard
// user, and that at rest the tap goes to the poster link instead.
//
// Two things this has to get right, both learned the hard way:
//   * opacity/pointer-events live on the `.hover-reveal` WRAPPER, not on the
//     button inside it. `opacity` does not inherit, so a child of an invisible
//     wrapper still computes opacity 1 — measure the wrapper, hit-test the child.
//   * "park the pointer away" has to mean away from every `.group`/`.group/row`.
//     A row spans the full width of the page, so the viewport corners are inside
//     one, and parking there leaves the arrows legitimately revealed.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/hover-probe.mjs http://127.0.0.1:3123
//
// Each control reports three states. Expected:
//   at rest  -> opacity 0, pointer-events none, hit = the card/link beneath
//   hovered  -> opacity 1, pointer-events auto, hit = self
//   focused  -> opacity 1, pointer-events auto (the ":focus-within" branch)

import { launchChrome, Session, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3123";
const DESKTOP = { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false, touch: false, ua: null };

/** Tag the probe targets and hand back the anchor each one is revealed by. */
const FIND = function find() {
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
    };
  };
  const out = [];
  const add = (name, button, anchorSel) => {
    if (!button) return;
    const wrapper = button.closest(".hover-reveal");
    if (!wrapper) return;
    const anchor = button.closest(anchorSel) ?? wrapper;
    wrapper.dataset.probe = String(out.length);
    button.dataset.probeBtn = String(out.length);
    out.push({ name, id: String(out.length), anchor: centre(anchor), self: centre(button) });
  };

  // Quick-add on a poster card, revealed by the card's own `.group` hover.
  add(
    "card quick-add",
    document.querySelector('button[aria-label^="Add "], button[aria-label^="Remove "]'),
    ".group"
  );
  // A row's scroll arrows, revealed by MediaRow's named `.group/row` hover.
  add("row arrow", document.querySelector('button[aria-label^="Scroll "]'), "section");

  // Somewhere to park the pointer that reveals nothing: the header sits above
  // every row and is not itself a group.
  const header = document.querySelector("header");
  return { targets: out, rest: header ? centre(header) : { x: 2, y: 2, box: "fallback" } };
};

const STATE = function state(id) {
  const wrapper = document.querySelector(`[data-probe="${id}"]`);
  const button = document.querySelector(`[data-probe-btn="${id}"]`);
  if (!wrapper || !button) return { missing: true };
  const cs = getComputedStyle(wrapper);
  const r = button.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  const short = (n) => {
    if (!n) return "nothing";
    const cls =
      typeof n.className === "string" && n.className.trim()
        ? `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
    return `${n.tagName.toLowerCase()}${cls}`;
  };
  return {
    opacity: cs.opacity,
    pointerEvents: cs.pointerEvents,
    hit: hit === button || button.contains(hit) ? "self" : short(hit),
    hitOwner: hit ? short(hit.closest("a,button") ?? hit) : "nothing",
    tag: button.tagName.toLowerCase(),
    disabled: button.disabled === true || button.getAttribute("aria-disabled") === "true",
    tabIndex: button.tabIndex,
    // Proof the resting measurement really was taken with nothing hovered.
    groupHovered: !!document.querySelector(":is(.group, .group\\/row):hover"),
  };
};

const FOCUS = function focus(id) {
  const el = document.querySelector(`[data-probe-btn="${id}"]`);
  if (!el) return false;
  el.focus();
  return document.activeElement === el;
};

const BLUR = function blur() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  return true;
};

const line = (label, s) =>
  s.missing
    ? `${label.padEnd(9)} not found`
    : `${label.padEnd(9)} opacity=${String(s.opacity).padEnd(4)} pointer-events=${String(s.pointerEvents).padEnd(5)} hit=${s.hit === "self" ? "self" : `${s.hit} (${s.hitOwner})`}`;

async function main() {
  const chrome = await launchChrome({ port: 9351 });
  const session = await Session.attach(chrome.port);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.emulate(DESKTOP);
  await session.goto(`${BASE}/`, { settleMs: 2600 });

  const { targets, rest: restPoint } = await session.eval(FIND);
  if (!targets.length) {
    console.log("No .hover-reveal controls found on / — nothing to check.");
    session.close();
    await chrome.close();
    return;
  }
  console.log(`pointer parked at ${restPoint.x},${restPoint.y} (header) for the resting reads`);

  let bad = 0;
  for (const t of targets) {
    console.log(`\n=== ${t.name} (${t.self.box} at ${t.self.x},${t.self.y}) ===`);

    await session.nudge(restPoint.x, restPoint.y);
    await sleep(500);
    const rest = await session.eval(STATE, t.id);
    console.log(`  ${line("at rest", rest)}  groupHovered=${rest.groupHovered}`);

    await session.nudge(t.anchor.x, t.anchor.y);
    await sleep(500);
    const hover = await session.eval(STATE, t.id);
    console.log(`  ${line("hovered", hover)}`);

    // Focus with the pointer parked away again, so only :focus-within can reveal.
    await session.nudge(restPoint.x, restPoint.y);
    await sleep(500);
    const took = await session.eval(FOCUS, t.id);
    await sleep(300);
    const focus = await session.eval(STATE, t.id);
    console.log(`  ${line("focused", focus)}${took ? "" : "  (focus() did not take)"}`);
    await session.eval(BLUR);

    console.log(`  ${"keyboard".padEnd(9)} <${rest.tag}> disabled=${rest.disabled} tabIndex=${rest.tabIndex}`);

    // `.hover-reveal` fades over 300ms, so a revealed read can legitimately land
    // on 0.9995 — compare numerically rather than against the string "1".
    const shown = (s) => Number.parseFloat(s.opacity) >= 0.99 && s.pointerEvents !== "none";
    const checks = [
      ["nothing hovered during the resting read", rest.groupHovered === false],
      ["inert at rest", rest.pointerEvents === "none" && rest.opacity === "0"],
      ["the element beneath takes the resting tap", rest.hit !== "self"],
      ["revealed on hover", shown(hover)],
      ["clickable on hover", hover.hit === "self"],
      ["revealed on focus", shown(focus)],
      ["keyboard reachable", rest.tag === "button" && !rest.disabled && rest.tabIndex >= 0],
    ];
    for (const [name, ok] of checks) {
      if (!ok) bad++;
      console.log(`  ${ok ? "OK  " : "FAIL"} ${name}`);
    }
  }

  console.log(`\n${bad === 0 ? "All reveal checks passed." : `${bad} reveal check(s) FAILED.`}`);
  session.close();
  await chrome.close();
  await sleep(200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
