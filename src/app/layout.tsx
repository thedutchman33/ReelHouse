import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/common/Footer";
import LibrarySync from "@/components/auth/LibrarySync";
import ResourceHints from "@/components/common/ResourceHints";

// Reference design system: Inter for UI text, Bebas Neue (single weight,
// condensed caps) for hero titles and section headings.
//
// Inter is loaded as Google's variable cut, not the five static weights
// (400/500/600/700/900) this used to pin: the browser was downloading five
// separate woff2 files (measured 172KB across 7 font files on the home page)
// for a face that ships as one ~40KB variable font.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

// metadataBase is only the prefix Next resolves URL-shaped metadata against
// (openGraph/twitter images, alternates.canonical, icons, manifest). It is not
// used for routing. It used to be hardcoded to the project's old AWS Amplify
// deployment and survived the move to Vercel, so any RELATIVE metadata URL
// added later would be advertised under the wrong (possibly dead) origin.
//
// Resolve it from the deployment instead of a literal: SITE_URL when set (the
// custom domain), else Vercel's own production URL, else the dev origin.
// Absolute metadata URLs (every image in this app today) never touch it.
function siteOrigin(): string {
  const candidates = [
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Invalid candidate — try the next one.
    }
  }
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    // "{Page} | REELHOUSE" everywhere below the home page; the home page names
    // every section the site now carries.
    default: "REELHOUSE - Movies, TV, Anime, Formula 1, Cricket & Games",
    template: "%s | REELHOUSE",
  },
  description:
    "Reelhouse is a cinematic streaming discovery experience — trending films and series, live Formula 1 and cricket, and a browser games directory. Search, dive into rich detail pages, and build your watchlist.",
  applicationName: "Reelhouse",
  // Tab logo: the operator's favicon, served from public/ exactly as provided.
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "Reelhouse — Movies, TV, Formula 1, Cricket & Games",
    description:
      "Discover, search and track films and series, follow live Formula 1 and cricket, and play browser games — all in one place.",
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
        <ResourceHints />
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
