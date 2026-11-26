/* Вертепный ящик — чертежи.
   Правило: на листе нет ни одной линии и ни одной цифры без источника в модели (assets/core.js).
   • Общие виды — проекции всех деталей модели.
   • Лист детали строит одна общая функция: контур самой детали, её вырезы и элементы (петли, магниты,
     саморезы, отверстия) и все детали, которые её касаются. Что с видимой стороны — сплошным тонким
     контуром с заливкой, что с обратной или скрыто — пунктиром. Своих чисел у функции рисования нет.
   • Каждый размер, координата, отметка и выноска помнят, какие точки листа они меряют или на что
     показывают. verify() проверяет, что эти точки лежат на нарисованной геометрии и что подпись
     совпадает с измеренным расстоянием. verifyAll() прогоняет так все листы. */
(function () {
'use strict';
const {P, T, fmt, esc, model, verts, faceW, faceSize, hull, convexes, contact, puppetCyl, dot} = V;

/* раздвинуть подписи: v — желаемые позиции (по возрастанию), g — минимальный шаг */
function spread(v, g) {
  const blocks = v.map(x => ({n:1, sum:x}));
  const start = b => b.sum/b.n - (b.n - 1)*g/2;
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 1; k < blocks.length; k++) {
      const a = blocks[k-1], b = blocks[k];
      if (start(a) + a.n*g > start(b) + 1e-9) { blocks.splice(k-1, 2, {n:a.n+b.n, sum:a.sum+b.sum}); merged = true; break; }
    }
  }
  const p = []; blocks.forEach(b => { const s = start(b); for (let j = 0; j < b.n; j++) p.push(s + j*g); }); return p;
}
/* классы оформления: всё остальное считается геометрией листа */
const ANNO = /(^|\s)(dim|ext|ext2|tick|tick-o|ord|jog|leader|dot|lvl|lvl-l|zone-c|datum|cl-pt|slot-cl|ghost)(\s|$)/;

