import type { Metadata } from "next";
import SearchClient from "@/components/search/SearchClient";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "";
  return <SearchClient initialQuery={q} />;
}
