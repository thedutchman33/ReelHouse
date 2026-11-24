import type { Metadata } from "next";
import NotificationsPage from "@/components/notifications/NotificationsPage";

export const metadata: Metadata = {
  title: "Notifications",
  description: "New episodes from the series you follow on Reelhouse.",
};

export default function NotificationsRoute() {
  return <NotificationsPage />;
}
