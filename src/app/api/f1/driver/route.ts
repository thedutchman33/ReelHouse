import { NextResponse } from "next/server";
import { getDriverCareer } from "@/lib/driver-career";

// One driver's career record for the directory profile sheet. The underlying
// season results never change once published, so the route caches for a day.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get("id") ?? "";
  if (!/^[a-z0-9_]+$/i.test(driverId)) {
    return NextResponse.json({ error: "bad_driver" }, { status: 400 });
  }
  const data = await getDriverCareer(driverId);
  if (!data) {
    return NextResponse.json({ error: "career_unavailable" }, { status: 502 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
