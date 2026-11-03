# Brag Plan: Reelhouse

## What is this app?
A streaming discovery and playback front end — browse films, series and anime, pick a provider server, watch — where the server speeds are really measured, progress survives every provider switch, and the same app also runs a live F1 telemetry centre and a cricket match centre.

## The angle
**The receipts film.** Every streaming site asks you to guess which of its servers works, then forgets where you were. Reelhouse does neither: it runs a real throughput test, shows you the number, and keeps one honest Continue Watching card per title. The video's spine is that one flow — dead servers → measured server → play → resume — and the punchline is the project's own thesis: *measured, not claimed.* No adjectives. Numbers.

## Hook (first 2-3 seconds)
Big condensed type: **"WHICH SERVER ACTUALLY WORKS?"** Three server chips land one by one underneath, each with a dead red dot and a cross. It names the exact annoyance the product removes, in the product's own vocabulary.

## Key moments (the middle)
- **The measurement.** The real Servers panel: `SERVERS · Videasy`, a live `4.3 Mbps` reading, and three chips whose status dots flip emerald one by one until the active one gets its ring and check.
- **The switch.** A click lands on play; then the selected server swaps Videasy → VidVault while the panel's light-streak border runs — and the progress bar keeps running through it.
- **The resume.** The home Continue Watching row, three cards arriving one at a time, bars filling to 68%, 22%, 91%, the first wearing an `S2 · E4` badge — one card per title, newest episode on it.

## Outro / punchline
Three measured numbers in a row — `12 ms` TTFB, `0` spinners between routes, `193` tests — then they blur away and the wordmark lands: **REELHOUSE**, with `MEASURED, NEVER INVENTED.` beneath it.

## User flow worth showing
Entry → key action → result: **home row → watch page → servers panel measures and switches → player runs → back home, the Continue Watching card has your place.** The watch page is the centerpiece; the home row is the proof that the flow closed.

## Tone
- Preset: `polished`
- Creative direction: quiet flex — a product film that shows receipts instead of adjectives; dry confidence, one wink ("oh — and live sport").
- Interpretation: few words, big type, long holds, restrained emerald accents on near-black. No hype cuts, no whooshes-for-their-own-sake. Motion is precise and fast; the copy is dead still.

## Format: landscape — 1920x1080
## Duration: 20.19 s

## Visual identity (from the project)
- Background: `#111212` (rh-bg) with surfaces `#1A1C1B` / `#232524`
- Accent: `#10B981` emerald (`#34D399` strong); danger `#E5645A`
- Text: `#F2F3F2`; muted `#89908C`; border `#2B2D2C`
- Display font: Bebas Neue (uppercase, condensed — the site's `font-display`)
- Body font: Inter 400/700/900
- Strongest visual element: the neumorphic **Servers panel** with its live Mbps readout and emerald status dots; second is the Continue Watching card anatomy (16:9 still, `S·E` badge, thin emerald progress bar).
- Brand assets used verbatim: `public/logo.png` (REELHOUSE wordmark, white REEL / red HOUSE), `public/f1/brand/f1-logo.svg`, `public/cricket/brand/bcci-logo.svg`.
- Poster artwork is **not** taken from TMDB (licensing): cards use fictional stand-in stills in the project palette, and titles come from the bundled sample catalog (`The Salt Road`, `Meridian`, `Nightmarket`).
- Server names shown are real names from the project: `Videasy`, `VidVault`, `FlyEmbed`.

## Share copy (draft)
Reelhouse: a streaming front end that measures its own servers, remembers exactly where you left off, and runs a live F1 telemetry centre on the side.

## Audio direction
- Role: warm, steady bed under a handful of precise UI accents.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and clean, 109.96 BPM) — the `polished` pick.
- Music treatment: starts at 0, volume ~0.30, fade out over the last 0.5 s; no ducking (no narration).
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. Tempo 109.96 BPM; beats at 0.56, 1.09, 1.64, 2.19, 2.73, 3.27, 3.82, 4.39, 4.91, 5.34, 6.00, 6.56, 7.09, 7.64, 8.19, 8.74, 9.29, 9.83, 10.37, 10.93, 11.46, 12.02, 12.55, 13.11, 13.64, 14.20, 14.73, 15.29, 15.84, 16.38, 16.93, 17.47, 18.02, 18.56, 19.10, 19.66, 20.19. Strong cues used: **8.74** (the "switch server" line), **13.11** (the newest Continue Watching card), **18.56** (the logo landing). Scene seams sit on beats 2.73 / 7.09 / 10.93 / 14.73 / 16.93.
- Audio-reactive treatment: subtle — the emerald glow behind the Servers panel and the final logo halo breathe with the bed's RMS. No waveform, no equalizer, no pulsing text.
- SFX posture: sparse, motion-matched; 5–7 cues total.
- Audio-coupled moments: chip arrivals (soft hits), server check (single glass ding), play click and server switch (two distinct clicks), card arrivals (three light card slides), logo (one mid-weight bell).
- Restraint rule: nothing bright or clicky repeated; no whooshes on transitions; the music carries the pace.

## Storyboard

