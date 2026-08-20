@AGENTS.md

# Reelhouse Development Rules

## Current State

- Phase 1 — Frontend V1: COMPLETE
- Phase 2 — Live TMDB integration: COMPLETE
- Phase 3 — Supabase/backend activation: COMPLETE and validated
- Subtitle search/resilience: COMPLETE
- Next.js 16 / React 19 upgrade: COMPLETE
- Phase 4 — Production hardening: NEXT
- Video provider integration: DEFERRED until an authorized provider API is supplied

`PROGRESS.md` is the source of truth for current project progress.

## Development Workflow

- Work one milestone at a time.
- Read `PROGRESS.md` before starting work.
- Before implementation, state the milestone scope and acceptance criteria.
- Implement only the approved milestone.
- Run typecheck, build, tests, and relevant smoke tests.
- Review changes for unrelated modifications.
- Update `PROGRESS.md`.
- STOP after the milestone and wait for approval.

## Non-Negotiable Rules

- Do not implement multiple phases simultaneously.
- Do not skip phase gates.
- Do not invent requirements.
- Do not rewrite working code without a concrete reason.
- Do not expose API keys, passwords, JWTs, or Supabase service-role keys.
- Never bypass Supabase RLS.
- Keep secrets in `.env.local`.
- Do not modify Supabase migrations without approval when existing data/RLS could be affected.
- Do not modify or remove `AGENTS.md`; Next.js manages it.
- Do not downgrade Next.js or React without approval.
- Do not add a real video provider until I explicitly provide
- Keep `VIDEO_PROVIDER_*` abstraction intact.
- Do not automatically continue to the next phase.

## Current Phase Plan

### Phase 1 — Frontend
COMPLETE.

### Phase 2 — TMDB
COMPLETE.

### Phase 3 — Supabase/backend
COMPLETE.

Validated:
- Auth
- Profiles
- Watchlist
- Watch history
- Playback events
- RLS isolation

### Phase 4 — Production Hardening
NEXT.

Potential scope:
- automated tests
- environment validation
- CI
- production error/loading/empty states
- browser auth verification
- localStorage → Supabase migration verification
- security/reliability checks
- production build
- deployment readiness

Before starting Phase 4, show the exact scope and acceptance criteria and wait for approval.



## Tech Stack

- Next.js 16.3.1
- React 19.2.8
- TypeScript
- Supabase
- TMDB API
- OpenSubtitles API
- Node.js 20.9+
- npm
- Turbopack

## Commands

Use existing project scripts.

- Dev: `npm run dev`
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit`

Do not invent or replace project scripts without approval.

## Security

- Keep server credentials server-side.
- Never expose service-role keys.
- Never log secrets.
- Preserve Supabase RLS.
- Keep `.env.local` out of Git.
- Keep OpenSubtitles credentials server-side.

## Architecture

- Keep shared integrations in `src/lib`.
- Keep Supabase browser/server clients separated.
- Keep OpenSubtitles logic behind its existing integration.
- Keep playback behind `VIDEO_PROVIDER_*`.
- Reuse existing components/utilities before creating duplicates.
- Preserve responsive/mobile behavior.
- Preserve Reelhouse branding and visual direction.

## Video Provider Architecture

Reelhouse is being prepared to support up to five future  video providers.

All five providers are expected to use the same general integration model as the Videasy-style documentation:

- External player/embed URL.
- Movie playback using a media/TMDB identifier.
- TV playback using a media/TMDB identifier + season + episode.
- The provider supplies the complete video-player UI.
- Reelhouse must not recreate the provider's video controls.
- No API key is assumed unless the future provider explicitly requires one.
- Do not invent provider capabilities, parameters, or authentication requirements.

### Five Provider Slots

Prepare exactly five provider slots:

- Provider 1
- Provider 2
- Provider 3
- Provider 4
- Provider 5



The five providers should use a reusable common adapter/interface rather than five duplicated implementations.

### Provider Manager

The Provider Manager must support:

- provider priority
- provider enable/disable
- manual provider switching
- controlled automatic fallback
- movie playback
- TV season/episode playback
- provider loading state
- provider failure state
- provider-independent playback state

Automatic fallback may only occur when provider/player failure can be reliably detected.

### External Player

The future providers supply their own complete video-player UI.

Do NOT maintain or extend the existing custom Reelhouse video-player controls as the primary playback UI.

Reelhouse should provide only the surrounding playback experience:

- player container
- provider/server selector
- loading state
- error/fallback state
- movie/TV context
- provider switching

The selected provider's own player should be rendered inside the playback container.

Provider-specific controls such as:

- play/pause
- seek
- volume
- quality
- fullscreen
- subtitles
- picture-in-picture
- episode controls

remain the provider's responsibility when supported by that provider.

### Provider Configuration

Provider URLs/templates and configuration must not be hard-coded into page components.

Each provider slot should have configurable:

- display name
- enabled state
- priority
- movie player URL/template
- TV player URL/template
- supported media types

Do not create API-key or authentication configuration unless the future provider documentation actually requires it.

### Playback State

Supabase watch history and playback progress must remain provider-independent.

If a future provider exposes documented playback/progress events, its adapter may translate those events into the existing Reelhouse playback-state interface.

Switching providers must not reset:

- selected movie/TV title
- season
- episode
- saved playback position
- watch history

### Future Activation

The five providers must be activatable without redesigning Reelhouse.

Create:

`docs/video-provider-setup.md`

This guide must explain how to activate each provider after purchase, including:

- where to enter the provider name
- where to enter the movie player URL/template
- where to enter the TV player URL/template
- how media/TMDB IDs are mapped
- how season/episode values are mapped
- how to enable/disable a provider
- how to set provider priority
- how to test a movie
- how to test a TV episode
- how to test provider switching
- how to test automatic fallback
- how to troubleshoot a provider that does not load

The guide must be written so the project owner can perform future provider configuration without requiring Claude to rebuild the playback architecture.

### Testing

The provider architecture must be testable without real providers.

Use mock providers and/or safe test content to verify:

- provider registration
- provider priority
- provider enable/disable
- manual switching
- fallback
- loading/error states
- movie configuration
- TV configuration
- playback-state persistence
- provider-independent Supabase progress

### Security

- Never expose private provider secrets to the browser.
- Never commit secrets.
- Keep secrets in `.env.local` when required.
- Use only documented provider integration interfaces.
- Do not scrape, reverse-engineer, bypass DRM, or use undocumented/private endpoints.

### Testing

The provider architecture must be testable without real providers.

Use mock providers to test:

- provider selection
- priority
- fallback
- manual switching
- movie playback configuration
- TV playback configuration
- loading/error states
- progress persistence
- provider failure
- disabled providers

## Next.js 16 Rules

- Read the relevant Next.js guide under `node_modules/next/dist/docs/` before changing framework-specific behavior.
- Treat dynamic request APIs as asynchronous.
- Keep `src/proxy.ts` as the Next.js 16 proxy entrypoint.
- Do not recreate deprecated `middleware.ts` conventions.

## Gotchas

- `PROGRESS.md` contains the current project state.
- `AGENTS.md` is generated/managed by Next.js.
- Supabase is already hosted and activated; don't create a local Docker instance unless explicitly requested.
- OpenSubtitles may experience transient network failures; use the existing resilient integration.
- TMDB already uses explicit caching/revalidation where required.