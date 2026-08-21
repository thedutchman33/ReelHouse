# Reelhouse — Deployment Guide

Everything needed to build, configure, and ship Reelhouse to production, plus the
manual checks that can't be run headless. Written for Phase 4 / M6.

---

## 1. Prerequisites

- **Node.js 20.9+** (Next.js 16 requirement).
- **npm** — the repo ships a `package-lock.json`; use `npm ci` for reproducible installs.

## 2. Environment variables

All secrets are **server-only** unless prefixed `NEXT_PUBLIC_`. **Every feature
degrades gracefully when its vars are blank** — a fresh clone builds and runs on
a mock catalog with `localStorage`, no setup required. Keep real values in
`.env.local` (git-ignored); see `.env.local.example`.

| Variable | Required for | Notes |
| --- | --- | --- |
| `SITE_URL` | **Correct auth redirects behind a proxy/CDN** | Server-only. The site's public origin, e.g. `https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com`. **Required on AWS Amplify, Cloudflare, and any reverse proxy.** On Amplify it takes **two** steps — the console variable **and** an entry in `amplify.yml`'s allow-list. The console variable alone reaches the build but **not** the running server; see §4.1. Leave unset locally. |
| `TMDB_API_KEY` | Live metadata | Server-only. Blank → mock catalog. v3 key or v4 token. |
| `TMDB_API_BASE` | TMDB host override | Optional; set `https://api.tmdb.org/3` if your ISP blocks the default. |
| `TMDB_IMAGE_BASE` | TMDB image base | Optional; rarely changed. |
| `OPENSUBTITLES_API_KEY` | Subtitle **search** | Server-only. Blank → search UI shows "not configured". |
| `OPENSUBTITLES_USERNAME` / `OPENSUBTITLES_PASSWORD` | Subtitle **download** | Server-only. Counts against a daily per-account quota. |
| `OPENSUBTITLES_APP_NAME` | User-Agent | Optional; defaults to `Reelhouse v1.0`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + persistence | Browser-exposed by design. Blank → anonymous `localStorage` mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + persistence | Browser-safe (protected by RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server tasks | Server-only, optional. **Bypasses RLS — never set as `NEXT_PUBLIC_`.** |
| `REDIS_URL` | Scale-out cache | Optional; built-in Next.js Data Cache used otherwise. |
| `VIDEO_PROVIDER_BASE` / `VIDEO_PROVIDER_KEY` | Future licensed playback | Server-only; **unused** in V1. Authorized/CC only. |

> Only the two `NEXT_PUBLIC_SUPABASE_*` values are ever exposed to the browser,
> and both are safe under row-level security. Everything else stays server-side.

## 3. Build & run

```bash
npm ci
npx tsc --noEmit   # typecheck
npm run test       # unit tests (Vitest)
npm run build      # production build (Turbopack)
npm run start      # serve the built app (default :3000)
```

`next start` requires a prior `next build`.

## 4. Supabase

The data/auth/RLS layer is already provisioned and validated end-to-end (see
`docs/phase-3.md`). To deploy against a **new** project:

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_init.sql` (tables + RLS policies + the
   `on_auth_user_created` trigger).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Leave `SUPABASE_SERVICE_ROLE_KEY` unset unless a privileged server task needs it.

With those blank, the app runs anonymously on `localStorage` (Phase 1 behavior).

## 4.1 `SITE_URL` — required behind a proxy or CDN (AWS Amplify, Cloudflare, …)

**Symptom if you skip this:** a password-reset link lands on `/auth/callback`, and
the server redirects the visitor to `https://localhost:3000/…` instead of your
domain. The reset flow works perfectly on `localhost` and only breaks in
production.

**Why.** A Route Handler cannot learn its public origin from `request.url`. Next
builds that URL from the address the server process is *bound to*
(`next/dist/server/next-server.js` → `attachRequestMeta`):

```js
initUrl = `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
```

`fetchHostname`/`port` are the server's own listener, while `protocol` is read
from `x-forwarded-proto`. On Amplify — CloudFront in front of a Node server in a
Lambda listening on `localhost:3000` — those compose to `https://localhost:3000`.
On a dev machine the same expression is right by coincidence, because there the
server really *is* the public origin. Nothing about Supabase, the email template,
or the redirect allow-list is involved.

**Fix.** Set `SITE_URL` to the site's public origin, with no trailing path:

```
SITE_URL=https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com
```

### On AWS Amplify this takes TWO steps, not one

Setting the console variable alone is **not sufficient** — it reaches the build but
never the running server. Both of these are required:

**(a) The variable must exist in the Amplify environment.** Amplify console → your
app → *Hosting* → **Environment variables** → add `SITE_URL`. Amplify env vars can
be scoped per branch, which is what you want when a preview branch has its own URL.

**(b) The variable must be named in the repository's `amplify.yml` allow-list**, so
the build writes it into `.env.production` for Next.js to load at server start:

```yaml
- env | grep -e SITE_URL -e TMDB_API_KEY -e TMDB_API_BASE -e NEXT_PUBLIC_ -e OPENSUBTITLES_ -e VIDEO_PROVIDER_ >> .env.production
```

Step (b) is the one that is easy to miss, and skipping it fails **silently**: the
build succeeds, the console shows the variable, and production still redirects to
`https://localhost:3000`. That is because Amplify's `WEB_COMPUTE` platform withholds
console environment variables from the Next.js server *deliberately*:

> "a Next.js server component doesn't have access to those environment variables by
> default. This behavior is intentional to protect any secrets stored in environment
> variables that your application uses during the build phase."
> — [Making environment variables accessible to server-side runtimes](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html)

So console variables are **build-time only**, and the `env | grep … >> .env.production`
line is the *only* channel into the request-time environment. A variable not named
there does not exist as far as the running server is concerned.

`amplify.yml` lives in the repository root on purpose — Amplify applies console
build settings "to all of your branches **unless there is an `amplify.yml` file
stored in your repository**", so the repo file wins and this runtime requirement
stays under version control instead of living only in console state.

**Then redeploy**, since the build is what produces `.env.production`.

**Verify it actually arrived.** After the deploy, absence of the warning is the
signal:

```bash
aws logs filter-log-events --log-group-name /aws/amplify/<app-id> \
  --filter-pattern '"SITE_URL is not set"'
```

`src/lib/site-url.ts` emits that warning once per compute instance when the variable
is missing — the name only, never the value. No matches means the server sees it.
Confirm the user-visible behavior directly with:

```bash
curl -I "https://<your-domain>/auth/callback?next=/reset-password"
# Location must be https://<your-domain>/forgot-password?error=link_invalid
# `link_invalid` is expected (no valid code is present) — the ORIGIN is the subject.
```

`src/lib/site-url.ts` validates the value and falls back to the request origin
when it is unset or unusable — so local development needs no `SITE_URL` at all,
and a fresh clone still builds and runs. In production an unset value logs a
one-time warning naming `SITE_URL` (no value, no secret).

Rejected values (each falls back rather than being trusted):

| Value | Why rejected |
| --- | --- |
| `reelhouse…amplifyapp.com` | not an absolute URL — needs a scheme |
| `http://reelhouse…amplifyapp.com` | plaintext on a public host would silently downgrade production; `http://` is accepted only for loopback |
| `https://reelhouse…amplifyapp.com@evil.example` | userinfo — reads as your host to a human, resolves to `evil.example` in a browser |
| `javascript:…`, `data:…`, `//host` | not an http(s) origin |

Any path, query, or fragment in the value is discarded — only the origin is kept.

> **Why not derive the origin from `Host` / `X-Forwarded-Host`?** Those are
> *request* headers, so unless the CDN is proven to strip them they are
> visitor-controlled. `safeRedirectPath()` guards only the **path** of a redirect,
> so an attacker-chosen **host** would sail past it and turn the mailed-link
> callback into an open redirect — a phishing primitive on a password-reset
> route. The origin therefore comes from configuration, which no request can
> influence. (Next's `experimental.trustHostHeader` is not a fix either: it is
> unreachable under `next start`, hardcodes `https://`, is undocumented, and
> means "trust the Host header".)

## 5. Security headers & CSP

Baseline headers ship from `next.config.mjs` → `headers()` on **every** route:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `X-DNS-Prefetch-Control: on`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`

**HSTS `preload` is intentionally omitted.** `preload` commits your apex domain
to the browser preload list (hard to reverse) and is unsafe on shared preview
domains. Add `; preload` and submit at <https://hstspreload.org> only once you
deploy on a dedicated domain you control.

### Content-Security-Policy — currently REPORT-ONLY

The policy ships as `Content-Security-Policy-Report-Only`, so the browser
**reports** violations to the console but **never blocks**. This lets you
validate it in a real browser (which a headless build cannot do) before
enforcing. Current policy:

```
default-src 'self';
script-src 'self' 'unsafe-inline'   (+ 'unsafe-eval' in dev only);
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://image.tmdb.org https://img.youtube.com;
font-src 'self';
connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co;
media-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; upgrade-insecure-requests;
```

**To enforce:**

1. Deploy, then open each page type (home, search, movie/TV detail, watch
   player, login, my-list) with DevTools open.
2. Exercise the app: play a clip, load a subtitle, sign in, add to My List.
   Confirm **no CSP violations** appear in the console.
3. If a violation appears for a host you trust, add it to the matching directive.
4. In `next.config.mjs`, rename the header key
   `Content-Security-Policy-Report-Only` → `Content-Security-Policy`. Redeploy.

> If your Supabase is self-hosted on a custom domain, replace
> `https://*.supabase.co` / `wss://*.supabase.co` with that origin.

### Stricter (nonce-based) alternative

`'unsafe-inline'` in `script-src` weakens XSS protection. For a strict policy,
generate a per-request nonce in `src/proxy.ts` and use
`script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` in dev), per
Next's guide (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
Trade-off: it forces **dynamic rendering** on all pages (no static/CDN caching).
Reelhouse uses no external or inline app scripts, so the nonce approach is viable
if the caching cost is acceptable.

