import { describe, expect, it } from "vitest";
import type { MusicTrack } from "../types";
import {
  normalizeJamendoAlbum,
  normalizeJamendoArtist,
  normalizeJamendoPlaylist,
  normalizeJamendoTrack,
} from "../jamendo-normalize";
import {
  catalogLabelForCollection,
  catalogLabelForTracks,
  interleaveUnique,
  mergeUnique,
  providerIdFromId,
} from "../providers";
import { streamUrlForTrack } from "../stream";

const jamendoTrack = {
  id: 1740123,
  name: "Night Drive",
  duration: "214",
  artist_id: 48765,
  artist_name: "Open Roads",
  album_id: 99881,
  album_name: "City Lights",
  image: "http://usercontent.jamendo.com/?type=album&id=99881&width=300",
  audio: "https://prod-1.storage.jamendo.com/?trackid=1740123&format=mp31&from=token",
  releasedate: "2025-04-11",
  shareurl: "https://www.jamendo.com/track/1740123/night-drive",
  license_ccurl: "https://creativecommons.org/licenses/by/4.0/",
  musicinfo: {
    tags: {
      genres: ["electronic", "synthwave"],
      vartags: ["night", "driving"],
    },
  },
};

describe("Jamendo normalization", () => {
  it("keeps provider ids and normalizes track metadata", () => {
    const track = normalizeJamendoTrack(jamendoTrack);
    expect(track).toMatchObject({
      id: "jamendo:1740123",
      provider: "jamendo",
      providerId: "1740123",
      title: "Night Drive",
      artistId: "jamendo:artist:48765",
      artistName: "Open Roads",
      albumId: "jamendo:album:99881",
      albumTitle: "City Lights",
      duration: 214,
      genre: "electronic/synthwave",
      mood: "night, driving",
      isStreamable: true,
    });
    expect(track?.artworkUrl).toContain("https://usercontent.jamendo.com/");
    expect(track?.artworkUrl).toContain("width=600");
    expect(track?.id).not.toBe("1740123");
  });

  it("rejects rows without the required provider id or title", () => {
    expect(normalizeJamendoTrack({ id: 1 })).toBeNull();
    expect(normalizeJamendoTrack({ name: "No id" })).toBeNull();
  });

  it("normalizes artists, albums and playlists into the shared shape", () => {
    const artist = normalizeJamendoArtist({
      id: 7,
      name: "Open Roads",
      image: "https://imgjam1.jamendo.com/artists/7.jpg",
    });
    expect(artist).toMatchObject({
      id: "jamendo:artist:7",
      provider: "jamendo",
      providerId: "7",
      name: "Open Roads",
    });

    const album = normalizeJamendoAlbum({
      id: 12,
      name: "City Lights",
      artist_id: 7,
      artist_name: "Open Roads",
      image: "https://usercontent.jamendo.com/?type=album&id=12&width=300",
    });
    expect(album).toMatchObject({
      id: "jamendo:album:12",
      provider: "jamendo",
      kind: "album",
      ownerId: "jamendo:artist:7",
      trackCount: 0,
    });

    const playlist = normalizeJamendoPlaylist({
      id: 33,
      name: "Late Night",
      user_id: 4,
      user_name: "Curator",
      track_count: 2,
      tracks: [{ id: 9, name: "One", image: "https://imgjam1.jamendo.com/9.jpg" }],
    });
    expect(playlist).toMatchObject({
      id: "jamendo:playlist:33",
      provider: "jamendo",
      kind: "playlist",
      ownerId: "jamendo:user:4",
      trackCount: 2,
    });
    expect(playlist?.artworkUrl).toContain("imgjam1.jamendo.com");
  });
});

describe("provider merging", () => {
  const audius: MusicTrack = {
    id: "audius-1",
    provider: "audius",
    providerId: "audius-1",
    title: "A",
    artistId: "audius-artist",
    artistName: "Audius Artist",
    duration: 180,
  };
  const jamendo = normalizeJamendoTrack({ ...jamendoTrack, id: 2, name: "B" })!;

  it("keeps provider-qualified ids distinct and removes repeats", () => {
    expect(mergeUnique([audius], [audius, jamendo])).toHaveLength(2);
    expect(interleaveUnique([[audius], [jamendo]])).toEqual([audius, jamendo]);
  });

  it("round-robins two providers without burying the secondary one", () => {
    const a1 = normalizeJamendoTrack({ ...jamendoTrack, id: 11, name: "A1" })!;
    const a2 = normalizeJamendoTrack({ ...jamendoTrack, id: 12, name: "A2" })!;
    const j1 = normalizeJamendoTrack({ ...jamendoTrack, id: 21, name: "J1" })!;
    const merged = interleaveUnique([[a1, a2], [j1]]);
    expect(merged.map((item) => item.title)).toEqual(["A1", "J1", "A2"]);
  });

  it("labels mixed catalogs and Reelhouse editorial mixes accurately", () => {
    expect(catalogLabelForTracks([audius, jamendo])).toBe("Audius + Jamendo");
    expect(
      catalogLabelForCollection({
        id: "mix-one",
        kind: "mix",
        title: "Mix",
        ownerName: "Reelhouse Music",
        trackCount: 2,
        tracks: [audius, jamendo],
        isEditorial: true,
      })
    ).toBe("Reelhouse Music");
  });

  it("extracts the raw id from provider-qualified ids", () => {
    expect(providerIdFromId("jamendo:artist:42")).toBe("42");
    expect(providerIdFromId("jamendo:album:9")).toBe("9");
    expect(providerIdFromId("jamendo:99")).toBe("99");
  });
});

describe("stream resolution", () => {
  const base: MusicTrack = {
    id: "track-1",
    artistId: "artist-1",
    artistName: "Artist",
    title: "Title",
    duration: 180,
  };

  it("uses the same-origin range proxy for YouTube Music tracks", () => {
    expect(
      streamUrlForTrack({
        ...base,
        id: "youtube:dQw4w9WgXcQ",
        provider: "youtube",
        providerId: "dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
      })
    ).toBe("/api/music/stream?provider=youtube&id=dQw4w9WgXcQ");
  });

  it("marks unmatched Spotify tracks as unplayable without a YouTube match", () => {
    expect(
      streamUrlForTrack({
        ...base,
        id: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
        provider: "spotify",
        providerId: "4uLU6hMCjMI75M1A2tKUQC",
        isStreamable: false,
      })
    ).toBeNull();
  });

  it("does not invent a stream for a legacy saved track without a YouTube id", () => {
    expect(streamUrlForTrack(base)).toBeNull();
  });

  it("does not invent a stream for an unknown provider", () => {
    expect(
      streamUrlForTrack({
        ...base,
        provider: "jamendo",
        providerId: "",
        id: "jamendo:",
      })
    ).toBeNull();
  });
});
