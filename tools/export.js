/* Архив для станка и печати: node tools/export.js <папка сайта> <имя архива>
   Берёт модель из <папка сайта>/assets/core.js (и чертежи из draw.js) с размерами v0.1 и пишет:
     dxf/      — контуры фанерных заготовок 1:1 в миллиметрах (слои CUT, CUT_INNER, POCKET)
     svg/      — те же контуры в SVG 1:1 (мм)
     3d/       — модель ящика в OBJ (мм, створки закрыты)
     chertezhi/ — листы чертежей с размерами (SVG, открываются в браузере)
     README.txt — что где, сколько штук, из чего
   Геометрию заготовки (контур, дыры, канавки) строит boardShape из основной модели (assets/core.js в корне),
   поэтому для брусковой версии используется та же функция. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..'), SITE = path.resolve(process.argv[2] || ROOT), NAME = process.argv[3] || 'vertep';
const OUT = path.resolve(process.argv[4] || path.join(ROOT, 'downloads'));

function load(dir, withDraw) {
  const ctx = {console, Math, JSON, Set, Map, Array, Object, String, Number, Infinity, isFinite};
  ctx.window = ctx; ctx.localStorage = {getItem:() => null, setItem() {}, removeItem() {}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'assets/core.js'), 'utf8'), ctx);
  if (withDraw) vm.runInContext(fs.readFileSync(path.join(dir, 'assets/draw.js'), 'utf8'), ctx);
  return ctx;
}
const R = load(ROOT, false).V;            // boardShape и splice — из основной модели
const C = load(SITE, true), V = C.V, VD = C.VD;
const mm = v => +(v*10).toFixed(3);

/* ---------- плоская геометрия ---------- */
const area = pl => { let s = 0; pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length]; s += q[0]*r[1] - r[0]*q[1]; }); return s/2; };
const ccw = pl => area(pl) < 0 ? pl.slice().reverse() : pl;
const cw = pl => area(pl) > 0 ? pl.slice().reverse() : pl;
const circlePts = (c, r, n = 32) => Array.from({length:n}, (_, i) => [c[0] + r*Math.cos(i/n*2*Math.PI), c[1] + r*Math.sin(i/n*2*Math.PI)]);
/* заготовка в плоскости: внешний контур, дыры, круги, канавки; mirror — зеркально по u, чтобы канавка была на верхней пласти */
function flat(p) {
  const S = R.boardShape(p), e0 = S.to3(0, 0, 0), ax = [[1,0,0],[0,1,0],[0,0,1]].map(a => { const q = S.to3(a[0], a[1], a[2]); return [q[0]-e0[0], q[1]-e0[1], q[2]-e0[2]]; });
  const right = R.dot(R.cross(ax[0], ax[1]), ax[2]) > 0;            // при взгляде на чертёж к нам смотрит пласть d = t
  const mirror = S.pockets.length && (S.pockets[0].at === 'max') !== right;
  const u0 = S.bb[0], v0 = S.bb[1], W = S.bb[2] - S.bb[0];
  const m = q => [mirror ? W - (q[0] - u0) : q[0] - u0, q[1] - v0];
  return {S, w:W, h:S.bb[3] - S.bb[1], t:S.t, mirror,
    outer:ccw(S.outer.map(m)), holes:S.holes.map(h => cw(h.map(m))), circles:S.circles.map(c => ({c:m(c.c), r:c.r})),
    pockets:S.pockets.map(k => ({pts:ccw(k.pts.map(m)), depth:k.depth}))};
}

