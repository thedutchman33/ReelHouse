import { NextResponse } from "next/server";
import { getF1LapTelemetry, getF1Telemetry, type F1LapPick } from "@/lib/f1";

// Two modes:
// - ?session=&drivers=1,16 → live-style driver telemetry (trailing window for
//   a live session, best-lap window for a finished one).
// - ?session=&picks=1:12,16:7[,1:5:9966] → GP-Tempo-style per-lap telemetry:
//   the exact car-data window of each selected lap, aligned at that lap's
//   start. Picks may carry their own session (`driver:lap:session`) so lap
//   comparisons survive changing the session selector.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionKey = Number(searchParams.get("session"));
  if (!Number.isFinite(sessionKey) || sessionKey <= 0) {
    return NextResponse.json({ error: "bad_session" }, { status: 400 });
  }

  const picksParam = searchParams.get("picks");
  if (picksParam) {
    const picks: F1LapPick[] = picksParam
      .split(",")
      .map((p) => {
        const [d, l, s] = p.split(":").map(Number);
        return { driverNumber: d, lap: l, sessionKey: Number.isFinite(s) && s > 0 ? s : undefined };
      })
      .filter(
        (p) =>
          Number.isFinite(p.driverNumber) &&
          p.driverNumber > 0 &&
          Number.isFinite(p.lap) &&
          p.lap > 0
      )
      .slice(0, 4);

    // Group picks by their session and merge the payloads (usually one).
    const groups = new Map<number, F1LapPick[]>();
    for (const p of picks) {
      const sk = p.sessionKey ?? sessionKey;
      const list = groups.get(sk);
      if (list) list.push(p);
      else groups.set(sk, [p]);
    }
    const payloads = (
      await Promise.all([...groups.entries()].map(([sk, pp]) => getF1LapTelemetry(sk, pp)))
    ).filter((o): o is NonNullable<typeof o> => o != null);
    if (payloads.length === 0) {
      return NextResponse.json({ error: "f1_telemetry_unavailable" }, { status: 502 });
    }
    const merged = {
      nowUtc: new Date(Date.now()).toISOString(),
      session: payloads[0].session,
      meeting: payloads[0].meeting,
      picks: payloads.flatMap((o) => o.picks),
      path: payloads.find((o) => o.path)?.path ?? null,
    };
    return NextResponse.json(merged, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  }

  const drivers = (searchParams.get("drivers") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(0, 4);

  const payload = await getF1Telemetry(sessionKey, drivers);
  if (!payload) {
    return NextResponse.json({ error: "f1_telemetry_unavailable" }, { status: 502 });
  }
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": payload.isLive
        ? "public, s-maxage=10, stale-while-revalidate=20"
        : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
