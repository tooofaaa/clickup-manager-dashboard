"use client";

type SpaceHealth = { id: string; name: string; color: string; total: number; done: number; overdue: number; pct: number };

const PCT_HIGH = 80;
const PCT_MID  = 40;

function healthColor(pct: number): string {
  if (pct >= PCT_HIGH) return "#10b981";
  if (pct >= PCT_MID)  return "#f59e0b";
  return "#ef4444";
}

export function ProjectHealth({
  spaces,
  isLoading,
}: {
  spaces: SpaceHealth[];
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;
  if (!spaces.length) return (
    <div className="flex h-32 items-center justify-center text-[13px] text-cu-text-tertiary">No spaces</div>
  );

  const sorted = [...spaces].sort((a, b) => b.total - a.total);

  return (
    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {sorted.map(s => {
        const initial    = s.name.length > 0 ? s.name[0].toUpperCase() : "?";
        const spaceColor = s.color || "#7b68ee";

        return (
          <div key={s.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: spaceColor }}
                >
                  {initial}
                </span>
                <span className="truncate text-[13px] font-medium text-cu-text" title={s.name}>{s.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px]">
                {s.overdue > 0 && (
                  <span
                    className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                    style={{ backgroundColor: "color-mix(in srgb, #f50000 12%, var(--cu-panel))", color: "#f50000" }}
                  >
                    {s.overdue} overdue
                  </span>
                )}
                {s.total === 0 ? (
                  <span className="text-cu-text-tertiary">No tasks yet</span>
                ) : (
                  <>
                    <span className="text-cu-text-tertiary">{s.done}/{s.total}</span>
                    <span className="font-semibold" style={{ color: healthColor(s.pct) }}>{s.pct}%</span>
                  </>
                )}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-cu-hover">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${s.pct}%`,
                  backgroundColor: s.pct >= PCT_HIGH ? "#10b981" : s.pct >= PCT_MID ? "#f59e0b" : spaceColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-cu-hover" />
              <div className="h-3 w-28 rounded bg-cu-hover" />
            </div>
            <div className="h-3 w-16 rounded bg-cu-hover" />
          </div>
          <div className="h-2 rounded-full bg-cu-hover" />
        </div>
      ))}
    </div>
  );
}
