import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { AuthPageCard } from "@/components/auth/auth-ui";
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
    <AuthPageCard
      title="Reset your password"
      subtitle="Enter the email address on your account and we’ll send you a link to choose a new password."
    >
      <ForgotPasswordForm linkExpired={error === "link_invalid"} />
    </AuthPageCard>
  );
}
