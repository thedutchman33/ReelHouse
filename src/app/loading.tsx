// Route-level Loading UI (Next 16 `loading.js` convention; ref
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
// Server Component (no "use client") — takes no props.
//
// This is the ROOT segment's Suspense fallback, so Next.js also uses it as the
// shared fallback for any child route that does not define its own loading.tsx.
// It is therefore kept intentionally NEUTRAL — a centered brand spinner that
// reads correctly on ANY route — rather than a home-specific skeleton that
// would flash the wrong shape onto /login, /search, etc. during transitions.
// Content-shaped skeletons live only in the routes whose server fetch is slow
// enough to warrant one (see movie/[id] and tv/[id] loading.tsx).
export default function Loading() {
  return (
    <div
      className="container-rh grid min-h-[60vh] place-items-center py-16"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-muted">Loading…</p>
      </div>
    </div>
  );
}
