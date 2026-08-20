# Video provider setup

This is the guide for connecting a **licensed** video provider to Reelhouse after
you have purchased/registered one. Everything the app needs is configuration —
you will not need any code changes, and you will not need Claude to rebuild the
playback architecture.

Reelhouse ships with **five generic provider slots**, all unconfigured and
disabled. Until you fill one in, playback falls back to Reelhouse's own built-in
player surface (the bundled Creative-Commons clip) exactly as it does today. That
built-in surface is **not** a provider slot and is never listed in the provider
picker — the picker only ever shows slots you have configured and enabled.

---

## Before you start: the rules that keep this legal and safe

1. **Only a provider you are licensed to embed.** Use the provider's *own*
   official integration documentation as the source for every value below.
2. **Never copy an embed URL pattern from a third-party site, forum, repo, or
   another streaming site.** If the URL did not come from the provider's own
   documentation, it does not go in.
3. **No scraping, reverse-engineering, DRM circumvention, or undocumented /
   private endpoints.**
4. **No secrets in a URL template.** An embed URL is by nature visible in the
   browser (it is an `iframe src`). If your provider requires a key, keep it
   server-side and consult the provider's documented flow — do not paste it into
   a template.
5. **Do not invent capabilities.** If the provider's documentation does not
   describe progress events or a failure signal, leave those flags off. The app is
   built to behave correctly with them off.

---

## 1. Where the configuration lives

Everything is environment variables in **`.env.local`** (never committed).
`.env.local.example` contains the same list, commented out, as a template.

Each slot `N` (1–5) has eight variables:

| Variable | Meaning | Default |
| --- | --- | --- |
| `VIDEO_PROVIDER_N_NAME` | Display name in the provider picker | `Provider N` |
| `VIDEO_PROVIDER_N_ENABLED` | `1`, `true`, `yes` or `on` to make the slot selectable | off |
| `VIDEO_PROVIDER_N_PRIORITY` | Integer, **lower is preferred** | `N × 10` |
| `VIDEO_PROVIDER_N_MOVIE_URL` | Movie player URL template | unset |
| `VIDEO_PROVIDER_N_TV_URL` | TV player URL template | unset |
| `VIDEO_PROVIDER_N_MEDIA_TYPES` | `movie`, `tv`, or `movie,tv` | derived from the URLs you set |
| `VIDEO_PROVIDER_N_REPORTS_PROGRESS` | The provider **documents** playback progress events | off |
| `VIDEO_PROVIDER_N_REPORTS_FAILURE` | The provider **documents** a reliable failure signal | off |

There are deliberately **no API-key / token / auth variables**. Add one only if
the provider's documentation actually requires it, keep it server-only (never
`NEXT_PUBLIC_`), and never put it in a template.

The older `VIDEO_PROVIDER_BASE` / `VIDEO_PROVIDER_KEY` variables are kept for
compatibility and are not read by the slot system.

---

## 2. Where to enter the provider name

```bash
VIDEO_PROVIDER_1_NAME=Example Player
```

This is the label the viewer sees in the provider picker and under the title on
the playback screen. It is cosmetic — nothing depends on it.

---

## 3. Where to enter the movie player URL / template

Take the movie embed URL from the provider's documentation and replace the media
id with the token `{id}`:

```bash
# Shape only — use YOUR provider's documented URL, not this placeholder.
VIDEO_PROVIDER_1_MOVIE_URL=https://player.example.com/embed/movie/{id}
```

Query-string style works identically — you write the whole URL, so any shape the
provider documents is supported:

```bash
VIDEO_PROVIDER_1_MOVIE_URL=https://player.example.com/embed?type=movie&id={id}&autoplay=1
```

Reelhouse assumes **nothing** about the URL shape. Extra provider options
(autoplay, theme, language, …) simply stay in the template as you wrote them.

**Accepted templates:** an `https://` URL, or a same-origin absolute path
(`/something`). During development `http://localhost` and `http://127.0.0.1` are
also accepted so you can test against a local sandbox. Anything else — including
`javascript:`, `data:`, and protocol-relative `//host` — is rejected: the slot
shows a configuration error in the picker instead of loading it.

---

## 4. Where to enter the TV player URL / template

Same idea, with the season and episode tokens:

```bash
# Shape only — use YOUR provider's documented URL.
VIDEO_PROVIDER_1_TV_URL=https://player.example.com/embed/tv/{id}/{season}/{episode}
```

or

```bash
VIDEO_PROVIDER_1_TV_URL=https://player.example.com/embed?type=tv&id={id}&s={season}&e={episode}
```

A slot can serve movies only, TV only, or both — just set the URLs you have.

---

## 5. How media / TMDB ids are mapped

