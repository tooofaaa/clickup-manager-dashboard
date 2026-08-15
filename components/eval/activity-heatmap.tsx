"use client";

import { useState } from "react";

interface ActivityHeatmapProps {
  data: Record<string, number>;
  isLoading?: boolean;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function getColor(count: number): string {
  if (count === 0) return "var(--cu-hover)";
  if (count <= 2) return "#bbf7d0";
  if (count <= 5) return "#4ade80";
  return "#16a34a";
}

function getLast30Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ActivityHeatmap({ data, isLoading }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  if (isLoading) return <ActivityHeatmapSkeleton />;

  const days = getLast30Days();

  const DAY_LABELS = ["Mon", "Wed", "Fri"];
  const labelDays = new Set(DAY_LABELS);

  return (
    <div className="space-y-2" style={{ position: "relative" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(30, 1fr)",
          gap: 3,
        }}
      >
        {days.map((date) => {
          const count = data[date] ?? 0;
          return (
            <div
              key={date}
              style={{
                aspectRatio: "1",
                borderRadius: 3,
                background: getColor(count),
                cursor: count > 0 ? "pointer" : "default",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                const parentRect = (e.target as HTMLElement).closest("[data-heatmap]")!.getBoundingClientRect();
                setTooltip({
                  date,
                  count,
                  x: rect.left - parentRect.left + rect.width / 2,
                  y: rect.top - parentRect.top,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </div>

      {/* Day labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(30, 1fr)",
          gap: 3,
        }}
      >
        {days.map((date) => {
          const label = getDayLabel(date);
          return (
            <div
              key={date}
              style={{
                fontSize: 9,
                color: "var(--cu-text-tertiary)",
                textAlign: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {labelDays.has(label) ? label : ""}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% - 16px)",
            left: tooltip.x,
            transform: "translateX(-50%)",
            background: "var(--cu-panel)",
            border: "1px solid var(--cu-border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            color: "var(--cu-text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <span style={{ color: "var(--cu-text-secondary)" }}>{formatDate(tooltip.date)}</span>
          {" — "}
          <strong>{tooltip.count} {tooltip.count === 1 ? "task" : "tasks"}</strong>
        </div>
      )}
    </div>
  );
}

function ActivityHeatmapSkeleton() {
  return (
    <div className="space-y-2">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(30, 1fr)",
          gap: 3,
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1",
              borderRadius: 3,
              background: "var(--cu-hover)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${(i % 5) * 80}ms`,
            }}
          />
        ))}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}
