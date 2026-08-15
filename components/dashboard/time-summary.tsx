"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CUMember } from "@/lib/clickup-client";

const COLORS = ["#7b68ee","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6"];

export function TimeSummary({ members, timeByMember }: { members: CUMember[]; timeByMember: Record<string, number> }) {
  const data = members
    .map((m, i) => ({ name: m.username ?? m.email.split("@")[0], hours: Math.round(((timeByMember[String(m.id)] ?? 0) / 3_600_000) * 10) / 10, color: m.color || COLORS[i % COLORS.length] }))
    .filter(d => d.hours > 0).sort((a, b) => b.hours - a.hours).slice(0, 10);

  if (!data.length) return <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No time tracked this week</div>;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} barSize={20} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--cu-text-secondary)" }} />
        <YAxis tick={{ fontSize: 10, fill: "var(--cu-text-tertiary)" }} unit="h" />
        <Tooltip formatter={(v) => [`${Number(v)}h`, "Hours"]} contentStyle={{ background: "var(--cu-panel)", border: "1px solid var(--cu-border)", borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="hours" name="Hours" radius={[4,4,0,0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
