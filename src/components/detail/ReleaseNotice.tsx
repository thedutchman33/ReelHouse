import {
  formatInterestedCount,
  formatReleaseDate,
  type ReleaseNotice as ReleaseNoticeModel,
} from "@/lib/release-notice";

function FlameIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      viewBox="0 0 24 24"
      width="12"
    >
      <path
        d="M12.4 2.4c.3 3.1-1.4 4.5-2.8 6.1-1.2 1.4-2.2 2.8-1.6 5 .3 1.1 1.2 2 2.2 2.3-.3-1.5.2-2.7 1.2-3.6.6 2.1 2 3.4 3.8 4.4.3-1 .1-2.2-.4-3.2 2 1.5 3.2 3.5 2.8 5.8-.5 2.5-2.8 4.1-5.6 4.1-3.9 0-6.9-2.7-6.9-6.6 0-2.6 1.2-4.6 2.9-6.5 2.1-2.3 4.4-4.6 4.4-7.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ReleaseNotice({
  notice,
}: {
  notice: ReleaseNoticeModel;
}) {
  const interested =
    notice.interested && notice.interested > 0 ? notice.interested : null;

  return (
    <aside
      aria-label={`${notice.label}: ${formatReleaseDate(notice.date)}`}
      data-release-notice={notice.kind}
      className="pointer-events-auto w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#111114]/90 px-4 py-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-md"
    >
      <p className="text-[11px] font-medium leading-4 text-[#A1A1AA]">
        {notice.label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold leading-5 text-white">
        {formatReleaseDate(notice.date)}
      </p>

      {notice.episode ? (
        <div className="mt-2 border-t border-white/[0.07] pt-2">
          <p className="text-[12px] font-medium leading-5 text-white/85">
            <span className="text-white/45">
              S{notice.episode.seasonNumber} E{notice.episode.episodeNumber}
            </span>
            <span className="mx-1.5 text-white/25">·</span>
            {notice.episode.title}
          </p>
          {notice.episode.overview && (
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-white/50">
              {notice.episode.overview}
            </p>
          )}
        </div>
      ) : notice.seasonName ? (
        <p className="mt-2 border-t border-white/[0.07] pt-2 text-[12px] font-medium text-white/70">
          {notice.seasonName}
        </p>
      ) : null}

      {interested && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#FF6233]">
          <FlameIcon />
          {formatInterestedCount(interested)} interested
        </p>
      )}
    </aside>
  );
}
