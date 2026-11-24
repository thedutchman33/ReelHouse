const MBID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LUCENE_SPECIAL = /([+\-&|!(){}[\]^"~*?:\\/])/g;

export function escapeLucene(value: string): string {
  return value.replace(LUCENE_SPECIAL, "\\$1");
}

export function musicBrainzReleaseQuery(artist: string, album: string): string {
  return `release:"${escapeLucene(album.trim())}" AND artist:"${escapeLucene(
    artist.trim()
  )}"`;
}

export function musicBrainzSearchUrl(artist: string, album: string): string {
  const query = encodeURIComponent(musicBrainzReleaseQuery(artist, album));
  return `https://musicbrainz.org/ws/2/release?query=${query}&fmt=json&limit=1`;
}

export function coverArtUrlForRelease(mbid: string): string | null {
  if (!MBID.test(mbid)) return null;
  return `https://coverartarchive.org/release/${mbid}/front-500`;
}
