// ---------------------------------------------------------------------------
// Formula 1 live servers.
//
// This is a plain TypeScript config, NOT an environment file, and it is read
// only by server code (src/lib/f1.ts). The list is resolved during the server
// render, so the browser never makes an extra request to discover servers.
//
// To add a server: append an entry, give it a unique `id`, and set `priority`
// (lower = listed first). To retire one without losing the name in the Servers
// panel, set `enabled: false` and explain why in `note`.
//
// A change here needs a rebuild (`npm run build` / `npm run dev` restarts on
// save) — the same as editing an env var. No secrets belong in this file:
// every URL is visible in the browser once it is framed.
// ---------------------------------------------------------------------------

export interface F1ServerConfig {
  /** Stable selection id — never reused for a different service. */
  id: string;
  /** Name shown in the Servers panel. */
  name: string;
  /** Player/embed URL, or a same-origin path (the FlyEmbed resolver). */
  url: string;
  /** Lower sorts first; the first enabled entry is the default server. */
  priority: number;
  /** Omitted/false disables the entry but keeps it visible. Default: enabled. */
  enabled?: boolean;
  /** Tooltip shown for a disabled entry (why it cannot be selected). */
  note?: string;
}

export const F1_SERVERS: readonly F1ServerConfig[] = [
  // --- Primary ------------------------------------------------------------
  {
    id: "westreamf1-st",
    name: "WestreamF1",
    url: "https://westreamf1.st/westreamf1.php",
    priority: 100,
  },
  {
    id: "flyembed-auto",
    name: "FlyEmbed Auto",
    // Same-origin resolver: finds the current F1 event in FlyEmbed's feed.
    url: "/api/f1/flyembed",
    priority: 110,
  },
  {
    id: "westreamf1-com",
    name: "WestreamF1 (.com)",
    url: "https://westreamf1.com/westreamf1.php",
    priority: 120,
  },
  {
    id: "flyembed-45",
    name: "Fox Sports HD",
    url: "https://flyembed.cfd/embed/45.php",
    priority: 130,
  },
  {
    id: "flyembed-44",
    name: "FlyEmbed 44 (Italian)",
    url: "https://flyembed.cfd/embed/44.php",
    priority: 140,
  },

  // --- Multi-host embeds --------------------------------------------------
  {
    id: "stream-1",
    name: "Stream 1",
    url: "https://embdlol.st/embed/01a173b9-fc3e-7091-b524-1e826d7dfa51",
    priority: 150,
  },
  {
    id: "fhd-embexex",
    name: "FHD",
    url: "https://embexex.cfd/text/?20",
    priority: 160,
  },
  {
    id: "full-hd-2",
    name: "Full HD 2",
    url: "https://taifood-blog.asia/embed/f1/2026/united-states/race",
    priority: 170,
  },
  {
    id: "full-hd-3",
    name: "Full HD 3",
    url: "https://embdlol.st/embed/01a173ce-7eb6-720d-97fd-ac4892690d65",
    priority: 180,
  },
  {
    id: "full-hd-4",
    name: "Full HD 4",
    url: "https://ch.nexa.st/ch.php?id=7",
    priority: 190,
  },
  {
    id: "uhd-4k",
    name: "4K UHD",
    url: "https://embdlol.st/embed/01a173ba-83f0-74dd-b56d-9a23666f7b6b",
    priority: 200,
  },
  {
    id: "streamfree-hd",
    name: "StreamFree HD",
    url: "https://streamfree.top/embed/racing/skyf11080p",
    priority: 210,
  },
  {
    id: "embed-st-1",
    name: "Embed.st 1",
    url: "https://embed.st/embed/admin/ppv-united-states-grand-prix-race/1",
    priority: 220,
  },
  {
    id: "apple-tv-2",
    name: "Apple TV 2",
    url: "https://taifood-blog.asia/embed/united-states-grand-prix---race-30888",
    priority: 230,
  },
  {
    id: "embed-st-3",
    name: "Embed.st 3",
    url: "https://embed.st/embed/admin/ppv-united-states-grand-prix-race/3",
    priority: 240,
  },
  {
    id: "videocdn-sky-f1-uk",
    name: "Videocdn Sky F1 UK",
    url: "https://videocdn-4726.website/shopping2/?channel_id=sky_sport_f1_uk",
    priority: 250,
  },

  // --- Language feeds -----------------------------------------------------
  {
    id: "italian-2",
    name: "Italian 2",
    url: "https://embdlol.st/embed/01a173cf-95a8-7473-8ddd-3b960a23a4d2",
    priority: 260,
  },
  {
    id: "italian-3",
    name: "Italian 3",
    url: "https://taifood-blog.asia/embed/united-states-grand-prix---race-30892",
    priority: 270,
  },
  {
    id: "spanish",
    name: "Spanish",
    url: "https://embdlol.st/embed/01a173cf-81ae-7599-aaf5-4ee50aa4f0d0",
    priority: 280,
  },
  {
    id: "czech",
    name: "Czech",
    url: "https://taifood-blog.asia/embed/united-states-grand-prix---race-30895",
    priority: 290,
  },
  {
    id: "german",
    name: "German",
    url: "https://taifood-blog.asia/embed/united-states-grand-prix---race-30891",
    priority: 300,
  },
  {
    id: "german-2",
    name: "German 2",
    url: "https://embdlol.st/embed/01a173cf-6e1a-771f-87bb-4caf467c3541",
    priority: 310,
  },

  // --- Dedicated F1 channels ---------------------------------------------
  {
    id: "f1-tv-hakunamatata",
    name: "F1 TV",
    url: "https://hakunamatata5.org/hakunamatata5.html",
    priority: 320,
  },
  {
    id: "junkie-f1",
    name: "Junkie F1",
    url: "https://junkieembeds.pages.dev/embed/sky-sports-f1",
    priority: 330,
  },
  {
    id: "sky-sport-live-1",
    name: "Sky Sport Live 1",
    url: "https://pushembdz.store/embed/019ce27c-7352-7d6b-8ba3-f6117cbac2a4",
    priority: 340,
  },
  {
    id: "sky-f1-4k-strmfree",
    name: "Sky F1 4K",
    url: "https://strmfree.st/embed/racing/skyf12160p",
    priority: 350,
  },
  {
    id: "streamfree-origin",
    name: "StreamFree Origin",
    url: "https://streamfree.top/embed/racing/skyf1?server=origin&quality=1080p&category=racing",
    priority: 360,
  },
  {
    id: "cdnlivetv-f1",
    name: "CDNLiveTV F1",
    url: "https://cdnlivetv.tv/api/v1/channels/player/?name=sky+sports+f1&code=gb&user=cdnlivetv&plan=free",
    priority: 370,
  },

  // --- Known-unavailable entries (kept visible, not selectable) -----------
  {
    id: "sky-f1-uhd-a1xs",
    name: "Sky F1 UHD",
    url: "https://xemzi.s.gy/2000016",
    priority: 900,
    note: "Short link — redirects to a page, not a player",
  },
  {
    id: "sky-f1-fhd-alpha",
    name: "Sky F1 FHD (HLS)",
    url: "https://alpha.flive.dpdns.org/p/AwZGQwwEZA/index.m3u8",
    priority: 910,
    
    note: "Direct HLS — needs a native player and a fresh token",
  },
  {
    id: "f1-tv-beta",
    name: "F1 TV (HLS)",
    url: "https://beta.flive.dpdns.org/hls/sky-f1.m3u8",
    priority: 920,
    
    note: "Direct HLS — needs a native player",
  },
  {
    id: "dlstreams",
    name: "DLStreams",
    url: "https://dlstreams.top/stream/stream-60.php",
    priority: 930,
    
    note: "Reported offline",
  },
  {
    id: "espn-1",
    name: "ESPN 1",
    url: "https://embedsports.top/embed/alpha/espn/1",
    priority: 940,
    
    note: "Reported offline",
  },
];