/* ---------- DXF (R12, мм) ---------- */
function dxf(F, label) {
  const o = [], g = (c, v) => o.push(String(c), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$INSUNITS'); g(70, 4); g(9, '$MEASUREMENT'); g(70, 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 4);
  [['CUT', 7], ['CUT_INNER', 1], ['POCKET', 5], ['LABEL', 8]].forEach(([n, c]) => { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS'); });
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const poly = (pts, layer) => { g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(70, 1); g(10, 0); g(20, 0); g(30, 0);
    pts.forEach(q => { g(0, 'VERTEX'); g(8, layer); g(10, mm(q[0])); g(20, mm(q[1])); g(30, 0); }); g(0, 'SEQEND'); g(8, layer); };
  poly(F.outer, 'CUT');
  F.holes.forEach(h => poly(h, 'CUT_INNER'));
  F.circles.forEach(c => { g(0, 'CIRCLE'); g(8, 'CUT_INNER'); g(10, mm(c.c[0])); g(20, mm(c.c[1])); g(30, 0); g(40, mm(c.r)); });
  F.pockets.forEach(k => poly(k.pts, 'POCKET'));
  if (label) { g(0, 'TEXT'); g(8, 'LABEL'); g(10, 10); g(20, mm(F.h) + 10); g(30, 0); g(40, 8); g(1, label); }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
/* ---------- SVG контура (мм) ---------- */
function svgCut(F, label) {
  const pad = 10, W = mm(F.w) + 2*pad, H = mm(F.h) + 2*pad + 14, X = q => (mm(q[0]) + pad).toFixed(2), Y = q => (H - pad - mm(q[1])).toFixed(2);
  const pl = (pts, cls) => `<polygon class="${cls}" points="${pts.map(q => X(q) + ',' + Y(q)).join(' ')}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">
<style>.cut{fill:#f3e6cf;stroke:#000;stroke-width:.3}.inner{fill:#fff;stroke:#c00;stroke-width:.3}.pocket{fill:#d9b98a;stroke:#00c;stroke-width:.3;stroke-dasharray:2 1}text{font:6px sans-serif;fill:#555}</style>
<g id="CUT">${pl(F.outer, 'cut')}</g>
<g id="POCKET">${F.pockets.map(k => pl(k.pts, 'pocket')).join('')}</g>
<g id="CUT_INNER">${F.holes.map(h => pl(h, 'inner')).join('')}${F.circles.map(c => `<circle class="inner" cx="${X(c.c)}" cy="${Y(c.c)}" r="${mm(c.r).toFixed(2)}"/>`).join('')}</g>
<text x="${pad}" y="10">${label}</text>
</svg>
`;
}

/* ---------- триангуляция: дыры сшиваются с контуром мостиками, потом отрезание ушей ---------- */
const cr = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
function segX(a, b, c, d) { const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d); return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12)); }
function bridge(outer, holes) {
  let P = outer.slice();
  holes.slice().sort((a, b) => Math.max(...b.map(q => q[0])) - Math.max(...a.map(q => q[0]))).forEach(h => {
    const mi = h.reduce((m, q, i) => q[0] > h[m][0] ? i : m, 0), M = h[mi], edges = [];
    const all = [P].concat(holes.filter(x => x !== h)); all.forEach(pl => pl.forEach((q, i) => edges.push([q, pl[(i + 1) % pl.length]]))); h.forEach((q, i) => edges.push([q, h[(i + 1) % h.length]]));
    let best = -1, bd = Infinity;
    P.forEach((q, i) => { const d = Math.hypot(q[0] - M[0], q[1] - M[1]); if (d >= bd) return;
      if (edges.some(([a, b]) => a !== q && b !== q && a !== M && b !== M && segX(M, q, a, b))) return;
      const pv = P[(i - 1 + P.length) % P.length], nx = P[(i + 1) % P.length];        // мостик должен идти внутрь контура
      const inside = cr(pv, q, nx) >= 0 ? cr(pv, q, M) > 0 && cr(q, nx, M) > 0 : !(cr(pv, q, M) <= 0 && cr(q, nx, M) <= 0);
      if (!inside) return; best = i; bd = d; });
    if (best < 0) throw new Error('не нашёлся мостик к дыре');
    const ring = h.slice(mi).concat(h.slice(0, mi));
    P = P.slice(0, best + 1).concat(ring, [M.slice(), P[best].slice()], P.slice(best + 1));
  });
  return P;
}
function earcut(outer, holes) {
  const P = bridge(ccw(outer), holes.map(cw)), idx = P.map((_, i) => i), tris = [];
  const inTri = (p, a, b, c) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;   // на ребре — тоже мешает
  let guard = 0;
  while (idx.length > 3 && guard++ < 200000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length], a = P[i0], b = P[i1], c = P[i2];
      const s = cr(a, b, c);
      if (Math.abs(s) < 1e-12) { idx.splice(k, 1); cut = true; break; }       // точка на прямой — просто убрать
      if (s < 0) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && !(P[j][0] === a[0] && P[j][1] === a[1]) && !(P[j][0] === b[0] && P[j][1] === b[1]) && !(P[j][0] === c[0] && P[j][1] === c[1]) && inTri(P[j], a, b, c))) continue;
      tris.push([a, b, c]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) throw new Error('триангуляция застряла');
  }
  if (idx.length === 3 && Math.abs(cr(P[idx[0]], P[idx[1]], P[idx[2]])) > 1e-12) tris.push(idx.map(i => P[i]));
  const want = Math.abs(area(outer)) - holes.reduce((s, h) => s + Math.abs(area(h)), 0), got = tris.reduce((s, t) => s + Math.abs(area(t)), 0);
  if (Math.abs(want - got) > 1e-3*Math.max(1, want)) throw new Error(`триангуляция не сошлась по площади: ${want.toFixed(3)} против ${got.toFixed(3)}`);
  return tris;
}

