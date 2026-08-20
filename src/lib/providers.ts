import "server-only";

import type { MediaType, PlaybackServer, SubtitleTrack, VideoSource } from "@/types";
import { buildBuiltInCandidate } from "./playback/builtin";
import { orderProviders } from "./playback/manager";
import {
  isSlotConfigured,
  readProviderSlots,
  slotUnavailableReason,
  templateFor,
} from "./playback/registry";
import type {
  PlaybackCandidate,
  PlaybackPlan,
  ProviderDescriptor,
} from "./playback/types";

// ---------------------------------------------------------------------------
// Playback provider abstraction (analysis §6 / PRD Playback).
//
// The rest of the app NEVER talks to a streaming source directly — it asks
// this module for normalized VideoSource / PlaybackServer data. That keeps
// provider credentials server-side and lets you swap providers without touching
// any UI component.
//
// With no provider slot configured, this returns clearly-labeled, freely-licensed
// sample clips (Blender Foundation open movies, CC-BY) for Reelhouse's own
// built-in player surface. The clips are BUNDLED in this repo and served
// SAME-ORIGIN from /public/media, so playback works fully offline and never
// depends on a remote host.
//
// The "servers" the built-in player lists are original-named entries that all
// resolve to those bundled clips, purely to exercise the server-picker UI. This
// module does NOT and must not resolve real/licensed titles or reuse any real
// third-party service's name. To go live, either configure an authorized
// provider slot (playback/registry.ts + docs/video-provider-setup.md) or
// implement a provider here that calls your AUTHORIZED video partner using
// VIDEO_PROVIDER_BASE/KEY and returns its normalized sources. Do not wire this
// to unauthorized streams, scrapers, or DRM-circumvention endpoints
// (PRD §3 "Does Not Ship").
// ---------------------------------------------------------------------------

export interface VideoProvider {
  /** All selectable sources for a movie, best first. */
  getMovieServers(tmdbId: number): Promise<PlaybackServer[]>;
  /** All selectable sources for one episode, best first. */
  getEpisodeServers(
    tmdbId: number,
    season: number,
    episode: number
  ): Promise<PlaybackServer[]>;
}

// Freely-licensed sample clips (Creative Commons, Blender Foundation open
// movies), bundled under /public/media and served same-origin. They exercise the
// player end-to-end — never to serve real/licensed content.
// `url` is a root-relative path, so the browser fetches it from this app's own
// origin (works offline, and immune to ad blockers / CORS / remote outages).
const SAMPLE_CLIPS: { url: string; title: string }[] = [
  { url: "/media/big-buck-bunny.mp4", title: "Big Buck Bunny (CC-BY, Blender Foundation)" },
  { url: "/media/sintel.mp4", title: "Sintel (CC-BY, Blender Foundation)" },
];

// Bundled sample subtitle tracks (WebVTT, same-origin). They describe what the
// player is showing, so the captions stay honest about the source. The custom
// player parses and renders these itself (for full styling control), so they work
// for any clip regardless of its own embedded tracks.
const SAMPLE_SUBTITLES: SubtitleTrack[] = [
  { label: "English", srcLang: "en", url: "/media/subtitles/sample-en.vtt" },
  { label: "Español", srcLang: "es", url: "/media/subtitles/sample-es.vtt" },
];

// Built-in server catalogue. Original names (NOT any real third-party service).
// `clip` indexes SAMPLE_CLIPS so switching servers visibly changes the video.
const BUILT_IN_SERVER_DEFS: Array<{
  id: string;
  name: string;
  audioLabel: string;
  countryCode: string;
  qualityLabel: string;
  clip: number;
}> = [
  { id: "aurora", name: "Aurora", audioLabel: "Original audio · may include 4K", countryCode: "US", qualityLabel: "Up to 4K", clip: 0 },
  { id: "meridian", name: "Meridian", audioLabel: "Original audio", countryCode: "US", qualityLabel: "1080p", clip: 1 },
  { id: "harbor", name: "Harbor", audioLabel: "Original audio", countryCode: "GB", qualityLabel: "1080p", clip: 0 },
  { id: "cobalt", name: "Cobalt", audioLabel: "German audio", countryCode: "DE", qualityLabel: "1080p", clip: 1 },
  { id: "summit", name: "Summit", audioLabel: "Hindi audio", countryCode: "IN", qualityLabel: "720p", clip: 0 },
  { id: "zephyr", name: "Zephyr", audioLabel: "Japanese audio", countryCode: "JP", qualityLabel: "1080p", clip: 1 },
];

