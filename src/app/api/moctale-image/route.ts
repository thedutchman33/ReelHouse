import { execFile } from "node:child_process";

// Moctale's image CDN sends `Cross-Origin-Resource-Policy: same-origin`, so a
// browser on Reelhouse's origin is not allowed to render the banner directly
// (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Fetch it server-side and serve
// it from this origin instead. curl is used for the same reason as the page
// fetcher: Moctale's Cloudflare edge rejects some Node TLS fingerprints.
export const runtime = "nodejs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MEDIA_HOST = "media.moctale.in";
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

function allowedImage(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== MEDIA_HOST ||
    (url.port !== "" && url.port !== "443") ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/images/")
  ) {
    return null;
  }
  const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ? url : null;
}

/**
 * The CDN content-negotiates: a `.jpg` URL can answer with WebP. Read the
 * actual signature so the same-origin response is labelled correctly
 * (especially with `nosniff`).
 */
function sniffImageType(body: Buffer): string | undefined {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "image/png";
  }
  if (body.length >= 6 && /^GIF8[79]a$/.test(body.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  if (
    body.length >= 12 &&
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    body.length >= 12 &&
    body.toString("ascii", 4, 8) === "ftyp" &&
    /^avi[fs]$/.test(body.toString("ascii", 8, 12))
  ) {
    return "image/avif";
  }
  return undefined;
}

function fetchImage(url: URL): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "--silent",
        "--show-error",
        "--fail",
        "--max-time",
        "15",
        "--user-agent",
        USER_AGENT,
        "--header",
        "Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        url.toString(),
      ],
      {
        encoding: "buffer",
        maxBuffer: 15 * 1024 * 1024,
        timeout: 18_000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      }
    );
  });
}

/**
 * GET /api/moctale-image?src=https://media.moctale.in/images/<file>
 *
 * Only Moctale's public image files are accepted: the route is a same-origin
 * wrapper, not a general-purpose proxy. The UUID filenames never change, so the
 * response can be cached aggressively by the browser and CDN.
 */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src");
  const target = src ? allowedImage(src) : null;
  if (!target) {
    return new Response("Unsupported image", { status: 400 });
  }

  try {
    const body = await fetchImage(target);
    const contentType = sniffImageType(body);
    if (!contentType) {
      return new Response("Unsupported image data", { status: 502 });
    }
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
