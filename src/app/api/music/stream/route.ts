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
          ? { Range: request.headers.get("range") as string }
          : {}),
      },
      cache: "no-store",
    });

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
    headers.set("Cache-Control", "private, max-age=3600");
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
