import DetailSkeleton from "@/components/detail/DetailSkeleton";

// Instant loading fallback for /anime/[id] while getMediaDetail() (AniList +
// TMDB title-logo match) is awaited on the server. Shares the composed
// DetailSkeleton with the movie and tv routes.
export default function Loading() {
  return <DetailSkeleton />;
}
