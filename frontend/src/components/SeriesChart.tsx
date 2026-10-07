import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PromSeries } from "../api/prometheus";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { useFormat } from "../lib/format";

const LIGHT = ["#0e7490", "#c4780a", "#7c3aed", "#15803d", "#be123c", "#475569"];
const DARK = ["#40bed6", "#e8a634", "#a78bfa", "#4ade80", "#fb7185", "#94a3b8"];

/** Line chart for Prometheus series. `unit` is shown on the axis ("%", "ms", "bit/s", ...). */
export default function SeriesChart({ series, unit, range, height = 224 }: { series: PromSeries[]; unit?: string; range: number; height?: number }) {
  const { theme } = useTheme();
  const { lang } = useI18n();
  const f = useFormat();
  const colors = theme === "dark" ? DARK : LIGHT;
  const grid = theme === "dark" ? "#284252" : "#d6dde4";
  const text = theme === "dark" ? "#8c9dad" : "#607080";

  const axisFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : undefined,
      range >= 86400 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" }),
    [lang, range],
  );

  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    series.forEach((s, i) => s.points.forEach(([ts, v]) => {
      const row = rows.get(ts) ?? { ts };
      row[`s${i}`] = v;
      rows.set(ts, row);
    }));
    return [...rows.values()].sort((a, b) => a.ts - b.ts);
  }, [series]);

  const tick = (v: number) => (Math.abs(v) >= 1e9 ? `${f.num(v / 1e9, 1)}G` : Math.abs(v) >= 1e6 ? `${f.num(v / 1e6, 1)}M` : Math.abs(v) >= 1e3 ? `${f.num(v / 1e3, 1)}k` : f.num(v, v % 1 ? 1 : 0));

  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} stroke={text} fontSize={11} minTickGap={48}
            tickFormatter={(v) => axisFmt.format(new Date(Number(v) * 1000))} />
          <YAxis stroke={text} fontSize={11} width={52} tickFormatter={tick} />
          <Tooltip
            labelFormatter={(v) => f.epoch(Number(v))}
            formatter={(v) => (typeof v === "number" ? `${f.num(v, 2)}${unit ? ` ${unit}` : ""}` : v)}
          />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => (
            <Line key={i} type="monotone" dataKey={`s${i}`} name={s.label || "—"} stroke={colors[i % colors.length]}
              dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
