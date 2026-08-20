import MediaCard from "./MediaCard";
import type { MediaSummary } from "@/types";

export default function MediaGrid({ items }: { items: MediaSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}
