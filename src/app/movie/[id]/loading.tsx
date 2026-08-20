import DetailSkeleton from "@/components/detail/DetailSkeleton";

// Instant loading fallback for /movie/[id] while getMediaDetail() (TMDB) is
// awaited on the server. Shares the composed DetailSkeleton with the tv route.
export default function Loading() {
  return <DetailSkeleton />;
}
