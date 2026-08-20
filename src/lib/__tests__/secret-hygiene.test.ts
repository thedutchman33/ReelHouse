import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Secret-hygiene guard (Phase 4 / M5). A static source scan that codifies two
// invariants M2/M3 verified by hand, so a future change can't silently regress
// them. Pure source analysis — no build artifact, no runtime, no network.
//
//   (1) The ONLY NEXT_PUBLIC_ env vars referenced under src/ are the two
//       Supabase public values. Any other NEXT_PUBLIC_* would inline its value
//       into the client bundle — the one channel by which a server secret could
//       reach the browser.
//   (2) No source line logs a raw environment variable (a `console.*` call that
//       also references `process.env`), the obvious way a secret could land in
//       a log. This is a line-level heuristic — it documents intent and catches
//       the common footgun; it is not a formal taint analysis.
//
// The walk skips `__tests__`, so this file (which necessarily mentions the
// allowlisted names and `process.env`) is not scanned by its own rules.

const SRC = join(process.cwd(), "src");

const ALLOWED_PUBLIC = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = sourceFiles(SRC).map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

describe("secret hygiene (static source scan)", () => {
  it("scans a non-trivial number of source files", () => {
    // Sanity: guards against a broken path silently scanning nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it("exposes only the allowlisted NEXT_PUBLIC_ variables to the browser", () => {
    const offenders: Record<string, string[]> = {};
    for (const { path, text } of files) {
      for (const token of text.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []) {
        if (!ALLOWED_PUBLIC.has(token)) {
          (offenders[token] ??= []).push(path);
        }
      }
    }
    expect(
      offenders,
      "Unexpected NEXT_PUBLIC_ vars would ship to the client bundle"
    ).toEqual({});
  });

  it("never logs a raw environment variable", () => {
    const offenders: string[] = [];
    for (const { path, text } of files) {
      text.split(/\r?\n/).forEach((line, i) => {
        if (/console\.\w+\(/.test(line) && /process\.env/.test(line)) {
          offenders.push(`${path}:${i + 1}`);
        }
      });
    }
    expect(offenders, "console.* must not log process.env directly").toEqual([]);
  });
});
