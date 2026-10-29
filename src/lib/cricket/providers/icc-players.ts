import "server-only";

import { playerNameKey } from "../shared";
import { iccPlayerImage } from "./icc-rankings";

// ---------------------------------------------------------------------------
// ICC player directory.
//
// The ICC website's search and player profiles are backed by this public stats
// feed. It carries every registered India player — including uncapped and
// domestic players who are not in any ranking table — but only names and ids.
// The portrait itself is served from the same Cloudinary asset keyed by the
// ICC id, so the directory is enough to find headshots the rankings miss.
//
// The feed needs no key beyond the public client id the ICC site itself sends.
// ---------------------------------------------------------------------------

const DIRECTORY_URL = "https://assets-icc.sportz.io/cricket/v1/player";
const CLIENT_ID = "tPZJbRgIub3Vua93/DWtyQ==";
const PAGE_SIZE = 1000;
const REVALIDATE_SECONDS = 6 * 60 * 60;

interface IccPlayerRow {
  id?: string | number;
  name?: string;
  full_name?: string;
}

interface IccPlayerPage {
  data?: unknown;
  meta?: { count?: number };
}

/**
 * Name → ICC portrait. A name shared by more than one registered player is
 * dropped rather than guessed, because a wrong headshot is worse than initials.
 */
export function parseIccPlayerDirectory(rows: unknown): Map<string, string> {
  const grouped = new Map<string, Set<string>>();
  if (!Array.isArray(rows)) return new Map();

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as IccPlayerRow;
    const id = String(row.id ?? "").trim();
    const name = String(row.name || row.full_name || "").trim();
    if (!/^\d+$/.test(id) || !name) continue;
    const key = playerNameKey(name);
    if (!key) continue;
    const ids = grouped.get(key) ?? new Set<string>();
    ids.add(id);
    grouped.set(key, ids);
  }

  const photos = new Map<string, string>();
  for (const [key, ids] of grouped) {
    if (ids.size !== 1) continue;
    const imageUrl = iccPlayerImage([...ids][0]);
    if (imageUrl) photos.set(key, imageUrl);
  }
  return photos;
}

async function fetchPage(page: number): Promise<IccPlayerPage> {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    feed_format: "json",
    lang: "en",
    nationality_id: "4",
    pagination: "true",
    page_number: String(page),
    page_size: String(PAGE_SIZE),
  });
  const response = await fetch(`${DIRECTORY_URL}?${query.toString()}`, {
    cache: "force-cache",
    next: { revalidate: REVALIDATE_SECONDS },
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ICC player directory returned ${response.status}`);
  return (await response.json()) as IccPlayerPage;
}

let cached: { at: number; photos: Map<string, string> } | null = null;
const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;

/** Every registered India player's portrait, or an empty map on failure. */
export async function fetchIccIndianPlayerPhotos(): Promise<Map<string, string>> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.photos;

  try {
    const first = await fetchPage(1);
    const rows = Array.isArray(first.data) ? first.data : [];
    const total = Math.max(rows.length, first.meta?.count ?? 0);
    const pages = Math.min(5, Math.ceil(total / PAGE_SIZE));
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, index) => fetchPage(index + 2))
    );
    const allRows = [rows, ...rest.map((page) => (Array.isArray(page.data) ? page.data : []))].flat();
    const photos = parseIccPlayerDirectory(allRows);
    cached = { at: Date.now(), photos };
    return photos;
  } catch {
    return new Map();
  }
}