function buildServers(seed: number): PlaybackServer[] {
  // Rotate which clip each server maps to by the seed, so different titles/
  // episodes present a slightly different (still deterministic) ordering.
  return BUILT_IN_SERVER_DEFS.map((def) => {
    const clip = SAMPLE_CLIPS[(def.clip + seed) % SAMPLE_CLIPS.length];
    const source: VideoSource = {
      playbackUrl: clip.url,
      type: "mp4",
      subtitles: SAMPLE_SUBTITLES,
      sourceLabel: `Licensed sample — ${clip.title}`,
      isSample: true,
    };
    return {
      id: def.id,
      name: def.name,
      audioLabel: def.audioLabel,
      countryCode: def.countryCode,
      qualityLabel: def.qualityLabel,
      source,
    };
  });
}

class SampleClipProvider implements VideoProvider {
  async getMovieServers(tmdbId: number): Promise<PlaybackServer[]> {
    return buildServers(Math.abs(tmdbId));
  }

  async getEpisodeServers(
    tmdbId: number,
    season: number,
    episode: number
  ): Promise<PlaybackServer[]> {
    return buildServers(Math.abs(tmdbId * 100 + season * 10 + episode));
  }
}

// Single place to choose the active provider for the built-in surface. Replace
// this with a factory that returns your authorized partner when
// VIDEO_PROVIDER_BASE is set.
function getProvider(): VideoProvider {
  return new SampleClipProvider();
}

/**
 * Resolve the full list of selectable playback servers for a title/episode.
 * The player renders these in its server picker and uses the first as default.
 */
export async function getPlaybackServers(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<PlaybackServer[]> {
  const provider = getProvider();
  if (type === "tv" && season != null && episode != null) {
    return provider.getEpisodeServers(tmdbId, season, episode);
  }
  return provider.getMovieServers(tmdbId);
}

/**
 * Resolve a single (default) playback source. Kept for the /api/playback route
 * and any caller that only needs one source; delegates to getPlaybackServers.
 */
export async function getPlaybackSource(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<VideoSource> {
  const servers = await getPlaybackServers(type, tmdbId, season, episode);
  return servers[0].source;
}

// ---------------------------------------------------------------------------
// Playback plan (five configurable provider slots + the built-in surface).
//
// The watch page asks for a PLAN rather than a source: every provider that could
// serve this title, priority-ordered, plus the payload for the ones that can.
// The client container then renders whichever one is selected. Provider URLs and
// configuration live in the environment (see src/lib/playback/registry.ts and
// docs/video-provider-setup.md) — never in a page or component.
//
// `providers` is exactly what the provider selector lists: the operator's
// configured slots and nothing else. Untouched slots are omitted, so the UI can
// never advertise a provider that does not exist.
//
// With no slot configured — the state this ships in — `providers` is empty (no
// selector is shown) and the only candidate is Reelhouse's own built-in surface,
// so playback behaves exactly as it did before the provider layer existed.
// ---------------------------------------------------------------------------

/** Descriptor + optional candidate for one configurable slot. */
function describeSlot(
  config: ReturnType<typeof readProviderSlots>[number],
  type: MediaType
): { provider: ProviderDescriptor; candidate: PlaybackCandidate | null } {
  const reason = slotUnavailableReason(config, type);
  const provider: ProviderDescriptor = {
    id: config.id,
    displayName: config.displayName,
    priority: config.priority,
    // A real provider supplies its own complete player UI.
    surface: "embed",
    capabilities: config.capabilities,
    available: reason === null,
    ...(reason === null ? {} : { unavailableReason: reason }),
    isBuiltIn: false,
  };
  const urlTemplate = templateFor(config, type);
  return {
    provider,
    candidate:
      reason === null && urlTemplate
        ? { provider, surface: { kind: "embed", urlTemplate } }
        : null,
  };
}

/**
 * Everything needed to play one title/episode: the configured providers (ordered
 * by priority, including unavailable ones so the selector can explain them) and
 * every playable candidate, the built-in surface last.
 */
export async function getPlaybackPlan(
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<PlaybackPlan> {
  const servers = await getPlaybackServers(type, tmdbId, season, episode);

  const providers: ProviderDescriptor[] = [];
  // The built-in surface is a candidate but never a listed provider.
  const candidates: PlaybackCandidate[] = [buildBuiltInCandidate({ servers })];

  for (const config of readProviderSlots()) {
    // An entirely untouched slot stays out of the UI; a slot the owner has
    // started configuring shows up (disabled, with the reason) so a mistake is
    // visible rather than silent.
    if (!isSlotConfigured(config) && !config.configError) continue;
    const { provider, candidate } = describeSlot(config, type);
    providers.push(provider);
    if (candidate) candidates.push(candidate);
  }

  return {
    providers: orderProviders(providers),
    candidates: candidates.sort((a, b) =>
      a.provider.priority - b.provider.priority ||
      (a.provider.id < b.provider.id ? -1 : 1)
    ),
  };
}
