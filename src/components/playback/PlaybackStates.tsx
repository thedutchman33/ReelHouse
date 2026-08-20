"use client";

import { ResetIcon, SourceIcon, SpinnerIcon } from "@/components/player/icons";
import type { MediaType } from "@/types";

// ---------------------------------------------------------------------------
// Playback surface states — loading, failure, nothing-playable, and the notice
// shown after an automatic provider switch.
//
// Presentational only (no state, no data access) so they can be dropped into any
// playback surface. They belong to the SURROUNDING playback experience, not to
// any provider's player: an embed provider draws its own controls inside the
// frame, while these cover the moments when there is nothing to draw yet.
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      <div className="max-w-md">{children}</div>
    </div>
  );
}

/** Shown until the provider's player reports (or the frame document loads). */
export function PlaybackLoading({ providerName }: { providerName: string }) {
  return (
    <Shell>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <SpinnerIcon size={28} className="text-accent" />
        <p className="text-sm text-muted">
          Loading <span className="font-semibold text-text">{providerName}</span>…
        </p>
      </div>
    </Shell>
  );
}

/**
 * Shown when a provider fails. `onSwitch` is offered whenever another provider
 * could serve this title — including when automatic fallback was NOT allowed,
 * which is exactly the case where the choice has to be the viewer's.
 */
export function PlaybackError({
  providerName,
  detail,
  onRetry,
  onSwitch,
  nextProviderName,
}: {
  providerName: string;
  detail?: string;
  onRetry: () => void;
  onSwitch?: () => void;
  nextProviderName?: string;
}) {
  return (
    <Shell>
      <div role="alert" className="flex flex-col items-center gap-3">
        <h2 className="text-lg font-semibold text-text">
          {providerName} could not play this
        </h2>
        <p className="text-sm text-muted">
          {detail ?? "The provider did not load."}{" "}
          {onSwitch
            ? "You can try again, or switch to another provider."
            : "You can try again, or pick another provider from the source menu."}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            <ResetIcon size={16} />
            Try again
          </button>
          {onSwitch && (
            <button
              type="button"
              onClick={onSwitch}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/60 px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-2"
            >
              <SourceIcon size={16} />
              {nextProviderName ? `Switch to ${nextProviderName}` : "Switch provider"}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** Shown when no provider can serve this media type at all. */
export function PlaybackUnavailable({
  mediaType,
  reason,
}: {
  mediaType: MediaType;
  reason?: string;
}) {
  return (
    <Shell>
      <div role="alert" className="flex flex-col items-center gap-2">
        <h2 className="text-lg font-semibold text-text">Playback unavailable</h2>
        <p className="text-sm text-muted">
          {reason ??
            `No playback provider is currently configured for ${
              mediaType === "tv" ? "TV episodes" : "movies"
            }.`}
        </p>
      </div>
    </Shell>
  );
}

/**
 * Confirmation that an automatic switch happened. Automatic fallback is only ever
 * allowed for a provider that reports its own failures, and even then the viewer
 * is told — a provider change is never silent.
 */
export function FallbackNotice({
  fromName,
  toName,
  onDismiss,
}: {
  fromName: string;
  toName: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface/95 px-4 py-2 text-xs text-muted shadow-2xl backdrop-blur"
    >
      <span>
        <span className="font-semibold text-text">{fromName}</span> failed — switched
        to <span className="font-semibold text-text">{toName}</span>.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 font-semibold text-accent transition hover:opacity-80"
      >
        Dismiss
      </button>
    </div>
  );
}
