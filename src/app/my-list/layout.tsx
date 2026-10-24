import type { Metadata } from "next";

// The My List page itself is a client component (it reads the localStorage
// library), so its tab title lives in this server layout — matching the
// reference's "My List | 7REELS" format via the root template.
export const metadata: Metadata = { title: "My List" };

export default function MyListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
