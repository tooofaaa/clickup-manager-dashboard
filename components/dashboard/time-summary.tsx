"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CUMemberUser } from "@/lib/clickup-client";

const COLORS = ["#7b68ee","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6"];

function safeName(m: CUMemberUser): string {
  if (m.username) return m.username;
  const local = m.email?.split("@")[0];
  return local || "Unknown";
}

export function TimeSummary({
  members,
  timeByMember,
  isLoading,
}: {
  members: CUMemberUser[];
  timeByMember: Record<string, number>;
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;

  const data = members
    .map((m, i) => ({
      name: safeName(m),
      hours: Math.round(((timeByMember[String(m.id)] ?? 0) / 3_600_000) * 10) / 10,
      color: m.color || COLORS[i % COLORS.length],
    }))
    .filter(d => d.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  if (!data.length) return (
    <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No time tracked this week</div>
  );

  const totalHours  = data.reduce((sum, d) => sum + d.hours, 0);
  const chartHeight = Math.max(190, data.length * 24);
  const needsRotate = data.length > 5;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-cu-text-tertiary">This week</span>
        <span className="text-[12px] font-semibold text-cu-text">{totalHours.toFixed(1)}h total</span>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          barSize={20}
          margin={{ top: 0, right: 0, left: -28, bottom: needsRotate ? 36 : 0 }}
        >
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--cu-text-secondary)", ...(needsRotate ? { angle: -35 } : {}) }}
            textAnchor={needsRotate ? "end" : "middle"}
          />
          <YAxis tick={{ fontSize: 10, fill: "var(--cu-text-tertiary)" }} unit="h" />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)}h`, "Hours"]}
            contentStyle={{
              background: "var(--cu-panel)",
              border: "1px solid var(--cu-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="hours" name="Hours" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="h-3 w-16 rounded bg-cu-hover" />
        <div className="h-3 w-20 rounded bg-cu-hover" />
      </div>
      <div className="h-48 rounded-lg bg-cu-hover" />
    </div>
  );
}
