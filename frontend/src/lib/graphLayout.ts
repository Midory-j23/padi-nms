export interface LNode { id: string; x: number; y: number }
export interface LEdge { a: string; b: string }

// Small deterministic force layout (no dependencies). Good enough for a few hundred nodes.
export function layout(ids: string[], edges: LEdge[], w = 1000, h = 700): Map<string, LNode> {
  const n = ids.length;
  const nodes = ids.map((id, i) => {
    const ang = (i / Math.max(n, 1)) * Math.PI * 2;
    const r = Math.min(w, h) * 0.35;
    return { id, x: w / 2 + Math.cos(ang) * r, y: h / 2 + Math.sin(ang) * r, dx: 0, dy: 0 };
  });
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const k = Math.sqrt((w * h) / Math.max(n, 1)) * 0.8;
  let temp = w / 8;
  const iterations = n > 250 ? 120 : 300;

  for (let it = 0; it < iterations; it++) {
    for (const nd of nodes) { nd.dx = 0; nd.dy = 0; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = ((i * 7) % 5) - 2 || 1; dy = ((j * 3) % 5) - 2 || 1; d = Math.hypot(dx, dy); }
        const f = (k * k) / d;
        nodes[i].dx += (dx / d) * f; nodes[i].dy += (dy / d) * f;
        nodes[j].dx -= (dx / d) * f; nodes[j].dy -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const i = idx.get(e.a), j = idx.get(e.b);
      if (i === undefined || j === undefined) continue;
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = (d * d) / k;
      nodes[i].dx -= (dx / d) * f; nodes[i].dy -= (dy / d) * f;
      nodes[j].dx += (dx / d) * f; nodes[j].dy += (dy / d) * f;
    }
    for (const nd of nodes) {
      nd.dx += (w / 2 - nd.x) * 0.02; // gravity keeps disconnected groups on screen
      nd.dy += (h / 2 - nd.y) * 0.02;
      const d = Math.max(Math.hypot(nd.dx, nd.dy), 0.01);
      const m = Math.min(d, temp);
      nd.x += (nd.dx / d) * m; nd.y += (nd.dy / d) * m;
      nd.x = Math.max(40, Math.min(w - 40, nd.x));
      nd.y = Math.max(40, Math.min(h - 40, nd.y));
    }
    temp *= 0.98;
  }
  return new Map(nodes.map((nd) => [nd.id, { id: nd.id, x: nd.x, y: nd.y }]));
}
