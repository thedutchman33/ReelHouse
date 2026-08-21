import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_VALUE } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Reelhouse account.",
};

// Note: unlike /login this page must NOT bounce signed-in visitors. Everyone who
// gets here IS signed in — that's what the recovery session from the emailed link
// is — so the form itself decides whether the link was good.
//
// Which is exactly why "signed in" can't be the test. The marker cookie below is
// set by /auth/callback only after a one-time emailed credential was redeemed, so
// it separates a real recovery from someone who simply found a signed-in browser.
// Read here rather than in the form because it is HttpOnly — deliberately out of
// reach of page scripts. See src/lib/auth.ts for the honest scope of this check.
export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  const recoveryVerified =
    (await cookies()).get(RECOVERY_COOKIE)?.value === RECOVERY_COOKIE_VALUE;

  return (
    <div className="container-rh flex min-h-[70svh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/60 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-semibold text-text">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">
          Pick something you haven’t used here before. You’ll stay signed in on
          this device once it’s saved.
        </p>

        <div className="mt-6">
          <ResetPasswordForm recoveryVerified={recoveryVerified} />
        </div>
      </div>
    </div>
  );
}