/* ---------- OBJ ---------- */
function objModel(M) {
  const lines = ['# Вертепный ящик, ' + NAME + ', мм. Оси: X — ширина, Y — высота, Z — к зрителю. Створки закрыты.'], vs = [];
  let nv = 0;
  const V3 = q => { lines.push(`v ${mm(q[0])} ${mm(q[1])} ${mm(-q[2])}`); return ++nv; };
  const face = (pts, nrm) => {   // pts в координатах ящика; порядок обхода — по внешней нормали nrm
    const a = pts[0], b = pts[1], c = pts[2], n = R.cross([b[0]-a[0], b[1]-a[1], b[2]-a[2]], [c[0]-a[0], c[1]-a[1], c[2]-a[2]]);
    const q = R.dot(n, nrm) < 0 ? pts.slice().reverse() : pts; lines.push('f ' + q.map(p => V3(p)).join(' ')); };
  M.parts.filter(p => p.mat).forEach(p => {
    lines.push('o ' + p.id + ' ' + p.name.replace(/\s+/g, '_'));
    const S = R.boardShape(p), e0 = S.to3(0, 0, 0), dn = (() => { const q = S.to3(0, 0, 1); return [q[0]-e0[0], q[1]-e0[1], q[2]-e0[2]]; })();
    const T3 = (q, d) => V.xform(p, S.to3(q[0], q[1], d)), neg = v => v.map(x => -x);
    const circ = S.circles.map(c => circlePts(c.c, c.r, 24));
    const slab = (outer, holes, d0, d1) => {
      const hs = holes.concat(circ);
      earcut(outer, hs).forEach(t => { face(t.map(q => T3(q, d1)), dn); face(t.map(q => T3(q, d0)), neg(dn)); });
      [ccw(outer)].concat(hs.map(cw)).forEach(pl => pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length], du = r[0] - q[0], dv = r[1] - q[1];
        const o = S.to3(q[0] + dv, q[1] - du, 0); face([T3(q, d0), T3(r, d0), T3(r, d1), T3(q, d1)], [o[0]-e0[0], o[1]-e0[1], o[2]-e0[2]].map((x, k) => x - (S.to3(q[0], q[1], 0)[k] - e0[k]))); }));
    };
    if (!S.pockets.length) slab(S.outer, S.holes, 0, S.t);
    else { const dp = S.pockets[0].depth, top = S.pockets[0].at === 'max'; let o2 = S.outer; const h2 = S.holes.slice();
      S.pockets.forEach(k => { const s2 = R.splice(o2, k.pts); if (s2) o2 = s2; else h2.push(k.pts); });
      if (top) { slab(S.outer, S.holes, 0, S.t - dp); slab(o2, h2, S.t - dp, S.t); } else { slab(o2, h2, 0, dp); slab(S.outer, S.holes, dp, S.t); } }
  });
  return lines.join('\n') + '\n';
}

