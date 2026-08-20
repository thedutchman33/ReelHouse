import DetailSkeleton from "@/components/detail/DetailSkeleton";

// Instant loading fallback for /tv/[id] while getMediaDetail() (TMDB) is
// awaited on the server. Shares the composed DetailSkeleton with the movie route.
export default function Loading() {
  return <DetailSkeleton />;
}
