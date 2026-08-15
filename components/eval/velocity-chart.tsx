"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface VelocityData {
  weekStart: string;
  completed: number;
}

interface VelocityChartProps {
  data: VelocityData[];
  isLoading?: boolean;
}

function formatWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--cu-panel)",
        border: "1px solid var(--cu-border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--cu-text)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ color: "var(--cu-text-secondary)", marginBottom: 2 }}>
        Week of {label}
      </div>
      <div style={{ fontWeight: 700, color: "var(--cu-purple, #7b68ee)" }}>
        {payload[0].value} tasks completed
      </div>
    </div>
  );
}

export function VelocityChart({ data, isLoading }: VelocityChartProps) {
  if (isLoading) return <VelocityChartSkeleton />;

  if (!data.length) {
    return (
      <div
        style={{
          height: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--cu-text-tertiary)",
          fontSize: 13,
        }}
      >
        No velocity data available
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatWeek(d.weekStart),
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={chartData}
        barSize={20}
        margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="var(--cu-border)"
          strokeDasharray="3 3"
          strokeOpacity={0.5}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--cu-text-secondary)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--cu-text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--cu-hover)", radius: 4 }} />
        <Bar
          dataKey="completed"
          fill="var(--cu-purple, #7b68ee)"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VelocityChartSkeleton() {
  const heights = [60, 90, 45, 110, 75, 130, 55, 95];
  return (
    <div
      style={{
        height: 160,
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: "0 32px 20px 4px",
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: h,
            borderRadius: "4px 4px 0 0",
            background: "var(--cu-hover)",
            animation: "pulse 1.5s ease-in-out infinite",
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}