/* ---------- листы чертежей ---------- */
const css = fs.readFileSync(path.join(SITE, 'assets/site.css'), 'utf8');
const LIGHT = {}; (css.match(/:root\{([^}]*)\}/) || ['', ''])[1].replace(/--([\w-]+):([^;]+);/g, (_, k, v) => { LIGHT[k] = v.trim(); });
const DWCSS = css.split('\n').filter(l => l.startsWith('.dw ')).join('\n').replace(/var\(--([\w-]+)\)/g, (_, k) => LIGHT[k] || '#000');
function sheetSvg(S, title) {
  const b = S.bb, p = S.fs*1.4, w = b[2] - b[0] + 2*p, h = b[3] - b[1] + 2*p, k = w/1100;   // 1 px экрана ≈ k единиц листа
  const st = DWCSS.replace(/vector-effect:non-scaling-stroke;?/g, '').replace(/stroke-width:([\d.]+)/g, (_, v) => 'stroke-width:' + (v*k).toFixed(4))
    .replace(/stroke-dasharray:([\d. ]+)/g, (_, v) => 'stroke-dasharray:' + v.trim().split(/\s+/).map(x => (x*k).toFixed(4)).join(' '));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" class="dw" viewBox="${(b[0]-p).toFixed(2)} ${(b[1]-p).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" width="${Math.round(w/k)}" height="${Math.round(h/k)}">
<title>${title}</title>
<style>svg{background:#fbfcfc}.dw text{font-family:"JetBrains Mono",Menlo,monospace}
${st.replace(/\.dw \.dw/g, '.dw')}</style>
<g class="dw">${S.L.g.join('')}${S.L.d.join('')}${S.L.t.join('')}</g>
</svg>
`;
}

/* ---------- сборка архива ---------- */
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vertep-')), base = path.join(tmp, NAME);
['dxf', 'svg', '3d', 'chertezhi'].forEach(d => fs.mkdirSync(path.join(base, d), {recursive:true}));
const M = V.model(180), types = V.partTypes(M), cut = [];
types.forEach(t => {
  if (!t.mat || !/^ply/.test(t.mat)) { cut.push({t, file:null}); return; }
  const pockets = t.parts.some(p => R.boardShape(p).pockets.length);
  const reps = pockets ? t.parts.map(p => [p, t.id + '-' + p.id.slice(-1)]) : [[t.parts[0], t.id]];
  const files = [];
  reps.forEach(([p, name]) => { const F = flat(p), label = `${t.name} (${name}), ${V.MAT[t.mat].l}, ${pockets ? 1 : t.qty} шт`;
    fs.writeFileSync(path.join(base, 'dxf', name + '.dxf'), dxf(F, label)); fs.writeFileSync(path.join(base, 'svg', name + '.svg'), svgCut(F, label));
    files.push({name, F, qty:pockets ? 1 : t.qty}); });
  cut.push({t, files});
});
fs.writeFileSync(path.join(base, '3d', 'vertep.obj'), objModel(V.model(0)));
const sheets = [['L1-fasad', 'Фасад, створки открыты', VD.buildFront(true)], ['L2-razrez', 'Разрез сбоку', VD.buildSection()]];
types.forEach((t, i) => sheets.push([`D${String(i + 1).padStart(2, '0')}-${t.id}`, t.name, VD.buildPart(t.id, false).S]));
V.STEPS.forEach((s, i) => (s.sheets || []).forEach((id, k) => sheets.push([`S${i + 1}${s.sheets.length > 1 ? '.' + (k + 1) : ''}-${id}`, `Сборка, шаг ${i + 1}: ${id}`, VD.buildPart(id, false, 'asm').S])));
sheets.forEach(([f, title, S]) => fs.writeFileSync(path.join(base, 'chertezhi', f + '.svg'), sheetSvg(S, title)));

const pad = (s, n) => String(s) + ' '.repeat(Math.max(1, n - String(s).length));
const readme = [
  `Вертепный ящик — ${V.VARIANT === 'shipy' ? 'корпус на шипах (фанера 10 мм, ЧПУ)' : 'корпус на брусках (фанера 9 мм, бруски, саморезы)'}`,
  `Размеры по умолчанию (v0.1): ширина сцены ${V.P.W} см, глубина ${V.P.D} см, корпус ${V.fmt(M.Wout)} × ${V.fmt(M.Dc)} × ${V.fmt(M.Hc)} см.`,
  'Сайт с 3D-моделью и пошаговой сборкой: https://besagar.github.io/Vertep/',
  '',
  'dxf/        контуры фанерных заготовок, 1:1, миллиметры. Слои:',
  '              CUT        — внешний контур (резать насквозь, фреза снаружи)',
  '              CUT_INNER  — дыры, щели, гнёзда (насквозь, фреза внутри)',
  '              POCKET     — канавки на часть толщины (глубина — в таблице ниже)',
  '              LABEL      — подпись, не резать',
  'svg/        те же контуры в SVG 1:1 (мм)',
  '3d/         модель ящика vertep.obj в миллиметрах, створки закрыты',
  'chertezhi/  листы чертежей с размерами в сантиметрах (открываются в браузере)',
  '',
  'Заготовки:',
  ...cut.flatMap(({t, files}) => files ? files.map(f => '  ' + pad(f.name + '.dxf', 22) + pad(f.qty + ' шт', 7) + pad(V.MAT[t.mat].l, 15) + V.fmt(f.F.w*10) + ' × ' + V.fmt(f.F.h*10) + ' мм' +
      (f.F.pockets.length ? `, канавки глубиной ${V.fmt(f.F.pockets[0].depth*10)} мм на верхней пласти` : '') + '  — ' + t.name)
    : ['  ' + pad('(без файла)', 22) + pad(t.qty + ' шт', 7) + pad(t.mat ? V.MAT[t.mat].l : '', 15) + t.size + ' см  — ' + t.name]),
  '',
  ...(V.VARIANT === 'shipy' ? [
    'Шипы и гнёзда:',
    '  Гнёзда и прорези под шипы — размер в размер толщины листа (10 мм для корпуса, 6 мм для фронтона), без зазора.',
    '  Внутренние углы гнёзд в файлах острые: подрезки под радиус фрезы (dogbone / T-bone) добавить в CAM.',
    '  Если реальная толщина листа отличается от 10 мм — пересчитать ширину гнёзд по замеру.',
    '  Боковины зеркальные: side-L и side-R. Канавки под полы — на верхней пласти в файле, на собранном ящике они смотрят внутрь.',
    '  Канавки под полы: пол должен задвигаться от руки, посадку подобрать по месту.', ''] : []),
  'Все размеры взяты из модели сайта; если на сайте двигать ползунки размеров, этот архив их не учитывает.'
].join('\n') + '\n';
fs.writeFileSync(path.join(base, 'README.txt'), readme);
fs.mkdirSync(OUT, {recursive:true});
const zip = path.join(OUT, NAME + '.zip'); if (fs.existsSync(zip)) fs.unlinkSync(zip);
require('child_process').execFileSync('zip', ['-r', '-X', '-q', zip, NAME], {cwd:tmp});
fs.rmSync(tmp, {recursive:true, force:true});
console.log(zip, (fs.statSync(zip).size/1024).toFixed(0) + ' КБ', 'листов', sheets.length, 'заготовок', cut.filter(c => c.files).reduce((s, c) => s + c.files.length, 0));
