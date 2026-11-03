import { RowSkeleton, Skeleton } from "@/components/common/Skeleton";

// /watch/[type]/[id] is rendered per request (it reads ?s/?e), and it is the
// heaviest route to reach from a poster click. Show the player shell at once so
// the click always has an immediate response.
export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="container-rh space-y-4 py-6">
        <Skeleton className="h-7 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/3 max-w-xs" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <RowSkeleton />
    </div>
  );
}
