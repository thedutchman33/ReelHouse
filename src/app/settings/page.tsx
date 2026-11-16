import type { Metadata } from "next";
import SettingsView from "@/components/settings/SettingsView";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage your Reelhouse account, appearance, language, playback performance, privacy and connected devices.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
