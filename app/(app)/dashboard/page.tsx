"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import GridLayout from "react-grid-layout";
import type { LayoutItem, Layout as RGLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { RefreshCw, Settings2, GripVertical, Users, BarChart2, Activity, AlertTriangle, Clock, CheckSquare, ExternalLink } from "lucide-react";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { TeamWorkload } from "@/components/dashboard/team-workload";
import { ProjectHealth } from "@/components/dashboard/project-health";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { OverdueTasks } from "@/components/dashboard/overdue-widget";
import { TimeSummary } from "@/components/dashboard/time-summary";
import { MyTasksWidget } from "@/components/dashboard/my-tasks-widget";
import { cn } from "@/lib/utils";
import type { CUMember, CUTask } from "@/lib/clickup-client";

type SpaceHealth = { id: string; name: string; color: string; total: number; done: number; overdue: number; pct: number };
type WorkloadEntry = { member: CUMember; tasks: CUTask[]; overdueCount: number };
type DashboardData = {
  me: CUMember; members: CUMember[]; spaces: SpaceHealth[];
  workload: WorkloadEntry[]; overdue: CUTask[]; recentTasks: CUTask[];
  timeByMember: Record<string, number>;
  totals: { tasks: number; overdue: number; members: number; hoursThisWeek: number };
};

const WIDGETS = [
  { id: "workload",  title: "Team Workload",  icon: Users,         defaultW: 6, defaultH: 9  },
  { id: "health",    title: "Project Health", icon: BarChart2,     defaultW: 6, defaultH: 9  },
  { id: "activity",  title: "Recent Activity",icon: Activity,      defaultW: 6, defaultH: 10 },
  { id: "overdue",   title: "Overdue Tasks",  icon: AlertTriangle, defaultW: 6, defaultH: 10 },
  { id: "time",      title: "Time This Week", icon: Clock,         defaultW: 6, defaultH: 8  },
  { id: "mine",      title: "My Tasks",       icon: CheckSquare,   defaultW: 6, defaultH: 9  },
] as const;
type WidgetId = (typeof WIDGETS)[number]["id"];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "workload", x: 0, y: 0,  w: 6, h: 9  },
  { i: "health",   x: 6, y: 0,  w: 6, h: 9  },
  { i: "activity", x: 0, y: 9,  w: 6, h: 10 },
  { i: "overdue",  x: 6, y: 9,  w: 6, h: 10 },
  { i: "time",     x: 0, y: 19, w: 6, h: 8  },
  { i: "mine",     x: 6, y: 19, w: 6, h: 9  },
];
const STORAGE_KEY = "cu-mgr-layout";

