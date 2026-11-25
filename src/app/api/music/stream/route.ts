import { backendFetch } from "@/lib/music/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function invalidStream() {
  return Response.json({ error: "Invalid stream request" }, { status: 400 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const provider = params.get("provider")?.trim() ?? "";
  const id = params.get("id")?.trim() ?? "";
  if (provider !== "youtube" || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return invalidStream();
  }

  try {
    const upstream = await backendFetch(`/v1/stream/${encodeURIComponent(id)}`, {
      headers: {
        Accept: "*/*",
        ...(request.headers.get("range")
          ? {
              Range: request.headers.get("range") as string,
              ...(request.headers.get("if-range")
                ? { "If-Range": request.headers.get("if-range") as string }
                : {}),
            }
          : {}),
      },
      cache: "no-store",
    });

    if (upstream.status === 416) {
      const headers = new Headers();
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) headers.set("Content-Range", contentRange);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, no-store");
      return new Response(null, { status: 416, headers });
    }

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: "This track is temporarily unavailable" },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers();
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "content-encoding",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    // The upstream URL is short-lived and the response is a partial body.
    // Caching it for an hour can replay stale/truncated ranges after expiry.
    headers.set("Cache-Control", "private, no-store");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error(
      "[api:music/stream] backend error:",
      error instanceof Error ? error.message : error
    );
    return Response.json(
      { error: "This track is temporarily unavailable" },
      { status: 502 }
    );
  }
}
