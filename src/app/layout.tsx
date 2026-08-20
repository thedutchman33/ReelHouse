import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/common/Footer";
import LibrarySync from "@/components/auth/LibrarySync";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  metadataBase: new URL("https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com/"),
  title: {
    default: "Reelhouse — Stream films & series",
    template: "%s · Reelhouse",
  },
  description:
    "Reelhouse is a cinematic streaming discovery experience — browse trending films and series, search, dive into rich detail pages, and build your watchlist.",
  applicationName: "Reelhouse",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Reelhouse — Stream films & series",
    description: "Discover, search, and track films and series in one cinematic experience.",
    siteName: "Reelhouse",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#100e0c",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side session read (null in local mode) so the navbar renders the
  // correct auth state on first paint — no flash of "Sign in" for signed-in users.
  const user = await getUser();
  const metadata = user?.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name;

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <LibrarySync />
        <Navbar
          userEmail={user?.email ?? null}
          userName={typeof name === "string" ? name : null}
        />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
