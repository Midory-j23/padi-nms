import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TopologyLink } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { listFrom } from "../lib/extract";
import { isUp } from "../lib/format";
import { layout } from "../lib/graphLayout";
import { Empty, ErrorNote, Panel } from "../components/ui";

const W = 1000, H = 700;

interface MapNode { id: string; label: string; deviceId?: number; up?: boolean; known: boolean }
interface PortPair { from: string; local: string; remote: string }
interface MapEdge { a: string; b: string; ports: PortPair[]; protocol?: string }

export default function NetworkMap() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const topo = useQuery({ queryKey: ["topology"], queryFn: api.topology, refetchInterval: ms ? ms * 4 : false });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges } = useMemo(() => {
    const links = topo.data ? listFrom<TopologyLink>(topo.data.data, "links") : [];
    const devs = devices.data?.data ?? [];
    const byId = new Map(devs.map((d) => [d.device_id, d]));
    const byName = new Map<string, number>();
    devs.forEach((d) => {
      if (d.hostname) byName.set(d.hostname.toLowerCase(), d.device_id);
      if (d.sysName) byName.set(d.sysName.toLowerCase(), d.device_id);
    });

    const nodeMap = new Map<string, MapNode>();
    const ensureDevice = (id: number): string => {
      const key = `d${id}`;
      if (!nodeMap.has(key)) {
        const d = byId.get(id);
        nodeMap.set(key, { id: key, label: d?.sysName || d?.hostname || t("Device {id}", { id }), deviceId: id, up: d ? isUp(d.status) : undefined, known: true });
      }
      return key;
    };
    const ensureRemote = (link: TopologyLink): string | undefined => {
      if (link.remote_device_id) return ensureDevice(link.remote_device_id);
      const name = link.remote_hostname?.trim();
      if (!name) return undefined;
      const match = byName.get(name.toLowerCase());
      if (match !== undefined) return ensureDevice(match);
      const key = `h${name.toLowerCase()}`;
      if (!nodeMap.has(key)) nodeMap.set(key, { id: key, label: name, known: false });
      return key;
    };

    const edgeMap = new Map<string, MapEdge>();
    for (const l of links) {
      if (l.local_device_id === undefined) continue;
      const a = ensureDevice(l.local_device_id);
      const b = ensureRemote(l);
      if (!b || a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const pair: PortPair = { from: a, local: l.local_port || "?", remote: l.remote_port || "?" };
      const e = edgeMap.get(key) ?? { a, b, ports: [], protocol: l.protocol };
      const dup = e.ports.some((x) => (x.from === pair.from && x.local === pair.local && x.remote === pair.remote) || (x.from !== pair.from && x.local === pair.remote && x.remote === pair.local));
      if (!dup) e.ports.push(pair);
      edgeMap.set(key, e);
    }
    return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
  }, [topo.data, devices.data, t]);

  const pos = useMemo(() => layout(nodes.map((n) => n.id), edges, W, H), [nodes, edges]);

  const neighbours = useMemo(() => {
    const s = new Set<string>();
    if (selected) edges.forEach((e) => { if (e.a === selected) s.add(e.b); if (e.b === selected) s.add(e.a); });
    return s;
  }, [selected, edges]);

  const sel = nodes.find((n) => n.id === selected);
  const selEdges = edges.filter((e) => e.a === selected || e.b === selected);
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  const zoom = (factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    setView((v) => {
      const w = Math.max(150, Math.min(W * 3, v.w * factor));
      const h = w * (H / W);
      return { x: cx - ((cx - v.x) / v.w) * w, y: cy - ((cy - v.y) / v.h) * h, w, h };
    });
  };
  const toSvg = (e: React.PointerEvent | React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
  };

  const stroke = (n: MapNode) => (!n.known ? "stroke-dim" : n.up === false ? "stroke-down" : n.up ? "stroke-up" : "stroke-dim");
  const fill = (n: MapNode) => (!n.known ? "fill-sunken" : n.up === false ? "fill-down/15" : "fill-panel");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Network map")}</h1>
        <p className="mt-1 text-sm text-dim">
          {t("Built from LLDP and CDP neighbour links that LibreNMS has discovered. Select a device to see its links.")}
        </p>
      </div>
      <ErrorNote error={topo.error} />

      {!topo.isLoading && nodes.length === 0 ? (
        <Panel title={t("Topology")}><Empty>{t("No neighbour links found. Enable LLDP or CDP on your switches and run discovery in LibreNMS.")}</Empty></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-lg border border-line bg-panel lg:col-span-3">
            <div className="absolute end-3 top-3 z-10 flex flex-col gap-1">
              <button onClick={() => zoom(0.8)} aria-label={t("Zoom in")} className="h-8 w-8 rounded-md border border-line bg-panel hover:bg-sunken">+</button>
              <button onClick={() => zoom(1.25)} aria-label={t("Zoom out")} className="h-8 w-8 rounded-md border border-line bg-panel hover:bg-sunken">−</button>
              <button onClick={() => setView({ x: 0, y: 0, w: W, h: H })} aria-label={t("Reset view")} className="h-8 w-8 rounded-md border border-line bg-panel text-xs hover:bg-sunken">1:1</button>
            </div>
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="h-[60vh] min-h-[320px] w-full touch-none sm:h-[560px] select-none"
              role="img"
              aria-label={t("Network topology map")}
              onWheel={(e) => { const p = toSvg(e); zoom(e.deltaY > 0 ? 1.1 : 0.9, p.x, p.y); }}
              onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => {
                if (!drag.current || !svgRef.current) return;
                const r = svgRef.current.getBoundingClientRect();
                setView((v) => ({ ...v, x: drag.current!.vx - ((e.clientX - drag.current!.x) / r.width) * v.w, y: drag.current!.vy - ((e.clientY - drag.current!.y) / r.height) * v.h }));
              }}
              onPointerUp={() => { drag.current = null; }}
              onClick={(e) => { if (e.target === svgRef.current) setSelected(null); }}
            >
              {edges.map((e) => {
                const p = pos.get(e.a), q = pos.get(e.b);
                if (!p || !q) return null;
                const on = selected && (e.a === selected || e.b === selected);
                return <line key={`${e.a}|${e.b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={on ? "stroke-accent" : "stroke-line"} strokeWidth={on ? 2.5 : 1.5} opacity={selected && !on ? 0.35 : 1} />;
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const dim = selected && n.id !== selected && !neighbours.has(n.id);
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.35 : 1} className="cursor-pointer"
                    tabIndex={0} role="button" aria-label={`${n.label}${n.known ? (n.up === false ? `, ${t("Down")}` : "") : `, ${t("not monitored")}`}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setSelected(n.id === selected ? null : n.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id === selected ? null : n.id); } }}>
                    <circle r={n.id === selected ? 15 : 12} strokeWidth={n.id === selected ? 4 : 3} className={`${stroke(n)} ${fill(n)}`} strokeDasharray={n.known ? undefined : "4 3"} />
                    <text y={28} textAnchor="middle" className="fill-ink" fontSize={12} style={{ paintOrder: "stroke" }}>{n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}</text>
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-xs text-dim">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-up" aria-hidden />{t("Up")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-down" aria-hidden />{t("Down")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-dim" aria-hidden />{t("Seen by neighbour discovery, not in LibreNMS")}</span>
              <span className="ms-auto">{t("{n} devices, {l} links", { n: f.num(nodes.length), l: f.num(edges.length) })}</span>
            </div>
          </div>

          <Panel title={sel ? sel.label : t("Links")}>
            {!sel ? (
              <Empty>{t("Select a device on the map to list its links.")}</Empty>
            ) : (
              <div className="space-y-3 p-4 text-sm">
                {sel.deviceId !== undefined && <Link to={`/devices/${sel.deviceId}`} className="text-accent hover:underline">{t("Open device page")}</Link>}
                {!sel.known && <p className="text-dim">{t("This device was seen through LLDP or CDP but is not monitored in LibreNMS.")}</p>}
                <ul className="space-y-3">
                  {selEdges.map((e) => {
                    const other = e.a === selected ? e.b : e.a;
                    return (
                      <li key={`${e.a}|${e.b}`}>
                        <button onClick={() => setSelected(other)} className="font-medium text-accent hover:underline">{labelOf(other)}</button>
                        {e.ports.map((p, i) => (
                          <div key={i} className="text-xs text-dim">
                            <bdi className="ltr">{p.from === selected ? `${p.local} ⇄ ${p.remote}` : `${p.remote} ⇄ ${p.local}`}</bdi>{e.protocol ? ` (${e.protocol})` : ""}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
