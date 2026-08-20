import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your watchlist and history across devices.",
};

export default async function LoginPage() {
  const configured = isSupabaseConfigured();

  // Already signed in → nothing to do here.
  if (configured) {
    const user = await getUser();
    if (user) redirect("/");
  }

  return (
    <div className="container-rh flex min-h-[70svh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/60 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-semibold text-text">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">
          Sign in to sync your watchlist, history, and playback progress across
          devices.
        </p>

        <div className="mt-6">
          {configured ? (
            <LoginForm />
          ) : (
            <div className="rounded-xl border border-border bg-bg/50 p-4 text-sm text-muted">
              <p className="font-medium text-text">
                Accounts aren’t enabled here.
              </p>
              <p className="mt-1.5">
                This deployment is running in local mode — your list and history
                are saved in this browser only. To enable accounts, configure
                Supabase (see{" "}
                <code className="rounded bg-surface px-1 py-0.5 text-xs">
                  docs/phase-2.md
                </code>
                ).
              </p>
              <Link
                href="/"
                className="mt-4 inline-block font-medium text-accent hover:underline"
              >
                ← Back to browsing
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
