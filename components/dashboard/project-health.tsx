"use client";

type SpaceHealth = { id: string; name: string; color: string; total: number; done: number; overdue: number; pct: number };

export function ProjectHealth({ spaces }: { spaces: SpaceHealth[] }) {
  if (!spaces.length) return <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No spaces</div>;
  return (
    <div className="space-y-3">
      {spaces.map(s => (
        <div key={s.id}>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: s.color }}>{s.name[0]}</span>
              <span className="text-[13px] font-medium text-cu-text">{s.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {s.overdue > 0 && <span className="rounded-full bg-[#fff0f0] px-1.5 py-px text-[10px] font-semibold text-[#f50000]">{s.overdue} overdue</span>}
              <span className="text-cu-text-tertiary">{s.done}/{s.total}</span>
              <span className="font-semibold" style={{ color: s.pct >= 80 ? "#10b981" : s.pct >= 40 ? "#f59e0b" : "#ef4444" }}>{s.pct}%</span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cu-hover">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.pct}%`, backgroundColor: s.pct >= 80 ? "#10b981" : s.pct >= 40 ? "#f59e0b" : s.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