### Scene 1 — "Which server?" — 2.73s (0.00–2.73)
Near-black ground, faint vignette. Small tracked eyebrow at the top: `EVERY STREAMING SITE`. Headline in Bebas, 132 px, two lines: **WHICH SERVER / ACTUALLY WORKS?** — blur-in at 0.20, dead still after it lands. Three neumorphic chips land on beats 0.56, 1.09, 1.64: `SERVER 1`, `SERVER 2`, `SERVER 3`, each with a dead red dot; a thin red strike draws across each label and an ✕ pops at 1.95 / 2.05 / 2.15.
Sequential/interaction: yes — three chips one by one, then three strikes.
Audio intent: a low, dry setup; the bed alone until the third chip.
Audio-coupled idea: one soft thud per chip (restrained, low volume).
Music: steady bed, in from 0.
Transition mood: hard cut on the beat → Scene 2.

### Scene 2 — "Measured" — 4.36s (2.73–7.09)
The product answers. Headline left-top, Bebas 96 px: **MEASURED, NOT CLAIMED.** (words in at 3.27 / 3.42 / 3.57). Below it, a near-faithful recreation of the watch page's **Servers panel**, scaled for video (1500 px wide): header `SERVERS · Videasy`, a red dot and `— Mbps` resolving to `4.3 Mbps`, `TEST`, `FAQ →`, ↻. All three provider chips are already readable at the cut; their status dots and the active check/ring resolve in sequence on the measurement cue.
Sequential/interaction: yes — the Mbps counter runs 0.0 → 4.3 from 3.60 to 5.20; dots turn green with the chips; the active chip's ring and check land at 5.34.
Audio intent: tension released into precision — this is the turn.
Audio-coupled idea: one glass ding when the check lands (5.34); no sound on the counter.
Music: bed continues.
Transition mood: hard cut → Scene 3.

### Scene 3 — "Switch server, keep your place" — 3.84s (7.09–10.93)
Full-frame watch page: player card (rounded, 16:9) over the page ground, `Back` pill top-left; inside, the title block `The Salt Road` / `S2 E4 · The Long Bright Dark`, `Quality 1080p` and `Audio & Subtitles` top-right, a centre play button, the control bar with timecode and a scrubber. A cursor moves to play and clicks at 8.19 — the button depresses and rings, the scrubber starts running 0 → 46%, timecode advances. At 8.95 the servers strip under the card swaps `Videasy` → `VidVault` and the light-streak border runs around the panel.
Line, lower-third over the card (Bebas 64 px): **SWITCH SERVER. KEEP YOUR PLACE.** lands 8.74 and holds 1.9 s.
Sequential/interaction: yes — simulated click, then a simulated server selection.
Audio intent: satisfying, mechanical, quiet.
Audio-coupled idea: `mouseclick` on play (8.19), a second, softer click on the switch (8.95).
Music: bed continues.
Transition mood: hard cut on the strong cue at 10.93 → Scene 4.

### Scene 4 — "One card per title" — 3.80s (10.93–14.73)
The home page. A slim nav with the REELHOUSE wordmark on the left. Statement in Bebas 96 px: **ONE CARD PER TITLE.** lands 11.46 and holds. Below: eyebrow `PICK UP WHERE YOU LEFT OFF` + `CONTINUE WATCHING` header (48 px). All three 16:9 cards are present at the cut with `S·E` badges and titles; their thin emerald progress bars and percentages reveal/fill on beats 12.02 / 12.55 / 13.11: `The Salt Road S2·E4 → 68%`, `Meridian S1·E1 → 22%`, `Nightmarket S3·E7 → 91%`. The first card gets a faint emerald rim as its bar completes.
Sequential/interaction: yes — the row is established immediately, then three progress states resolve independently on the beats.
Audio intent: tidy, domestic, satisfying.
Audio-coupled idea: a light card slide per arrival, first and last accented only.
Music: bed continues.
Transition mood: hard cut → Scene 5.

### Scene 5 — "Oh — and live sport" — 2.20s (14.73–16.93)
Split screen, left F1, right cricket. Left: deep red radial, the official F1 mark, eyebrow `LIVE · TELEMETRY`, a telemetry trace drawing in at 14.90 and two live numbers (`1:24.871`, `S3`) in F1 red/white. Right: deep blue radial, the BCCI crest, `LIVE · MATCH CENTRE`, `IND 187/3` and `16.2 OV` with a small run-rate bar. Line above the split (Bebas 84 px): **OH — AND LIVE SPORT.** at 15.04, holds.
Sequential/interaction: yes — the trace draws, the score digits tick 186 → 187.
Audio intent: a quick gear change; the bed is enough.
Audio-coupled idea: none — let the cut do the work.
Music: bed continues, one beat louder.
Transition mood: hard cut → Scene 6.

### Scene 6 — "The receipts" — 3.26s (16.93–20.19)
Black, faint emerald radial. Three numbers are settled in one row at the cut, tabular and still: **12 ms** (`TTFB`), **0** (`SPINNERS`), **193** (`TESTS`). They hold, then clear for the wordmark at 18.56 — `REELHOUSE`, white REEL / red HOUSE — with **MEASURED, NEVER INVENTED.** beneath. Hold to the end.
Sequential/interaction: yes — a settled receipt row, then the mark.
Audio intent: the resolve.
Audio-coupled idea: one mid-weight bell on the logo at 18.56, ringing over the fade.
Music: fade out over the last 0.5 s.
Transition mood: end.

**Music mood for this video:** steady, warm, unshowy — the confidence is in the cut, not the track.
**Audio summary:** a quiet bed under precise, sparse UI sound, one bell for the wordmark, and silence-shaped space around every line of copy.
