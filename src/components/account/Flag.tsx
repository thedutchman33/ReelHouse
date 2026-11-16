import { GlobeIcon } from "./icons";

/** Reference language/region flag. Auto-detect uses the globe glyph. */
export default function Flag({
  cc,
  className = "h-5 w-7",
}: {
  cc?: string;
  className?: string;
}) {
  if (!cc) {
    return <GlobeIcon size={18} className="shrink-0 text-muted" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt=""
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-sm object-cover ring-1 ring-white/15 ${className}`}
    />
  );
}
