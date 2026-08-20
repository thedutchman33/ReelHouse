import { describe, it, expect } from "vitest";
// Importing from a `server-only` module — this exercises the `server-only`
// alias stub configured in vitest.config.mts (without it this import throws).
import { ensureVtt } from "@/lib/opensubtitles";

describe("ensureVtt", () => {
  it("passes through already-WEBVTT input (trimmed)", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello";
    expect(ensureVtt(vtt)).toBe(vtt);
    expect(ensureVtt(`\n  ${vtt}\n  `)).toBe(vtt);
  });

  it("converts SRT comma timestamps to dots and injects a WEBVTT header", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello";
    const out = ensureVtt(srt);
    expect(out.startsWith("WEBVTT\n\n")).toBe(true);
    expect(out).toContain("00:00:01.000 --> 00:00:02.500");
    expect(out).not.toContain(",000");
    expect(out).not.toContain(",500");
  });

  it("injects a header for plain text with no timestamps", () => {
    expect(ensureVtt("just some text")).toBe("WEBVTT\n\njust some text");
  });

  it("strips a leading BOM", () => {
    expect(ensureVtt("﻿WEBVTT\n\nfoo")).toBe("WEBVTT\n\nfoo");
    // BOM + SRT: still normalizes to a headered VTT.
    const out = ensureVtt("﻿1\n00:00:01,000 --> 00:00:02,000\nHi");
    expect(out.startsWith("WEBVTT")).toBe(true);
    expect(out.charCodeAt(0)).toBe("W".charCodeAt(0)); // no BOM at index 0
    expect(out).toContain("00:00:01.000 --> 00:00:02.000");
  });

  it("normalizes CRLF to LF", () => {
    const out = ensureVtt("WEBVTT\r\n\r\nfoo\r\nbar");
    expect(out).toBe("WEBVTT\n\nfoo\nbar");
    expect(out).not.toContain("\r");
  });
});
