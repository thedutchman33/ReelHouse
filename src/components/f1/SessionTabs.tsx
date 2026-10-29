"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// The Session view | Telemetry tab bar. An F1TV-style segmented bar — dark
// rail, red active edge, white active text — with a red "N laps" badge and
// a "Lap added" toast with a GO TO TELEMETRY action. A third, Combined mode
// renders both views at once; the choice persists in localStorage like the
// reference. Window event "f1:open-session" hops to the Session view (the
// session-records strip dispatches it when you click a finished session).
// ---------------------------------------------------------------------------

type TabKey = "session" | "telemetry";
type ViewMode = "tabbed" | "combined";

interface F1TabsApi {
  activeTab: TabKey;
  viewMode: ViewMode;
  setActive: (t: TabKey) => void;
  goToTelemetry: () => void;
  toastLapAdded: () => void;
}

const F1TabsContext = createContext<F1TabsApi | null>(null);

export function useF1Tabs(): F1TabsApi {
  const v = useContext(F1TabsContext);
  if (!v) throw new Error("useF1Tabs must be used within SessionTabs");
  return v;
}

/** Public helper: hop another module into the Session view. */
export function openF1SessionView(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("f1:open-session"));
  }
}

const VIEW_MODE_KEY = "reelhouse-f1-viewmode";

export default function SessionTabs({
  sessionContent,
  telemetryContent,
  lapCount,
}: {
  sessionContent: ReactNode;
  telemetryContent: ReactNode;
  lapCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("session");
  const [viewMode, setViewModeStored] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tabbed";
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    return stored === "combined" ? "combined" : "tabbed";
  });
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    session: null,
    telemetry: null,
  });

  // Roving tabindex: Left/Right cycle the two tabs, Home/End jump to either
  // end — the keyboard pattern a segmented control is expected to follow.
  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const order: TabKey[] = ["session", "telemetry"];
    const i = order.indexOf(tab);
    let next: TabKey | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      next = order[(i + 1) % order.length];
    } else if (e.key === "Home") {
      next = order[0];
    } else if (e.key === "End") {
      next = order[order.length - 1];
    }
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeStored(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  const goToTelemetry = useCallback(() => setTab("telemetry"), []);

  const toastLapAdded = useCallback(() => {
    setToast(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(false), 4500);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  // Session-records rows dispatch this to pull the Session view up; the F1
  // section bar uses the telemetry twin.
  useEffect(() => {
    const openSession = () => setTab("session");
    const openTelemetry = () => setTab("telemetry");
    window.addEventListener("f1:open-session", openSession);
    window.addEventListener("f1:open-telemetry", openTelemetry);
    return () => {
      window.removeEventListener("f1:open-session", openSession);
      window.removeEventListener("f1:open-telemetry", openTelemetry);
    };
  }, []);

  const api: F1TabsApi = { activeTab: tab, viewMode, setActive: setTab, goToTelemetry, toastLapAdded };

  const tabTrigger = (key: TabKey, label: ReactNode) => (
    <button
      ref={(el) => {
        tabRefs.current[key] = el;
      }}
      type="button"
      role="tab"
      id={`f1-tab-${key}`}
      aria-selected={tab === key}
      aria-controls={`f1-tabpanel-${key}`}
      tabIndex={tab === key ? 0 : -1}
      onClick={() => setTab(key)}
      data-active={tab === key}
      className="group relative flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap text-[13px] font-medium tracking-wide text-white/45 outline-none transition-colors duration-200 hover:text-white/80 focus-visible:text-white data-[active=true]:text-white"
    >
      {label}
      {/* F1TV active edge: the thin red bar that sits under the live tab */}
      <span
        aria-hidden="true"
        className={`absolute inset-x-4 bottom-0 h-[2.5px] rounded-full bg-[#e10600] shadow-[0_0_10px_rgb(225_6_0/0.65)] transition-all duration-300 ${
          tab === key ? "opacity-100" : "scale-x-0 opacity-0"
        }`}
      />
    </button>
  );

  return (
    <F1TabsContext.Provider value={api}>
      {viewMode === "combined" ? (
        <div id="f1-tabs-anchor" className="f1-sticky-shell">
          <section aria-label="Session view">{sessionContent}</section>
          <section aria-label="Telemetry" className="mt-6">
            {telemetryContent}
          </section>
        </div>
      ) : (
        <div id="f1-tabs-anchor" className="f1-sticky-shell">
          <div
            role="tablist"
            aria-label="Session and telemetry views"
            onKeyDown={onTabKeyDown}
            className="mb-4 flex w-full grid-cols-2 rounded-xl border border-white/[0.07] bg-[#15151e]/90 shadow-[0_2px_16px_rgba(0,0,0,0.4)] backdrop-blur-sm grid"
          >
            {tabTrigger("session", "SESSION VIEW")}
            {tabTrigger(
              "telemetry",
              <>
                TELEMETRY
                {lapCount > 0 && (
                  <span
                    className="rounded-[3px] bg-[#e10600] px-1.5 py-0.5 text-[10px] font-black leading-none text-white tabular-nums"
                    aria-label={`${lapCount} ${lapCount === 1 ? "lap" : "laps"} loaded`}
                  >
                    {lapCount} LAP{lapCount !== 1 ? "S" : ""}
                  </span>
                )}
              </>
            )}
          </div>
          <div
            id={`f1-tabpanel-${tab}`}
            role="tabpanel"
            aria-labelledby={`f1-tab-${tab}`}
            tabIndex={0}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[#e10600]/50"
          >
            {tab === "session" ? sessionContent : telemetryContent}
          </div>
        </div>
      )}

      {/* "Lap added" toast with the tab hop action */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="f1-in fixed bottom-4 right-4 z-50 flex w-max max-w-[calc(100vw-2rem)] items-center gap-4 overflow-hidden rounded-lg border border-white/10 bg-[#15151e] pl-4 pr-3 py-3 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[#e10600]" />
          <span className="font-medium">Lap added</span>
          <button
            type="button"
            onClick={() => {
              goToTelemetry();
              setToast(false);
            }}
            className="rounded-md bg-[#e10600] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white transition hover:bg-[#ff2421] active:scale-95"
          >
            GO TO TELEMETRY
          </button>
        </div>
      )}
    </F1TabsContext.Provider>
  );
}
