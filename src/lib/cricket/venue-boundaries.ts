// Venue boundary distances in metres. The figures are the published rope
// positions collected by The Cricket Boundary (cricketboundary.com) from host
// associations, ground staff and broadcast graphics, plus the BCCI/IPL venue
// set used by this page. Ropes move per fixture, so these are the usual
// positions rather than a measurement of one particular match.

export interface VenueDimensions {
  straight: number;
  square: number;
  /** Individual rope radii when the source published them. */
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  /** Font-end note: this venue's figures are not confirmed by ground staff. */
  approx?: boolean;
  source: string;
}

interface VenueEntry {
  match: RegExp;
  dimensions: VenueDimensions;
}

// Most of these are listed as "straight × square" by the source. Where the
// source also gives the four rope radii we keep them, because the diagram can
// then show a real asymmetry (HNRY's square boundaries differ by 5 m).
const VENUES: VenueEntry[] = [
  {
    match: /hnry|sky stadium|westpac|cake tin/i,
    dimensions: {
      straight: 75,
      square: 58.5,
      north: 75,
      south: 75,
      east: 56,
      west: 61,
      source: "HNRY Stadium turf manager, 2026",
    },
  },
  {
    match: /eden park/i,
    dimensions: { straight: 52.5, square: 64.5, source: "The Cricket Boundary" },
  },
  {
    match: /basin reserve/i,
    dimensions: { straight: 73, square: 73.5, source: "The Cricket Boundary" },
  },
  {
    match: /bay oval/i,
    dimensions: { straight: 68, square: 68, source: "The Cricket Boundary" },
  },
  {
    match: /hagley oval/i,
    dimensions: { straight: 70.5, square: 74, source: "The Cricket Boundary" },
  },
  {
    match: /seddon park/i,
    dimensions: { straight: 60.6, square: 64.8, source: "The Cricket Boundary" },
  },
  {
    match: /bca stadium|kotambi|baroda/i,
    dimensions: {
      straight: 76,
      square: 78,
      approx: true,
      source: "Published venue figures, unconfirmed",
    },
  },
  {
    match: /narendra modi|motera/i,
    dimensions: { straight: 66, square: 68.5, source: "The Cricket Boundary" },
  },
  {
    match: /wankhede/i,
    dimensions: { straight: 65, square: 71, source: "The Cricket Boundary" },
  },
  {
    match: /eden gardens/i,
    dimensions: { straight: 71, square: 66, source: "The Cricket Boundary" },
  },
  {
    match: /m\.?\s*chinnaswamy|chinnaswamy/i,
    dimensions: { straight: 65, square: 67, source: "The Cricket Boundary" },
  },
  {
    match: /ma chidambaram|chepauk/i,
    dimensions: { straight: 65, square: 71, source: "The Cricket Boundary" },
  },
  {
    match: /arun jaitley/i,
    dimensions: { straight: 57, square: 64, source: "The Cricket Boundary" },
  },
  {
    match: /ekana/i,
    dimensions: { straight: 75, square: 76, source: "The Cricket Boundary" },
  },
  {
    match: /rajiv gandhi/i,
    dimensions: { straight: 71, square: 68, source: "The Cricket Boundary" },
  },
  {
    match: /pca .*mohali|pca stadium|new chandigarh/i,
    dimensions: { straight: 67, square: 73, source: "The Cricket Boundary" },
  },
  {
    match: /vca stadium|nagpur/i,
    dimensions: { straight: 71, square: 77, source: "The Cricket Boundary" },
  },
  {
    match: /jsca|ranchi/i,
    dimensions: { straight: 69, square: 69, source: "The Cricket Boundary" },
  },
  {
    match: /holkar/i,
    dimensions: { straight: 63, square: 64, source: "The Cricket Boundary" },
  },
  {
    match: /aca stadium|barsapara|guwahati/i,
    dimensions: { straight: 67, square: 67, source: "The Cricket Boundary" },
  },
  {
    match: /raipur/i,
    dimensions: { straight: 64, square: 67, source: "The Cricket Boundary" },
  },
  {
    match: /newlands/i,
    dimensions: { straight: 75, square: 71, source: "The Cricket Boundary" },
  },
  {
    match: /wanderers/i,
    dimensions: { straight: 74, square: 64.5, source: "The Cricket Boundary" },
  },
  {
    match: /supersport/i,
    dimensions: { straight: 67, square: 57, source: "The Cricket Boundary" },
  },
  {
    match: /boland park/i,
    dimensions: { straight: 63, square: 63, source: "The Cricket Boundary" },
  },
  {
    match: /mangaung/i,
    dimensions: { straight: 76, square: 65, source: "The Cricket Boundary" },
  },
  {
    match: /st george/i,
    dimensions: { straight: 67, square: 64, source: "The Cricket Boundary" },
  },
  {
    match: /dubai international|dubai intl/i,
    dimensions: { straight: 64, square: 63, source: "The Cricket Boundary" },
  },
  {
    match: /sharjah/i,
    dimensions: { straight: 58, square: 65, source: "The Cricket Boundary" },
  },
  {
    match: /sheikh zayed|abu dhabi/i,
    dimensions: { straight: 73, square: 65, source: "The Cricket Boundary" },
  },
];

export function venueDimensions(
  venueName: string | null | undefined,
  city?: string | null
): VenueDimensions | null {
  if (!venueName) return null;
  const haystack = `${venueName} ${city ?? ""}`;
  return VENUES.find((entry) => entry.match.test(haystack))?.dimensions ?? null;
}

export function boundaryLabel(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}m` : `${rounded.toFixed(1)}m`;
}
