import { describe, expect, it } from "vitest";
import {
  coverArtUrlForRelease,
  escapeLucene,
  musicBrainzReleaseQuery,
} from "../cover-art";

describe("Cover Art Archive helpers", () => {
  it("escapes MusicBrainz query syntax in artist and album names", () => {
    expect(escapeLucene('AC/DC: "Live"')).toBe('AC\\/DC\\: \\"Live\\"');
    const query = musicBrainzReleaseQuery("Sigur Rós", "( )");
    expect(query).toContain('artist:"Sigur Rós"');
    expect(query).toContain('release:"\\( \\)"');
  });

  it("accepts only a real release MBID", () => {
    expect(
      coverArtUrlForRelease("0f2d2f4f-4e16-4d2c-a8a9-ef7c22f9cbbf")
    ).toBe(
      "https://coverartarchive.org/release/0f2d2f4f-4e16-4d2c-a8a9-ef7c22f9cbbf/front-500"
    );
    expect(coverArtUrlForRelease("not-an-mbid")).toBeNull();
    expect(coverArtUrlForRelease("javascript:alert(1)")).toBeNull();
  });
});
