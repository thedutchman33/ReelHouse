import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/common/Footer";
import LibrarySync from "@/components/auth/LibrarySync";

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
    // "{Page} | REELHOUSE" everywhere below the home page; the home page names
    // every section the site now carries.
    default: "REELHOUSE — Movies, TV, Formula 1, Cricket & Games",
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
        <LibrarySync />
        <Navbar />
        {/* The navbar is a fixed floating bar; content clears it via --rh-nav-h
            (see globals.css). Pages that must slide beneath it (home hero,
            watch page) cancel this offset with a matching negative margin. */}
        <main className="flex-1 pt-[var(--rh-nav-h)]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
