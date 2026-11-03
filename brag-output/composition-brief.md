# Hyperframes Composition Brief: Reelhouse

## Objective
Create a short launch-style brag video for Reelhouse that shows the product working — measured servers, a server switch that keeps your place, and a Continue Watching row that proves it.

## Output
- Composition directory: `<output-dir>/composition/`
- Rendered video: `<output-dir>/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20.19 seconds (plan is 15–25s; seams sit on the track's beat grid)

## Source Material
- Project root: `D:\reelhouse`
- Primary files read: `README.md`, `package.json`, `src/app/page.tsx`, `src/app/globals.css`, `tailwind.config.ts`, `src/components/hero/Hero.tsx`, `src/components/media/ContinueWatching.tsx`, `src/components/playback/ServerPanel.tsx`, `src/components/playback/ProviderSelector.tsx`, `src/app/my-list/page.tsx`, `src/app/faq/page.tsx`, `src/lib/library.ts`, `src/app/f1/page.tsx`, `src/app/cricket/page.tsx`, `docs/readme/*.webp`
- Product name: Reelhouse
- Tagline / strongest claim: "Every number on this page is measured, never invented."
- Key UI or visual moment to recreate: the watch page **Servers panel** — `SERVERS · Videasy · 4.3 Mbps · TEST · FAQ`, three neumorphic chips with emerald status dots — and the home **Continue Watching** card with its `S·E` badge and thin progress bar.
- Copy that must appear verbatim:
  - `MEASURED, NOT CLAIMED.` (README section: "Measured, not claimed")
  - `MEASURED, NEVER INVENTED.` (README: "Every number on this page is measured, never invented")
  - `ONE CARD PER TITLE.` (README: "One card per title, newest episode wins")
  - `12 ms` TTFB, `0` spinners, `193` tests (README "Measured, not claimed" table + badge)
  - `SWITCH SERVER.` / `KEEP YOUR PLACE.` (FAQ "pick another server"; README "continue exactly where you left off")
  - `SERVERS`, `4.3 Mbps`, `TEST`, `FAQ` (Servers panel, verbatim; 4.3 Mbps is the value in `docs/readme/player.webp`)
  - Provider names `Videasy`, `VidVault`, `FlyEmbed` are real names from the project (screenshot, README, `src/lib/flyembed.ts`)

## Creative Direction
- Tone preset: `polished`
- Creative direction: quiet flex — a product film that shows receipts instead of adjectives, with one dry wink.
- Interpretation: big condensed type, long holds, near-black ground, emerald only where the product uses it. Motion is precise and fast; copy lands and stays dead still. No hype whooshes, no bouncy UI, no glowing particle fields.
- Angle: every streaming site makes you guess which server works and then forgets your place. The film answers with a real measurement, a switch that keeps the bar running, and a row of cards that remembers.
- Hook: **WHICH SERVER ACTUALLY WORKS?** over three dead server chips.
- Outro / punchline: numbers `12 ms / 0 / 193`, then the wordmark and `MEASURED, NEVER INVENTED.`
- Avoid:
  - Generic SaaS language ("streamline", "everything you need", "built for teams")
  - Abstract filler visuals, particle fields, waveform/equalizer graphics
  - Unrelated visual redesign: the product's own palette, type and components are the look
  - Fake benchmark numbers; only numbers the project states

## Visual Identity
- Background: `#111212`; surfaces `#1A1C1B` / `#232524`; border `#2B2D2C`
- Text: `#F2F3F2`; muted `#89908C`
- Accent: `#10B981`, strong `#34D399`, ink-on-accent `#04120C`; danger `#E5645A`
- Display font: **Bebas Neue** — `assets/fonts/bebas-neue.woff2` with `@font-face` (not a bundled family; the project uses it via next/font)
- Body font: Inter (bundled; 400 / 700 / 900)
- Visual references from the project: `docs/readme/home.webp` (nav, row anatomy), `docs/readme/player.webp` (player card + servers strip), `src/app/globals.css` `.nm-raise` / `.nm-glass` neumorphic shadows, `.badge-accent`, `.eyebrow`, `.poster-frame`/`.still-frame` ratios
- Brand assets in `assets/brand/`: `reelhouse-logo.png` (2164×727, transparent), `f1-logo.svg` (red), `bcci-logo.svg`
- LOOK line: near-black `#111212` ground with a 10% emerald radial behind the active panel; `#F2F3F2` ink; one emerald `#10B981` accent per scene; Bebas Neue at 96–132 px for statements, Inter 14–22 px for UI; 1 px `#2B2D2C` hairlines and the project's dual-shadow neumorphism instead of cards with drop shadows.

## Storyboard
Use the storyboard in `<output-dir>/brag-plan.md` as the creative contract.

Scene summary:
1. **Which server?** — 2.73s — three dead chips under `WHICH SERVER ACTUALLY WORKS?`
2. **Measured** — 4.36s — Servers panel recreation; Mbps counter 0.0 → 4.3; dots flip emerald; `MEASURED, NOT CLAIMED.`
3. **Switch server, keep your place** — 3.84s — player card, simulated play click, server swap with border beam; lower-third line
4. **One card per title** — 3.80s — home row is present at the cut; progress bars/percentages resolve on beats to 68 / 22 / 91%
5. **Oh — and live sport** — 2.20s — F1 + cricket split, trace draws, score ticks
6. **The receipts** — 3.26s — 12 ms / 0 / 193, then the wordmark + tagline

## Audio
- Audio role: warm steady bed + sparse precise UI accents
- Audio arc: bed in from 0; dry chip hits in scene 1; one glass check in scene 2; two clicks in scene 3; light card/progress accents in scene 4; scene 5 rides the cut; one bell on the logo in scene 6; fade out.
- Music: `assets/music/bed.mp3` (= `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`), volume ~0.30, fade out 19.7 → 20.19
- Music treatment: no ducking (no narration); let the bell ring over the fade
- Music cue guidance: preset `.music-cues.json` at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` — 109.96 BPM. Lock 8.74 (scene 3 line), 13.11 (third card), 18.56 (logo). Beat grid available in the plan.
- Audio-reactive treatment: subtle — emerald radial glow behind the panel and the logo halo modulated by music RMS; no waveform/equalizer visuals
- Audio-coupled moments:
  - Scene 1 chip arrivals — soft thud per chip (low volume; third one only if it does not crowd)
  - Scene 2 check lands 5.34 — single glass ding
  - Scene 3 play click 8.19, server switch 8.95 — two distinct clicks
  - Scene 4 progress reveals 12.02 / 12.55 / 13.11 — light accents on the first and last state
  - Scene 6 logo 18.56 — one mid-weight bell
- SFX selection guidance: `impact/impactSoft_medium_*`, `interface/click_00{3,5}`, `ui/mouseclick1`, `casino/card-slide-{1,3,8}`, `impact/impactGlass_light_001`, `impact/impactBell_heavy_000`. Prefer low/medium high-frequency risk; avoid stacking.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density and volume after the animation exists.
- Audio files: music copied to `assets/music/bed.mp3`; chosen SFX copied into `assets/sfx/`.

## Hyperframes Instructions
Load `hyperframes` (contract, `references/format.md`, `references/motion.md`, `references/look.md`), `hyperframes-registry`, `media-use` (audio), `hyperframes-cli`. /brag is its own workflow: skip the storyline step (no `references/types/*`, no `references/story.md`, no `SPEC.md`), skip `usage`/`history`/`feedback`/`REVIEW.md`; `check` is the gate.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (scenes 2–4 are faithful recreations; brand assets are the project's own files).
- Keep all text readable in the final render — UI text is scaled up for video (panel header 20 px, chips 19 px, not the site's 13 px).
- Keep the video within 15–25 seconds (20.19 s).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Major reveals may move toward nearby strong cues within ~0.15 s; small entrances within ~0.10 s. 1–3 strong cue locks.
- Use SFX to support motion and interaction; restraint when the edit is already busy.
- Audio-reactive: subtle, on the emerald glow only. If extraction is unavailable, note it and skip — do not block the render.
- Local assets only for audio and runtime deps.
- Run `hyperframes check` before render — brag's single gate.
- Keep creation and rendering local.

## Implementation notes (brag-owned)
- Poster artwork is fictional — TMDB art is licensed and is not shipped. Cards use gradient stand-ins in the project palette with sample-catalog titles.
- Do not display `.env` values, API keys, Supabase URLs or any real user data. Nothing secret was read.
