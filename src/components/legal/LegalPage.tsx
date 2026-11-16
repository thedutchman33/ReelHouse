import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="container-rh max-w-3xl py-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-xs text-muted">Last updated: November 16, 2026</p>

      <div className="mt-8 space-y-8">{children}</div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-white/10 pt-6">
        <Link href="/" className="btn-ghost">
          Back to browsing
        </Link>
        <Link href="/faq" className="btn-ghost">
          Visit FAQ
        </Link>
      </div>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-28">
      <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
