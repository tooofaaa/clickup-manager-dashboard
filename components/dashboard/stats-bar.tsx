"use client";
import { CheckSquare, AlertTriangle, Users, Clock } from "lucide-react";

export function StatsBar({ stats }: { stats: { tasks: number; overdue: number; members: number; hoursThisWeek: number } }) {
  const items = [
    { label: "Open Tasks",      value: stats.tasks,         icon: CheckSquare,   color: "#7b68ee", bg: "#f1effd" },
    { label: "Overdue",         value: stats.overdue,       icon: AlertTriangle, color: "#f50000", bg: "#fff0f0" },
    { label: "Team Members",    value: stats.members,       icon: Users,         color: "#0ea5e9", bg: "#f0f9ff" },
    { label: "Hours This Week", value: stats.hoursThisWeek, icon: Clock,         color: "#10b981", bg: "#f0fdf4" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-3 rounded-xl border border-cu-border bg-cu-panel px-4 py-3 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: item.bg }}>
            <item.icon className="h-4 w-4" style={{ color: item.color }} />
          </span>
          <div>
            <p className="text-xl font-bold text-cu-text">{item.value}</p>
            <p className="text-[11px] text-cu-text-tertiary">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
