"use client";
import { SquareCheckBig, AlertTriangle, Users, Clock } from "lucide-react";

type Stats = { tasks: number; overdue: number; members: number; hoursThisWeek: number };

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function StatsBar({ stats }: { stats: Stats | undefined | null }) {
  if (!stats) return <LoadingSkeleton />;

  const items = [
    { label: "Open Tasks",      value: safeNum(stats.tasks),         icon: SquareCheckBig, color: "#7b68ee" },
    { label: "Overdue",         value: safeNum(stats.overdue),       icon: AlertTriangle,  color: "#f50000" },
    { label: "Team Members",    value: safeNum(stats.members),       icon: Users,          color: "#0ea5e9" },
    { label: "Hours This Week", value: safeNum(stats.hoursThisWeek), icon: Clock,          color: "#10b981" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(item => (
        <div
          key={item.label}
          className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cu-hover"
          >
            <item.icon className="h-4 w-4" style={{ color: item.color }} />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-bold text-cu-text">{item.value}</p>
            <p className="truncate text-[11px] text-cu-text-tertiary">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-cu-hover" />
          <div className="space-y-2">
            <div className="h-5 w-12 rounded bg-cu-hover" />
            <div className="h-3 w-20 rounded bg-cu-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
