/**
 * 生成源码依赖图（自包含交互 HTML），零外部依赖。
 *
 * 为什么不用 madge：madge 依赖经典 TypeScript 的 JS API，而本项目 pin 的是
 * `typescript@7`（Go 原生编译器，不提供 classic API），跑了会崩
 * `Cannot read properties of undefined (reading 'Intrinsic')`。这里用正则扫 import，
 * 对本仓库这种「显式相对路径 import」的代码足够准确，且永远不挑 TS 版本。
 *
 * 产物：docs/architecture.html（自包含，离线可开，支持拖拽 / 缩放 / 点节点高亮）。
 * 用法：npm run graph
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const files = walk(SRC).map((p) => resolve(p).replace(/\\/g, '/'));
const rel = (abs) => abs.replace(ROOT.replace(/\\/g, '/') + '/src/', '');
const exists = new Set(files);

/** 把相对 specifier 解析成真实文件（补 .ts / /index.ts） */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = dirname(fromFile);
  for (const cand of [spec, `${spec}.ts`, `${spec}/index.ts`]) {
    const p = resolve(base, cand).replace(/\\/g, '/');
    if (exists.has(p)) return p;
  }
  return null;
}

const graph = {};
for (const abs of files) {
  const text = readFileSync(abs, 'utf8');
  const deps = new Set();
  // 匹配各种 import/export ... from '...'（允许换行；用 [^'"] 排除副作用 import 与跨语句误配）
  const re = /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = resolveSpec(abs, m[1]);
    if (t !== null && t !== abs) deps.add(rel(t));
  }
  // 副作用 import：import './x.ts';
  const re2 = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  while ((m = re2.exec(text)) !== null) {
    const t = resolveSpec(abs, m[1]);
    if (t !== null && t !== abs) deps.add(rel(t));
  }
  graph[rel(abs)] = [...deps].sort();
}

// 计算入度/出度、按目录分组
const groups = [
  ['common/core/', '#2563eb', 'common/core'],
  ['common/ui/', '#7c3aed', 'common/ui'],
  ['common/utils/', '#0d9488', 'common/utils'],
  ['common/custom/', '#ca8a04', 'common/custom'],
  ['sites/uooc/ai/', '#dc2626', 'uooc/ai'],
  ['sites/uooc/', '#ea580c', 'uooc'],
  ['sites/bkxk/', '#16a34a', 'bkxk'],
  ['sites/', '#475569', 'sites 骨架'],
];
const groupOf = (p) => {
  for (const [pre, color, name] of groups) if (p.startsWith(pre)) return { color, name };
  return { color: '#94a3b8', name: '其它' };
};

const nodeMap = new Map();
const edges = [];
for (const [from, deps] of Object.entries(graph)) {
  if (!nodeMap.has(from)) nodeMap.set(from, { id: from, in: 0, out: 0 });
  for (const to of deps) {
    if (!nodeMap.has(to)) nodeMap.set(to, { id: to, in: 0, out: 0 });
    nodeMap.get(from).out++;
    nodeMap.get(to).in++;
    edges.push({ s: from, t: to });
  }
}
const nodes = [...nodeMap.values()].map((n) => ({ ...n, ...groupOf(n.id) }));
const stats = {};
for (const n of nodes) stats[n.name] = (stats[n.name] ?? 0) + 1;

// 循环依赖检测（DFS 三色）
const color = new Map();
const cycles = [];
function dfs(id, stack) {
  color.set(id, 1);
  for (const to of graph[id] ?? []) {
    if (color.get(to) === 1) cycles.push(stack.concat(to).join(' → '));
    else if (!color.has(to)) dfs(to, stack.concat(to));
  }
  color.set(id, 2);
}
for (const id of Object.keys(graph)) if (!color.has(id)) dfs(id, [id]);