## 6. Release checklist

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run test` → all green
- [ ] `npm run build` → clean
- [ ] Every env var the **server** reads is in **both** places: the Amplify
      environment **and** `amplify.yml`'s `.env.production` allow-list (§4.1).
      Missing the second fails silently at runtime.
- [ ] Prod smoke (`npm run start`): `/`, `/search`, `/login`, `/my-list` → 200;
      `/movie/<numeric>` → 200; `/movie/<non-numeric>` → 404; `/api/watchlist`
      → 401 when signed out
- [ ] Security headers present on an HTML **and** an API response
- [ ] CSP Report-Only console clean in a browser, then enforce (§5)
- [ ] CI green (`.github/workflows/ci.yml`)

## 7. Browser verification (manual — cannot be automated headless)

The data/auth/RLS layer is validated by direct API calls (`docs/phase-3.md`
§4–5). These UI flows need a human in a browser:

1. **Sign up / sign in** via the Navbar "Sign in" → `LoginForm`. Confirm the
   navbar reflects the signed-in state.
2. **Persistence**: add a title to My List and set some playback progress;
   reload → it persists; verify the rows in the Supabase dashboard.
3. **localStorage → Supabase migration**: while signed out, add items to My List
   (stored locally). Then sign in for the first time → confirm the local items
   migrate to the server **exactly once** (an owner-marker prevents re-import and
   cross-account bleed). See `docs/phase-3.md` §6.
4. **RLS isolation**: with a second account, confirm you never see the first
   account's list/history.
5. **Sign out → local mode**: confirm the app falls back to `localStorage` and
   still works.

## 8. Notes

- No VCS is initialized in this workspace; `.github/workflows/ci.yml` activates
  once the repo is pushed to GitHub.
- `AGENTS.md` is generated by `next dev` — leave it in place.
- Playback is **authorized / Creative-Commons only**; the `VIDEO_PROVIDER_*` seam
  stays unused until a licensed provider is supplied.