`{id}` is replaced with the title's **TMDB id** (`media.tmdbId`) — the same id the
rest of Reelhouse already uses for metadata. Nothing else is sent.

- Movie *Fight Club* → `{id}` → `550`
- Series *Game of Thrones* → `{id}` → `1399`

If your provider keys on a different identifier (IMDb, an internal id), consult
its documentation: that is a genuine adapter change, not a configuration change,
and should be raised as its own task rather than worked around in the template.

Values are URI-encoded when substituted, so a template cannot be broken by an
unexpected value.

---

## 6. How season / episode values are mapped

`{season}` → the current season number, `{episode}` → the current episode number,
both as the viewer's current position in the series (1-based, as TMDB numbers
them).

- `…/tv/1399/2/5` → *Game of Thrones*, season 2, episode 5.

These tokens are only substituted for TV. If a template uses `{season}` or
`{episode}` for a movie, the token collapses to an empty string rather than
leaking a literal `{season}` into the request.

When the viewer picks a different episode, Reelhouse re-expands the same template
with the new numbers — the provider's player is simply re-pointed. It does **not**
reload the page and does **not** reset the saved position.

---

## 7. How to enable / disable a provider

```bash
VIDEO_PROVIDER_1_ENABLED=1     # selectable
VIDEO_PROVIDER_1_ENABLED=      # disabled (also: 0, false, no, off, or unset)
```

Accepted "on" values: `1`, `true`, `yes`, `on` (case-insensitive).

Behaviour:

- **Disabled (but configured)** → the provider still appears in the picker, greyed
  out, with the reason `Disabled`. This is intentional: you can see that a slot
  exists and why it is not usable.
- **Enabled with no URL for the current media type** → greyed out with
  `No TV player URL set` / `No movie player URL set`.
- **Never touched at all** → **omitted entirely.** The picker only lists slots you
  have configured, so it can never advertise a provider that does not exist, and
  it never shows a count of five when you have configured two. (A slot with a
  *rejected* URL template is the exception: it is shown, greyed out, with the
  reason — a mistake should be visible, not silent.)
- **No slot configured at all** — the state the app ships in — → no picker is
  rendered, and playback uses Reelhouse's own built-in player.

Environment variables are read on the server at request time — **restart
`npm run dev`** (or redeploy) after editing `.env.local`.

---

## 8. How to set provider priority

```bash
VIDEO_PROVIDER_1_PRIORITY=5
```

**Lower wins.** The highest-priority *playable* provider is what a viewer gets by
default; the rest are available in the picker, listed in the same order.

- Default is `N × 10` → slot 1 = 10, slot 2 = 20, … slot 5 = 50.
- Reelhouse's own built-in player surface sits far below every slot (priority
  `10000`) and is not part of the picker, so **any** configured slot automatically
  takes over as the default. You do not have to change anything to demote it.
- Ties are broken by provider id, so the order is always stable.

To make slot 3 the primary and slot 1 the first fallback:

```bash
VIDEO_PROVIDER_3_PRIORITY=10
VIDEO_PROVIDER_1_PRIORITY=20
```

---

## 9. Progress and failure flags

These two flags are the only things that change Reelhouse's *behaviour*, and both
default to off. Set them **only** if the provider's documentation says so.

```bash
VIDEO_PROVIDER_1_REPORTS_PROGRESS=1   # provider documents progress events
VIDEO_PROVIDER_1_REPORTS_FAILURE=1    # provider documents a reliable failure signal
```

- `REPORTS_PROGRESS` off → Reelhouse records **no** position from that provider.
  It does not guess: a fabricated position is worse than none, because it corrupts
  "Continue watching". Watchlist, history and previously-saved positions are
  unaffected.
- `REPORTS_FAILURE` off → **automatic fallback is off for that provider.** A
  failure surfaces as a retry / switch prompt instead. This is deliberate: an
  embed that loaded but is blank is indistinguishable from a working one, so
  silently switching would be guesswork.

### Provider events (only if documented)

Setting `REPORTS_PROGRESS=1` declares that events *exist*; translating them also
needs a small **adapter** — the function that turns that provider's message
payload into Reelhouse's normalized `ready` / `progress` / `ended` / `failure`
signals. Adapters live in `src/lib/playback/adapters.ts`.

None of the five slots has an adapter today, because no provider documentation has
been supplied. Until one is added, an embed provider's messages are ignored
entirely (never guessed at), so:

- with no adapter: playback works, progress is not recorded from the provider,
  and failures surface as the manual retry/switch prompt;
- with an adapter: progress lands in the same store as everything else, and a
  documented failure can drive automatic fallback.