class Sheet {
  constructor(fs) { this.fs = fs; this.L = {g:[], d:[], t:[]}; this.bb = [1e9,1e9,-1e9,-1e9]; this.tb = []; this.rec = []; this.dims = []; }
  _e(x, y) { const b = this.bb; if (x < b[0]) b[0] = x; if (-y < b[1]) b[1] = -y; if (x > b[2]) b[2] = x; if (-y > b[3]) b[3] = -y; }
  _p(x, y) { return x.toFixed(3) + ',' + (-y).toFixed(3); }
  poly(pts, cls, lay) { pts.forEach(q => this._e(q[0], q[1])); this.rec.push({t:'poly', cls, pts}); this.L[lay || 'g'].push(`<polygon class="${cls}" points="${pts.map(q => this._p(q[0], q[1])).join(' ')}"/>`); }
  pline(pts, cls, sw, lay) { pts.forEach(q => this._e(q[0], q[1])); this.rec.push({t:'pline', cls, pts, w:sw || 0}); this.L[lay || 'd'].push(`<polyline class="${cls}" points="${pts.map(q => this._p(q[0], q[1])).join(' ')}"${sw != null ? ` stroke-width="${sw.toFixed(3)}"` : ''}/>`); }
  line(x1, y1, x2, y2, cls, lay) { this._e(x1, y1); this._e(x2, y2); this.rec.push({t:'pline', cls, pts:[[x1,y1],[x2,y2]], w:0}); this.L[lay || 'd'].push(`<line class="${cls}" x1="${x1.toFixed(3)}" y1="${(-y1).toFixed(3)}" x2="${x2.toFixed(3)}" y2="${(-y2).toFixed(3)}"/>`); }
  circ(x, y, r, cls, lay) { this._e(x-r, y-r); this._e(x+r, y+r); this.rec.push({t:'circ', cls, c:[x,y], r}); this.L[lay || 'g'].push(`<circle class="${cls}" cx="${x.toFixed(3)}" cy="${(-y).toFixed(3)}" r="${r.toFixed(3)}"/>`); }
  ell(x, y, rx, ry, cls, lay) { this._e(x-rx, y-ry); this._e(x+rx, y+ry); this.rec.push({t:'ell', cls, c:[x,y], rx, ry}); this.L[lay || 'g'].push(`<ellipse class="${cls}" cx="${x.toFixed(3)}" cy="${(-y).toFixed(3)}" rx="${rx.toFixed(3)}" ry="${ry.toFixed(3)}"/>`); }
  rect(x0, y0, x1, y1, cls, lay) { this.poly([[x0,y0],[x1,y0],[x1,y1],[x0,y1]], cls, lay); }
  text(x, y, s, o) {
    o = o || {}; const z = o.size || this.fs, w = String(s).length * z * 0.6, a = o.anchor || 'start'; let box;
    if (o.rot) { const y0 = a === 'middle' ? y - w/2 : a === 'end' ? y - w : y; box = [x - 0.78*z, y0, x + 0.22*z, y0 + w]; }
    else { const x0 = a === 'middle' ? x - w/2 : a === 'end' ? x - w : x; box = [x0, y - 0.22*z, x0 + w, y + 0.78*z]; }
    this._e(box[0], box[1]); this._e(box[2], box[3]); this.tb.push(box);
    this.L.t.push(`<text class="${o.cls || 'tx'}" x="${x.toFixed(3)}" y="${(-y).toFixed(3)}" font-size="${z.toFixed(3)}" text-anchor="${a}"${o.rot ? ` transform="rotate(-90 ${x.toFixed(3)} ${(-y).toFixed(3)})"` : ''}>${esc(s)}</text>`);
    return box;
  }
  tick(x, y) { const k = this.fs * .28; this.line(x-k, y-k, x+k, y+k, 'tick'); }
  /* размер по горизонтали: from — высота точек на детали (одна или [левая, правая]) */
  dimH(x1, x2, y, label, o) {
    o = o || {}; const f = this.fs; if (x2 < x1) [x1, x2] = [x2, x1];
    const fr = o.from == null ? [null, null] : Array.isArray(o.from) ? o.from : [o.from, o.from];
    [[x1, fr[0]], [x2, fr[1]]].forEach(([x, a]) => { if (a == null) return; const s = y > a ? 1 : -1; this.line(x, a + s*f*.25, x, y + s*f*.45, 'ext'); });
    this.line(x1, y, x2, y, 'dim'); this.tick(x1, y); this.tick(x2, y);
    const w = String(label).length * f * .6;
    if (w + f*.8 <= x2 - x1) this.text((x1+x2)/2, y + f*.3, label, {anchor:'middle', cls:'dt ' + (o.cls || '')});
    else { this.line(x2, y, x2 + f*.5, y, 'dim'); this.text(x2 + f*.7, y - f*.3, label, {cls:'dt ' + (o.cls || '')}); }
    this.dims.push({k:'h', a:[x1, fr[0]], b:[x2, fr[1]], v:x2 - x1, label});
  }
  /* размер по вертикали: from — абсцисса точек на детали (одна или [нижняя, верхняя]) */
  dimV(y1, y2, x, label, o) {
    o = o || {}; const f = this.fs; if (y2 < y1) [y1, y2] = [y2, y1];
    const fr = o.from == null ? [null, null] : Array.isArray(o.from) ? o.from : [o.from, o.from];
    [[y1, fr[0]], [y2, fr[1]]].forEach(([y, a]) => { if (a == null) return; const s = x > a ? 1 : -1; this.line(a + s*f*.25, y, x + s*f*.45, y, 'ext'); });
    this.line(x, y1, x, y2, 'dim'); this.tick(x, y1); this.tick(x, y2);
    this.dims.push({k:'v', a:[fr[0], y1], b:[fr[1], y2], v:y2 - y1, label});
    const w = String(label).length * f * .6, tx = o.side === 'right' ? x + f*1.05 : x - f*.3;
    if (o.horiz) { this.text(o.side === 'right' ? x + f*.45 : x - f*.45, (y1+y2)/2 - f*.3, label, {anchor:o.side === 'right' ? 'start' : 'end', cls:'dt ' + (o.cls || '')}); return; }
    if (w + f*.8 <= y2 - y1) this.text(tx, (y1+y2)/2, label, {anchor:'middle', rot:true, cls:'dt ' + (o.cls || '')});
    else { this.line(x, y2, x, y2 + f*.5, 'dim'); this.text(tx, y2 + f*.7, label, {anchor:'start', rot:true, cls:'dt ' + (o.cls || '')}); }
  }
  /* координаты по горизонтали от базового угла: подписи под базовой линией yb */
  ordX(items, yb) {
    const f = this.fs; if (!items.length) return yb;
    const m = new Map(); items.forEach(i => { const k = Math.round(i.x*20); if (!m.has(k) || (i.from != null && i.from < m.get(k).from)) m.set(k, i); });
    const it = [...m.values()].sort((a, b) => a.x - b.x), pos = spread(it.map(i => i.x), f*1.5), xs = it.map(i => i.x);
    this.line(Math.min(...xs), yb, Math.max(...xs), yb, 'ord');
    let ymin = yb;
    it.forEach((i, k) => {
      if (i.from > yb + f*.3) this.line(i.x, i.from, i.x, yb, 'ext2');
      this.line(i.x, yb - f*.3, i.x, yb + f*.3, 'tick-o');
      const xp = pos[k]; this.pline([[i.x, yb],[i.x, yb - f*.45],[xp, yb - f*1.05],[xp, yb - f*1.25]], 'jog');
      const label = fmt(i.x), b = this.text(xp + f*.28, yb - f*1.4, label, {anchor:'end', rot:true, cls:'dt ' + (i.cls || '')});
      ymin = Math.min(ymin, b[1]);
      this.dims.push({k:'ox', a:[i.x, i.from], v:i.x, label});
    });
    return ymin;
  }
  /* координаты по вертикали от базового угла: подписи левее базовой линии xb */
  ordY(items, xb) {
    const f = this.fs; if (!items.length) return xb;
    const m = new Map(); items.forEach(i => { const k = Math.round(i.y*20); if (!m.has(k) || (i.from != null && i.from < m.get(k).from)) m.set(k, i); });
    const it = [...m.values()].sort((a, b) => a.y - b.y), pos = spread(it.map(i => i.y), f*1.5), ys = it.map(i => i.y);
    this.line(xb, Math.min(...ys), xb, Math.max(...ys), 'ord');
    let xmin = xb;
    it.forEach((i, k) => {
      if (i.from > xb + f*.3) this.line(i.from, i.y, xb, i.y, 'ext2');
      this.line(xb - f*.3, i.y, xb + f*.3, i.y, 'tick-o');
      const yp = pos[k]; this.pline([[xb, i.y],[xb - f*.45, i.y],[xb - f*1.05, yp],[xb - f*1.25, yp]], 'jog');
      const label = fmt(i.y), b = this.text(xb - f*1.4, yp - f*.28, label, {anchor:'end', cls:'dt ' + (i.cls || '')});
      xmin = Math.min(xmin, b[0]);
      this.dims.push({k:'oy', a:[i.from, i.y], v:i.y, label});
    });
    return xmin;
  }
  /* выноски: точка на геометрии листа, подпись колонкой справа от xc */
  callouts(items, xc) {
    const f = this.fs; if (!items.length) return;
    const it = items.slice().sort((a, b) => a.y - b.y), pos = spread(it.map(i => i.y), f*1.6);
    it.forEach((i, k) => {
      const yp = pos[k];
      this.circ(i.x, i.y, f*.16, 'dot', 'd');
      this.pline([[i.x, i.y],[xc - f*1.1, yp],[xc - f*.3, yp]], 'leader');
      this.text(xc, yp - f*.28, i.text, {cls:'ct ' + (i.cls || '')});
      this.dims.push({k:'co', a:[i.x, i.y], label:i.text});
    });
  }
  /* отметки уровня: from — абсцисса точки на детали */
  levels(items, x, from) {
    const f = this.fs; if (!items.length) return;
    const it = items.slice().sort((a, b) => a.y - b.y), pos = spread(it.map(i => i.y), f*1.6);
    it.forEach((i, k) => {
      const yp = pos[k], fx = i.from != null ? i.from : from;
      this.line(fx + f*.25, i.y, x, i.y, 'ext');
      this.poly([[x, i.y],[x - f*.38, i.y + f*.58],[x + f*.38, i.y + f*.58]], 'lvl', 'd');
      this.pline([[x, i.y],[x + f*.9, i.y],[x + f*1.25, yp],[x + f*1.5, yp]], 'jog');
      this.text(x + f*1.65, yp - f*.28, i.label, {cls:'dt ' + (i.cls || '')});
      this.dims.push({k:'lvl', a:[fx, i.y], v:i.y, label:i.label});
    });
  }
  zone(x, y, letter, cls) { const f = this.fs; this.circ(x, y, f*.72, 'zone-c ' + (cls || ''), 'd'); this.text(x, y - f*.32, letter, {anchor:'middle', cls:'zone ' + (cls || '')}); }
  datum(x, y) { this.circ(x, y, this.fs*.3, 'datum', 'd'); }
  out(svg, pad) {
    if (!svg) return;
    const b = this.bb, p = pad == null ? this.fs*1.2 : pad;
    svg.setAttribute('viewBox', `${(b[0]-p).toFixed(2)} ${(b[1]-p).toFixed(2)} ${(b[2]-b[0]+2*p).toFixed(2)} ${(b[3]-b[1]+2*p).toFixed(2)}`);
    svg.innerHTML = this.L.g.join('') + this.L.d.join('') + this.L.t.join('');
  }
}

