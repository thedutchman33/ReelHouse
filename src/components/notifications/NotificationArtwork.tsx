import PosterImage from "@/components/media/PosterImage";
import type { TrackingNotification } from "@/lib/tracking";

/**
 * Notifications have two shapes: a followed title with poster art, or a live
 * F1 / cricket channel alert with no catalog poster. Both render here in the
 * same frame so the bell, account panel and page stay visually aligned.
 */
export default function NotificationArtwork({
  item,
  className = "",
  sizes = "48px",
}: {
  item: TrackingNotification;
  className?: string;
  sizes?: string;
}) {
  if (item.kind === "live" || !item.media) {
    const f1 = item.sport === "f1";
    const cricket = item.sport === "cricket";
    return (
      <div
        aria-hidden="true"
        className={`relative grid shrink-0 place-items-center overflow-hidden ring-1 ring-white/10 ${
          f1
            ? "bg-[linear-gradient(160deg,rgba(225,6,0,0.42),rgba(45,0,0,0.7))] text-[#ff6b60]"
            : cricket
              ? "bg-[linear-gradient(160deg,rgba(29,80,158,0.55),rgba(7,18,34,0.85))] text-[#b9d7ff]"
              : "bg-white/[0.04] text-muted"
        } ${className}`}
      >
        <span className="text-[9px] font-black uppercase leading-none tracking-[0.12em]">
          {f1 ? "F1" : cricket ? "CRK" : "LIVE"}
        </span>
        <span className="mt-1 text-[7px] font-bold uppercase leading-none tracking-[0.12em] opacity-80">
          Live
        </span>
      </div>
    );
  }

  return (
    <PosterImage
      src={item.media.posterUrl}
      title={item.media.title}
      type={item.media.type}
      className={`shrink-0 object-cover ring-1 ring-white/10 ${className}`}
      sizes={sizes}
    />
  );
}
