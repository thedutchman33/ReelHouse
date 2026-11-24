import { GridSkeleton, Skeleton } from "@/components/common/Skeleton";

// Instant fallback for the provider catalog. The page itself is dynamic (it
// reads ?page and ?q), so without this the browser sits on the previous page
// until the TMDB catalog comes back.
export default function Loading() {
  return (
    <div className="container-rh py-8">
      <Skeleton className="mb-4 h-3 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-24 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-52" />
        </div>
      </div>
      <Skeleton className="mt-6 h-10 w-full max-w-md rounded-lg" />
      <div className="mt-6">
        <GridSkeleton />
      </div>
    </div>
  );
}
