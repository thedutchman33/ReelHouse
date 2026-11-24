import type { Metadata } from "next";
import MusicApp from "@/components/music/MusicApp";
import "./music.css";

export const metadata: Metadata = {
  title: "Reelhouse Music",
  description:
    "Discover and stream independent music, build playlists, save liked songs, follow artists and read synced lyrics — Reelhouse Music.",
};

export default function MusicPage() {
  return <MusicApp />;
}
