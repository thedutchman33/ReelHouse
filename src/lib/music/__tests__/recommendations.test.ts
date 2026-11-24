import { describe, expect, it } from "vitest";
import type { MusicTrack, UserPlaylist } from "../types";
import {
  buildTasteProfile,
  rankRecommendations,
} from "../recommendations";

function track(
  id: string,
  genre: string,
  artistId = `artist-${id}`,
  artistName = `Artist ${artistId}`
): MusicTrack {
  return {
    id,
    title: `Track ${id}`,
    artistId,
    artistName,
    genre,
    duration: 180,
    isStreamable: true,
  };
}

const playlist: UserPlaylist = {
  id: "playlist-1",
  title: "Night",
  description: "",
  tracks: [track("p1", "ambient"), track("p2", "ambient")],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  accent: "#1ed760",
};

describe("music taste profile", () => {
  it("combines explicit genres, likes, follows, history and playlists", () => {
    const profile = buildTasteProfile({
      favoriteGenres: ["Jazz", "Jazz", "Rock", "Pop", "Soul", "Funk", "Blues", "Disco"],
      likedTracks: [track("l1", "electronic/synthwave", "a1", "Open Roads")],
      recentTracks: [track("r1", "jazz", "a2", "Blue Note")],
      playlists: [playlist],
      followedArtists: [{ id: "a1", name: "Open Roads" }],
    });

    expect(profile.hasSignals).toBe(true);
    expect(profile.favoriteGenres).toHaveLength(7);
    expect(profile.genres[0]?.label.toLocaleLowerCase()).toBe("jazz");
    expect(profile.artists[0]).toMatchObject({ id: "a1", name: "Open Roads" });
    expect(profile.seedIds).toEqual(expect.arrayContaining(["l1", "r1", "p1", "p2"]));
  });

  it("derives genre and artist signals from likes and history without explicit genres", () => {
    const profile = buildTasteProfile({
      favoriteGenres: [],
      likedTracks: [track("l1", "electronic/synthwave", "a1", "Open Roads")],
      recentTracks: [track("r1", "jazz", "a2", "Blue Note")],
      playlists: [],
      followedArtists: [],
    });
    expect(profile.genres.map((genre) => genre.label).sort()).toEqual([
      "electronic",
      "jazz",
      "synthwave",
    ]);
    expect(profile.artists.map((artist) => artist.name).sort()).toEqual([
      "Blue Note",
      "Open Roads",
    ]);
  });

  it("reports no signals for an empty library", () => {
    const profile = buildTasteProfile({
      likedTracks: [],
      recentTracks: [],
      playlists: [],
      followedArtists: [],
    });
    expect(profile.hasSignals).toBe(false);
    expect(profile.genres).toEqual([]);
    expect(profile.artists).toEqual([]);
  });
});

describe("recommendation ranking", () => {
  const profile = buildTasteProfile({
    favoriteGenres: ["Electronic"],
    likedTracks: [track("seed", "electronic", "a1", "Favourite")],
    recentTracks: [],
    playlists: [],
    followedArtists: [{ id: "a2", name: "Followed" }],
  });

  it("excludes library seeds and scores genre and artist matches", () => {
    const result = rankRecommendations(
      [
        track("seed", "electronic", "a1", "Favourite"),
        track("genre", "electronic", "a3", "New Artist"),
        track("artist", "ambient", "a2", "Followed"),
        track("unrelated", "polka", "a9", "Other"),
      ],
      profile,
      10
    );
    expect(result.map((item) => item.id)).toEqual(["genre", "artist"]);
  });

  it("caps one artist before filling the remaining slots", () => {
    const result = rankRecommendations(
      [
        track("one", "electronic", "same", "Same"),
        track("two", "electronic", "same", "Same"),
        track("three", "electronic", "same", "Same"),
        track("four", "electronic", "same", "Same"),
        track("other", "electronic", "different", "Different"),
      ],
      profile,
      4
    );
    expect(result).toHaveLength(4);
    expect(result.filter((item) => item.artistId === "same")).toHaveLength(3);
    expect(result.some((item) => item.artistId === "different")).toBe(true);
  });
});
