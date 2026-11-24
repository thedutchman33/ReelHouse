"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";

export async function getMusicAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getBrowserSupabase();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function musicApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const auth = await getMusicAuthHeaders();
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  return fetch(input, { ...init, headers });
}