/* ---------- геометрия на плоскости листа ---------- */
const segDist = (q, a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1], l = dx*dx + dy*dy, t = l ? Math.max(0, Math.min(1, ((q[0]-a[0])*dx + (q[1]-a[1])*dy)/l)) : 0; return Math.hypot(q[0] - a[0] - t*dx, q[1] - a[1] - t*dy); };
const area = pl => { let s = 0; pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length]; s += q[0]*r[1] - r[0]*q[1]; }); return s/2; };
const centroid = pl => { const A = area(pl); if (Math.abs(A) < 1e-9) return pl[0]; let cx = 0, cy = 0; pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length], c = q[0]*r[1] - r[0]*q[1]; cx += (q[0] + r[0])*c; cy += (q[1] + r[1])*c; }); return [cx/(6*A), cy/(6*A)]; };
const inPoly = (q, pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1]) + a[0]) c = !c; } return c; };
/* обрезка выпуклого многоугольника выпуклым (Сазерленд — Ходжмен), clip — против часовой */
function clipPoly(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
    const side = q => (b[0]-a[0])*(q[1]-a[1]) - (b[1]-a[1])*(q[0]-a[0]);
    inp.forEach((q, k) => { const r = inp[(k + 1) % inp.length], sq = side(q), sr = side(r);
      if (sq >= -1e-9) out.push(q);
      if ((sq >= -1e-9) !== (sr >= -1e-9)) { const t = sq/(sq - sr); out.push([q[0] + (r[0]-q[0])*t, q[1] + (r[1]-q[1])*t]); } });
  }
  return out;
}
const ext = pl => ({minU:pl.reduce((m, q) => q[0] < m[0] ? q : m), maxU:pl.reduce((m, q) => q[0] > m[0] ? q : m), minV:pl.reduce((m, q) => q[1] < m[1] ? q : m), maxV:pl.reduce((m, q) => q[1] > m[1] ? q : m)});
const X = q => ({x:q[0], from:q[1]}), Y = q => ({y:q[1], from:q[0]});

