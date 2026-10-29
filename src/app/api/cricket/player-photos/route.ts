import { NextResponse } from "next/server";
import { fetchBcciPlayers } from "@/lib/cricket/providers/bcci";
import { fetchIccIndianPlayerPhotos } from "@/lib/cricket/providers/icc-players";
import {
  fetchIccPlayerPhotos,
  iccPlayerImageExists,
} from "@/lib/cricket/providers/icc-rankings";
import { playerNameKey } from "@/lib/cricket/shared";

// The directory's BCCI portraits are authoritative when they exist; a handful
// of players only have BCCI's generic silhouette. This compact index lets the
// client swap in the official ICC headshot on the image error, without making
// the main dashboard wait for the 1.3 MB ICC rankings page.
//
// ICC's face transform serves a grey silhouette for players without a photo,
// so each candidate is checked against the untransformed asset before it is
// offered as a fallback.
export async function GET() {
  try {
    const [ranked, registered, men, women] = await Promise.all([
      fetchIccPlayerPhotos("IND").catch(() => new Map<string, string>()),
      fetchIccIndianPlayerPhotos(),
      fetchBcciPlayers("men"),
      fetchBcciPlayers("women"),
    ]);
    const directory = new Set(
      [...men, ...women].map((player) => playerNameKey(player.name))
    );

    // Both ICC sources can name the same player; keep every candidate URL so a
    // placeholder in one does not hide a real portrait in the other.
    const candidates = new Map<string, Set<string>>();
    for (const source of [registered, ranked]) {
      for (const [name, imageUrl] of source) {
        if (!directory.has(name)) continue;
        const urls = candidates.get(name) ?? new Set<string>();
        urls.add(imageUrl);
        candidates.set(name, urls);
      }
    }

    // Cloudinary is happy to answer many small HEAD requests, but keep the
    // fan-out modest so a cold route never opens the whole set at once.
    const verified: [string, string][] = [];
    const queue = [...candidates];
    await Promise.all(
      Array.from({ length: Math.min(8, queue.length) }, async () => {
        while (queue.length > 0) {
          const [name, urls] = queue.shift()!;
          for (const imageUrl of urls) {
            if (await iccPlayerImageExists(imageUrl)) {
              verified.push([name, imageUrl]);
              break;
            }
          }
        }
      })
    );

    return NextResponse.json(
      { photos: Object.fromEntries(verified) },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { photos: {} },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
