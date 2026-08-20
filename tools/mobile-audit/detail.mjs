// Dump every hit-test sample plus the blocker's ancestry for one control, so a
// partial overlap is not mistaken for a total one and the stacking cause is read
// off measured values instead of inferred.
//
// Investigation tooling. Not application code.
//
//   node tools/mobile-audit/detail.mjs "Show Lanterns"

import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync("tools/mobile-audit/report.json", "utf8"));
const needle = process.argv[2];
if (!needle) {
  console.error('usage: node detail.mjs "<label substring>"');
  process.exit(1);
}

for (const run of report.runs) {
  for (const b of run.bad) {
    if (!(b.label ?? "").includes(needle)) continue;
    console.log(`\n=== [${run.profile}] ${run.route} — <${b.tag}> "${b.label}" ===`);
    console.log(`  rect ${b.rect.w}x${b.rect.h} @${b.rect.x},${b.rect.y}  pe=${b.css.pointerEvents} pos=${b.css.position} z=${b.css.zIndex} touchAction=${b.css.touchAction}`);
    for (const s of b.samples) {
      const tail = s.outcome === "self" || s.outcome === "nothing" || s.outcome === "offscreen"
        ? ""
        : ` -> ${s.hit} @${s.hitRect.x},${s.hitRect.y} ${s.hitRect.w}x${s.hitRect.h}`;
      console.log(`    ${s.where.padEnd(13)} (${s.x},${s.y})  ${s.outcome}${tail}`);
    }
    const blocked = b.samples.find((s) => s.hitChain);
    if (blocked) {
      console.log(`  blocker ancestry:`);
      for (const a of blocked.hitChain) {
        console.log(`    ${a.node}\n        pos=${a.position} z=${a.zIndex} pe=${a.pointerEvents} tf=${a.transform} op=${a.opacity} iso=${a.isolation} filter=${a.filter} contain=${a.contain} ov=${a.overflow}`);
      }
    }
    break; // one instance per run is enough
  }
}
