import { afterEach, describe, expect, it } from "vitest";
import {
  buildCricketPlaybackPlan,
  CRICKET_EMBED_SANDBOX,
  CRICKET_NESTED_ORIGINS,
  getCricketEmbedAllowlist,
  readCricketServers,
  type CricketServerConfig,
} from "@/lib/cricket-playback";
import { CRICKET_EMBED_PATH } from "@/lib/cricket-embed";
import { getPlaybackServers } from "@/lib/providers";

// ---------------------------------------------------------------------------
// Cricket plan tests. The server list is environment-backed, so these cover
// both the pure builder and the env reader. The important invariant: the
// iframe never points at a source page directly — every playable candidate is
// the same-origin sanitizer, with the source URL encoded in its query.
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "CRICKET_SERVER_1_NAME",
  "CRICKET_SERVER_1_URL",
  "CRICKET_SERVER_1_MEDIA_TYPES",
  "CRICKET_SERVER_1_ENABLED",
  "CRICKET_SERVER_1_PRIORITY",
  "CRICKET_SERVER_2_NAME",
  "CRICKET_SERVER_2_URL",
  "CRICKET_SERVER_2_MEDIA_TYPES",
  "CRICKET_SERVER_2_ENABLED",
  "CRICKET_SERVER_3_NAME",
  "CRICKET_SERVER_3_URL",
  "CRICKET_SERVER_3_MEDIA_TYPES",
  "CRICKET_SERVER_4_NAME",
  "CRICKET_SERVER_4_URL",
  "CRICKET_SERVER_4_MEDIA_TYPES",
] as const;

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    saved.delete(key);
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = value;
}

describe("cricket server environment", () => {
  it("reads configured slots and leaves untouched slots out", () => {
    setEnv("CRICKET_SERVER_1_NAME", "Server 1");
    setEnv("CRICKET_SERVER_1_URL", "https://newball.pages.dev/HIN");
    setEnv("CRICKET_SERVER_1_MEDIA_TYPES", "cricket");
    setEnv("CRICKET_SERVER_2_NAME", "Server 2");
    setEnv("CRICKET_SERVER_2_URL", "https://newball.pages.dev/");
    setEnv("CRICKET_SERVER_2_MEDIA_TYPES", "cricket");

    const servers = readCricketServers();
    expect(servers.map((server) => server.id)).toEqual([
      "cricket-1",
      "cricket-2",
    ]);
    expect(servers[0].url).toBe("https://newball.pages.dev/HIN");
    expect(servers[0].priority).toBe(10);
    expect(servers.every((server) => server.enabled !== false)).toBe(true);
  });

  it("marks a slot whose MEDIA_TYPES excludes cricket as disabled", () => {
    setEnv("CRICKET_SERVER_1_NAME", "Wrong type");
    setEnv("CRICKET_SERVER_1_URL", "https://example.test/live");
    setEnv("CRICKET_SERVER_1_MEDIA_TYPES", "movie");

    const [server] = readCricketServers();
    expect(server.enabled).toBe(false);
    expect(server.note).toMatch(/cricket/i);
  });

  it("honours an explicit disable and priority", () => {
    setEnv("CRICKET_SERVER_1_NAME", "Later");
    setEnv("CRICKET_SERVER_1_URL", "https://example.test/live");
    setEnv("CRICKET_SERVER_1_PRIORITY", "200");
    setEnv("CRICKET_SERVER_2_NAME", "Off");
    setEnv("CRICKET_SERVER_2_URL", "https://example.test/off");
    setEnv("CRICKET_SERVER_2_ENABLED", "0");

    const servers = readCricketServers();
    expect(servers[0].priority).toBe(200);
    expect(servers[1].enabled).toBe(false);
  });

  it("builds the allowlist from configured origins plus known nested players", () => {
    setEnv("CRICKET_SERVER_1_NAME", "One");
    setEnv("CRICKET_SERVER_1_URL", "https://newball.pages.dev/HIN");
    setEnv("CRICKET_SERVER_2_NAME", "Two");
    setEnv("CRICKET_SERVER_2_URL", "https://dekhobhai.pages.dev/HIN");

    const origins = getCricketEmbedAllowlist();
    for (const origin of CRICKET_NESTED_ORIGINS) {
      expect(origins.has(origin)).toBe(true);
    }
  });
});

describe("cricket playback plan", () => {
  const servers: CricketServerConfig[] = [
    {
      id: "cricket-1",
      name: "Ready",
      url: "https://newball.pages.dev/HIN",
      priority: 10,
    },
    {
      id: "cricket-2",
      name: "Missing URL",
      url: "",
      priority: 20,
    },
    {
      id: "cricket-3",
      name: "Unsafe",
      url: "javascript:alert(1)",
      priority: 30,
    },
    {
      id: "cricket-4",
      name: "Plain HTTP",
      url: "http://example.test/live",
      priority: 40,
    },
    {
      id: "cricket-5",
      name: "Off",
      url: "https://example.test/off",
      priority: 50,
      enabled: false,
      note: "Source is between events",
    },
  ];

  const plan = buildCricketPlaybackPlan(servers);

  it("keeps every configured row but only playable ones become candidates", () => {
    expect(plan.providers).toHaveLength(servers.length);
    expect(plan.candidates.map((candidate) => candidate.provider.id)).toEqual([
      "cricket-1",
    ]);
    expect(plan.providers.every((provider) => !provider.isBuiltIn)).toBe(true);
    expect(plan.providers[4].unavailableReason).toBe("Source is between events");
    expect(plan.providers[1].unavailableReason).toMatch(/no stream url/i);
    expect(plan.providers[2].unavailableReason).toMatch(/https/i);
    expect(plan.providers[3].unavailableReason).toMatch(/https/i);
  });

  it("frames the sanitizer, not the source page", () => {
    const [candidate] = plan.candidates;
    expect(candidate.surface.kind).toBe("embed");
    if (candidate.surface.kind !== "embed") return;

    expect(candidate.surface.urlTemplate.startsWith(`${CRICKET_EMBED_PATH}?url=`)).toBe(
      true
    );
    expect(candidate.surface.urlTemplate).toContain(
      encodeURIComponent("https://newball.pages.dev/HIN")
    );
    expect(candidate.surface.urlTemplate).not.toContain("newball.pages.dev/HIN");
    expect(candidate.surface.sandbox).toBe(CRICKET_EMBED_SANDBOX);
  });

  it("marks the plan as cricket-only", () => {
    for (const provider of plan.providers) {
      expect(provider.surface).toBe("embed");
      expect(provider.capabilities.supportedMediaTypes).toEqual(["cricket"]);
      expect(provider.capabilities.canReportProgress).toBe(false);
      expect(provider.capabilities.canReportFailure).toBe(false);
    }
  });

  it("never falls back to the bundled sample clips", async () => {
    await expect(getPlaybackServers("cricket", 1)).resolves.toEqual([]);
  });
});
