"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMessageAdapter } from "@/lib/playback/adapters";
import type { PlaybackSignal } from "@/lib/playback/adapters";
import type { PlaybackFailure, ProviderDescriptor } from "@/lib/playback/types";
import { PlaybackLoading } from "./PlaybackStates";

// ---------------------------------------------------------------------------
// Embed surface — hosts an external provider's own player.
//
// Reelhouse renders the CONTAINER and nothing else: the frame, the loading state
// and the error path. Play/pause, seek, volume, quality, fullscreen, subtitles
// and picture-in-picture all belong to the provider's player inside the frame,
// and are deliberately not reproduced here.
//
// Everything Reelhouse learns from the provider arrives as a postMessage, and is
// accepted only when it comes from the frame's own origin AND from that frame's
// window — one embed must not be able to speak for another. The payload is then
// translated by that provider's adapter; a provider with no documented events has
// no adapter, so its messages are ignored entirely rather than guessed at.
// ---------------------------------------------------------------------------

/** How long to wait for the frame's document to load before calling it failed. */
const LOAD_TIMEOUT_MS = 15000;

export default function EmbedSurface({
  provider,
  src,
  title,
  reloadKey = 0,
  onReady,
  onProgress,
  onEnded,
  onFailure,
}: {
  provider: ProviderDescriptor;
  /** Fully expanded provider URL. */
  src: string;
  /** Accessible name for the frame. */
  title: string;
  /** Bump to force the frame to reload (retry). */
  reloadKey?: number;
  onReady?: () => void;
  onProgress?: (seconds: number, duration: number) => void;
  onEnded?: () => void;
  onFailure?: (failure: PlaybackFailure) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  // Whether the current attempt got as far as a loaded document — read by the
  // load-timeout, which must not fire for a frame that is already up.
  const loadedRef = useRef(false);

  // Callbacks live in a ref so the message listener is installed once per
  // provider/src rather than on every parent render.
  const handlers = useRef({ onReady, onProgress, onEnded, onFailure });
  handlers.current = { onReady, onProgress, onEnded, onFailure };

  const providerId = provider.id;

  const markLoaded = useCallback(() => {
    loadedRef.current = true;
    setLoading(false);
  }, []);

  // Reset the loading state whenever the frame is (re)pointed or retried.
  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
  }, [src, reloadKey]);

  const applySignal = useCallback(
    (signal: PlaybackSignal) => {
      const h = handlers.current;
      switch (signal.kind) {
        case "ready":
          markLoaded();
          h.onReady?.();
          break;
        case "progress":
          h.onProgress?.(signal.seconds, signal.duration);
          break;
        case "ended":
          h.onEnded?.();
          break;
        case "failure":
          h.onFailure?.({
            providerId,
            reason: signal.reason,
            detail: signal.detail,
          });
          break;
      }
    },
    [providerId]
  );

  useEffect(() => {
    const adapter = getMessageAdapter(providerId, src);
    if (!adapter) return; // No documented events → consume nothing.

    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(src, window.location.origin).origin;
    } catch {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      const frame = frameRef.current;
      if (frame && event.source !== frame.contentWindow) return;
      const signal = adapter(event.data);
      if (signal) applySignal(signal);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [providerId, src, applySignal]);

  // A frame whose document never loads is a real failure; the manager still
  // decides whether that may switch providers automatically.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (loadedRef.current) return;
      handlers.current.onFailure?.({
        providerId,
        reason: "timeout",
        detail: "The provider did not respond in time.",
      });
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [providerId, src, reloadKey]);

  return (
    <div className="absolute inset-0 bg-black">
      <iframe
        // Re-keying on src/reloadKey gives a clean document per attempt instead
        // of a same-frame navigation that would linger in history.
        key={`${src}#${reloadKey}`}
        ref={frameRef}
        src={src}
        title={title}
        className="h-full w-full border-0"
        // The provider's player needs these to function; nothing here grants it
        // access to Reelhouse itself.
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={markLoaded}
        onError={() =>
          handlers.current.onFailure?.({
            providerId,
            reason: "load-error",
            detail: "The provider's player failed to load.",
          })
        }
      />
      {loading && <PlaybackLoading providerName={provider.displayName} />}
    </div>
  );
}
