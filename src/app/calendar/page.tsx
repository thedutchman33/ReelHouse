import CalendarView from "@/components/calendar/CalendarView";
import {
  filterFromType,
  monthForOffset,
  parseMonthOffset,
  resolveSelectedDate,
} from "@/lib/calendar";
import { getReleaseCalendarMonth } from "@/lib/release-calendar";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    d?: string;
    type?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const monthOffset = parseMonthOffset(params.m);
  const month = monthForOffset(monthOffset);
  const selectedDate = resolveSelectedDate(month, params.d);
  const filter = filterFromType(params.type);
  const view = params.view === "tracking" ? "tracking" : "calendar";
  const data =
    view === "tracking"
      ? {
          month,
          items: [],
          counts: { all: 0, movies: 0, series: 0, episodes: 0 },
        }
      : await getReleaseCalendarMonth(month);

  return (
    <CalendarView
      key={`${month}:${view}:${selectedDate}:${filter}`}
      initial={data}
      initialView={view}
      monthOffset={monthOffset}
      initialSelectedDate={selectedDate}
      initialFilter={filter}
    />
  );
}
