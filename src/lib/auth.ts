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