const data = { nodes, edges, stats, total: nodes.length, edgeCount: edges.length, cycles: cycles.length };

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>szuer-toolbox 架构依赖图</title>
<style>
  :root{color-scheme:dark}
  html,body{margin:0;height:100%;background:#0b1020;color:#e5e7eb;font:13px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif}
  svg{width:100%;height:100%;display:block;cursor:grab}
  svg.dragging{cursor:grabbing}
  .edge{stroke:#334155;stroke-width:1;stroke-opacity:.45}
  .edge.hi{stroke:#f59e0b;stroke-width:1.8;stroke-opacity:1}
  .node circle{stroke:#0b1020;stroke-width:1.2;cursor:pointer}
  .node text{fill:#cbd5e1;font-size:9px;pointer-events:none;user-select:none;paint-order:stroke;stroke:#0b1020;stroke-width:2.5px}
  .node.dim{opacity:.25}
  #panel{position:fixed;top:12px;left:12px;max-width:340px;background:#0f172ae6;border:1px solid #1e293b;
         border-radius:10px;padding:10px 12px;backdrop-filter:blur(4px);font-size:12px}
  #panel h1{margin:0 0 6px;font-size:13px}
  #panel .muted{color:#94a3b8}
  #legend{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:6px}
  #legend span{display:inline-flex;align-items:center;gap:5px}
  #legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
  #sel{position:fixed;bottom:12px;left:12px;max-width:70ch;max-height:40vh;overflow:auto;background:#0f172ae6;border:1px solid #1e293b;
       border-radius:10px;padding:8px 10px;font-size:12px;display:none;white-space:pre-wrap}
  #hint{position:fixed;bottom:12px;right:12px;color:#64748b;font-size:11px;text-align:right}
</style></head>
<body><svg id="svg"></svg>
<div id="panel">
  <h1>szuer-toolbox 架构依赖图</h1>
  <div class="muted">${data.total} 个模块 / ${data.edgeCount} 条 import 边 · 循环依赖 ${data.cycles}</div>
  <div id="legend"></div>
  <div class="muted" style="margin-top:6px">拖节点=移动 · 滚轮=缩放 · 拖空白=平移 · 点节点=高亮依赖</div>
</div>
<div id="sel"></div>
<div id="hint">src/ · 由 tools/arch-graph.mjs 生成</div>
<script>
const G = ${JSON.stringify(data)};
const svg = document.getElementById('svg');
const NS = 'http://www.w3.org/2000/svg';
const W = () => svg.clientWidth || 1200, H = () => svg.clientHeight || 800;
const byId = new Map(G.nodes.map(n => [n.id, n]));
const deg = n => n.in + n.out;
const R = n => 3.5 + Math.min(9, Math.sqrt(deg(n)) * 2.0);

G.nodes.forEach(n => {
  const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * Math.min(W(), H()) * 0.40;
  n.x = W()/2 + Math.cos(a)*r; n.y = H()/2 + Math.sin(a)*r; n.vx = 0; n.vy = 0;
});

function step(alpha) {
  const k = 0.9 * alpha;
  for (const a of G.nodes) { a.fx = 0; a.fy = 0; }
  for (let i = 0; i < G.nodes.length; i++) for (let j = i + 1; j < G.nodes.length; j++) {
    const a = G.nodes[i], b = G.nodes[j];
    let dx = a.x-b.x, dy = a.y-b.y, d2 = dx*dx+dy*dy || .01, d = Math.sqrt(d2);
    const min = R(a)+R(b)+14;
    let f = 3600/d2; if (d < min) f += (min-d)*0.35;
    const fx = dx/d*f, fy = dy/d*f;
    a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
  }
  for (const e of G.edges) {
    const a = byId.get(e.s), b = byId.get(e.t);
    let dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy)||.01;
    const f = (d-135)*0.012, fx = dx/d*f, fy = dy/d*f;
    a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
  }
  for (const a of G.nodes) { a.fx += (W()/2-a.x)*0.0011; a.fy += (H()/2-a.y)*0.0011; }
  for (const a of G.nodes) {
    if (a.dragging) continue;
    a.vx = (a.vx + a.fx*k)*0.82; a.vy = (a.vy + a.fy*k)*0.82;
    a.x += Math.max(-25, Math.min(25, a.vx)); a.y += Math.max(-25, Math.min(25, a.vy));
  }
}

const edgeEls = [], nodeEls = new Map();
const gEdges = document.createElementNS(NS,'g'), gNodes = document.createElementNS(NS,'g');
svg.append(gEdges, gNodes);
for (const e of G.edges) {
  const l = document.createElementNS(NS,'line'); l.setAttribute('class','edge');
  gEdges.appendChild(l); edgeEls.push({ e, l });
}
for (const n of G.nodes) {
  const g = document.createElementNS(NS,'g'); g.setAttribute('class','node');
  const c = document.createElementNS(NS,'circle'); c.setAttribute('r', R(n)); c.setAttribute('fill', n.color);
  const t = document.createElementNS(NS,'text'); t.setAttribute('dx', R(n)+3); t.setAttribute('dy', 3);
  t.textContent = n.id.split('/').pop();
  if (deg(n) < 3) t.style.opacity = '0.45';
  g.append(c,t); gNodes.appendChild(g); nodeEls.set(n.id, g);
  c.addEventListener('pointerdown', ev => {
    ev.stopPropagation(); n.dragging = true; c.setPointerCapture(ev.pointerId);
    const mv = e2 => { const p = toWorld(e2); n.x = p.x; n.y = p.y; };
    const up = () => { n.dragging = false; c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); };
    c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up);
  });
  g.addEventListener('click', ev => { ev.stopPropagation(); select(n); });
  g.addEventListener('pointerenter', () => { if (deg(n) < 3) t.style.opacity = '1'; });
  g.addEventListener('pointerleave', () => { if (deg(n) < 3 && !n._sel) t.style.opacity = '0.45'; });
}
function draw() {
  for (const { e, l } of edgeEls) {
    const a = byId.get(e.s), b = byId.get(e.t);
    l.setAttribute('x1',a.x); l.setAttribute('y1',a.y); l.setAttribute('x2',b.x); l.setAttribute('y2',b.y);
  }
  for (const n of G.nodes) nodeEls.get(n.id).setAttribute('transform','translate('+n.x+','+n.y+')');
}

