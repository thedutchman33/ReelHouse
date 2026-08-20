import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a link to choose a new Reelhouse password.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // No accounts on this deployment means no password to reset; /login already
  // explains local mode, so send visitors there rather than duplicating it.
  if (!isSupabaseConfigured()) redirect("/login");

  // Set by /auth/callback when a mailed link could not be redeemed.
  const { error } = await searchParams;

  return (
    <div className="container-rh flex min-h-[70svh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/60 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-semibold text-text">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted">
          Enter the email address on your account and we’ll send you a link to
          choose a new password.
        </p>

        <div className="mt-6">
          <ForgotPasswordForm linkExpired={error === "link_invalid"} />
        </div>
      </div>
    </div>
  );
}