Adding an adapter is a small, well-scoped change — bring the provider's event
documentation and it is a single function keyed by the provider id
(`provider-1` … `provider-5`).

---

## 10. Worked example

Slot 2, a hypothetical licensed provider that serves both media types and
documents nothing about events:

```bash
VIDEO_PROVIDER_2_NAME=Example Player
VIDEO_PROVIDER_2_ENABLED=1
VIDEO_PROVIDER_2_PRIORITY=10
VIDEO_PROVIDER_2_MOVIE_URL=https://player.example.com/embed/movie/{id}
VIDEO_PROVIDER_2_TV_URL=https://player.example.com/embed/tv/{id}/{season}/{episode}
VIDEO_PROVIDER_2_MEDIA_TYPES=movie,tv
# REPORTS_* intentionally left off — not documented by the provider.
```

Restart the dev server. Open any title: "Example Player" is now the default and
the only entry in the picker — the picker lists **only** slots you have configured
and enabled, so it never advertises a provider a viewer cannot actually pick.

---

## 11. How to test a movie

1. `npm run dev`
2. Open a movie's detail page and press play (or go straight to
   `/watch/movie/<tmdbId>`).
3. Expected: the top bar shows the movie title and the provider name, the picker
   shows your provider selected, and the provider's own player renders inside the
   frame.
4. Confirm the URL is what you intended: DevTools → Elements → the `<iframe src>`
   should be your template with `{id}` replaced by the TMDB id.

Reelhouse deliberately adds **no** play/pause/seek/volume/quality/fullscreen/
subtitle controls on an embed provider — those are the provider's player, inside
the frame. Only the surrounding chrome (back, title, provider picker, episodes)
is Reelhouse's.

## 12. How to test a TV episode

1. Open `/watch/tv/<tmdbId>?s=2&e=5` (or use the Episodes button).
2. Expected: the top bar reads `Title · S2:E5`, and the `<iframe src>` carries
   season `2` and episode `5` in the positions your template specifies.
3. Open the Episodes drawer and pick a different episode. Expected: the frame
   re-points, the URL becomes `?s=…&e=…`, and no page reload occurs.

## 13. How to test provider switching

1. Configure **two** slots. Manual switching needs at least two entries in the
   picker; Reelhouse's own built-in surface is not one of them, so a single
   configured slot renders the pill with nothing to switch to.
   If you only have one real provider, point the second slot at the bundled embed
   test fixture (see §14) so you have something to switch between.
2. Click the provider pill in the top bar → the picker lists every configured
   provider in priority order. Unavailable ones are greyed out with the reason.
3. Pick another provider. Expected, and worth checking explicitly:
   - the **title stays the same**;
   - the **season/episode stay the same**;
   - the **saved position is not reset** (watch a minute, switch, come back — the
     position is still there);
   - **watch history is unchanged**.

Progress is stored per media/episode, never per provider, which is what makes the
above true. Switching provider only changes who renders the picture.

## 14. How to test automatic fallback

Automatic fallback only ever triggers for a provider that *declares* a reliable
failure signal (`REPORTS_FAILURE=1`), so testing it needs a provider that fails on
demand. Reelhouse bundles an embed **test fixture** for exactly this — a
same-origin page at `public/media/mock-embed/player.html` that stands in for an
external provider and reports a failure when you pass `fail=1`. It is a test
fixture, not a provider slot: it is never registered on its own and never appears
in the picker unless you point a slot at it yourself.

Configure a failing slot plus a working one:

```bash
# Slot 5 = the failing stand-in, tried first.
VIDEO_PROVIDER_5_NAME=Fallback Test Source
VIDEO_PROVIDER_5_ENABLED=1
VIDEO_PROVIDER_5_PRIORITY=1
VIDEO_PROVIDER_5_MOVIE_URL=/media/mock-embed/player.html?type=movie&id={id}&fail=1
VIDEO_PROVIDER_5_TV_URL=/media/mock-embed/player.html?type=tv&id={id}&season={season}&episode={episode}&fail=1
VIDEO_PROVIDER_5_REPORTS_FAILURE=1

# Slot 1 = whatever should catch the fall (your real provider, or the same
# fixture without fail=1).
VIDEO_PROVIDER_1_NAME=Working Source
VIDEO_PROVIDER_1_ENABLED=1
VIDEO_PROVIDER_1_PRIORITY=10
VIDEO_PROVIDER_1_MOVIE_URL=/media/mock-embed/player.html?type=movie&id={id}
VIDEO_PROVIDER_1_TV_URL=/media/mock-embed/player.html?type=tv&id={id}&season={season}&episode={episode}
```

