export const CONTACT_EMAIL = "reelhouse69@gmail.com";

/**
 * Gmail's compose URL. Opening this (rather than a `mailto:`) keeps the
 * recipient in the browser and works for visitors who don't have a desktop
 * mail app configured.
 */
export function gmailComposeUrl({
  subject,
  body,
}: {
  subject?: string;
  body?: string;
} = {}): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: CONTACT_EMAIL,
  });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
