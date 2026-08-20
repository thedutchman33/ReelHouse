import { Skeleton, RowSkeleton } from "@/components/common/Skeleton";

// Loading skeleton that mirrors the shape of <DetailContent> (hero backdrop +
// poster/title/meta, then a horizontal cast/recommendations row). It is
// composed entirely from the shared Skeleton primitives in
// components/common/Skeleton — no new primitives are introduced. Shared by
// movie/[id]/loading.tsx and tv/[id]/loading.tsx so the two identical
// fallbacks stay in one place.
export default function DetailSkeleton() {
  return (
    <div className="pb-8">
      {/* Hero backdrop */}
      <div className="relative">
        <Skeleton className="h-[42vh] w-full rounded-none sm:h-[52vh]" />

        <div className="container-rh relative -mt-24 flex flex-col gap-5 sm:-mt-32 sm:flex-row sm:items-end">
          {/* Poster */}
          <div className="w-32 shrink-0 sm:w-44">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          </div>

          {/* Title + meta + overview + actions */}
          <div className="flex-1 space-y-3 pb-1">
            <Skeleton className="h-8 w-2/3 max-w-md" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-11/12 max-w-2xl" />
            <Skeleton className="h-4 w-5/6 max-w-xl" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-11 w-32 rounded-full" />
              <Skeleton className="h-11 w-32 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Cast / recommendations row */}
      <div className="mt-10">
        <RowSkeleton />
      </div>
    </div>
  );
}
