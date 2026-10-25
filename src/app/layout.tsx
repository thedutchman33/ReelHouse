import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/common/Footer";
import LibrarySync from "@/components/auth/LibrarySync";
import { Analytics } from "@vercel/analytics/next";

// Reference design system: Inter for UI text, Bebas Neue (single weight,
// condensed caps) for hero titles and section headings.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-inter",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reelhouse.d14f2cs6k7jhfn.amplifyapp.com/"),
  title: {
    // Reference tab-title format: "{Page} | 7REELS" with the brand uppercase;
    // the home page carries the tagline instead of the bare brand.
    default: "Watch Free Movies & TV Shows Online | REELHOUSE",
    template: "%s | REELHOUSE",
  },
  description:
    "Reelhouse is a cinematic streaming discovery experience — browse trending films and series, search, dive into rich detail pages, and build your watchlist.",
  applicationName: "Reelhouse",
  // Tab logo: the operator's favicon, served from public/ exactly as provided.
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "Reelhouse — Stream films & series",
    description: "Discover, search, and track films and series in one cinematic experience.",
    siteName: "Reelhouse",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#111212",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deliberately NO server-side session read here: cookies() in the root
  // layout would force EVERY route to render dynamically (measured: 13s
  // DOMContentLoaded on a cold region vs 25ms for the reference's CDN-cached
  // HTML). The navbar's AuthStatus resolves the session client-side instead,
  // so every content page below can be statically rendered / ISR-cached.
  return (
    <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <LibrarySync />
        <Navbar />
        {/* The navbar is a fixed floating bar; content clears it via --rh-nav-h
            (see globals.css). Pages that must slide beneath it (home hero,
            watch page) cancel this offset with a matching negative margin. */}
        <main className="flex-1 pt-[var(--rh-nav-h)]">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
