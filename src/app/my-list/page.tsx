import MyListHub from "@/components/library/MyListHub";
import { getReleaseWeekCount } from "@/lib/release-calendar";

export const revalidate = 1800;

export default async function MyListPage() {
  const weekCount = await getReleaseWeekCount();
  return (
    <div className="red-accent">
      <MyListHub
        key="watchlist"
        activeCollection="watchlist"
        weekCount={weekCount}
      />
    </div>
  );
}
