"use client";
import { AlertTriangle } from "lucide-react";
import type { CUTask } from "@/lib/clickup-client";

function formatLate(dueDate: string | null): string {
  if (!dueDate) return "";
  const ms = Date.now() - Number(dueDate);
  if (ms <= 0) return "";
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.ceil(hours)}h late`;
  return `${Math.ceil(ms / 86_400_000)}d late`;
}

export function OverdueTasks({
  tasks,
  isLoading,
}: {
  tasks: CUTask[];
  isLoading?: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;

  if (!tasks.length) return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 text-[13px] text-cu-text-tertiary">
      <span className="text-lg text-[#10b981]">&#10003;</span> All caught up
    </div>
  );

  const sorted = [...tasks].sort((a, b) => Number(a.due_date ?? 0) - Number(b.due_date ?? 0));

  return (
    <div className="max-h-96 divide-y divide-cu-border overflow-y-auto">
      {sorted.map(t => {
        const lateLabel = formatLate(t.due_date);
        const assigneeNames = t.assignees
          .map(a => a.username ?? (a.email?.split("@")[0] || "Unknown"))
          .join(", ");
        const listLabel = t.list.name;
        const meta = [listLabel, assigneeNames].filter(Boolean).join(" · ");

        return (
          <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f50000]" />
            <div className="min-w-0 flex-1">
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline"
              >
                {t.name}
              </a>
              {meta && (
                <div
                  className="mt-0.5 truncate text-[11px] text-cu-text-tertiary"
                  title={meta}
                >
                  {meta}
                </div>
              )}
            </div>
            {lateLabel && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: "color-mix(in srgb, #f50000 12%, var(--cu-panel))", color: "#f50000" }}
              >
                {lateLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-cu-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0">
          <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-cu-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-cu-hover" />
            <div className="h-2.5 w-1/2 rounded bg-cu-hover" />
          </div>
          <div className="h-5 w-16 shrink-0 rounded-full bg-cu-hover" />
        </div>
      ))}
    </div>
  );
}
