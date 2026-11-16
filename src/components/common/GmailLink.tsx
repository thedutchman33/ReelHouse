import type { ReactNode } from "react";
import { gmailComposeUrl } from "@/lib/contact";

export default function GmailLink({
  subject,
  body,
  className,
  ariaLabel,
  children,
}: {
  subject?: string;
  body?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={gmailComposeUrl({ subject, body })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </a>
  );
}