/* ---------- общие виды ---------- */
const VIEWS = {
  front:{axis:'z', proj:q => [q[0], q[1]], depth:q => q[2]},
  section:{axis:'x', proj:q => [q[2], q[1]], depth:q => -q[0]}
};
function partOps(S, M, Vw, filter) {
  const ops = [];
  for (const p of M.parts) {
    if (!filter(p)) continue;
    const vs = verts(p), d = vs.reduce((s, q) => s + Vw.depth(q), 0) / vs.length;
    let poly, holes = [];
    if (p.face && p.face.n === Vw.axis && !p.rot) {
      const [w, h] = faceSize(p), ol = p.face.outline || [[0,0],[w,0],[w,h],[0,h]];
      poly = ol.map(t => Vw.proj(faceW(p, t[0], t[1])));
      holes = p.face.prims.map(pr => pr.t === 'circle' ? {t:'circle', c:Vw.proj(faceW(p, pr.c[0], pr.c[1])), r:pr.r}
        : {t:pr.t, pts:pr.pts.map(t => Vw.proj(faceW(p, t[0], t[1]))), w:pr.w});
    } else poly = hull(vs.map(Vw.proj));
    ops.push({d, f:() => {
      S.poly(poly, 'geo c-' + p.cat);
      holes.forEach(h => { if (h.t === 'circle') S.circ(h.c[0], h.c[1], h.r, 'void'); else if (h.t === 'poly') S.poly(h.pts, 'void'); else S.pline(h.pts, 'slot', h.w, 'g'); });
    }});
  }
  return ops;
}
/* кукла: те же цилиндры, по которым её проверяет аудит */
function pupDraw(S, M, pp, u, below) {
  puppetCyl(M, pp.tier, pp.x, pp.z).forEach(c => {
    const under = c.n === 'шкант' || c.n === 'рукоятка' || c.n === 'кулак';
    if (under && !below) return;
    if (c.n === 'кулак') return S.ell(u, (c.y0 + c.y1)/2, c.r, (c.y1 - c.y0)/2, 'ghost', 'd');
    if (c.n === 'голова') return S.ell(u, (c.y0 + c.y1)/2, c.r, (c.y1 - c.y0)/2, 'geo avo');
    S.rect(u - c.r, c.y0, u + c.r, c.y1, 'geo ' + (c.n === 'шкант' ? 'rod' : c.n === 'рукоятка' ? 'handle' : pp.tier === 'upper' ? 'pup-u' : 'pup-l'));
  });
}
function levelChain(S, L, x, fromFor) {
  const segs = [[0, L.y0, null],[L.y0, L.f1, 'Г'],[L.f1, L.c0, 'В'],[L.c0, L.f2, 'Б'],[L.f2, L.t1, 'А'],[L.t1, L.roof, null]];
  segs.forEach(([a, b]) => S.dimV(a, b, x, fmt(b - a), {from:[fromFor(a), fromFor(b)], horiz:true}));
  const wmax = Math.max(...segs.map(([a, b]) => fmt(b - a).length)) * S.fs * .6, xz = x - S.fs*.45 - wmax - S.fs*1.1;
  segs.forEach(([a, b, z]) => { if (z) S.zone(xz, (a + b)/2, z, z === 'А' ? 'cold' : z === 'В' ? 'warm' : ''); });
  S.dimV(0, L.roof, xz - S.fs*1.9, 'всего ' + fmt(L.roof), {from:[fromFor(0), fromFor(L.roof)]});
}
function buildFront(open) {
  const M = model(open ? 180 : 0), L = M.L, W = P.W, ts = T.ts, dw = M.dw, dg = M.dg, S = new Sheet(L.roof/31), f = S.fs;
  const ops = partOps(S, M, VIEWS.front, p => p.group !== 'stand' || true);
  M.pups.forEach(pp => ops.push({d:pp.z, f:() => pupDraw(S, M, pp, pp.x, false)}));
  ops.sort((a, b) => b.d - a.d).forEach(o => o.f());
  const bx0 = open ? -ts - dw : -ts, bx1 = open ? W + ts + dw : W + ts;
  S.line(bx0 - f*9.5, 0, bx1 + f*2, 0, 'ground', 'g');
  S.dimV(L.y0 + dg, L.t1 - dg, bx0 - f*1.6, 'створка ' + fmt(M.dh), {from:bx0});
  levelChain(S, L, bx0 - f*4.2, y => y === 0 ? bx0 : y === L.roof ? W/2 : -ts);
  let y = L.roof + f*1.8;
  S.dimH(0, W, y, 'сцена ' + fmt(W), {from:L.t1}); y += f*2.2;
  S.dimH(-ts, W + ts, y, 'корпус ' + fmt(M.Wout), {from:L.t1});
  if (open) { y += f*2.2; S.dimH(bx0, bx1, y, 'с открытыми створками ' + fmt(bx1 - bx0), {from:L.t1 - dg}); S.dimH(bx0, -ts, L.y0 - f*1.8, 'створка ' + fmt(dw), {from:L.y0 + dg}); }
  S.levels([{y:L.f1, label:'+' + fmt(L.f1) + ' пол нижней сцены', cls:'warm'}, {y:L.f2, label:'+' + fmt(L.f2) + ' пол верхней сцены', cls:'cold'},
    {y:L.t1, label:'+' + fmt(L.t1) + ' верх корпуса'}, {y:L.roof, label:'+' + fmt(L.roof) + ' верх фронтона', from:W/2}], bx1 + f*1.6, W + ts);
  return S;
}
function buildSection() {
  const M = model(180), L = M.L, D = P.D, tp = T.tp, td = T.td, S = new Sheet(L.roof/31), f = S.fs;
  const ops = partOps(S, M, VIEWS.section, p => !(p.id === 'sideR' || p.id === 'doorR' || (p.group === 'doors' && p.rotSign > 0) || (p.assembly && /^hingeR/.test(p.assembly))));
  ops.sort((a, b) => b.d - a.d).forEach(o => o.f());
  M.pups.forEach(pp => pupDraw(S, M, pp, pp.z, true));
  const bx0 = -tp - 2*td, bx1 = D + tp;
  S.line(bx0 - f*9.5, 0, bx1 + f*16, 0, 'ground', 'g');
  levelChain(S, L, bx0 - f*1.6, y => y === 0 ? bx0 : -tp);
  const xr = bx1 + f*1.6;
  [[L.b1, L.f1b, 'Г', ''], [L.f1, L.c0, 'В', 'warm'], [L.c1, L.f2b, 'Б', ''], [L.f2, L.t0, 'А', 'cold']].forEach(([a, b, z, c]) =>
    S.dimV(a, b, xr, fmt(b - a), {from:bx1, side:'right', cls:c, horiz:true}));
  const wr = Math.max(...[P.hG, P.hV, P.hB, P.hA].map(v => fmt(v).length)) * f * .6, xzr = xr + f*.45 + wr + f*1.1;
  [[L.b1, L.f1b, 'Г', ''], [L.f1, L.c0, 'В', 'warm'], [L.c1, L.f2b, 'Б', ''], [L.f2, L.t0, 'А', 'cold']].forEach(([a, b, z, c]) => S.zone(xzr, (a + b)/2, z, c));
  const eL = L.f1 + M.BL.info.eye[1], eU = L.f2 + M.BU.info.eye[1];
  S.levels([{y:eL, label:'+' + fmt(eL) + ' глазки нижней сцены', cls:'warm'}, {y:eU, label:'+' + fmt(eU) + ' глазки верхней сцены', cls:'cold'}], xzr + f*1.7, bx1);
  S.dimH(-tp, D + tp, L.roof + f*1.8, 'корпус ' + fmt(M.Dc), {from:L.t1});
  S.dimH(0, D, L.roof + f*4, 'сцена ' + fmt(D), {from:L.t1});
  S.text(bx0, -f*1.7, '← зритель', {anchor:'end', cls:'ct'});
  S.text(bx1 + f*1.2, -f*1.7, 'кукловоды →', {cls:'ct'});
  return S;
}

