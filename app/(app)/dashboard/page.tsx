"use client";

import { useState, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { useQuery } from "@tanstack/react-query";
import GridLayout from "react-grid-layout";
import type { LayoutItem, Layout as RGLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
  RefreshCw, Settings2, GripVertical, Users, BarChart2,
  Activity, AlertTriangle, Clock, SquareCheckBig, ExternalLink,
} from "lucide-react";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { TeamWorkload } from "@/components/dashboard/team-workload";
import { ProjectHealth } from "@/components/dashboard/project-health";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { OverdueTasks } from "@/components/dashboard/overdue-widget";
import { TimeSummary } from "@/components/dashboard/time-summary";
import { MyTasksWidget } from "@/components/dashboard/my-tasks-widget";
import { cn } from "@/lib/utils";
import type { CUUser, CUMemberUser, CUTask } from "@/lib/clickup-client";

// ---------------------------------------------------------------------------
// Types — mirror exactly what /api/clickup/dashboard returns
// ---------------------------------------------------------------------------
type SpaceHealth = {
  id: string; name: string; color: string;
  total: number; done: number; overdue: number; pct: number;
};

type WorkloadEntry = {
  member: CUMemberUser;
  tasks: CUTask[];
  overdueCount: number;
};

type DashboardTotals = {
  tasks: number;
  overdue: number;
  members: number;
  hoursThisWeek: number;
};

type DashboardData = {
  me: CUUser;
  members: CUMemberUser[];
  spaces: SpaceHealth[];
  workload: WorkloadEntry[];
  overdue: CUTask[];
  recentTasks: CUTask[];
  /** Milliseconds per member (key = string of member id) */
  timeByMember: Record<string, number>;
  totals: DashboardTotals;
};

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------
const WIDGETS = [
  { id: "workload", title: "Team Workload",   icon: Users,          defaultW: 6, defaultH: 9  },
  { id: "health",   title: "Project Health",  icon: BarChart2,      defaultW: 6, defaultH: 9  },
  { id: "activity", title: "Recent Activity", icon: Activity,       defaultW: 6, defaultH: 10 },
  { id: "overdue",  title: "Overdue Tasks",   icon: AlertTriangle,  defaultW: 6, defaultH: 10 },
  { id: "time",     title: "Time This Week",  icon: Clock,          defaultW: 6, defaultH: 8  },
  { id: "mine",     title: "My Tasks",        icon: SquareCheckBig, defaultW: 6, defaultH: 9  },
] as const;
type WidgetId = (typeof WIDGETS)[number]["id"];

// ---------------------------------------------------------------------------
// Layout defaults + versioned persistence
// Bump LAYOUT_VERSION when DEFAULT_LAYOUT shape changes so that stale saved
// layouts don't silently misplace new widgets.
// ---------------------------------------------------------------------------
const LAYOUT_VERSION = 2;
const STORAGE_KEY    = `cu-mgr-layout-v${LAYOUT_VERSION}`;
const HIDDEN_KEY     = `cu-mgr-hidden-v${LAYOUT_VERSION}`;

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "workload", x: 0, y: 0,  w: 6, h: 9  },
  { i: "health",   x: 6, y: 0,  w: 6, h: 9  },
  { i: "activity", x: 0, y: 9,  w: 6, h: 10 },
  { i: "overdue",  x: 6, y: 9,  w: 6, h: 10 },
  { i: "time",     x: 0, y: 19, w: 6, h: 8  },
  { i: "mine",     x: 6, y: 19, w: 6, h: 9  },
];

function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const saved = JSON.parse(raw) as LayoutItem[];
    // Merge: any widget id present in DEFAULT_LAYOUT but absent in saved layout
    // gets appended at a safe position rather than defaulting to (0,0).
    const savedIds = new Set(saved.map(l => l.i));
    const merged   = [...saved];
    for (const def of DEFAULT_LAYOUT) {
      if (!savedIds.has(def.i)) merged.push(def);
    }
    return merged;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function loadHidden(): Set<WidgetId> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as WidgetId[]);
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Per-widget error boundary — one crashing widget does not take down the page
// ---------------------------------------------------------------------------
interface WidgetBoundaryProps { title: string; children: ReactNode }
interface WidgetBoundaryState { crashed: boolean; msg: string }

class WidgetErrorBoundary extends Component<WidgetBoundaryProps, WidgetBoundaryState> {
  constructor(props: WidgetBoundaryProps) {
    super(props);
    this.state = { crashed: false, msg: "" };
  }

