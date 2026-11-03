"use client";

import ReactDOM from "react-dom";

// Resource hints for the artwork CDN.
//
// Every hero backdrop and poster on the site is served by image.tmdb.org, but
// the browser only discovers that origin after it has parsed the HTML and
// started the image requests — paying a full DNS + TCP + TLS setup on the
// critical path of the first (and largest) paint. Declaring the origin up front
// removes that handshake from the artwork's timeline.
//
// `next/image` and `next/font` emit their own hints; the posters here are plain
// <img> elements (see PosterImage), so nothing else hints at TMDB.
//
// Client component because ReactDOM's resource-hint methods are only supported
// there — it still runs during SSR, so the <link> tags land in the initial
// document head.
export default function ResourceHints() {
  ReactDOM.prefetchDNS("https://image.tmdb.org");
  // No crossOrigin: posters are fetched as plain <img> (no CORS), and an
  // anonymous connection would not be reused by them.
  ReactDOM.preconnect("https://image.tmdb.org");
  return null;
}
