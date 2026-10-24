import type { Metadata } from "next";
import SearchClient from "@/components/search/SearchClient";

// Reference tab-title format: "Search Results for {q} | 7REELS".
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const { q: rawQ } = await searchParams;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").trim();
  return { title: q ? `Search Results for ${q}` : "Search" };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "";
  return <SearchClient initialQuery={q} />;
}