  static getDerivedStateFromError(err: unknown): WidgetBoundaryState {
    return { crashed: true, msg: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(`[widget: ${this.props.title}]`, err, info.componentStack);
  }

  override render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        <AlertTriangle className="h-5 w-5 text-cu-text-tertiary" />
        <p className="text-[13px] font-medium text-cu-text-secondary">Widget failed to render</p>
        <p className="max-w-[220px] line-clamp-2 text-[11px] text-cu-text-tertiary">{this.state.msg}</p>
        <button
          onClick={() => this.setState({ crashed: false, msg: "" })}
          className="mt-1 rounded-lg border border-cu-border px-3 py-1 text-[11px] text-cu-text-secondary hover:bg-cu-hover"
        >
          Retry
        </button>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Premium skeleton components
// ---------------------------------------------------------------------------
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-cu-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-5 w-10 animate-pulse rounded bg-cu-hover" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-cu-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm">
          <div className="flex items-center gap-2 border-b border-cu-border px-4 py-2.5">
            <div className="h-3.5 w-3.5 animate-pulse rounded bg-cu-hover" />
            <div className="h-3.5 w-4  animate-pulse rounded bg-cu-hover" />
            <div className="h-3.5 w-28 animate-pulse rounded bg-cu-hover" />
          </div>
          <div className="space-y-3 px-4 py-3">
            {[0, 1, 2, 3, 4].map(j => (
              <div key={j} className="flex items-center gap-2.5">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-cu-hover" />
                <div
                  className="h-3 animate-pulse rounded bg-cu-hover"
                  style={{ width: `${60 + (j % 3) * 15}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [layout,    setLayout]   = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [hidden,    setHidden]   = useState<Set<WidgetId>>(new Set());
  // Start undefined — skip rendering the grid until ResizeObserver measures the
  // container. This prevents a one-frame flash at the hardcoded fallback width.
  const [width,     setWidth]    = useState<number | undefined>(undefined);
  const [configOpen, setConfig]  = useState(false);
  const [hydrated,  setHydrated] = useState(false);

  // Hydrate persisted state after mount to avoid SSR/hydration mismatch
  useEffect(() => {
    setLayout(loadLayout());
    setHidden(loadHidden());
    setHydrated(true);
  }, []);

  // Persist hidden state whenever it changes (skip first render before hydration)
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch {/* */}
  }, [hidden, hydrated]);

  // ResizeObserver — keep grid width in sync with the container
  useEffect(() => {
    const el = document.getElementById("dash-grid");
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const saveLayout = useCallback((l: RGLayout) => {
    const copy = [...l];
    setLayout(copy);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(copy)); } catch {/* */}
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["cu-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/clickup/dashboard");
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch {/* */}
        throw new Error(body || `HTTP ${r.status}`);
      }
      return r.json() as Promise<DashboardData>;
    },
    staleTime:       5 * 60 * 1000,
    // Background auto-refresh every 5 minutes so data doesn't grow stale silently
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  // Show dedicated setup screen only when the API token is missing
  if (error && /CLICKUP_API_TOKEN/i.test(String(error))) {
    return <SetupPrompt />;
  }

  const hasError   = !!error;
  const errMessage = hasError ? String(error).replace(/^Error:\s*/, "") : null;

  const visible       = WIDGETS.filter(w => !hidden.has(w.id));
  const visibleLayout = layout.filter(l => !hidden.has(l.i as WidgetId)) as RGLayout;

  // Deduplicate by task id — a task assigned to N members appears N times in
  // the workload flatMap. We want each task exactly once in My Tasks.
  const myTasksAll: CUTask[] = data
    ? [...new Map(data.workload.flatMap(w => w.tasks).map(t => [t.id, t])).values()]
    : [];

  // Show the current user's name in the My Tasks widget title
  const meDisplayName = data?.me
    ? (data.me.username || data.me.email.split("@")[0])
    : null;
  const myTasksTitle = meDisplayName ? `${meDisplayName}'s Tasks` : "My Tasks";

  function resolveTitle(id: WidgetId): string {
    return id === "mine" ? myTasksTitle : (WIDGETS.find(w => w.id === id)?.title ?? id);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div>
          <h1 className="text-[16px] font-bold text-cu-text">Manager Dashboard</h1>
          <p className="text-[12px] text-cu-text-tertiary">Live from your ClickUp workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[13px] text-cu-text-secondary hover:bg-cu-hover disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => setConfig(o => !o)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] hover:bg-cu-hover",
              configOpen
                ? "border-cu-purple text-cu-purple"
                : "border-cu-border text-cu-text-secondary",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Customize
          </button>
        </div>
      </div>

      {/* ── Error banner — shown when data fetch failed, but page stays usable */}
      {hasError && (
        <div className="shrink-0 border-b border-[#fca5a5] bg-[#fef2f2] px-6 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#ef4444]" />
              <p className="shrink-0 text-[13px] font-medium text-[#991b1b]">
                Dashboard failed to load
              </p>
              {errMessage && (
                <span className="hidden truncate text-[12px] text-[#b91c1c] sm:block">
                  — {errMessage}
                </span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              className="shrink-0 rounded-lg border border-[#fca5a5] bg-white px-3 py-1 text-[12px] font-medium text-[#991b1b] hover:bg-[#fef2f2]"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Customize panel ─────────────────────────────────────────────────── */}
      {configOpen && (
        <div className="shrink-0 border-b border-cu-border bg-cu-sidebar px-6 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cu-text-tertiary">
            Toggle Widgets
          </p>
          <div className="flex flex-wrap gap-2">
            {WIDGETS.map(w => (
              <button
                key={w.id}
                onClick={() =>
                  setHidden(h => {
                    const n = new Set(h);
                    n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                    return n;
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  hidden.has(w.id)
                    ? "border-cu-border text-cu-text-tertiary"
                    : "border-cu-purple bg-cu-purple-light text-cu-purple",
                )}
              >
                <w.icon className="h-3.5 w-3.5" />
                {resolveTitle(w.id)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-cu-text-tertiary">
            Drag headers to reorder · Drag corner to resize
          </p>
        </div>
      )}

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-cu-border bg-cu-bg px-6 py-4">
        {isLoading || !data ? (
          <StatsSkeleton />
        ) : (
          <StatsBar stats={data.totals} />
        )}
      </div>

      {/* ── Widget grid ─────────────────────────────────────────────────────── */}
      <div id="dash-grid" className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <GridSkeleton />
        ) : width !== undefined ? (
          /* react-grid-layout v2 API: cols/rowHeight/margin live in gridConfig;
             the drag handle selector lives in dragConfig.handle              */
          <GridLayout
            layout={visibleLayout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 30, margin: [16, 16] as [number, number] }}
            dragConfig={{ handle: ".drag-handle" }}
            onLayoutChange={saveLayout}
          >
            {visible.map(w => (
              <div key={w.id} className="overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm">
                <div className="drag-handle flex cursor-grab items-center gap-2 border-b border-cu-border px-4 py-2.5 active:cursor-grabbing">
                  <GripVertical className="h-3.5 w-3.5 text-cu-text-tertiary" />
                  <span className="text-cu-text-secondary">
                    <w.icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-semibold text-cu-text">
                    {resolveTitle(w.id)}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <WidgetErrorBoundary title={resolveTitle(w.id)}>
                    {data
                      ? renderWidget(w.id, data, myTasksAll)
                      : <WidgetLoadingPlaceholder />
                    }
                  </WidgetErrorBoundary>
                </div>
              </div>
            ))}
          </GridLayout>
        ) : (
          // Width not yet measured — show skeleton to avoid layout flash
          <GridSkeleton />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget renderer
// ---------------------------------------------------------------------------
function renderWidget(id: WidgetId, d: DashboardData, myTasks: CUTask[]) {
  switch (id) {
    case "workload": return <TeamWorkload workload={d.workload} />;
    case "health":   return <ProjectHealth spaces={d.spaces} />;
    case "activity": return <ActivityFeed tasks={d.recentTasks} />;
    case "overdue":  return <OverdueTasks tasks={d.overdue} />;
    case "time":     return <TimeSummary members={d.members} timeByMember={d.timeByMember} />;
    case "mine":     return <MyTasksWidget tasks={myTasks} currentUser={d.me} />;
  }
}

function WidgetLoadingPlaceholder() {
  return (
    <div className="flex h-32 items-center justify-center">
      <div className="h-4 w-32 animate-pulse rounded bg-cu-hover" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup prompt — shown only when CLICKUP_API_TOKEN is missing
// ---------------------------------------------------------------------------
function SetupPrompt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cu-purple-light">
        <ExternalLink className="h-7 w-7 text-cu-purple" />
      </div>
      <h2 className="text-[18px] font-bold text-cu-text">Connect your ClickUp workspace</h2>
      <p className="max-w-sm text-[13px] text-cu-text-tertiary">
        Add your ClickUp API credentials as environment variables, then restart the server.
      </p>
      <div className="rounded-xl border border-cu-border bg-cu-panel p-4 text-left">
        <p className="mb-2 text-[12px] font-semibold text-cu-text">Required env vars:</p>
        <code className="block space-y-1 text-[12px] text-cu-text-secondary">
          <span className="block">CLICKUP_API_TOKEN=pk_...</span>
          <span className="block">CLICKUP_TEAM_ID=...</span>
        </code>
        <p className="mt-3 text-[11px] text-cu-text-tertiary">
          ClickUp → Settings → Apps → API Token
        </p>
      </div>
    </div>
  );
}
