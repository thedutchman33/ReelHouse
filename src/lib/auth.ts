// Small, dependency-free auth helpers shared by the sign-in and password-reset
// screens. Pure functions only — this module is imported by client components,
// so it must never reach for Supabase, cookies, or anything server-side.

/** The rule signup has always enforced; the reset screen reuses it verbatim. */
export const MIN_PASSWORD_LENGTH = 8;

/** Field hint, so signup and reset state the same requirement. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters`;

/**
 * The message to show for a password that breaks the project rule, or null when
 * it is acceptable. Emptiness is left to the caller: "required" reads differently
 * on a sign-in form than on a set-a-new-password form.
 */
export function passwordRuleError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
    : null;
}

/**
 * The message for a confirmation field that doesn't match, or null when it does.
 *
 * Wording is the reset screen's, verbatim, so the two places that ask a visitor
 * to type a password twice answer a mismatch identically. Emptiness is left to
 * the caller and to `required`: an empty confirmation simply doesn't match.
 */
export function confirmPasswordError(
  password: string,
  confirm: string
): string | null {
  return password === confirm ? null : "The two passwords don’t match.";
}

/**
 * The message to show when `signInWithPassword` fails.
 *
 * Sign-in leaks account existence in the same way signup did, through a second
 * channel: GoTrue answers a wrong password with `invalid_credentials` but an
 * unconfirmed address with `email_not_confirmed`, and the second reply only
 * happens for an address that *has* an account. Both therefore collapse onto one
 * sentence here — like {@link signUpErrorMessage}, deliberately without
 * inspecting the error to tell them apart, since a branch that recognised
 * "not confirmed" would be a distinguishable message again.
 *
 * Transport failures are mapped separately, and safely: a 5xx or a fetch that
 * never got a status says nothing about the account, and telling a visitor their
 * password was wrong when the network was actually down would be a lie.
 *
 * The 429 wording matches the reset screen's, so every form answers a rate limit
 * the same way.
 *
 * Note for a future `mailer_autoconfirm` change: with **Confirm email** turned on
 * in Supabase, a genuinely unconfirmed visitor reaches the message below rather
 * than being told to check their inbox. Any guidance added for them must be part
 * of this single string — shown for a wrong password too — or the channel
 * reopens.
 */
export function signInErrorMessage(
  error: { status?: number | null } | null | undefined
): string {
  const status = error?.status ?? 0;
  if (status === 429) {
    return "Too many requests. Wait a minute, then try again.";
  }
  if (status === 0 || status >= 500) {
    return "We couldn’t sign you in just now. Check your connection and try again.";
  }
  return "That email or password isn’t right.";
}

/**
 * The message to show when `signUp` fails, chosen so the form can never confirm
 * whether an address already has an account.
 *
 * Supabase answers a signup on a known address with a real error ("User already
 * registered") whenever email confirmation is off, so surfacing `error.message`
 * makes the form an enumeration oracle. Everything except the send-rate limit
 * therefore collapses onto one neutral sentence — deliberately *without*
 * inspecting the error for "already registered", because any branch that
 * recognised that case would be a distinguishable message again, which is the
 * leak itself. The conditional phrasing still points a returning user at the
 * right screen without the server having confirmed anything, the same way the
 * reset screen's success panel does.
 *
 * The 429 wording matches the reset screen's, so both forms answer a rate limit
 * the same way.
 */
export function signUpErrorMessage(
  error: { status?: number | null } | null | undefined
): string {
  if (error?.status === 429) {
    return "Too many requests. Wait a minute, then try again.";
  }
  return "We couldn’t create your account. If you already have a Reelhouse account, sign in instead.";
}

/** The two things the /login screen can be. Exported so the page, the form and
 *  the URL parameter can never disagree about the spelling. */
export type AuthMode = "signin" | "signup";

/** The query parameter that gives sign-up mode a URL of its own. */
export const AUTH_MODE_PARAM = "mode";

/**
 * Reads the screen's mode out of `?mode=`.
 *
 * Sign-up used to be reachable only by clicking a toggle, so it had no URL to
 * link, bookmark, or come back to. `?mode=signup` is that URL. Anything
 * unrecognised falls back to sign-in, which is what /login has always shown, and
 * the repeated-parameter case is flattened the way /search flattens `?q=`.
 */
export function authModeFromParam(
  raw: string | string[] | null | undefined
): AuthMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim().toLowerCase() === "signup" ? "signup" : "signin";
}

/**
 * The query string /login should carry for `mode`, preserving every other
 * parameter already there.
 *
 * Returned with the leading `?`, or empty when nothing is left — so it can be
 * concatenated onto the pathname directly. Sign-in drops the parameter instead
 * of spelling it out, keeping the canonical URL for the default view clean.
 * Other parameters survive because a visitor can arrive mid-flow and switching
 * mode must not discard where they were headed.
 */
export function authModeQuery(currentSearch: string, mode: AuthMode): string {
  const params = new URLSearchParams(currentSearch);
  if (mode === "signup") params.set(AUTH_MODE_PARAM, "signup");
  else params.delete(AUTH_MODE_PARAM);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Every string that differs between the two modes, in one place.
 *
 * The screen used to greet someone creating their first account with
 * "Welcome back" under a tab reading "Sign in", because both were hard-coded for
 * sign-in. The page's `generateMetadata` and its heading now read from here, so
 * the tab title and the visible copy cannot drift apart again.
 */
export function authScreenCopy(mode: AuthMode): {
  title: string;
  description: string;
  heading: string;
  blurb: string;
} {
  return mode === "signup"
    ? {
        title: "Create your account",
        description:
          "Create a Reelhouse account to sync your watchlist and history across devices.",
        heading: "Create your account",
        blurb:
          "Create an account to sync your watchlist, history, and playback progress across devices.",
      }
    : {
        title: "Sign in",
        description:
          "Sign in to sync your watchlist and history across devices.",
        heading: "Welcome back",
        blurb:
          "Sign in to sync your watchlist, history, and playback progress across devices.",
      };
}

/** CR/LF and friends: a Location header must never carry a control character. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Sanitises a `next=` target taken from a query string.
 *
 * Only same-origin relative paths survive. An absolute URL, a protocol-relative
 * `//evil.example`, the backslash variant browsers normalise to it, or anything
 * carrying control characters (header-injection shapes) all fall back — so the
 * auth callback can never be turned into an open redirect.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  if (hasControlChars(raw)) return fallback;
  return raw;
}
