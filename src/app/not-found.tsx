import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-rh grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <p className="font-display text-6xl font-black text-accent">404</p>
        <h1 className="mt-4 text-2xl font-bold">We couldn&apos;t find that title</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          The page may have moved, or the title is no longer available. Let&apos;s get you back to
          something to watch.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-primary">
            Back to Home
          </Link>
          <Link href="/search" className="btn-ghost">
            Search
          </Link>
        </div>
      </div>
    </div>
  );
}
