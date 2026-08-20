import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Reelhouse account.",
};

// Note: unlike /login this page must NOT bounce signed-in visitors. Everyone who
// gets here IS signed in — that's what the recovery session from the emailed link
// is — so the form itself decides whether the link was good.
export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  return (
    <div className="container-rh flex min-h-[70svh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/60 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-semibold text-text">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">
          Pick something you haven’t used here before. You’ll stay signed in on
          this device once it’s saved.
        </p>

        <div className="mt-6">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
