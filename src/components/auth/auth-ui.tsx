import type { ReactNode } from "react";

// Shared styling for the account modal and the emailed-link screens. Keeping
// these here prevents the reset pages from drifting back to the old card/button
// design while the login modal uses the newer glass treatment.
export const AUTH_INPUT_CLASS =
  "nm-inset w-full rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary/40";

export const AUTH_PRIMARY_BUTTON_CLASS =
  "w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-50";

export const AUTH_LINK_CLASS =
  "text-xs font-medium text-primary transition hover:text-accent-strong";

export const AUTH_ERROR_CLASS =
  "rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs leading-relaxed text-rose-300";

export const AUTH_NOTICE_CLASS =
  "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-zinc-300";

export function AuthPageCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="container-rh flex min-h-[70svh] items-center justify-center py-12">
      <div className="nm-glass w-full max-w-sm rounded-[16px] p-6 text-zinc-100 shadow-2xl">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{subtitle}</p>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
