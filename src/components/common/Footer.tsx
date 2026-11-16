import Link from "next/link";
import Logo from "@/components/brand/Logo";
import FeedbackForm from "@/components/feedback/FeedbackForm";
import GmailLink from "@/components/common/GmailLink";
import { CONTACT_EMAIL } from "@/lib/contact";

// Footer — centered reference layout inside a floating bordered panel.
const LINKS: { href: string; label: string }[] = [
  { href: "/faq", label: "FAQ" },
  { href: "/legal", label: "Legal" },
  { href: "/terms", label: "Terms" },
  { href: "/dmca", label: "DMCA" },
];

const LINK_CLASS = "text-sm text-zinc-400 transition hover:text-zinc-100";

function MailIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-zinc-500"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 bg-bg px-4 pb-10 pt-6 sm:px-6">
      <div className="rounded-[26px] border border-white/[0.07] bg-[#0b0c0d] px-6 py-9 text-center shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:py-10">
        <div className="flex flex-col items-center">
          <Logo className="[&_img]:h-8 sm:[&_img]:h-9" />

          <nav
            aria-label="Footer"
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-7"
          >
            {LINKS.map((link) => (
              <Link key={link.label} href={link.href} className={LINK_CLASS}>
                {link.label}
              </Link>
            ))}
            <GmailLink subject="Reelhouse contact" className={LINK_CLASS}>
              Contact us
            </GmailLink>
            <a href="#feedback" className={LINK_CLASS}>
              Feedback
            </a>
          </nav>

          <GmailLink
            ariaLabel="Email Reelhouse via Gmail"
            className="mt-4 inline-flex items-center gap-2 text-[13px] text-zinc-400 transition hover:text-zinc-100"
          >
            <MailIcon />
            {CONTACT_EMAIL}
          </GmailLink>

          <section
            id="feedback"
            aria-labelledby="footer-feedback-title"
            className="mx-auto mt-9 w-full max-w-2xl scroll-mt-28 border-t border-white/[0.07] pt-8 text-left"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Feedback</p>
                <h2
                  id="footer-feedback-title"
                  className="mt-1 font-display text-2xl uppercase leading-none tracking-wide text-foreground sm:text-3xl"
                >
                  Send feedback
                </h2>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-zinc-500 sm:text-right">
                Found a bug or have an idea? Send it straight to the Reelhouse team.
              </p>
            </div>
            <FeedbackForm className="mt-5" />
          </section>

          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
            <span>© {year} REELHOUSE</span>
            <span aria-hidden="true">·</span>
            <span>Doesn&apos;t host content</span>
            <span aria-hidden="true">·</span>
            <span>v7</span>
          </p>

          <a
            href="#top"
            className="mt-6 inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5m0 0-6 6m6-6 6 6" />
            </svg>
            Back to top
          </a>
        </div>
      </div>
    </footer>
  );
}
