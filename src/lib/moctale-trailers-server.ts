import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TrailerFeed, TrailerKind } from "@/types";
import {
  extractMoctaleSpacesPayload,
  parseMoctaleSpacesFeed,
} from "./moctale-trailers";

const execFileAsync = promisify(execFile);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SPACES_URL = "https://www.moctale.in/spaces";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;

const cache = new Map<
  string,
  { expiresAt: number; value: TrailerFeed | null }
>();
const inflight = new Map<string, Promise<TrailerFeed | null>>();

async function fetchSpacesHtml(page: number): Promise<string | null> {
  const cookie = process.env.MOCTALE_COOKIE?.trim();
  if (!cookie) return null;

  try {
    // Cloudflare rejects Node's TLS fingerprint for some Moctale requests; the
    // existing Moctale server bridge uses curl for the same reason.
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--silent",
        "--show-error",
        "--location",
        "--compressed",
        "--max-time",
        "12",
        "--user-agent",
        USER_AGENT,
        "--cookie",
        cookie,
        `${SPACES_URL}?page=${page}&space_type=VIDEOS`,
      ],
      {
        encoding: "utf8",
        maxBuffer: 24 * 1024 * 1024,
        timeout: 15000,
        windowsHide: true,
      }
    );
    return stdout;
  } catch {
    return null;
  }
}

/**
 * The authenticated Moctale Spaces video feed, ordered by the post's
 * published_at. Returns null when the cookie is absent, the session expired,
 * or the payload cannot be parsed; /trailers then keeps its TMDB feed.
 */
export async function getMoctaleTrailerFeed(
  kind: TrailerKind,
  page = 1
): Promise<TrailerFeed | null> {
  if (!process.env.MOCTALE_COOKIE?.trim()) return null;

  const safePage = Math.max(1, Math.floor(page) || 1);
  const key = `${kind}:${safePage}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const html = await fetchSpacesHtml(safePage);
    const payload = html ? extractMoctaleSpacesPayload(html) : null;
    const feed = payload
      ? parseMoctaleSpacesFeed(payload, kind, safePage)
      : null;

    cache.set(key, {
      expiresAt: Date.now() + (feed ? CACHE_TTL_MS : FAILURE_TTL_MS),
      value: feed,
    });
    return feed;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, request);
  return request;
}
