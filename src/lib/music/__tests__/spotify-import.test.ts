import { describe, expect, it } from "vitest";
import { parseSpotifyPlaylistLink } from "../spotify-url";
import {
  parseCsvTracklist,
  parseJsonTracklist,
  parseManualTracklist,
  parseTracklistFile,
} from "../spotify-tracklist";

const ID = "37i9dQZF1E8NTubRzHR8ft";

describe("Spotify playlist link validation", () => {
  it("accepts the canonical playlist URL", () => {
    const result = parseSpotifyPlaylistLink(`https://open.spotify.com/playlist/${ID}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.link.id).toBe(ID);
    expect(result.link.uri).toBe(`spotify:playlist:${ID}`);
    expect(result.link.url).toBe(`https://open.spotify.com/playlist/${ID}`);
    expect(result.link.embedUrl).toContain(`/embed/playlist/${ID}`);
  });

  it("accepts query parameters, trailing slashes and locale paths", () => {
    for (const value of [
      `https://open.spotify.com/playlist/${ID}?si=abc123&utm_source=copy-link`,
      `https://open.spotify.com/playlist/${ID}/`,
      `https://open.spotify.com/intl-de/playlist/${ID}?si=x`,
      `open.spotify.com/playlist/${ID}`,
    ]) {
      expect(parseSpotifyPlaylistLink(value).ok, value).toBe(true);
    }
  });

  it("accepts the spotify: URI form", () => {
    const result = parseSpotifyPlaylistLink(`spotify:playlist:${ID}`);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed and non-playlist links", () => {
    for (const value of [
      "",
      "not a link",
      "https://example.com/playlist/37i9dQZF1E8NTubRzHR8ft",
      "https://open.spotify.com/track/37i9dQZF1E8NTubRzHR8ft",
      "https://open.spotify.com/album/37i9dQZF1E8NTubRzHR8ft",
      "https://open.spotify.com/playlist/short",
      "https://open.spotify.com/playlist/37i9dQZF1E8NTubRzHR8f!",
      "spotify:track:37i9dQZF1E8NTubRzHR8ft",
      "spotify:playlist:tooshort",
      "https://open.spotify.com/playlist/",
      "https://open.spotify.com/playlist/37i9dQZF1E8NTubRzHR8ft/extra",
    ]) {
      expect(parseSpotifyPlaylistLink(value).ok, value).toBe(false);
    }
  });

  it("tells the user when they pasted a track instead of a playlist", () => {
    const result = parseSpotifyPlaylistLink(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not a playlist/i);
  });
});

describe("manual tracklist parsing", () => {
  it("parses Song Title - Artist Name lines in order", () => {
    const parsed = parseManualTracklist(
      "Kesariya - Arijit Singh\nTum Hi Ho - Arijit Singh\n\n# comment\nShape of You - Ed Sheeran"
    );
    expect(parsed.entries).toEqual([
      { name: "Kesariya", artists: ["Arijit Singh"] },
      { name: "Tum Hi Ho", artists: ["Arijit Singh"] },
      { name: "Shape of You", artists: ["Ed Sheeran"] },
    ]);
    expect(parsed.duplicates).toBe(0);
  });

  it("handles numbered lines, en dashes and multiple artists", () => {
    const parsed = parseManualTracklist(
      "1. Kesariya – Arijit Singh, Pritam\n02 - Brown Munde - AP Dhillon & Gurinder Gill"
    );
    expect(parsed.entries[0]).toEqual({ name: "Kesariya", artists: ["Arijit Singh", "Pritam"] });
    expect(parsed.entries[1].name).toBe("Brown Munde");
    expect(parsed.entries[1].artists).toEqual(["AP Dhillon", "Gurinder Gill"]);
  });

  it("keeps a title with no artist and counts duplicates", () => {
    const parsed = parseManualTracklist("Instrumental Intro\nKesariya - Arijit Singh\nKesariya - Arijit Singh");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].artists).toEqual([]);
    expect(parsed.duplicates).toBe(1);
    expect(parsed.warnings.join(" ")).toMatch(/duplicate/i);
  });

  it("reports an empty paste instead of inventing tracks", () => {
    const parsed = parseManualTracklist("   \n\n");
    expect(parsed.entries).toEqual([]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe("CSV tracklist parsing", () => {
  it("maps a header row", () => {
    const parsed = parseCsvTracklist(
      'title,artist,album,duration\n"Kesariya","Arijit Singh","Brahmastra",4:28\n"Tum Hi Ho","Arijit Singh","Aashiqui 2",4:22'
    );
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toEqual({
      name: "Kesariya",
      artists: ["Arijit Singh"],
      album: "Brahmastra",
      durationMs: 268_000,
    });
  });

  it("falls back to positional columns", () => {
    const parsed = parseCsvTracklist("Kesariya,Arijit Singh,Brahmastra\nTum Hi Ho,Arijit Singh");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[1].artists).toEqual(["Arijit Singh"]);
  });

  it("handles quoted commas in a title", () => {
    const parsed = parseCsvTracklist('title,artist\n"Hello, World","Artist"');
    expect(parsed.entries[0].name).toBe("Hello, World");
  });
});

describe("JSON tracklist parsing", () => {
  it("reads Spotify-style nested tracks and playlist metadata", () => {
    const parsed = parseJsonTracklist(
      JSON.stringify({
        name: "Road Trip",
        description: "Hindi favourites",
        tracks: {
          items: [
            {
              track: {
                id: "4cOdK2wGLETKBW3PvgPWqT",
                name: "Kesariya",
                artists: [{ name: "Arijit Singh" }],
                album: { name: "Brahmastra" },
                duration_ms: 268_000,
              },
            },
            { track: { trackName: "Tum Hi Ho", artistName: "Arijit Singh", albumName: "Aashiqui 2" } },
          ],
        },
      })
    );
    expect(parsed.playlistName).toBe("Road Trip");
    expect(parsed.playlistDescription).toBe("Hindi favourites");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].spotifyTrackId).toBe("4cOdK2wGLETKBW3PvgPWqT");
    expect(parsed.entries[1].album).toBe("Aashiqui 2");
  });

  it("reads a plain array of titles and artists", () => {
    const parsed = parseJsonTracklist(
      JSON.stringify([
        { title: "Kesariya", artist: "Arijit Singh" },
        { title: "Brown Munde", artists: ["AP Dhillon", "Gurinder Gill"], duration: 248 },
      ])
    );
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[1].artists).toEqual(["AP Dhillon", "Gurinder Gill"]);
    expect(parsed.entries[1].durationMs).toBe(248_000);
  });

  it("reports invalid JSON and multiple-playlist exports", () => {
    expect(parseJsonTracklist("{").warnings[0]).toMatch(/not valid JSON/i);
    expect(
      parseJsonTracklist(JSON.stringify({ playlists: [{ name: "A" }, { name: "B" }] })).warnings[0]
    ).toMatch(/several playlists/i);
  });
});

describe("tracklist file sniffing", () => {
  it("uses the extension and falls back to content", () => {
    expect(parseTracklistFile("list.txt", "A - B").entries).toHaveLength(1);
    expect(parseTracklistFile("list.csv", "title,artist\nA,B").entries).toHaveLength(1);
    expect(parseTracklistFile("export", '{"tracks":[{"name":"A"}]}').entries).toHaveLength(1);
  });
});
