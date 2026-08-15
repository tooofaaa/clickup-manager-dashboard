"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CUMember, CUTask } from "@/lib/clickup-client";

const COLORS = ["#7b68ee","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316"];

export function TeamWorkload({ workload }: { workload: { member: CUMember; tasks: CUTask[]; overdueCount: number }[] }) {
  const data = workload
    .filter(w => w.tasks.length > 0)
    .sort((a, b) => b.tasks.length - a.tasks.length)
    .slice(0, 12)
    .map((w, i) => ({
      name: w.member.username ?? w.member.email.split("@")[0],
      tasks: w.tasks.length,
      overdue: w.overdueCount,
      color: w.member.color || COLORS[i % COLORS.length],
      avatar: w.member.profilePicture,
    }));

  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.tasks));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barSize={18} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--cu-text-secondary)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--cu-text-tertiary)" }} />
          <Tooltip contentStyle={{ background: "var(--cu-panel)", border: "1px solid var(--cu-border)", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="tasks" name="Open tasks" radius={[4,4,0,0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: d.color }}>
              {d.avatar ? <img src={d.avatar} alt="" className="h-full w-full object-cover" /> : d.name[0].toUpperCase()}
            </div>
            <span className="w-20 truncate text-[12px] text-cu-text">{d.name}</span>
            <div className="flex-1 rounded-full bg-cu-hover" style={{ height: 5 }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round((d.tasks / max) * 100)}%`, backgroundColor: d.color }} />
            </div>
            <span className="w-5 text-right text-[12px] font-semibold text-cu-text">{d.tasks}</span>
            {d.overdue > 0 && <span className="rounded-full bg-[#fff0f0] px-1.5 py-px text-[10px] font-semibold text-[#f50000]">{d.overdue} late</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No open tasks</div>;
}
