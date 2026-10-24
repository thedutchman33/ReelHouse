// Route transition (reference pattern): every client-side navigation
// crossfades the incoming page (~250ms) instead of flashing a loading
// spinner — 7reels shows no spinner, the new page simply fades in over the
// old one. template.tsx remounts on every navigation, which is exactly what
// the fade needs. Opacity-only: a transformed wrapper here would become the
// containing block for the watch page's position:fixed backdrop.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-route-fade">{children}</div>;
}
