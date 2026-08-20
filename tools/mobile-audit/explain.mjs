// Reads report.json and separates two things audit.mjs deliberately does not
// distinguish:
//
//   - a control that is INERT ON PURPOSE (`pointer-events: none` while hidden).
//     `elementFromPoint` correctly skips it, so audit.mjs logs it as "blocked" —
//     but that is the fix working, and what matters is WHICH element now receives
//     the tap underneath it.
//   - a control that is live and still covered by something else. That is a bug.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/explain.mjs [substring-of-label]

import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync("tools/mobile-audit/report.json", "utf8"));
const filter = process.argv[2];

for (const run of report.runs) {
  const rows = run.bad.filter((b) => !filter || (b.label ?? "").includes(filter));
  const inert = rows.filter((b) => b.css.pointerEvents === "none");
  const live = rows.filter((b) => b.css.pointerEvents !== "none");
  if (!rows.length) continue;

  console.log(`\n=== [${run.profile}] ${run.route} ===`);

  if (inert.length) {
    console.log(`  INERT ON PURPOSE (pointer-events:none) — ${inert.length}`);
    // Group by what now receives the tap, which is the thing to sanity-check.
    const by = new Map();
    for (const b of inert) {
      const s = b.samples.find((x) => x.outcome === "blocked" || x.outcome === "ancestor");
      const k = `${s.outcome} -> ${s.hit}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    for (const [k, n] of by) console.log(`    x${n}  tap lands on ${k}`);
  }

  if (live.length) {
    console.log(`  LIVE BUT COVERED — ${live.length}  <-- real defects`);
    for (const b of live) {
      const s = b.samples.find((x) => x.outcome === "blocked" || x.outcome === "ancestor");
      console.log(
        `    <${b.tag}> "${b.label}" ${b.rect.w}x${b.rect.h} @${b.rect.x},${b.rect.y}` +
          `  pe=${b.css.pointerEvents} pos=${b.css.position} z=${b.css.zIndex}`
      );
      console.log(`        ${s.where}(${s.x},${s.y}) -> ${s.outcome} ${s.hit} @${s.hitRect.x},${s.hitRect.y} ${s.hitRect.w}x${s.hitRect.h}`);
      for (const a of b.selfChain) {
        console.log(`        self^ ${a.node}  pos=${a.position} z=${a.zIndex} pe=${a.pointerEvents} tf=${a.transform} op=${a.opacity} ov=${a.overflow}`);
      }
    }
  }
}
