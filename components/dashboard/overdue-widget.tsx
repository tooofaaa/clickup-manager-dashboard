"use client";
import { AlertTriangle } from "lucide-react";
import type { CUTask } from "@/lib/clickup-client";

export function OverdueTasks({ tasks }: { tasks: CUTask[] }) {
  if (!tasks.length) return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 text-[13px] text-cu-text-tertiary">
      <span className="text-lg text-[#10b981]">✓</span> All caught up
    </div>
  );
  return (
    <div className="divide-y divide-cu-border">
      {[...tasks].sort((a, b) => Number(a.due_date) - Number(b.due_date)).map(t => {
        const daysLate = t.due_date ? Math.ceil((Date.now() - Number(t.due_date)) / 86_400_000) : 0;
        return (
          <div key={t.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f50000]" />
            <div className="min-w-0 flex-1">
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-medium text-cu-text hover:text-cu-purple hover:underline">{t.name}</a>
              <div className="mt-0.5 text-[11px] text-cu-text-tertiary">
                {t.list.name}{t.assignees.length > 0 && ` · ${t.assignees.map(a => a.username ?? a.email.split("@")[0]).join(", ")}`}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-[#fff0f0] px-2 py-0.5 text-[11px] font-semibold text-[#f50000]">{daysLate}d late</span>
          </div>
        );
      })}
    </div>
  );
}