// ---- 视图：screen = world*k + view（view 单位是屏幕像素）；viewBox.min = -view/k ----
const view = { x: 0, y: 0, k: 1 };
function applyView(){ svg.setAttribute('viewBox', (-view.x/view.k)+' '+(-view.y/view.k)+' '+(W()/view.k)+' '+(H()/view.k)); }
function toWorld(ev){
  const r = svg.getBoundingClientRect();
  return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
}
svg.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = svg.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const w = toWorld(ev);
  const s = Math.exp(-ev.deltaY * 0.001);
  view.k = Math.max(0.25, Math.min(4, view.k * s));
  view.x = sx - w.x * view.k; view.y = sy - w.y * view.k;   // 光标下的点保持不动
  applyView();
}, { passive: false });
let panning = false, px = 0, py = 0;
svg.addEventListener('pointerdown', ev => { panning = true; px = ev.clientX; py = ev.clientY; svg.classList.add('dragging'); });
window.addEventListener('pointermove', ev => {
  if (!panning) return;
  view.x += ev.clientX - px; view.y += ev.clientY - py;      // 拖拽方向 = 内容移动方向
  px = ev.clientX; py = ev.clientY; applyView();
});
window.addEventListener('pointerup', () => { panning = false; svg.classList.remove('dragging'); });

const sel = document.getElementById('sel');
function select(n) {
  const deps = G.edges.filter(e => e.s === n.id).map(e => e.t);
  const users = G.edges.filter(e => e.t === n.id).map(e => e.s);
  G.nodes.forEach(m => { m._sel = m === n; nodeEls.get(m.id).classList.toggle('dim', m !== n && !deps.includes(m.id) && !users.includes(m.id)); });
  for (const { e, l } of edgeEls) l.classList.toggle('hi', e.s === n.id || e.t === n.id);
  sel.style.display = 'block';
  sel.textContent = n.id + '\\n【依赖 ' + deps.length + '】' + (deps.map(d=>'\\n  → '+d).join('') || '\\n  （无）') +
    '\\n【被 ' + users.length + ' 个模块引用】' + (users.map(d=>'\\n  ← '+d).join('') || '\\n  （无）');
}
svg.addEventListener('click', () => {
  sel.style.display = 'none';
  for (const { l } of edgeEls) l.classList.remove('hi');
  G.nodes.forEach(m => { m._sel = false; nodeEls.get(m.id).classList.remove('dim'); });
  for (const n of G.nodes) { const t = nodeEls.get(n.id).querySelector('text'); if (deg(n) < 3) t.style.opacity = '0.45'; }
});

const legend = document.getElementById('legend');
for (const [name, cnt] of Object.entries(G.stats).sort((a,b)=>b[1]-a[1])) {
  const color = (G.nodes.find(n => n.name === name) || {}).color || '#94a3b8';
  const s = document.createElement('span'); s.innerHTML = '<i style="background:'+color+'"></i>'+name+' ('+cnt+')';
  legend.appendChild(s);
}

for (let i = 0; i < 400; i++) step(1 - i/400);
let alpha = 0.35;
function loop(){ step(alpha); alpha = Math.max(0.02, alpha*0.997); draw(); requestAnimationFrame(loop); }
new ResizeObserver(applyView).observe(svg);
applyView(); loop();
// 便于自动核验拖拽/缩放方向（只读句柄，不影响交互）
window.__archView = view;
</script></body></html>`;

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'architecture.html'), html);
console.log(`docs/architecture.html 已生成：${data.total} 模块 / ${data.edgeCount} 边 / 循环依赖 ${data.cycles}`);
