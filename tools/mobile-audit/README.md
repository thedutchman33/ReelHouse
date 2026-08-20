# Mobile interaction audit harness

Investigation tooling for the mobile interaction audit (2026-08-20). **Nothing in
this directory ships**: it is outside `src/`, so it is not part of the build, not
type-checked by `npx tsc --noEmit`, and not collected by Vitest (`vitest.config.mts`
includes `src/**/*.test.ts` only).

It exists because "the page looks right on a phone" and "the page *works* on a
phone" are different claims, and only the second one matters. Every script here
drives a real headless Chrome over the DevTools Protocol with **device emulation
on** (`mobile: true`, touch enabled, `hover: none` / `pointer: coarse`) and
dispatches **real touch events** — not synthetic `click()` calls, which succeed on
controls a finger can never reach.

No dependencies: Node 22 ships a global `WebSocket`, and `cdp.mjs` is a ~280-line
client on top of it.

## Running

Start a server first, then point a script at it. Both surfaces matter:

```bash
# the whole functional matrix (desktop / Android portrait / Android landscape)
node tools/mobile-audit/matrix.mjs http://127.0.0.1:3123

# one row only, while iterating
node tools/mobile-audit/matrix.mjs http://127.0.0.1:3123 --row=Genre

# Reelhouse's own player: reachable only when no provider slot is configured
node tools/mobile-audit/matrix.mjs http://127.0.0.1:3125 --set=native
```

To reach the native surface without editing `.env.local`, neutralise the slots in
the server's **process environment** only — `@next/env` does not override a key
that is already present:

```bash
for i in 1 2 3 4 5; do
  export VIDEO_PROVIDER_${i}_ENABLED=0
  export VIDEO_PROVIDER_${i}_MOVIE_URL=" "
  export VIDEO_PROVIDER_${i}_TV_URL=" "
done
npx next start -p 3125
```

Prefer `next start` over `next dev` for anything conclusive: the dev-tools
indicator (`nextjs-portal`) is itself an overlay and will occlude a control in the
bottom-right corner, which is a dev artifact and not a defect.

When testing from a phone on the LAN, use the `Network:` URL `next dev` prints —
and note that this only works because `next.config.mjs` lists this machine's
addresses in `allowedDevOrigins` (see below).

## What each script is for

| Script | Question it answers |
| --- | --- |
| `cdp.mjs` | Shared CDP client: launch, emulate, `tap`, `longPress`, `nudge`, `type`, `pressKey`. |
| `matrix.mjs` | **Behaviour.** Taps every control and asserts a *named* piece of page state changed. A row passes only when its own assertion is satisfied. |
| `audit.mjs` | **Geometry, whole-page.** Every interactive element per route/profile: rect, hit test, `pointer-events`, target size, nesting. |
| `explain.mjs` | Why one specific element loses a hit test — walks the blocker's ancestry. |
| `hydration-probe.mjs` | Whether React actually hydrated, and which requests 403'd. Found root cause #1. |
| `navbar-probe.mjs` | The glass navbar's stacking/backdrop layers over the page beneath. |
| `hero-probe.mjs` | The home hero's rotator, dots, and the `-mt-4` row that overlaps them. |
| `detail.mjs` | Detail-page hero controls. |
| `drawer-probe.mjs` | Which element wins over the modal episode drawer, and why. Found the `z-60` chrome. |
| `native-probe.mjs` | The native player's layer geometry — found the control bar sitting below the fold in landscape. |
| `hover-probe.mjs` | The other half of the `.hover-reveal` contract: inert at rest, but still revealed and clickable on hover **and** on keyboard focus. |

Machine-readable dumps (`matrix-*.json`) are written next to the scripts on each
run and are regenerable, so they are not kept.

## The four defects this harness found

1. **`allowedDevOrigins`** (dev only, `next.config.mjs`) — `next dev` 403s every
   `/_next` chunk for a LAN origin, so CSS applies, the page looks perfect, React
   never hydrates, and every `onClick`/`onSubmit` is dead while plain `<a href>`
   links keep working. This is the one that produced the reported symptoms.
2. **`opacity-0` without `pointer-events-none`** (`.hover-reveal` in
   `globals.css`) — invisible hover-only controls were answering taps aimed at the
   poster underneath. Touch-only, so a mouse never sees it.
3. **Embed chrome above the modal drawer** (`PlaybackContainer.tsx`) — `z-60`
   chrome over a `z-40` drawer meant the drawer's own close/autoplay controls were
   covered. All viewports, desktop included.
4. **Native control bar below the fold** (`PlayerOverlay.tsx`) — the overlay's
   bottom band asked for 328px inside a 412px-tall viewport, pushing the timeline
   and the entire control row off-screen on a phone held sideways.
