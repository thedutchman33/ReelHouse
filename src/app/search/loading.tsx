import { GridSkeleton, Skeleton } from "@/components/common/Skeleton";

// /search is a server route (it reads ?q for the tab title), so navigating to it
// waits on the response. Render the shell immediately instead of leaving the
// previous page on screen.
export default function Loading() {
  return (
    <div className="container-rh py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8">
        <GridSkeleton count={12} />
      </div>
    </div>
  );
}
