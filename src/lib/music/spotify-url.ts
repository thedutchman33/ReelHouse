// Spotify playlist links, validated without Spotify Web API, OAuth or network
// access. Only the documented public formats are accepted:
//
//   https://open.spotify.com/playlist/PLAYLIST_ID
//   https://open.spotify.com/playlist/PLAYLIST_ID?si=...
//   spotify:playlist:PLAYLIST_ID
//
// The extracted id is used for the official embed (open.spotify.com/embed) and
// for duplicate detection. Nothing here fetches a tracklist.

export interface SpotifyPlaylistLink {
  /** 22 character Spotify playlist id. */
  id: string;
  /** Canonical share URL, safe to persist as the external source. */
  url: string;
  /** Spotify URI form used as the stable external id. */
  uri: string;
  /** Official public embed URL. */
  embedUrl: string;
}

export type SpotifyPlaylistLinkResult =
  | { ok: true; link: SpotifyPlaylistLink }
  | { ok: false; error: string };

// Spotify ids are Base62 and exactly 22 characters.
const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_HOST = /^(?:open|play)\.spotify\.com$/i;

function malformed(error = "That playlist link is not valid. Check the link and try again.") {
  return { ok: false as const, error };
}

export function spotifyPlaylistFromId(id: string): SpotifyPlaylistLink | null {
  if (!PLAYLIST_ID.test(id)) return null;
  return {
    id,
    url: `https://open.spotify.com/playlist/${id}`,
    uri: `spotify:playlist:${id}`,
    embedUrl: `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`,
  };
}

export function parseSpotifyPlaylistLink(input: string): SpotifyPlaylistLinkResult {
  const value = input.trim();
  if (!value) return malformed("Paste a Spotify playlist link to continue.");
  if (value.length > 500) return malformed();

  // spotify:playlist:ID
  if (/^spotify:/i.test(value)) {
    const match = /^spotify:playlist:([^?\s]+)$/i.exec(value);
    if (!match) {
      if (/^spotify:(track|album|artist|episode|show):/i.test(value)) {
        return malformed("That is a Spotify item link, not a playlist link.");
      }
      return malformed();
    }
    const link = spotifyPlaylistFromId(match[1]);
    return link
      ? { ok: true, link }
      : malformed("That Spotify playlist id looks wrong. Copy the full playlist link again.");
  }

  // Accept links pasted without a scheme, which browsers and chat apps often
  // strip. Only https/http URLs are considered.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return malformed();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return malformed();
  if (!SPOTIFY_HOST.test(url.hostname)) {
    return malformed("Only open.spotify.com playlist links are supported.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  // Spotify localises share links as /intl-de/playlist/ID.
  if (segments[0]?.startsWith("intl-")) segments.shift();
  if (segments[0] !== "playlist") {
    if (segments[0] === "track" || segments[0] === "album" || segments[0] === "artist") {
      return malformed("That is a Spotify item link, not a playlist link.");
    }
    if (segments[0] === "episode" || segments[0] === "show") {
      return malformed("Podcast links are not supported for playlist import.");
    }
    return malformed("That Spotify link does not point to a playlist.");
  }
  if (segments.length !== 2) {
    return malformed("Paste the full Spotify playlist link, including the playlist id.");
  }
  const link = spotifyPlaylistFromId(segments[1]);
  return link
    ? { ok: true, link }
    : malformed("That Spotify playlist id looks wrong. Copy the full playlist link again.");
}

export function spotifyEmbedUrl(link: SpotifyPlaylistLink): string {
  return link.embedUrl;
}