1. `npm run dev`, then open any title.
2. Expected: "Fallback Test Source" is picked first, reports a failure a moment
   after load, Reelhouse switches to the next playable provider automatically, and
   a short notice says which provider it moved away from and which it moved to.
3. Expected also: it does **not** loop. A provider that already failed in this
   chain is not retried automatically; when nothing is left, the error state
   appears with **Try again** and (when there is one) **Switch provider**.
4. Remove those slot variables when you are done testing.

To verify the *other* half of the rule — no silent switching — drop
`VIDEO_PROVIDER_5_REPORTS_FAILURE` and reload. Expected: no automatic switch; you
get the error state with retry/switch instead, because an embed that loaded but is
blank is indistinguishable from a working one.

The selection rules themselves (ordering, enable/disable, manual switch, fallback,
no-fallback-without-a-failure-signal, movie/TV configuration) are unit-tested with
no real provider connected:

```bash
npm run test          # src/lib/__tests__/playback-manager.test.ts
                      # src/lib/__tests__/playback-progress.test.ts
```

---

## 15. Troubleshooting a provider that does not load

Work down this list; it is ordered by how often each one is the cause.

**The provider is not in the picker at all**
- The slot has no configuration. Set at least `ENABLED` or one URL.
- You edited `.env.local` without restarting. Restart `npm run dev`.

**It is greyed out, and the reason says…**
- `Not configured` → no `ENABLED` and no URLs for this slot.
- `Disabled` → set `VIDEO_PROVIDER_N_ENABLED=1`.
- `No movie player URL set` / `No TV player URL set` → that media type has no
  template. Add it, or accept that the slot is single-type.
- `Not configured for movies` / `Not configured for TV` → `MEDIA_TYPES` excludes
  it. Either add the type or delete the variable (it then follows your URLs).
- `MOVIE_URL must be an https:// URL or a same-origin /path` (or the same message
  naming `TV_URL`, or both) → that template was rejected and is not being loaded.
  Check the scheme: `https://` (or a leading `/`), no protocol-relative `//host`,
  no `javascript:` / `data:`.

**It is selected, but the frame stays on the loading state and then errors**
- Read the real URL first: DevTools → Elements → `<iframe src>`. Copy it into a
  new tab. If it fails there too, the problem is the URL or the provider account,
  not Reelhouse.
- Wrong token positions are the most common cause — e.g. `{season}`/`{episode}`
  swapped, or `{id}` in a path segment the provider expects as a query parameter.
- Reelhouse gives the frame **15 seconds** to load a document. Past that it
  reports a timeout (and only then, and only if the provider declares
  `REPORTS_FAILURE`, may it switch automatically).
- DevTools → Console/Network for the provider's own error. `X-Frame-Options` or a
  `frame-ancestors` directive from the provider means that provider does not
  permit embedding at your origin — that is a provider-side setting, not
  something to work around.

**It works locally but not in production**
- The Content-Security-Policy in `next.config.mjs` is currently shipped
  **report-only**, so it does not block anything — but when it is switched to
  enforcing, `default-src 'self'` will not allow a cross-origin frame. An
  enforced policy needs the provider's origin added, e.g.
  `frame-src 'self' https://player.example.com`. That is a deliberate deployment
  change to `next.config.mjs`; make it as its own reviewed step (see
  `docs/deployment.md`).
- Check that the provider's variables actually exist in the production
  environment — they are server-side and are not bundled into the client.
- `http://localhost` templates are accepted in development only. Production
  requires `https://`.

**Progress is not being recorded**
- Expected unless `REPORTS_PROGRESS=1` **and** an adapter exists for that provider
  (§9). This is by design.
- Reelhouse's own built-in player surface records progress through the existing
  player, which is unrelated to this setting.

**"Playback unavailable" with no picker**
- This appears only when *no* surface at all can serve the media type. Reelhouse's
  built-in surface is always registered as the last resort, so this should not be
  reachable — treat it as a signal that the playback plan came back with nothing
  playable: check the server console and that `public/media/` still contains the
  bundled clip files.

---

## 16. What you should never have to change

For a normal provider activation, you edit `.env.local` and nothing else. In
particular you should not need to touch:

- `src/components/player/*` — Reelhouse's own built-in player (the native
  surface). An external provider supplies its own complete player UI; Reelhouse
  does not recreate provider controls.
- `src/lib/playback/manager.ts` — the selection rules (priority, enable/disable,
  manual switch, fallback), all unit-tested.
- `src/lib/library.ts`, the Supabase APIs, or the migrations — progress is
  provider-independent and stays where it is.
- `src/proxy.ts` — unrelated to playback.

The one legitimate code change is an **adapter** (§9) when a provider documents
its events, and a **CSP `frame-src` entry** when the policy is enforced (§15).