export default function DashboardPage() {
  const [layout, setLayout]     = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [hidden, setHidden]     = useState<Set<WidgetId>>(new Set());
  const [width, setWidth]       = useState(1200);
  const [configOpen, setConfig] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setLayout(JSON.parse(s) as LayoutItem[]); } catch {/* */}
  }, []);

  useEffect(() => {
    const el = document.getElementById("dash-grid");
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el); setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const saveLayout = useCallback((l: RGLayout) => {
    const m = [...l]; setLayout(m); localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["cu-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/clickup/dashboard");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (error && String(error).includes("CLICKUP_API_TOKEN")) return <SetupPrompt />;

  if (error) return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p className="text-[14px] font-medium text-cu-text">Failed to load dashboard</p>
      <p className="max-w-sm text-center text-[13px] text-cu-text-tertiary">{String(error)}</p>
      <button onClick={() => refetch()} className="rounded-lg bg-cu-purple px-4 py-2 text-[13px] font-medium text-white hover:bg-cu-purple-dark">Retry</button>
    </div>
  );

  const visible = WIDGETS.filter(w => !hidden.has(w.id));
  const visibleLayout: RGLayout = layout.filter((l: LayoutItem) => !hidden.has(l.i as WidgetId));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-cu-border bg-cu-panel px-6 py-3.5">
        <div>
          <h1 className="text-[16px] font-bold text-cu-text">Manager Dashboard</h1>
          <p className="text-[12px] text-cu-text-tertiary">Live from your ClickUp workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 rounded-lg border border-cu-border px-3 py-1.5 text-[13px] text-cu-text-secondary hover:bg-cu-hover disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
          </button>
          <button onClick={() => setConfig(o => !o)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] hover:bg-cu-hover", configOpen ? "border-cu-purple text-cu-purple" : "border-cu-border text-cu-text-secondary")}>
            <Settings2 className="h-3.5 w-3.5" /> Customize
          </button>
        </div>
      </div>

      {/* Customize panel */}
      {configOpen && (
        <div className="shrink-0 border-b border-cu-border bg-cu-sidebar px-6 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cu-text-tertiary">Toggle Widgets</p>
          <div className="flex flex-wrap gap-2">
            {WIDGETS.map(w => (
              <button key={w.id} onClick={() => setHidden(h => { const n = new Set(h); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; })}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors", hidden.has(w.id) ? "border-cu-border text-cu-text-tertiary" : "border-cu-purple bg-cu-purple-light text-cu-purple")}>
                <w.icon className="h-3.5 w-3.5" />{w.title}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-cu-text-tertiary">Drag headers to reorder · Drag corner to resize</p>
        </div>
      )}

      {/* Stats */}
      <div className="shrink-0 border-b border-cu-border bg-cu-bg px-6 py-4">
        {isLoading ? <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-cu-hover" />)}</div>
          : <StatsBar stats={data!.totals} />}
      </div>

      {/* Grid */}
      <div id="dash-grid" className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-cu-hover" />)}</div>
        ) : (
          <GridLayout layout={visibleLayout} width={width}
            gridConfig={{ cols: 12, rowHeight: 30, margin: [16, 16] as [number, number] }}
            dragConfig={{ handle: ".drag-handle" }}
            onLayoutChange={saveLayout}>
            {visible.map(w => (
              <div key={w.id} className="overflow-hidden rounded-xl border border-cu-border bg-cu-panel shadow-sm">
                <div className="drag-handle flex cursor-grab items-center gap-2 border-b border-cu-border px-4 py-2.5 active:cursor-grabbing">
                  <GripVertical className="h-3.5 w-3.5 text-cu-text-tertiary" />
                  <span className="text-cu-text-secondary"><w.icon className="h-4 w-4" /></span>
                  <span className="text-[13px] font-semibold text-cu-text">{w.title}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">{data && renderWidget(w.id, data)}</div>
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

function renderWidget(id: WidgetId, d: DashboardData) {
  switch (id) {
    case "workload":  return <TeamWorkload workload={d.workload} />;
    case "health":    return <ProjectHealth spaces={d.spaces} />;
    case "activity":  return <ActivityFeed tasks={d.recentTasks} />;
    case "overdue":   return <OverdueTasks tasks={d.overdue} />;
    case "time":      return <TimeSummary members={d.members} timeByMember={d.timeByMember} />;
    case "mine":      return <MyTasksWidget tasks={d.workload.flatMap(w => w.tasks)} currentUser={d.me} />;
  }
}

function SetupPrompt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cu-purple-light">
        <ExternalLink className="h-7 w-7 text-cu-purple" />
      </div>
      <h2 className="text-[18px] font-bold text-cu-text">Connect your ClickUp workspace</h2>
      <p className="max-w-sm text-[13px] text-cu-text-tertiary">Add your ClickUp API credentials as environment variables.</p>
      <div className="rounded-xl border border-cu-border bg-cu-panel p-4 text-left">
        <p className="mb-2 text-[12px] font-semibold text-cu-text">Required env vars:</p>
        <code className="block space-y-1 text-[12px] text-cu-text-secondary">
          <span className="block">CLICKUP_API_TOKEN=pk_...</span>
          <span className="block">CLICKUP_TEAM_ID=...</span>
        </code>
        <p className="mt-3 text-[11px] text-cu-text-tertiary">ClickUp → Settings → Apps → API Token</p>
      </div>
    </div>
  );
}
