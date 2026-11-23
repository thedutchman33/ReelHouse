import type { Metadata } from "next";
import MyListHub from "@/components/library/MyListHub";
import { getReleaseWeekCount } from "@/lib/release-calendar";

export const revalidate = 1800;

function titleFromSlug(slug: string): string {
  if (slug === "watchlist") return "My List";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const { collection } = await params;
  return { title: titleFromSlug(collection) };
}

export default async function MyListCollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const [{ collection }, weekCount] = await Promise.all([
    params,
    getReleaseWeekCount(),
  ]);

  return (
    <div className="red-accent">
      <MyListHub
        key={collection}
        activeCollection={collection}
        weekCount={weekCount}
      />
    </div>
  );
}
