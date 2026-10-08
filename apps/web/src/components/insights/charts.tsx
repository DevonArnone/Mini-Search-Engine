"use client";

import type { InsightsDay } from "@mini-search/shared-types";
import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const INK = "rgb(var(--ink))";
const INK_SOFT = "rgb(var(--ink-soft))";
const INK_FAINT = "rgb(var(--ink-faint))";
const RULE = "rgb(var(--rule))";

const AXIS_TICK = { fill: INK_SOFT, fontSize: 11, fontFamily: "var(--font-mono)" };

function shortDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function longDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string | null;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: TooltipEntry[]; label?: string; unit: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="border border-rule-strong bg-paper-raised px-3 py-2 text-xs shadow-lift" style={{ borderRadius: 3 }}>
      <p className="font-semibold text-ink">{longDay(label)}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li className="flex items-center gap-2 text-ink-soft" key={String(entry.dataKey)}>
            <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: entry.color }} />
            <span className="flex-1">{entry.name}</span>
            <span className="font-mono text-ink">{entry.value === null || entry.value === undefined ? "none" : `${Number(entry.value).toLocaleString("en-US")}${unit}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function tickInterval(days: number) {
  return days <= 7 ? 0 : days <= 30 ? 4 : 13;
}

export function VolumeChart({ daily }: { daily: InsightsDay[] }) {
  const data = daily.map((day) => ({ date: day.date, withResults: day.searches - day.zeroResultSearches, zeroResults: day.zeroResultSearches }));
  return (
    <ResponsiveContainer height={260} width="100%">
      <BarChart barCategoryGap={daily.length > 30 ? 1 : "18%"} data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis axisLine={{ stroke: INK_FAINT }} dataKey="date" interval={tickInterval(daily.length)} tick={AXIS_TICK} tickFormatter={shortDay} tickLine={false} />
        <YAxis allowDecimals={false} axisLine={false} tick={AXIS_TICK} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip unit="" />} cursor={{ fill: "rgb(var(--paper-sunk))" }} />
        <Legend align="left" iconSize={9} iconType="square" verticalAlign="top" wrapperStyle={{ fontSize: 12, color: INK_SOFT, paddingBottom: 8 }} />
        <Bar dataKey="withResults" fill={INK} isAnimationActive={false} name="Searches with results" stackId="searches" />
        <Bar dataKey="zeroResults" fill={INK_FAINT} isAnimationActive={false} name="Searches with no results" stackId="searches" stroke="rgb(var(--paper-raised))" strokeWidth={1} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ daily }: { daily: InsightsDay[] }) {
  const data = daily.map((day) => ({ date: day.date, p50: day.p50LatencyMs, p95: day.p95LatencyMs }));
  // A lone day between two empty days still needs a visible mark.
  const dots = daily.length <= 30;
  return (
    <ResponsiveContainer height={260} width="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis axisLine={{ stroke: INK_FAINT }} dataKey="date" interval={tickInterval(daily.length)} padding={{ left: 24, right: 24 }} tick={AXIS_TICK} tickFormatter={shortDay} tickLine={false} />
        <YAxis axisLine={false} tick={AXIS_TICK} tickFormatter={(value: number) => `${value}`} tickLine={false} unit=" ms" width={64} />
        <Tooltip content={<ChartTooltip unit=" ms" />} cursor={{ stroke: INK_FAINT, strokeDasharray: "3 3" }} />
        <Legend align="left" iconSize={14} iconType="plainline" verticalAlign="top" wrapperStyle={{ fontSize: 12, color: INK_SOFT, paddingBottom: 8 }} />
        <Line connectNulls={false} dataKey="p50" dot={dots ? { r: 2.5, fill: INK, strokeWidth: 0 } : false} isAnimationActive={false} name="Median (p50)" stroke={INK} strokeWidth={2} type="linear" />
        <Line connectNulls={false} dataKey="p95" dot={dots ? { r: 2.5, fill: "rgb(var(--paper-raised))", stroke: INK_SOFT, strokeWidth: 1.5 } : false} isAnimationActive={false} name="95th percentile (p95)" stroke={INK_SOFT} strokeDasharray="5 4" strokeWidth={2} type="linear" />
      </LineChart>
    </ResponsiveContainer>
  );
}
