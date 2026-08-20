import { networkInterfaces } from "node:os";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Regression guard for the dev-server origin allowlist.
//
// `next dev` prints a `Network: http://<lan-ip>:3000` URL and then, by default,
// answers requests from that origin with 403 Unauthorized for anything under
// /_next — see next/dist/server/lib/router-utils/block-cross-site-dev.js, whose
// allowlist is only ['**.localhost', 'localhost', ...allowedDevOrigins]. HTML and
// CSS still stream, so the page LOOKS right on a phone, but every client chunk is
// blocked, React never hydrates, and every onClick/onSubmit control on the site is
// inert while plain <a href> links keep working.
//
// That is exactly the failure this project hit when testing from an Android phone
// over the LAN, so the config enumerates this machine's own addresses. This suite
// exists to make a regression loud: delete or narrow `allowedDevOrigins` and it
// fails here rather than three days later on a real device.
//
// `next start` never runs that check, so production is unaffected either way.
// ---------------------------------------------------------------------------

const config = (await import("../../../next.config.mjs")).default as {
  allowedDevOrigins?: string[];
};

/** Every non-internal address this machine can be reached on. */
function localAddresses(): string[] {
  const out: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal) continue;
      out.push(address.address.split("%")[0]);
    }
  }
  return out;
}

describe("allowedDevOrigins", () => {
  it("is a list of plain host strings", () => {
    expect(Array.isArray(config.allowedDevOrigins)).toBe(true);
    expect(config.allowedDevOrigins!.length).toBeGreaterThan(0);
    for (const host of config.allowedDevOrigins!) {
      expect(typeof host).toBe("string");
      expect(host).not.toBe("");
      // A scheme, a port or a path here could never match: Next compares the
      // Origin header's hostname alone, by exact string equality
      // (server/app-render/csrf-protection.js → isCsrfOriginAllowed).
      // IPv6 literals carry colons of their own, so a bare ":\d+$" would flag
      // "::1"; the port shapes are spelled out instead — "host:3000" and
      // "[::1]:3000" are rejected while "::1" and "[::1]" are not.
      expect(host).not.toMatch(/^https?:|\/|^[^:]+:\d+$|\]:\d+$/);
    }
  });

  it("allows loopback, which is what `npm run dev` opens locally", () => {
    expect(config.allowedDevOrigins).toContain("127.0.0.1");
    // `new URL("http://[::1]:3000").hostname` is "[::1]" — brackets included —
    // and the comparison is exact, so the bracketed form is the one that can
    // actually match an IPv6 origin. The bare form is kept alongside it as
    // documentation of intent.
    expect(config.allowedDevOrigins).toContain("[::1]");
    expect(config.allowedDevOrigins).toContain("::1");
  });

  it("allows every LAN address this machine answers on", () => {
    // The list is derived from the same source, so this asserts the derivation
    // still runs at all — an empty or hard-coded list fails here.
    for (const address of localAddresses()) {
      expect(config.allowedDevOrigins).toContain(address);
      if (address.includes(":")) {
        expect(config.allowedDevOrigins).toContain(`[${address}]`);
      }
    }
  });

  it("carries no zone id, which an Origin header never has", () => {
    for (const host of config.allowedDevOrigins!) {
      expect(host).not.toContain("%");
    }
  });

  it("uses literal addresses rather than wildcards", () => {
    // matchWildcardDomain() splits on "." and rejects a single-segment pattern,
    // so "192.168.**" silently matches nothing. Enumerating real addresses is
    // both narrower and actually effective.
    for (const host of config.allowedDevOrigins!) {
      expect(host).not.toContain("*");
    }
  });
});