/* ---------- лист детали: одна общая функция ---------- */
const VIEW = {
  top:p => ({o:[p.b.x0, p.b.y1, p.b.z0], U:[1,0,0], V:[0,0,1], N:[0,1,0]}),
  front:p => ({o:[p.b.x0, p.b.y0, p.b.z0], U:[1,0,0], V:[0,1,0], N:[0,0,-1]}),
  inner:p => ({o:[p.b.x1, p.b.y0, p.b.z0], U:[0,0,1], V:[0,1,0], N:[1,0,0]})
};
const PRIM_TEXT = {
  lobe:(p, n) => 'щель-петля ' + fmt(p.w) + ' от кулисы' + (n > 1 ? ', ' + n + ' шт' : '') + ', ось по таблице',
  hook:(p) => 'щель ' + fmt(p.w) + ' от кулисы, ось по таблице',
  hatch:(p) => { const e = ext(p.pts); return 'проём ' + fmt(e.maxU[0] - e.minU[0]) + ' × ' + fmt(e.maxV[1] - e.minV[1]) + ': слева трон, справа люк'; },
  arch:(p, n) => { const e = ext(p.pts); return 'арка-кулиса ' + fmt(e.maxU[0] - e.minU[0]) + ' × ' + fmt(e.maxV[1] - e.minV[1]) + ', верх полукругом' + (n > 1 ? ', ' + n + ' шт' : ''); },
  eye:(p, n) => 'глазки Ø' + fmt(p.r*2) + (n > 1 ? ', ' + n + ' шт' : ''), 
  star:() => 'звезда насквозь, вершины в таблице'
};
const neighbourExtremes = c => { const xs = [], ys = [];
  c.nbs.forEach(n => { const e = ext(n.poly); if (e.minU[0] > .05) xs.push(X(e.minU)); if (e.maxU[0] < c.w - .05) xs.push(X(e.maxU)); if (e.minV[1] > .05) ys.push(Y(e.minV)); if (e.maxV[1] < c.h - .05) ys.push(Y(e.maxV)); });
  c.feats.forEach(ft => { xs.push(X(ft.c)); ys.push(Y(ft.c)); }); return {xs, ys}; };
