import { musicBackendBase } from "@/lib/music/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORWARDED = [
  "authorization",
  "content-type",
  "accept",
  "x-import-categories",
  "x-import-archive-name",
  "x-import-job-id",
  "x-import-final",
];

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const source = new URL(request.url);
  const target = `${musicBackendBase()}/v1/spotify/${path
    .map((part) => encodeURIComponent(part))
    .join("/")}${source.search}`;
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = request.method !== "GET" && request.method !== "HEAD" ? request.body : null;
  const init = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
    ...(body
      ? {
          body,
          duplex: "half",
        }
      : {}),
  } as RequestInit & { duplex?: "half" };

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "retry-after", "location"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has("cache-control")) {
      responseHeaders.set("Cache-Control", "no-store");
    }
    if (upstream.status === 204) {
      return new Response(null, { status: 204, headers: responseHeaders });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(
      "[api:spotify] backend error:",
      error instanceof Error ? error.message : error
    );
    return Response.json(
      { error: "The Spotify service is temporarily unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const PUT = proxy;
