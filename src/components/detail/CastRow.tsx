import type { CastMember } from "@/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function CastRow({ cast }: { cast?: CastMember[] }) {
  if (!cast || cast.length === 0) return null;

  return (
    <section className="container-rh py-6">
      <h2 className="mb-4 text-xl font-semibold">Cast</h2>
      <div className="row-scroll no-scrollbar">
        {cast.map((c) => (
          <div key={c.id} className="w-24 shrink-0 text-center sm:w-28">
            <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 sm:h-28 sm:w-28">
              {c.profileUrl ? (
                // Profile stills are portrait; a square crop biased upward keeps
                // the face centred in the circle instead of trimming the head.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.profileUrl}
                  alt={c.name}
                  className="h-full w-full object-cover object-[50%_20%]"
                  loading="lazy"
                />
              ) : (
                <span className="font-display text-2xl font-bold text-muted">{initials(c.name)}</span>
              )}
            </div>
            <p className="mt-2 line-clamp-1 text-sm font-medium text-text">{c.name}</p>
            {c.character && <p className="line-clamp-1 text-xs text-muted">{c.character}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