const SPEC = {
  side:{rep:'sideL', view:'inner', asm:c => { const xs = [], ys = [];
    ['bottom','floor1','ceil','floor2','top'].forEach(id => { const n = c.nb(id); if (n) { const e = ext(n.poly); ys.push(Y(e.minV), Y(e.maxV)); } });
    ['floor1','clLf1','backL'].forEach(id => { const n = c.nb(id); if (n) { const e = ext(n.poly); xs.push(X(e.minU)); if (id === 'clLf1') xs.push(X(e.maxU)); } });
    return {xs, ys}; }},
  panel:{rep:'bottom', view:'top', ords:neighbourExtremes},
  'floor-lower':{rep:'floor1', view:'top', ords:c => floorOrds(c), tables:(c, M) => floorTables(M.FL)},
  'floor-upper':{rep:'floor2', view:'top', ords:c => floorOrds(c), tables:(c, M) => floorTables(M.FU)},
  'hatch-half':{rep:'hatchLid', view:'top', ords:neighbourExtremes},
  'back-lower':{rep:'backL', view:'front', ords:c => backOrds(c)},
  'back-upper':{rep:'backU', view:'front', ords:c => backOrds(c)},
  apron:{rep:'apron', view:'front', ords:neighbourExtremes},
  frieze:{rep:'frieze', view:'front', ords:neighbourExtremes},
  'top-fascia':{rep:'topFascia', view:'front', ords:neighbourExtremes},
  door:{rep:'doorL', view:'front', door:0, asm:c => { const xs = [], ys = [];
    c.nbs.filter(n => n.q.name === 'Петля створки' && n.front).forEach(n => { const e = ext(n.poly); ys.push({y:(e.minV[1] + e.maxV[1])/2, from:e.minU[0]}); });
    c.feats.forEach(ft => { xs.push(X(ft.c)); ys.push(Y(ft.c)); }); return {xs, ys}; }},
  'gable-front':{rep:'gableF', view:'front', outline:p => p.face.outline, ords:c => { const xs = [], ys = [], st = c.prims.find(p => p.k === 'star'), G = c.M.gable;
    if (st) { const e = ext(st.pts); xs.push(X(e.maxV)); ys.push(Y(e.maxV)); }
    ys.push({y:G.h1, from:0}); xs.push({x:G.a/2, from:G.h1 + G.s2}, {x:G.a, from:G.h1}); return {xs, ys}; },
    asm:c => { const xs = [], ys = []; c.nbs.forEach(n => { const e = ext(n.poly); xs.push(X(e.minU), X(e.maxU)); ys.push(Y(e.maxV)); }); return {xs, ys}; },
    tables:c => { const st = c.prims.find(p => p.k === 'star'), G = c.M.gable;
      return [{title:'Контур, левая половина (x от левого угла, y от низа): соединить плавной линией, правая — зеркально', cols:['№','x','y'], rows:G.half.map((q, i) => [i + 1, fmt(q[0]), fmt(q[1])])}]
        .concat(st ? [{title:'Вершины звезды (x от левого угла, y от низа), обходить по порядку', cols:['№','x','y'], rows:st.pts.map((q, i) => [i + 1, fmt(q[0]), fmt(q[1])])}] : []); }},
  'gable-bar':{rep:'gableBar', view:'top', ords:c => { const xs = []; c.featPolys.forEach(pl => { const e = ext(pl); xs.push(X(e.minU), X(e.maxU)); }); return {xs, ys:[]}; }},
  rib:{rep:'ribF1', view:'front', ords:() => ({xs:[], ys:[]})},
  cleat:{rep:'clLf1', view:'inner', asm:c => ({xs:c.feats.map(ft => X(ft.c)), ys:[]})}
};
function floorOrds(c) {
  const xs = [], ys = [];
  c.prims.forEach(p => {
    if (p.t === 'poly') { const e = ext(p.pts); xs.push(X(e.minU), X(e.maxU)); ys.push(Y(e.minV), Y(e.maxV)); }
    else if (p.t === 'stroke' && p.k !== 'lock') { const e = ext(p.pts), last = p.pts[p.pts.length - 1];
      xs.push(X(p.pts[0]), X(last), X(e.minU), X(e.maxU)); ys.push(Y(e.minV), Y(last), Y(e.minU), Y(e.maxU)); }
    else if (p.k === 'lock') { xs.push(X(p.pts[0]), X(p.pts[p.pts.length - 1])); ys.push(Y(p.pts[1]), Y(p.pts[p.pts.length - 1])); }
  });
  c.nbs.filter(n => n.front).forEach(n => { const e = ext(n.poly); ys.push(Y(e.minV)); if (n.q.cat === 'decor') ys.push(Y(e.maxV)); });
  return {xs, ys};
}
function floorTables(F) {
  return F.info.tables.map(t => ({title:t.title + ' (x от левого края, z от переднего края)', cols:['№','x','z'], rows:t.pts.map((q, i) => [i + 1, fmt(q[0]), fmt(q[1])])}));
}
function backOrds(c) {
  const xs = [], ys = [];
  c.prims.forEach(p => {
    if (p.t === 'circle') { xs.push(X(p.c)); ys.push(Y(p.c)); }
    else { const e = ext(p.pts); xs.push(X(e.minU), X(e.maxU)); ys.push(Y(e.maxV), Y(p.pts[2])); }
  });
  return {xs, ys};
}
function buildPart(type, thumb, mode) {
  const asm = mode === 'asm';
  if (type === 'puppet') return puppetSheet(thumb);
  const sp = SPEC[type], M = model(sp.door != null ? sp.door : 180), p = M.parts.find(q => q.id === sp.rep), fr = VIEW[sp.view](p, M);
  const pr0 = q => { const d = [q[0] - fr.o[0], q[1] - fr.o[1], q[2] - fr.o[2]]; return [dot(d, fr.U), dot(d, fr.V), dot(d, fr.N)]; };
  const ol0 = sp.outline ? sp.outline(p) : hull(verts(p).map(q => pr0(q).slice(0, 2)));
  const su = Math.min(...ol0.map(q => q[0])), sv = Math.min(...ol0.map(q => q[1]));
  const pr = q => { const r = pr0(q); return [r[0] - su, r[1] - sv, r[2]]; }, uv = q => pr(q).slice(0, 2);
  const outline = ol0.map(q => [q[0] - su, q[1] - sv]);
  const w = Math.max(...outline.map(q => q[0])), h = Math.max(...outline.map(q => q[1]));
  const S = new Sheet(Math.max(w, h)/(thumb ? 30 : 34)), f = S.fs;
  const vp = verts(p), dp = vp.reduce((s, q) => s + pr(q)[2], 0)/vp.length, Aol = Math.abs(area(outline));
  // соседи: всё, что касается детали
  const Cp = convexes(p), nbs = [];
  // соседа берём по его настоящим кускам (задник с арками — без арок, пол с проёмом — без проёма)
  if (asm) M.parts.forEach(q => {
    if (q.id === p.id || q.group === 'stand' || /^light/.test(q.cat)) return;
    convexes(q).forEach(Cq => {
      let c = -Infinity; Cp.forEach(a => { c = Math.max(c, contact(a, Cq)); });
      if (c < -.05) return;
      const vq = Cq.V, poly = clipPoly(hull(vq.map(uv)), hull(outline)), A = Math.abs(area(poly));
      if (poly.length < 3 || A < .02 || A > .9*Aol) return;
      nbs.push({q, poly, front:vq.reduce((s, x) => s + pr(x)[2], 0)/vq.length > dp + 1e-6, A});
    });
  });
  // собственные вырезы детали (только если смотрим на ту грань, где они прорезаны)
  const prims = [];
  if (p.face && Math.abs(dot(p.face.n === 'y' ? [0,1,0] : [0,0,1], fr.N)) > .99)
    p.face.prims.forEach(q => prims.push(q.t === 'circle' ? {t:'circle', k:q.k || q.role, role:q.role, c:uv(faceW(p, q.c[0], q.c[1])), r:q.r}
      : {t:q.t === 'stroke' ? 'stroke' : 'poly', k:q.k || q.role, role:q.role, pts:q.pts.map(t => uv(faceW(p, t[0], t[1]))), w:q.w}));
  // элементы детали (петли — отдельные детали; здесь магниты, пластины, саморезы, отверстия)
  const feats = [], featPolys = [];
  (p.feats || []).forEach(ft => {
    const c3 = V.xform(p, ft.c), c = uv(c3), front = pr(c3)[2] >= dp;
    if (ft.kind === 'bore') { const r = ft.r, d = ft.depth, b = [[-r,0,-r],[r,0,-r],[r,0,r],[-r,0,r],[-r,d,-r],[r,d,-r],[r,d,r],[-r,d,r]].map(o => uv(V.xform(p, [ft.c[0]+o[0], ft.c[1]+o[1], ft.c[2]+o[2]])));
      featPolys.push(hull(b)); return; }
    if (ft.kind === 'screw' && !asm) return;
    feats.push({kind:ft.kind, n:ft.n, c, r:ft.r, front});
  });
  // скрытые рёбра призмы (скат: нижняя пласть короче верхней)
  const hidden = [];
  if (p.prism) {
    const pl = p.prism.poly, n = pl.length, cx = pl.reduce((s, q) => s + q[0], 0)/n, cy = pl.reduce((s, q) => s + q[1], 0)/n;
    const sideN = pl.map((q, i) => { const r = pl[(i + 1) % n]; let nx = r[1] - q[1], ny = -(r[0] - q[0]); if ((q[0] + r[0])/2*nx - cx*nx + ((q[1] + r[1])/2 - cy)*ny < 0) { nx = -nx; ny = -ny; } return [nx, ny, 0]; });
    const vis = v => dot(v, fr.N) > 1e-6;
    pl.forEach((q, i) => { if (!vis(sideN[(i - 1 + n) % n]) && !vis(sideN[i])) { const a = uv([q[0], q[1], p.prism.z0]), b = uv([q[0], q[1], p.prism.z1]); hidden.push([a, b]); } });
    pl.forEach((q, i) => { const r = pl[(i + 1) % n]; [[p.prism.z0, [0,0,-1]], [p.prism.z1, [0,0,1]]].forEach(([z, nz]) => { if (!vis(sideN[i]) && !vis(nz)) hidden.push([uv([q[0], q[1], z]), uv([r[0], r[1], z])]); }); });
  }
  const onOutline = q => outline.some((a, i) => segDist(q, a, outline[(i + 1) % outline.length]) < .01);
  const hid = hidden.filter(([a, b]) => !(onOutline(a) && onOutline(b) && onOutline([(a[0] + b[0])/2, (a[1] + b[1])/2])));
  // рисуем: контур, скрытое пунктиром, вырезы, то что сверху
  S.poly(outline, 'geo face c-' + p.cat);
  nbs.filter(n => !n.front).forEach(n => S.poly(n.poly, 'mark'));
  hid.forEach(([a, b]) => S.line(a[0], a[1], b[0], b[1], 'mark-l', 'g'));
  featPolys.forEach(pl => S.poly(pl, 'mark'));
  prims.forEach(q => { if (q.t === 'circle') S.circ(q.c[0], q.c[1], q.r, 'void'); else if (q.t === 'poly') S.poly(q.pts, 'void'); else S.pline(q.pts, 'slot', q.w, 'g'); });
  prims.filter(q => q.t === 'stroke').forEach(q => S.pline(q.pts, 'slot-cl', null, 'g'));
  nbs.filter(n => n.front).forEach(n => S.poly(n.poly, 'geo onfloor' + (/^back/.test(n.q.cat) ? ' c-' + n.q.cat : '')));
  feats.forEach(ft => { if (ft.kind === 'screw') { S.circ(ft.c[0], ft.c[1], ft.r, 'geo feat'); } else S.circ(ft.c[0], ft.c[1], ft.r, ft.front ? 'geo feat' : 'mark'); });
  if (thumb) return {S, res:{}};
  if (!asm && (type === 'floor-lower' || type === 'floor-upper')) { const F = type === 'floor-lower' ? M.FL : M.FU; F.info.tables.forEach(t => t.pts.forEach(q => { const c = uv(faceW(p, q[0], q[1])); S.circ(c[0], c[1], f*.14, 'cl-pt', 'g'); })); }
  S.datum(0, 0);
  const ctx = {M, p, w, h, nbs, prims, feats, featPolys, hidden:hid, nb:id => nbs.find(n => n.q.id === id)};
  const of = asm ? (sp.asm || neighbourExtremes) : sp.ords, o = of ? of(ctx) : {xs:[], ys:[]};
  const inside = (q, axis) => axis === 'x' ? q.x > .01 && q.x < w - .01 : q.y > .01 && q.y < h - .01;
  const ymin = S.ordX(o.xs.filter(q => inside(q, 'x')), -f*1.4), xmin = S.ordY(o.ys.filter(q => inside(q, 'y')), -f*1.4);
  const top = ext(outline).maxV;
  S.dimH(0, w, Math.min(ymin, 0) - f*1.8, fmt(w), {from:0});
  S.dimV(0, h, Math.min(xmin, 0) - f*1.8, fmt(h), {from:[0, top[0] > .01 ? top[0] : 0]});
  // выноски: соседи по названию, вырезы по виду, элементы по виду, особые пометки
  const items = [], groups = new Map();
  nbs.forEach(n => { const k = n.q.name + (n.front ? '' : ' (пунктир)'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  groups.forEach((g, k) => { const big = g.reduce((m, n) => n.A > m.A ? n : m), c = centroid(big.poly), cnt = new Set(g.map(n => n.q.assembly || n.q.id)).size;
    items.push({x:c[0], y:c[1], text:k.replace(/ \(пунктир\)$/, '') + (cnt > 1 ? ', ' + cnt + ' шт' : '') + (big.front ? '' : ' (пунктир)')}); });
  const pg = new Map(); prims.forEach(q => { const k = q.k; if (!PRIM_TEXT[k]) return; if (!pg.has(k)) pg.set(k, []); pg.get(k).push(q); });
  pg.forEach((g, k) => { const q = g[g.length - 1]; let a;
    if (q.t === 'circle') a = q.c; else if (q.t === 'poly') a = centroid(q.pts); else a = q.pts[Math.round(q.pts.length*.8) - 1];
    items.push({x:a[0], y:a[1], text:PRIM_TEXT[k](q, g.length)}); });
  const fg = new Map(); feats.forEach(ft => { if (!fg.has(ft.kind)) fg.set(ft.kind, []); fg.get(ft.kind).push(ft); });
  fg.forEach(g => { const ft = g[g.length - 1]; items.push({x:ft.c[0], y:ft.c[1], text:ft.n + (g.length > 1 ? ', ' + g.length + ' шт' : '') + (ft.front ? '' : ' (пунктир)')}); });
  featPolys.forEach(pl => { const c = centroid(pl); items.push({x:c[0], y:c[1], text:(p.feats.find(ft => ft.kind === 'bore') || {}).n + ' (пунктир)'}); });
  if (sp.notes) sp.notes(ctx).forEach(n => items.push(n));
  S.callouts(items, w + f*3);
  return {S, res:{tables:!asm && sp.tables ? sp.tables(ctx, M) : []}};
}
/* кукла: габарит, который должна соблюдать любая кукла (по нему же идёт проверка щелей) */
function puppetSheet(thumb) {
  // кукла рисуется в собственных координатах: пол сцены на высоте 0
  const M = model(180), cyl = puppetCyl(M, 'upper', 0, 0), y0 = M.L.f2, s = P.slotW/2, tf = T.tf;
  const S = new Sheet((P.figH + P.handle)/(thumb ? 13 : 15)), f = S.fs, k = n => { const c = cyl.find(q => q.n === n); return {r:c.r, y0:c.y0 - y0, y1:c.y1 - y0}; };
  S.rect(-14, -tf, -s, 0, 'geo c-floor'); S.rect(s, -tf, 14, 0, 'geo c-floor');
  const rod = k('шкант'), hd = k('рукоятка'), disc = k('диск'), body = k('кукла'), head = k('голова'), fist = k('кулак');
  S.rect(-rod.r, rod.y0, rod.r, rod.y1, 'geo rod'); S.rect(-hd.r, hd.y0, hd.r, hd.y1, 'geo handle');
  S.ell(0, (fist.y0 + fist.y1)/2, fist.r, (fist.y1 - fist.y0)/2, 'ghost', 'd');
  S.rect(-disc.r, disc.y0, disc.r, disc.y1, 'geo pup-u'); S.rect(-body.r, body.y0, body.r, body.y1, 'geo pup-u');
  S.ell(0, (head.y0 + head.y1)/2, head.r, (head.y1 - head.y0)/2, 'geo avo');
  if (thumb) return {S, res:{}};
  const top = head.y1, xl = -14 - f*1.4;
  S.dimV(disc.y0, top, xl, 'кукла ' + fmt(top - disc.y0), {from:[-14, 0]});
  S.dimV(hd.y0, hd.y1, hd.r + f*1.4, fmt(hd.y1 - hd.y0), {from:[hd.r, hd.r], side:'right'});
  S.dimV(hd.y0, top, xl - f*2.4, 'всего ' + fmt(top - hd.y0), {from:[-hd.r, 0]});
  S.dimV(head.y0, head.y1, head.r + f*1.4, fmt(head.y1 - head.y0), {from:[head.r, 0], side:'right'});
  S.callouts([
    {x:head.r*.5, y:(head.y0 + head.y1)/2, text:'голова: высота ' + fmt(head.y1 - head.y0) + ', не шире Ø' + fmt(head.r*2)},
    {x:body.r*.5, y:(body.y0 + body.y1)/2, text:'тело, не шире Ø' + fmt(body.r*2)},
    {x:disc.r*.8, y:(disc.y0 + disc.y1)/2, text:'диск Ø' + fmt(disc.r*2) + ' — кукла стоит сама'},
    {x:0, y:-tf/2, text:'щель ' + fmt(P.slotW) + ', сквозь неё шкант Ø' + fmt(rod.r*2)},
    {x:10, y:-tf/2, text:'пол сцены, фанера 9 мм'},
    {x:0, y:(hd.y0 + hd.y1)/2, text:'рукоятка Ø' + fmt(hd.r*2) + ', длина ' + fmt(hd.y1 - hd.y0)}], 14 + f*3);
  return {S, res:{}};
}

/* ---------- сверка листа ---------- */
function boundaryDist(q, r) {
  if (r.t === 'poly') return Math.min(...r.pts.map((a, i) => segDist(q, a, r.pts[(i + 1) % r.pts.length])));
  if (r.t === 'pline') { let d = Infinity; for (let i = 1; i < r.pts.length; i++) d = Math.min(d, segDist(q, r.pts[i-1], r.pts[i])); return Math.min(d, Math.abs(d - r.w/2)); }
  const d = Math.hypot(q[0] - r.c[0], q[1] - r.c[1]);
  if (r.t === 'circ') return Math.min(d, Math.abs(d - r.r));
  const n = Math.hypot((q[0] - r.c[0])/r.rx, (q[1] - r.c[1])/r.ry); return Math.min(d, Math.abs(n - 1)*Math.min(r.rx, r.ry));
}
function insideGeo(q, r) {
  if (r.t === 'poly') return inPoly(q, r.pts) || boundaryDist(q, r) < .06;
  if (r.t === 'pline') { let d = Infinity; for (let i = 1; i < r.pts.length; i++) d = Math.min(d, segDist(q, r.pts[i-1], r.pts[i])); return d <= r.w/2 + .06; }
  if (r.t === 'circ') return Math.hypot(q[0] - r.c[0], q[1] - r.c[1]) <= r.r + .06;
  return Math.hypot((q[0] - r.c[0])/r.rx, (q[1] - r.c[1])/r.ry) <= 1.02;
}
function verify(S, name) {
  const geo = S.rec.filter(r => !ANNO.test(r.cls)), out = {dims:0, callouts:0, problems:[]};
  const on = q => q && q[0] != null && q[1] != null && geo.some(r => boundaryDist(q, r) <= .06);
  const bad = (d, why) => out.problems.push(`${name}: «${d.label}» — ${why}`);
  S.dims.forEach(d => {
    if (d.k === 'co') { out.callouts++; if (!geo.some(r => insideGeo(d.a, r))) bad(d, 'выноска показывает в пустое место'); return; }
    out.dims++;
    const pts = d.k === 'h' || d.k === 'v' ? [d.a, d.b] : [d.a];
    pts.forEach(q => { if (!q || q[0] == null || q[1] == null) bad(d, 'размер не привязан к точке детали'); else if (!on(q)) bad(d, `точка (${fmt(q[0])}; ${fmt(q[1])}) не лежит на нарисованной геометрии`); });
    const meas = d.k === 'h' ? Math.abs(d.b[0] - d.a[0]) : d.k === 'v' ? Math.abs(d.b[1] - d.a[1]) : d.k === 'ox' ? d.a[0] : d.a[1];
    if (Math.abs(meas - Math.abs(d.v)) > .01) bad(d, `подписано ${fmt(d.v)}, а по точкам ${fmt(meas)}`);
    const want = (d.k === 'lvl' ? '+' : '') + fmt(Math.abs(d.v));
    if (!String(d.label).includes(want)) bad(d, `в подписи нет числа ${want}`);
  });
  return out;
}
function verifyAll() {
  const sheets = [['Л1 фасад, створки открыты', buildFront(true)], ['Л1 фасад, створки закрыты', buildFront(false)], ['Л2 разрез', buildSection()]];
  const types = V.partTypes(model(180));
  types.forEach((t, i) => sheets.push([`Д${i + 1} ${t.name}`, t.id === 'puppet' ? puppetSheet(false).S : buildPart(t.id, false).S]));
  V.STEPS.forEach((s, i) => (s.sheets || []).forEach(id => sheets.push([`Сборка, шаг ${i + 1}: ${id}`, buildPart(id, false, 'asm').S])));
  const tot = {sheets:sheets.length, dims:0, callouts:0, problems:[]};
  sheets.forEach(([n, S]) => { const r = verify(S, n); tot.dims += r.dims; tot.callouts += r.callouts; tot.problems.push(...r.problems); });
  // одна заготовка — одна карточка: две карточки с одинаковой заготовкой — ошибка (partTypes должен был их склеить)
  const seen = new Map();
  types.forEach(t => { const k = V.blankSig(t); if (!k) return; if (seen.has(k)) tot.problems.push(`одинаковая заготовка на двух листах: «${seen.get(k)}» и «${t.name}»`); else seen.set(k, t.name); });
  return tot;
}

/* ---------- вывод ---------- */
function front(svg, open) { buildFront(open).out(svg); }
function section(svg) { buildSection().out(svg); }
function part(svg, type, thumb) {
  const r = type === 'puppet' ? puppetSheet(thumb) : buildPart(type, thumb);
  r.S.out(svg, thumb ? r.S.fs*.6 : r.S.fs*1.4);
  return r.res;
}
function asmSheet(svg, type) { const r = buildPart(type, false, 'asm'); r.S.out(svg, r.S.fs*1.4); return r.res; }
window.VD = {Sheet, spread, front, section, part, asmSheet, verify, verifyAll, buildFront, buildSection, buildPart};
})();
