"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CUMemberUser, CUTask } from "@/lib/clickup-client";

const COLORS = ["#7b68ee","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316"];

function safeName(member: CUMemberUser): string {
  if (member.username) return member.username;
  const local = member.email?.split("@")[0];
  return local || "Unknown";
}

export function TeamWorkload({
  workload,
  isLoading,
}: {
  workload: { member: CUMemberUser; tasks: CUTask[]; overdueCount: number }[];
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;

  const data = workload
    .filter(w => w.tasks.length > 0)
    .sort((a, b) => b.tasks.length - a.tasks.length)
    .slice(0, 12)
    .map((w, i) => ({
      name: safeName(w.member),
      tasks: w.tasks.length,
      overdue: w.overdueCount,
      color: w.member.color || COLORS[i % COLORS.length],
      avatar: w.member.profilePicture,
    }));

  if (!data.length) return <Empty />;

  const max = Math.max(...data.map(d => d.tasks));
  const chartHeight = Math.max(160, data.length * 22);

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} barSize={18} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--cu-text-secondary)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--cu-text-tertiary)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--cu-panel)",
              border: "1px solid var(--cu-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="tasks" name="Open tasks" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: d.color }}
            >
              {d.avatar
                ? <img src={d.avatar} alt={d.name} className="h-full w-full object-cover" />
                : (d.name[0] ?? "?").toUpperCase()}
            </div>
            <span className="w-24 truncate text-[12px] text-cu-text" title={d.name}>{d.name}</span>
            <div className="flex-1 rounded-full bg-cu-hover" style={{ height: 5 }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round((d.tasks / max) * 100)}%`, backgroundColor: d.color }}
              />
            </div>
            <span className="w-5 text-right text-[12px] font-semibold text-cu-text">{d.tasks}</span>
            {d.overdue > 0 && (
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                style={{ backgroundColor: "color-mix(in srgb, #f50000 12%, var(--cu-panel))", color: "#f50000" }}
              >
                {d.overdue} late
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No open tasks</div>;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-40 rounded-lg bg-cu-hover" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="h-6 w-6 shrink-0 rounded-full bg-cu-hover" />
          <div className="h-3 w-20 rounded bg-cu-hover" />
          <div className="h-[5px] flex-1 rounded-full bg-cu-hover" />
          <div className="h-3 w-5 rounded bg-cu-hover" />
        </div>
      ))}
    </div>
  );
}
