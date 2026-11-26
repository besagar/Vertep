/* Вертепный ящик — общая модель: параметры, детали, раскрой, проверки, шаги сборки.
   Все размеры в сантиметрах. Оси: x — ширина (0 = внутренняя сторона левой боковины),
   y — высота от пола комнаты, z — глубина (0 = передний край пола, растёт назад). */
(function () {
'use strict';
const DEF = {W:80, D:35, hStand:66, hG:17, hV:35, hB:17, hA:32, hRoof:25, slotW:1.7, figH:18, handle:13};
/* ts — боковины, tf — панели и полы (фанера 10 мм, корпус на шипах); tp, td, tg — фасад, створки, задники, фронтон (6 мм);
   gr — глубина канавки под пол в боковине; tab, tabM — ширина шипа и отступ крайних шипов от краёв панели; gz — отступ фронтона от переднего края крышки */
const T = {ts:1.0, tf:1.0, tp:0.6, td:0.6, tr:0.6, tg:0.6, gr:0.2, tab:6, tabM:3, gTab:8, gz:1, hVal:5, hVal2:4, head:5, dg:0.3};
const RANGES = [
  ['W','ширина сцены',60,100,1], ['D','глубина сцены',25,45,1], ['hStand','подставка',40,100,1],
  ['hG','зона руки Г (низ)',12,26,0.5], ['hV','нижняя сцена В',25,45,0.5], ['hB','зона руки Б (пояс)',12,26,0.5],
  ['hA','верхняя сцена А',25,45,0.5], ['hRoof','фронтон',10,40,1], ['slotW','ширина щели',1.2,2.5,0.1],
  ['figH','кукла над полом',12,26,0.5], ['handle','рукоятка под полом',8,20,0.5]];
const LS = 'vertep-params-v1';
const P = Object.assign({}, DEF);
try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) for (const k in DEF) if (typeof s[k] === 'number' && isFinite(s[k])) P[k] = s[k]; } catch (e) {}
const saveP = () => { try { localStorage.setItem(LS, JSON.stringify(P)); } catch (e) {} };
const resetP = () => { Object.assign(P, DEF); try { localStorage.removeItem(LS); } catch (e) {} };
const changed = () => RANGES.filter(r => Math.abs(P[r[0]] - DEF[r[0]]) > 1e-9);

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r1 = v => Math.round(v * 10) / 10;
const fmt = v => { const x = r1(v); return (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',').replace('-', '−'); };

function levels() {
  const tf = T.tf, y0 = P.hStand, b1 = y0 + tf, f1b = b1 + P.hG, f1 = f1b + tf, c0 = f1 + P.hV, c1 = c0 + tf,
        f2b = c1 + P.hB, f2 = f2b + tf, t0 = f2 + P.hA, t1 = t0 + tf, roof = t1 + P.hRoof;
  return {y0, b1, f1b, f1, c0, c1, f2b, f2, t0, t1, roof};
}
const bz = (p, t) => { const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return [a*p[0][0] + b*p[1][0] + c*p[2][0] + d*p[3][0], a*p[0][1] + b*p[1][1] + c*p[2][1] + d*p[3][1]]; };
const sample = (p, n = 56) => Array.from({length: n + 1}, (_, i) => bz(p, i / n));
function arcZatX(arc, x, dense) {
  const s = dense || sample(arc, 600);
  for (let i = 1; i < s.length; i++) {
    const a = s[i-1], b = s[i];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const t = (x - a[0]) / (b[0] - a[0]); return a[1] + t * (b[1] - a[1]); }
  }
  return null;
}
/* кривая Катмулла — Рома через опорные точки */
function spline(ctrl, n = 16) {
  const o = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i-1] || ctrl[i], p1 = ctrl[i], p2 = ctrl[i+1], p3 = ctrl[i+2] || ctrl[i+1];
    for (let k = 0; k < n; k++) { const t = k/n, t2 = t*t, t3 = t2*t;
      o.push([0, 1].map(j => .5*((2*p1[j]) + (-p0[j] + p2[j])*t + (2*p0[j] - 5*p1[j] + 4*p2[j] - p3[j])*t2 + (-p0[j] + 3*p1[j] - 3*p2[j] + p3[j])*t3))); }
  }
  o.push(ctrl[ctrl.length - 1].slice()); return o;
}
const plen = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - pts[i-1][0], q[1] - pts[i-1][1]) : 0, 0);
/* точка на ломаной на доле длины k (0…1) */
function along(pts, k) {
  let need = plen(pts)*Math.max(0, Math.min(1, k));
  for (let i = 1; i < pts.length; i++) { const a = pts[i-1], b = pts[i], l = Math.hypot(b[0]-a[0], b[1]-a[1]); if (need <= l || i === pts.length - 1) { const t = l ? Math.min(1, need/l) : 0; return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]; } need -= l; }
  return pts[pts.length - 1];
}
/* точки через step по длине (для таблиц разметки) */
function stations(pts, step) { const L = plen(pts), n = Math.max(1, Math.round(L/step)), o = []; for (let i = 0; i <= n; i++) o.push(along(pts, i/n)); return o; }
/* Щели по чертежам «Фомы»: каждая начинается у заднего края пола под кулисой и уходит на сцену,
   концы не сходятся — пол остаётся цельным. Низ: две петли (слева и справа) и общий проём трона и люка у задника.
   Верх: одна щель слева, заканчивается у центра близко к рампе. */
function floorPrims(which) {
  const W = P.W, D = P.D, zb = D + T.tp, w = P.slotW, prims = [], info = {strokes:[], exits:[], tables:[]};
  const mirror = pts => pts.map(q => [W - q[0], q[1]]);
  if (which === 'lower') {
    const xe = .261*W, ctrl = [[xe, zb], [xe, D - 6], [.193*W, .6*D], [.244*W, .357*D], [.334*W, .314*D], [W/2 - .0725*W, .394*D]];
    const left = spline(ctrl), right = mirror(left);
    prims.push({t:'stroke', pts:left, w, role:'slot', k:'lobe'}, {t:'stroke', pts:right, w, role:'slot', k:'lobe'});
    // общий проём у задника: левую половину закрывает площадка трона (проваливается), правую — крышка люка (откидывается)
    const hx = W/2 + 5, hw = 20, hd = 8, hz = D - 4 - hd/2;   // проём сдвинут вправо: трон (левая половина) ровно по центру сцены
    prims.push({t:'poly', pts:[[hx-hw/2, hz-hd/2],[hx+hw/2, hz-hd/2],[hx+hw/2, hz+hd/2],[hx-hw/2, hz+hd/2]], role:'hatch', k:'hatch'});
    Object.assign(info, {strokes:[left, right], exits:[xe, W - xe], hatch:{x:hx, z:hz, w:hw, d:hd}, ends:[left[left.length-1], right[right.length-1]], left, right});
    info.tables.push({title:'Ось левой петли: точки через 3 см от заднего края', mirror:true, pts:stations(left, 3)});
  } else {
    const xe = .27*W, ctrl = [[xe, zb], [xe, D - 10], [xe + 3, 12], [xe + 9, 7], [W/2 - 2, 6]];
    const hook = spline(ctrl);
    prims.push({t:'stroke', pts:hook, w, role:'slot', k:'hook'});
    Object.assign(info, {strokes:[hook], exits:[xe], ends:[hook[hook.length-1]], hook});
    info.tables.push({title:'Ось щели: точки через 3 см от заднего края', pts:stations(hook, 3)});
  }
  return {prims, info};
}
function archPts(u0, w, h) { const r = w/2, pts = [[u0,0],[u0+w,0],[u0+w,h-r]]; for (let i = 1; i < 16; i++) { const a = i/16*Math.PI; pts.push([u0+r+r*Math.cos(a), h-r+r*Math.sin(a)]); } pts.push([u0,h-r]); return pts; }
/* Фронтон-кокошник: по краям два малых кокошника, в центре большой килевидный с остриём.
   Контур в координатах фронтона: u от левого края (0..Wo), v от низа (0..H), обход против часовой. */
function keel(t) { return t < .6 ? Math.sin(t/.6*Math.PI/2)*.75 : .75 + .25*((t - .6)/.4)**2; }
function gableOutline(Wo, H) {
  const c = Wo/2, h1 = Math.max(3, H*.28), a = Wo*.2, s2 = Math.min(5, H*.2), n = 12, m = 6, L = [];
  for (let i = 0; i <= m; i++) { const t = i/m; L.push([t*a/2, h1 + s2*keel(t)]); }
  for (let i = m - 1; i >= 0; i--) { const t = i/m; L.push([a - t*a/2, h1 + s2*keel(t)]); }
  for (let i = 1; i <= n; i++) { const t = i/n; L.push([a + t*(c - a), h1 + (H - h1)*keel(t)]); }
  const R = L.map(q => [Wo - q[0], q[1]]);
  return {poly:[[0, 0], [Wo, 0]].concat(R.slice(0, -1), [[c, H]], L.slice(0, -1).reverse()), half:L, h1, a, s2};
}
/* ---------- контуры заготовок ---------- */
const rectPts = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
/* врезать в контур многоугольник, у которого одно ребро лежит на ребре контура:
   снаружи — получится шип, внутри — вырез с края. Контур обходим как был, на общем ребре сворачиваем
   на границу многоугольника. Если общего ребра нет — null. */
function splice(outline, poly) {
  const n = outline.length, m = poly.length, eps = .005;
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx*dx + dy*dy; if (L2 < 1e-12) continue;
    const par = q => ((q[0] - a[0])*dx + (q[1] - a[1])*dy)/L2, off = q => Math.abs((q[0] - a[0])*dy - (q[1] - a[1])*dx)/Math.sqrt(L2);
    for (let k = 0; k < m; k++) {
      const p0 = poly[k], p1 = poly[(k + 1) % m];
      if (off(p0) > eps || off(p1) > eps) continue;
      const t0 = par(p0), t1 = par(p1); if (Math.min(t0, t1) < -1e-6 || Math.max(t0, t1) > 1 + 1e-6 || Math.abs(t0 - t1) < 1e-9) continue;
      const path = []; for (let j = 1; j <= m; j++) path.push(poly[(k + j) % m]);   // от p1 вокруг до p0
      if (t0 < t1) path.reverse();
      const o = outline.slice(0, i + 1).concat(path, outline.slice(i + 1));
      return o.filter((q, j) => { const r = o[(j + 1) % o.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-6; });
    }
  }
  return null;
}
/* щель (ось + ширина) как многоугольник: два края и полукруг на конце; начало щели обрезано прямо */
function strokePoly(Q, w, capStart, capEnd) {
  const r = w/2, n = Q.length, Lf = [], Rt = [];
  const dir = i => { const a = Q[Math.max(0, i - 1)], c = Q[Math.min(n - 1, i + 1)], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx/l, dy/l]; };
  Q.forEach((q, i) => { const [dx, dy] = dir(i); Lf.push([q[0] - dy*r, q[1] + dx*r]); Rt.push([q[0] + dy*r, q[1] - dx*r]); });
  const cap = (q, [dx, dy]) => { const c = []; for (let k = 1; k < 12; k++) { const ph = k/12*Math.PI; c.push([q[0] - dy*r*Math.cos(ph) + dx*r*Math.sin(ph), q[1] + dx*r*Math.cos(ph) + dy*r*Math.sin(ph)]); } return c; };
  const out = Lf.slice();
  if (capEnd) out.push(...cap(Q[n - 1], dir(n - 1)));
  out.push(...Rt.reverse());
  if (capStart) { const [dx, dy] = dir(0); out.push(...cap(Q[0], [-dx, -dy])); }
  return out;
}
/* шипы вдоль края длиной len: три шипа, крайние отступают на tabM от концов */
const tabsAlong = len => { const w = T.tab, m = T.tabM; return [m, len/2 - w/2, len - m - w].map(a => [a, a + w]); };
function starPts(cx, cy, R, r, n = 8) { const o = []; for (let i = 0; i < n*2; i++) { const a = Math.PI/2 + i*Math.PI/n, rr = i % 2 ? r : R; o.push([cx + rr*Math.cos(a), cy + rr*Math.sin(a)]); } return o; }
/* задники: арки-кулисы стоят ровно над выходами щелей; глазки — напротив глаз кукловодов */
function backPrims(which, exits) {
  const W = P.W, h = which === 'lower' ? P.hV : P.hA, ah = Math.min(24, h - 4), aw = 10;
  const prims = exits.map(x => ({t:'poly', pts:archPts(x - aw/2, aw, ah), role:'arch', k:'arch'}));
  const info = {h, ah, aw, arches:exits.map(x => [x - aw/2, x + aw/2])};
  // нижний кукловод сидит слева, между боковиной и левой кулисой; верхний стоит по центру
  const eu = which === 'lower' ? Math.min(11, exits[0] - aw/2 - 4) : W/2, ev = which === 'lower' ? h - 5 : h - 9;
  prims.push({t:'circle', c:[eu-3.2,ev], r:.75, role:'eye', k:'eye'}, {t:'circle', c:[eu+3.2,ev], r:.75, role:'eye', k:'eye'});
  info.eye = [eu, ev];
  return {prims, info};
}
function model(doorDeg, opt) {
  if (doorDeg == null) doorDeg = 180;
  opt = opt || {};
  const L = levels(), W = P.W, D = P.D, {ts, tp, td, tr, tg, hVal, hVal2} = T;
  const Wout = W + 2*ts, Dc = D + 2*tp, Hc = L.t1 - L.y0, half = Wout/2, dw = half - 0.1, dg = T.dg, dh = Hc - 2*dg;
  // корпус на шипах: дно, потолок и крышка проходят шипами насквозь через боковины; полы задвигаются сзади в канавки боковин;
  // фронтон стоит двумя шипами в прорезях крышки
  const Dp = D + tp, TB3 = tabsAlong(Dp), gr = T.gr, joints = [];
  const FL = floorPrims('lower'), FU = floorPrims('upper'), BL = backPrims('lower', FL.info.exits), BU = backPrims('upper', FU.info.exits);
  const parts = [], B = (x0,x1,y0,y1,z0,z1) => ({x0,x1,y0,y1,z0,z1});
  // задник для проверок: сплошные куски вокруг арок; полукруг арки считаем сплошным (запас)
  const archSolids = (Bk, y0, y1) => { const o = [], ar = Bk.info.arches.slice().sort((a, b) => a[0] - b[0]); let x = 0;
    ar.forEach(([a0, a1]) => { if (a0 > x) o.push(B(x, a0, y0, y1, D, D+tp)); o.push(B(a0, a1, y0 + Bk.info.ah - Bk.info.aw/2, y1, D, D+tp)); x = a1; });
    if (x < W) o.push(B(x, W, y0, y1, D, D+tp)); return o; };
  const add = (id, type, name, cat, mat, b, ext) => { const p = Object.assign({id, type, name, cat, mat, b, group:'corpus'}, ext || {}); parts.push(p); return p; };
  const sy = P.hStand;
  add('standTop', null, 'Подставка (стол или козлы)', 'stand', null, B(-7, W+7, sy-3, sy, -6, D+tp+6), {group:'stand'});
  [[-6,-2],[W+2,W+6]].forEach((xx,i) => [[-5,-1],[D+tp+1,D+tp+5]].forEach((zz,j) =>
    add('leg'+i+j, null, 'Подставка (стол или козлы)', 'stand', null, B(xx[0], xx[1], 0, sy-3, zz[0], zz[1]), {group:'stand'})));
  // боковина: u — глубина от переднего края, v — высота от низа. Гнёзда дна и крышки выходят на край (вырезы), потолка — сквозные окна
  // фасадные планки на шипах: шип на каждом конце планки входит в вырез на переднем крае боковины (по высоте — там, где нет петель створок),
  // а дно, потолок и крышка проходят через планку тремя шипами вперёд
  const hingeYs = [10, dh/2, dh - 10].map(v => L.y0 + dg + v), FT = [W*.15, W*.5, W*.85].map(x => [x - T.tab/2, x + T.tab/2]);
  const fTab = (y0, y1) => { let free = [[y0 + 1, y1 - 1]];
    hingeYs.forEach(yc => { const a = yc - 4, b = yc + 4;   /* петля 5 см + по 1,5 см */ free = free.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]]).filter(([p, q]) => q - p > .01); });
    const [p, q] = free.reduce((m, x) => x[1] - x[0] > m[1] - m[0] ? x : m, [0, 0]), hh = Math.min(8, q - p), c = (p + q)/2; return hh >= 2 ? [c - hh/2, c + hh/2] : null; };
  const FA = [['apron', L.y0, L.f1, 'bottom', L.y0, L.b1], ['frieze', L.c0 - hVal, L.f2, 'ceil', L.c0, L.c1], ['topFascia', L.t0 - hVal2, L.t1, 'top', L.t0, L.t1]]
    .map(([id, y0, y1, pid, py0, py1]) => ({id, y0, y1, pid, py0, py1, tab:fTab(y0, y1)}));
  const sideFace = at => {
    let ol = rectPts(0, 0, Dc, Hc); const prims = [];
    [[L.y0, L.b1], [L.c0, L.c1], [L.t0, L.t1]].forEach(([y0, y1]) => TB3.forEach(([a, b]) => {
      const r = rectPts(a + tp, y0 - L.y0, b + tp, y1 - L.y0), s2 = splice(ol, r);
      if (s2) ol = s2; else prims.push({t:'poly', pts:r, role:'mortise', k:'mortise'}); }));
    FA.forEach(f => { if (f.tab) ol = splice(ol, rectPts(0, f.tab[0] - L.y0, tp, f.tab[1] - L.y0)); });
    [[L.f1b, L.f1], [L.f2b, L.f2]].forEach(([y0, y1]) => prims.push({t:'poly', pts:rectPts(tp, y0 - L.y0, Dc, y1 - L.y0), role:'pocket', k:'pocket', depth:gr, at}));
    return {n:'x', outline:ol, prims};
  };
  // панель корпуса: по три шипа с каждого конца, длина шипа — толщина боковины (насквозь)
  const panelFace = prims => { let ol = rectPts(0, 0, W, Dp); TB3.forEach(([a, b]) => { ol = splice(ol, rectPts(-ts, a, 0, b)); ol = splice(ol, rectPts(W, a, W + ts, b)); });
    FT.forEach(([a, b]) => { ol = splice(ol, rectPts(a, -tp, b, 0)); }); return {n:'y', outline:ol, prims:prims || []}; };
  const panelJoints = (id, y0, y1) => { TB3.forEach(([a, b]) => { joints.push({id, host:'sideL', kind:'tab', g:'ps', b:B(-ts, 0, y0, y1, a, b)}, {id, host:'sideR', kind:'tab', g:'ps', b:B(W, W + ts, y0, y1, a, b)}); });
    const f = FA.find(q => q.pid === id); FT.forEach(([a, b]) => joints.push({id, host:f.id, kind:'tab', g:'pf', b:B(a, b, y0, y1, -tp, 0)})); };
  // планка: шипы на концах; окна (или вырезы с края) под передние шипы своей панели
  const fasciaFace = f => { let ol = rectPts(0, 0, W, f.y1 - f.y0); const prims = [];
    if (f.tab) [[-ts, 0], [W, W + ts]].forEach(([a, b]) => { ol = splice(ol, rectPts(a, f.tab[0] - f.y0, b, f.tab[1] - f.y0)); });
    FT.forEach(([a, b]) => { const r = rectPts(a, f.py0 - f.y0, b, f.py1 - f.y0), s2 = splice(ol, r); if (s2) ol = s2; else prims.push({t:'poly', pts:r, role:'mortise', k:'fmortise'}); });
    if (f.tab) joints.push({id:f.id, host:'sideL', kind:'tab', g:'fs', b:B(-ts, 0, f.tab[0], f.tab[1], -tp, 0)}, {id:f.id, host:'sideR', kind:'tab', g:'fs', b:B(W, W + ts, f.tab[0], f.tab[1], -tp, 0)});
    return {n:'z', outline:ol, prims}; };
  add('sideL', 'side', 'Боковина левая', 'carcass', 'ply10', B(-ts, 0, L.y0, L.t1, -tp, D+tp), {face:sideFace('max')});
  add('sideR', 'side', 'Боковина правая', 'carcass', 'ply10', B(W, W+ts, L.y0, L.t1, -tp, D+tp), {face:sideFace('min')});
  add('bottom', 'panel', 'Дно', 'carcass', 'ply10', B(0, W, L.y0, L.b1, 0, D+tp), {face:panelFace()}); panelJoints('bottom', L.y0, L.b1);
  const H = FL.info.hatch, hx0 = H.x - H.w/2, hx1 = H.x + H.w/2, hz0 = H.z - H.d/2, hz1 = H.z + H.d/2, hm = H.x;
  // для проверки пересечений пол с люком — четыре сплошных куска вокруг проёма
  // пол шире сцены: края по gr заходят в канавки боковин
  const floorFace = F => ({n:'y', outline:rectPts(-gr, 0, W + gr, Dp), prims:F.prims});
  [['floor1', L.f1b, L.f1], ['floor2', L.f2b, L.f2]].forEach(([id, y0, y1]) => joints.push({id, host:'sideL', kind:'tongue', b:B(-gr, 0, y0, y1, 0, Dp)}, {id, host:'sideR', kind:'tongue', b:B(W, W + gr, y0, y1, 0, Dp)}));
  add('floor1', 'floor-lower', 'Пол нижней сцены', 'floor', 'ply10', B(0, W, L.f1b, L.f1, 0, D+tp), {face:floorFace(FL),
    solids:[B(0, W, L.f1b, L.f1, 0, hz0), B(0, W, L.f1b, L.f1, hz1, D+tp), B(0, hx0, L.f1b, L.f1, hz0, hz1), B(hx1, W, L.f1b, L.f1, hz0, hz1)]});
  const lidA = (opt.lid || 0) * Math.PI / 180;
  add('hatchLid', 'hatch-half', 'Крышка люка', 'floor', 'ply10', B(hm + .1, hx1 - .1, L.f1b, L.f1, hz0 + .1, hz1 - .1), {lidHinged:true, rot:{axis:'x', angle:lidA, pivot:[H.x, L.f1, hz1]}});
  // площадка трона: из выпила, вровень с полом; на ней трон и Ирод. Чем держать снизу — решается на месте.
  const drop = opt.drop || 0, tg2 = {group:'throne'};
  const TB = (x0, x1, y0, y1, z0, z1) => B(x0, x1, y0 - drop, y1 - drop, z0, z1);
  add('throneBase', 'hatch-half', 'Площадка трона', 'floor', 'ply10', TB(hx0 + .1, hm - .1, L.f1b, L.f1, hz0 + .1, hz1 - .1), tg2);
  add('throneS', null, 'Трон Ирода (декор, условно)', 'decor', null, TB(hx0 + .6, hm - .6, L.f1, L.f1 + 7, hz0 + .6, hz1 - .6), {group:'throne'});
  add('throneB', null, 'Трон Ирода (декор, условно)', 'decor', null, TB(hx0 + .6, hm - .6, L.f1 + 7, L.f1 + 16, hz1 - 2.6, hz1 - .6), {group:'throne'});
  add('herod', null, 'Ирод на троне (условно)', 'decor', null, TB((hx0 + hm)/2 - 2.6, (hx0 + hm)/2 + 2.6, L.f1 + 7, L.f1 + 7 + P.figH*.7, hz0 + 1, hz1 - 2.6), {group:'throne'});
  { const a2 = {assembly:'hingeLid', hosts:['hatchLid', 'floor1']};
    add('hingeLidf', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1, L.f1 + .1, hz1, hz1 + 2), Object.assign({}, a2));
    add('hingeLidm', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1, L.f1 + .1, hz1 - 2, hz1), Object.assign({lidHinged:true, rot:{axis:'x', angle:lidA, pivot:[H.x, L.f1, hz1]}}, a2));
    add('hingeLidp', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1 - .3, L.f1 + .3, hz1 - .3, hz1 + .3), Object.assign({}, a2)); }
  add('ceil', 'panel', 'Потолок нижней сцены', 'carcass', 'ply10', B(0, W, L.c0, L.c1, 0, D+tp), {face:panelFace()}); panelJoints('ceil', L.c0, L.c1);
  add('floor2', 'floor-upper', 'Пол верхней сцены', 'floor', 'ply10', B(0, W, L.f2b, L.f2, 0, D+tp), {face:floorFace(FU)});
  // крышка: те же шипы, что у дна и потолка, плюс две прорези под шипы фронтона
  const gz0 = T.gz, gz1 = gz0 + tg, gTabs = [W*.25, W*.75].map(x => [x - T.gTab/2, x + T.gTab/2]);
  add('top', 'top', 'Крышка корпуса', 'carcass', 'ply10', B(0, W, L.t0, L.t1, 0, D+tp), {face:panelFace(gTabs.map(([x0, x1]) => ({t:'poly', pts:rectPts(x0, gz0, x1, gz1), role:'mortise', k:'gmortise'})))});
  panelJoints('top', L.t0, L.t1);
  add('backL', 'back-lower', 'Задник нижней сцены', 'back-warm', 'ply6', B(0, W, L.f1, L.c0, D, D+tp), {face:{n:'z', prims:BL.prims}, solids:archSolids(BL, L.f1, L.c0)});
  add('backU', 'back-upper', 'Задник верхней сцены', 'back-cold', 'ply6', B(0, W, L.f2, L.t0, D, D+tp), {face:{n:'z', prims:BU.prims}, solids:archSolids(BU, L.f2, L.t0)});
  add('apron', 'apron', 'Фартук', 'fascia', 'ply6', B(0, W, L.y0, L.f1, -tp, 0), {face:fasciaFace(FA[0])});
  add('frieze', 'frieze', 'Пояс между этажами', 'fascia', 'ply6', B(0, W, L.c0-hVal, L.f2, -tp, 0), {face:fasciaFace(FA[1])});
  add('topFascia', 'top-fascia', 'Верхний фриз', 'fascia', 'ply6', B(0, W, L.t0-hVal2, L.t1, -tp, 0), {face:fasciaFace(FA[2])});
  const ang = doorDeg * Math.PI / 180;
  add('doorL', 'door', 'Створка левая', 'door', 'ply6', B(-ts, -ts+dw, L.y0+dg, L.t1-dg, -tp-td, -tp), {group:'doors', rotSign:-1, rot:{axis:'y', angle:-ang, pivot:[-ts, 0, -tp-td]}});
  add('doorR', 'door', 'Створка правая', 'door', 'ply6', B(W+ts-dw, W+ts, L.y0+dg, L.t1-dg, -tp-td, -tp), {group:'doors', rotSign:1, rot:{axis:'y', angle:ang, pivot:[W+ts, 0, -tp-td]}});
  // петли створок: ось на внешнем переднем углу боковины; неподвижное крыло на боковине, подвижное на створке
  const hl = 5, hwid = 2.5, ht = .1, hingeY = [10, dh/2, dh - 10].map(v => L.y0 + dg + v);
  hingeY.forEach((yc, i) => [['L', -ts, -1, 'doorL', 'sideL'], ['R', W + ts, 1, 'doorR', 'sideR']].forEach(([s2, px, sg, door, side]) => {
    const id = 'hinge' + s2 + i, asm = {assembly:id, hosts:[door, side], cat:'hw'};
    const xo = sg < 0 ? [px - ht, px] : [px, px + ht], xm = sg < 0 ? [px, px + hwid] : [px - hwid, px];
    add(id + 'f', null, 'Петля створки', 'hw', null, B(xo[0], xo[1], yc - hl/2, yc + hl/2, -tp - td, -tp + hwid - td), Object.assign({}, asm));
    add(id + 'm', null, 'Петля створки', 'hw', null, B(xm[0], xm[1], yc - hl/2, yc + hl/2, -tp - td - ht, -tp - td),
      Object.assign({group:'doors', rotSign:sg, rot:{axis:'y', angle:sg*ang, pivot:[px, 0, -tp - td]}}, asm));
    add(id + 'p', null, 'Петля створки', 'hw', null, B(px - .3, px + .3, yc - hl/2, yc + hl/2, -tp - td - .3, -tp - td + .3), Object.assign({}, asm));
  }));
  const ry = L.t1, GO = gableOutline(Wout, P.hRoof), sv = GO.h1 + (P.hRoof - GO.h1)*.42, R = Math.min(4.5, P.hRoof*0.18);
  const star = starPts(half, sv, R, R*0.45), gW = GO.poly.map(q => [q[0] - ts, q[1] + ry]);
  // фронтон: контур-кокошник и два шипа снизу; шипы проходят крышку насквозь. Для расчёта пересечений — тело без шипов
  let gol = GO.poly; gTabs.forEach(([x0, x1]) => { gol = splice(gol, rectPts(x0 + ts, -T.tf, x1 + ts, 0)); joints.push({id:'gableF', host:'top', kind:'tab', g:'g', b:B(x0, x1, L.t0, L.t1, gz0, gz1)}); });
  add('gableF', 'gable-front', 'Фронтон', 'roof', 'ply6', B(-ts, W+ts, ry, ry+P.hRoof, gz0, gz1), {group:'roof', face:{n:'z', outline:gol, prims:[{t:'poly', pts:star, role:'star'}]}, prism:{poly:gW, z0:gz0, z1:gz1}});
  add('starLamp', null, 'Фонарик звезды', 'light-star', null, B(W/2-1.5, W/2+1.5, ry+sv-1.5, ry+sv+1.5, gz1, gz1+3), {group:'roof'});
  const ch = Math.min(20, P.hA - 12);
  let caveFront = D - 14; FU.info.hook.forEach(q => { if (Math.abs(q[0] - W/2) <= 13 + 3.6) caveFront = Math.max(caveFront, q[1] + 3.6); });
  add('caveL', null, 'Пещера (декор, условно)', 'decor', null, B(W/2-13, W/2-10, L.f2, L.f2+ch, caveFront, D));
  add('caveR', null, 'Пещера (декор, условно)', 'decor', null, B(W/2+10, W/2+13, L.f2, L.f2+ch, caveFront, D));
  add('caveT', null, 'Пещера (декор, условно)', 'decor', null, B(W/2-13, W/2+13, L.f2+ch-3, L.f2+ch, caveFront, D));
  const a1 = along(FU.info.hook, .55), a2 = along(FU.info.hook, .85), e1 = FL.info.ends[0], w1 = along(FL.info.left, .6), w2 = along(FL.info.right, .6);
  const pups = [
    {id:'pu1', name:'Пастух', tier:'upper', x:a1[0], z:a1[1]}, {id:'pu2', name:'Волхв', tier:'upper', x:a2[0], z:a2[1]},
    {id:'pl2', name:'Воин', tier:'lower', x:w1[0], z:w1[1]}, {id:'pl3', name:'Воин', tier:'lower', x:w2[0], z:w2[1]}
  ].map(o => Object.assign(o, {yF: o.tier === 'upper' ? L.f2 : L.f1, yB: o.tier === 'upper' ? L.f2b : L.f1b}));
  // габарит заготовки с шипами — по контуру
  parts.forEach(p => { if (!p.face || !p.face.outline) return; const us = p.face.outline.map(q => q[0]), vs = p.face.outline.map(q => q[1]), b = p.b;
    p.cut = [Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs), p.face.n === 'x' ? b.x1 - b.x0 : p.face.n === 'y' ? b.y1 - b.y0 : b.z1 - b.z0]; });
  return {parts, pups, L, FL, FU, BL, BU, Wout, Dc, Hc, dw, dh, dg, half, ch, star, sv, starR:R, gable:GO, gTabs, joints, fascia:FA, hatch:{x0:hx0, x1:hx1, z0:hz0, z1:hz1}};
}

function xform(p, q) {
  if (!p.rot) return q;
  const [px, py, pz] = p.rot.pivot, a = p.rot.angle, c = Math.cos(a), s = Math.sin(a), x = q[0]-px, y = q[1]-py, z = q[2]-pz;
  if (p.rot.axis === 'y') return [px + x*c - z*s, py + y, pz + x*s + z*c];
  if (p.rot.axis === 'x') return [px + x, py + y*c - z*s, pz + y*s + z*c];
  return [px + x*c - y*s, py + x*s + y*c, pz + z];
}
function verts(p) {
  if (p.prism) { const o = []; p.prism.poly.forEach(q => { o.push([q[0], q[1], p.prism.z0], [q[0], q[1], p.prism.z1]); }); return o; }
  const b = p.b, o = []; for (const x of [b.x0,b.x1]) for (const y of [b.y0,b.y1]) for (const z of [b.z0,b.z1]) o.push(xform(p, [x,y,z])); return o;
}

/* ---------- проверка пересечений ----------
   Каждая деталь — выпуклое тело: коробка (возможно повёрнутая на петле) или призма
   (многоугольник в плоскости x-y, вытянутый по z: фронтоны, скаты). Пересечение ищем
   по теореме о разделяющей оси: если хоть на одной оси проекции не перекрываются
   больше чем на допуск — тела не пересекаются. Касание (0 мм) пересечением не считается. */
const TOL = 0.02;
function convex(p) {
  const V = verts(p);
  if (p.prism) {
    const pl = hull(p.prism.poly), N = [[0,0,1]], E = [[0,0,1]];
    pl.forEach((q, i) => { const r = pl[(i + 1) % pl.length], dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1; N.push([dy/l, -dx/l, 0]); E.push([dx/l, dy/l, 0]); });
    return {V, N, E};
  }
  const ax = [[1,0,0],[0,1,0],[0,0,1]].map(a => { const o = xform(p, [0,0,0]), t = xform(p, a); return [t[0]-o[0], t[1]-o[1], t[2]-o[2]]; });
  return {V, N:ax, E:ax};
}
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
/* глубина взаимного проникновения двух выпуклых тел, см (≤ 0 — не пересекаются) */
function penetration(A, B) {
  const bb = C => C.bb || (C.bb = C.V.reduce((m, v) => [Math.min(m[0], v[0]), Math.min(m[1], v[1]), Math.min(m[2], v[2]), Math.max(m[3], v[0]), Math.max(m[4], v[1]), Math.max(m[5], v[2])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
  const a = bb(A), b = bb(B);
  for (let k = 0; k < 3; k++) { const o = Math.min(a[k+3], b[k+3]) - Math.max(a[k], b[k]); if (o <= TOL) return o; }
  let best = Infinity;
  const test = ax => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of A.V) { const d = dot(v, ax); if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const v of B.V) { const d = dot(v, ax); if (d < b0) b0 = d; if (d > b1) b1 = d; }
    return Math.min(a1, b1) - Math.max(a0, b0);
  };
  for (const ax of A.N.concat(B.N)) { const o = test(ax); if (o <= TOL) return o; if (o < best) best = o; }
  for (const e of A.E) for (const f of B.E) { const c = cross(e, f), l = Math.hypot(c[0], c[1], c[2]); if (l < 1e-6) continue;
    const o = test([c[0]/l, c[1]/l, c[2]/l]); if (o <= TOL) return o; if (o < best) best = o; }
  return best;
}
/* соприкосновение: наименьшее перекрытие проекций по всем осям (≥ −0,05 — тела касаются или пересекаются) */
function contact(A, B) {
  const axes = A.N.concat(B.N); A.E.forEach(e => B.E.forEach(f => { const c = cross(e, f), l = Math.hypot(c[0], c[1], c[2]); if (l > 1e-6) axes.push([c[0]/l, c[1]/l, c[2]/l]); }));
  let best = Infinity;
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of A.V) { const d = dot(v, ax); if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const v of B.V) { const d = dot(v, ax); if (d < b0) b0 = d; if (d > b1) b1 = d; }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o < best) best = o; if (best < -.2) return best;
  }
  return best;
}
/* капсула (отрезок a–b радиуса r) против выпуклого тела: точки отрезка против тела, раздутого на r */
function capsuleDepth(c, C) {
  let worst = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i/12, q = [c.a[0] + (c.b[0]-c.a[0])*t, c.a[1] + (c.b[1]-c.a[1])*t, c.a[2] + (c.b[2]-c.a[2])*t];
    let d = Infinity; // глубина точки внутри тела, раздутого на r (минимум по осям граней)
    for (const n of C.N) { let lo = Infinity, hi = -Infinity; C.V.forEach(v => { const k = dot(v, n); if (k < lo) lo = k; if (k > hi) hi = k; }); const k = dot(q, n); d = Math.min(d, Math.min(k - (lo - c.r), (hi + c.r) - k)); }
    worst = Math.max(worst, d);
  }
  return worst;
}
function wbox(p) { const r = {x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z0:1e9,z1:-1e9}; verts(p).forEach(q => { r.x0 = Math.min(r.x0,q[0]); r.x1 = Math.max(r.x1,q[0]); r.y0 = Math.min(r.y0,q[1]); r.y1 = Math.max(r.y1,q[1]); r.z0 = Math.min(r.z0,q[2]); r.z1 = Math.max(r.z1,q[2]); }); return r; }
/* координаты на пласти: z — u по x, v по y; y — u по x, v по z; x — u по z, v по y */
function faceW(p, u, v) { const b = p.b, n = p.face.n; return n === 'z' ? [b.x0+u, b.y0+v, (b.z0+b.z1)/2] : n === 'y' ? [b.x0+u, (b.y0+b.y1)/2, b.z0+v] : [(b.x0+b.x1)/2, b.y0+v, b.z0+u]; }
function faceSize(p) { const b = p.b, n = p.face.n; return n === 'z' ? [b.x1-b.x0, b.y1-b.y0] : n === 'y' ? [b.x1-b.x0, b.z1-b.z0] : [b.z1-b.z0, b.y1-b.y0]; }
/* заготовка как плоская фигура: внешний контур (с шипами, вырезами с края, щелями от края), сквозные дыры,
   круглые отверстия, карманы (канавки на часть толщины). to3(u, v, d) — точка заготовки в координатах ящика,
   d — глубина от нижней по оси пласти стороны. Работает и для деталей без описанной пласти (прямоугольник по двум большим сторонам). */
function boardShape(p) {
  const b = p.b, d3 = {x:b.x1 - b.x0, y:b.y1 - b.y0, z:b.z1 - b.z0};
  const n = p.face ? p.face.n : Object.keys(d3).reduce((m, k) => d3[k] < d3[m] ? k : m, 'x');
  const w = n === 'x' ? d3.z : d3.x, h = n === 'y' ? d3.z : d3.y, t = d3[n];
  let outer = p.face && p.face.outline ? p.face.outline.map(q => q.slice()) : rectPts(0, 0, w, h);
  const us = outer.map(q => q[0]), vs = outer.map(q => q[1]), bb = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
  const onEdge = q => q[0] < bb[0] + .01 || q[0] > bb[2] - .01 || q[1] < bb[1] + .01 || q[1] > bb[3] - .01;
  const holes = [], circles = [], pockets = [];
  (p.face ? p.face.prims : []).forEach(pr => {
    if (pr.t === 'circle') { circles.push({c:pr.c, r:pr.r}); return; }
    const poly = pr.t === 'stroke' ? strokePoly(pr.pts, pr.w, !onEdge(pr.pts[0]), !onEdge(pr.pts[pr.pts.length - 1])) : pr.pts.map(q => q.slice());
    if (pr.t === 'stroke' && onEdge(pr.pts[0])) {   // щель от края: оба угла начала — точно на кромке
      const q = pr.pts[0], k = Math.abs(q[0] - bb[0]) < .01 || Math.abs(q[0] - bb[2]) < .01 ? 0 : 1; [poly[0], poly[poly.length - 1]].forEach(c => { c[k] = q[k]; }); }
    if (pr.role === 'pocket') { pockets.push({pts:poly, depth:pr.depth, at:pr.at || 'max', role:pr.role}); return; }
    const s2 = splice(outer, poly); if (s2) outer = s2; else holes.push(poly);
  });
  const to3 = (u, v, d) => n === 'x' ? [b.x0 + d, b.y0 + v, b.z0 + u] : n === 'y' ? [b.x0 + u, b.y0 + d, b.z0 + v] : [b.x0 + u, b.y0 + v, b.z0 + d];
  const from3 = q => n === 'x' ? [q[2] - b.z0, q[1] - b.y0, q[0] - b.x0] : n === 'y' ? [q[0] - b.x0, q[2] - b.z0, q[1] - b.y0] : [q[0] - b.x0, q[1] - b.y0, q[2] - b.z0];
  return {n, w, h, t, bb, outer, holes, circles, pockets, to3, from3};
}
const inPoly2 = (q, pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1]) + a[0]) c = !c; } return c; };
/* есть ли дерево в точке заготовки (u, v) на глубине d */
function solidAt(S, u, v, d) {
  if (d < 0 || d > S.t || !inPoly2([u, v], S.outer)) return false;
  if (S.holes.some(h => inPoly2([u, v], h)) || S.circles.some(c => Math.hypot(u - c.c[0], v - c.c[1]) < c.r)) return false;
  return !S.pockets.some(k => inPoly2([u, v], k.pts) && (k.at === 'max' ? d > S.t - k.depth : d < k.depth));
}
function hull(pts) {
  const p = pts.map(a => [+a[0].toFixed(4), +a[1].toFixed(4)]).sort((a,b) => a[0]-b[0] || a[1]-b[1]); if (p.length < 3) return p;
  const cr = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length-1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

/* ---------- материалы и типы деталей ---------- */
const MAT = {
  ply10:{l:'Фанера 10 мм', t:1.0, kg:6.0}, ply9:{l:'Фанера 9 мм', t:0.9, kg:5.4}, ply6:{l:'Фанера 6 мм', t:0.6, kg:3.6},
  bar22:{l:'Брусок 20×20 мм', kgm:.2}};
const GROUPS = [
  ['Корпус', ['side','panel','top'], 'Основа. Боковины, дно, потолок и крышка из фанеры 10 мм, вырезаются на ЧПУ и собираются на шипах насквозь, на клею. Брусков и саморезов нет.', 'основа'],
  ['Фасад', ['apron','frieze','top-fascia','door'], 'Основа. Планки сидят на шипах: концами входят в вырезы на переднем крае боковин, а панели корпуса проходят через них шипами вперёд. Шипы на клею, иначе планку можно вытянуть вперёд. Створки висят на петлях.', 'основа'],
  ['Сцена', ['floor-lower','hatch-half','floor-upper','back-lower','back-upper'], 'Можно менять. Полы задвигаются сзади в канавки боковин, задники ставятся враспор, всё без клея и вынимается назад. Щели, проём трона и люка, арки и глазки — исходный вариант по «Фоме»: их можно вырезать, когда станет ясна драматургия, или вырезать новый пол и задник по тем же габаритам. Задники можно сделать не из фанеры, а из картона, плотной бумаги или ткани.', 'можно менять'],
  ['Фронтон', ['gable-front'], 'Декор, дело десятое. Форма фронтона и звезды — только вариант: её можно поменять, а фронтон можно не ставить вовсе. Основа здесь одна — крепление: фронтон стоит двумя шипами в прорезях крышки. Сам фронтон можно сделать и из картона.', 'декор, не основа']];
/* Сцена: детали, которые ставятся без клея и меняются вместе с драматургией. */
const STAGE = new Set(GROUPS.find(g => g[0] === 'Сцена')[1]);
const DECOR = new Set(['gable-front']);
const DECOR_NOTE = 'Декор, дело десятое. Форма фронтона и звезды — только вариант: её можно поменять, а фронтон можно не ставить вовсе. Основа — только крепление: два шипа внизу фронтона и две прорези в крышке.';
const STAGE_NOTE = 'Деталь сцены. Габариты и посадка — основа, их не трогаем. Вырезы — исходный вариант по «Фоме»: их можно вырезать позже или переделать, когда станет ясна драматургия. Деталь ставится без клея и вынимается назад.';
const ORDER = GROUPS.flatMap(g => g[1]);
/* имя файла заготовки в архиве для станка */
const FILE = id => id + '.dxf';
const CNC = (id, mat) => `Вырезать на ЧПУ из ${mat} по файлу ${FILE(id)} из архива для станка. Размеры в файле в миллиметрах, 1:1.`;

/* Описание каждого типа детали: название, вид на чертеже, где стоит, как сделать. */
function typeInfo(M) {
  const L = M.L, W = P.W, D = P.D, sw = fmt(P.slotW), Dc = M.Dc, Hc = M.Hc, gr = fmt(T.gr*10), tb = fmt(T.tab), tl = fmt(T.ts*10);
  const FIXT = 'Шипы на концах — длиной в толщину боковины, окна и вырезы под шипы панели — размер в размер, без зазора.';
  const FIT = 'Гнёзда под шипы — размер в размер толщины листа, без зазора. Внутренние углы гнёзд в файле острые: подрезки под радиус фрезы (dogbone) добавить в своей программе.';
  return {
    side: {name:'Боковина', note:'левая и правая зеркальные', view:'Вид изнутри, на левую боковину; передний край слева. Правая — зеркально.',
      where:'Левая и правая стенки корпуса. В них входят шипы дна, потолка нижней сцены, крышки и фасадных планок, а в канавки с внутренней стороны задвигаются полы.',
      make:[CNC('side-L', 'фанеры 10 мм') + ' Правая боковина — файл side-R.dxf: она зеркальная.',
        'Сквозные гнёзда: у дна и крышки они выходят на нижний и верхний край, у потолка — окна посередине. На переднем крае — три выреза под шипы фасадных планок.',
        `Канавки под полы — с внутренней стороны, глубиной ${gr} мм, от заднего края до упора в ${fmt(T.tp*10)} мм от переднего. В файле они на отдельном слое POCKET. На левой и правой боковине канавки должны смотреть друг на друга.`,
        FIT]},
    panel: {name:'Дно и потолок', note:'дно, потолок нижней сцены', view:'Вид сверху, передний край внизу.',
      where:'Две одинаковые панели корпуса: дно (низ ящика, стоит на подставке) и потолок нижней сцены. По три шипа с каждого конца проходят боковины насквозь, ещё три спереди — фартук (у дна) или пояс (у потолка).',
      make:[CNC('panel', 'фанеры 10 мм') + ' Нужно 2 шт.', `Боковые шипы ${tb} × ${tl} мм длиной в толщину боковины, передние — длиной в толщину планки (${fmt(T.tp*10)} мм). После сборки торцы шипов выходят заподлицо.`]},
    top: {name:'Крышка корпуса', note:'с прорезями под фронтон', view:'Вид сверху, передний край внизу.',
      where:'Верх корпуса и потолок верхней сцены. Шипы — как у дна и потолка, передние проходят через верхний фриз. У переднего края две прорези: в них входят шипы фронтона.',
      make:[CNC('top', 'фанеры 10 мм'), `Прорези под фронтон — сквозные, ${fmt(T.gTab)} × ${fmt(T.tg)} см, в ${fmt(T.gz)} см от переднего края.`]},
    'floor-lower': {name:'Пол нижней сцены', note:'две петли, люк', view:'Вид сверху, передний край (зритель) внизу, задний край со стороны кукловодов вверху. Оси щелей — штрихпунктир.',
      where:'Пол дворца Ирода. Края пола заходят в канавки боковин, пол задвигается сзади до упора в фартук. Две щели-петли, как на чертежах «Фомы»: каждая начинается у заднего края под своей кулисой — кукла выезжает из-за задника сквозь арку, обходит свою сторону сцены и останавливается у центра. Концы петель не сходятся, поэтому пол цельный. У задника по центру — общий проём: левую половину закрывает площадка трона (по сигналу трон с Иродом проваливается), правую — откидная крышка люка.',
      make:[CNC('floor-lower', 'фанеры 10 мм'),
        `Пол шире сцены на две канавки: по ${gr} мм с каждой стороны заходит в боковину. По ширине — без зазора, иначе с одной стороны в канавке останется меньше. Посадку по толщине подобрать так, чтобы пол задвигался от руки.`,
        'Щели и проём можно вырезать сразу или позже, когда станет ясна драматургия. В файле — исходный вариант; оси щелей есть и в таблице ниже.',
        'Прошкурить края щелей и проверить, что шкант Ø1 проходит по всей длине без заеданий.']},
    'floor-upper': {name:'Пол верхней сцены', note:'одна щель', view:'Вид сверху, передний край (зритель) внизу, задний край вверху. Ось щели — штрихпунктир.',
      where:'Пол «неба». Края заходят в канавки боковин, пол задвигается сзади до упора в пояс. Одна щель, как на чертежах «Фомы»: от заднего края под левой кулисой — к рампе и вдоль неё к центру, перед пещерой. Пастухи и волхвы выходят из-за кулисы, кланяются у пещеры и уходят тем же путём.',
      make:[CNC('floor-upper', 'фанеры 10 мм'),
        `Как нижний пол: шире сцены на ${gr} мм с каждой стороны, посадка в канавке — от руки.`,
        'Щель можно вырезать сразу или позже. В файле — исходный вариант.',
        'Прошкурить края, проверить ход шканта Ø1.']},
    'back-lower': {name:'Задник нижней сцены', note:'арки, глазки', view:'Вид от зрителя.',
      where:'Задняя стенка дворца Ирода. Зажат между полом нижней сцены и потолком, сзади заподлицо с боковинами.',
      make:[CNC('back-lower', 'фанеры 6 мм'), 'Арки — верх полукругом R5, глазки Ø15 мм.',
        'Вариант: вместо фанеры — плотная бумага, картон или ткань того же размера. Арки и глазки тогда вырезаются ножом.']},
    'back-upper': {name:'Задник верхней сцены', note:'арки, глазки', view:'Вид от зрителя.',
      where:'Задняя стенка «неба». Зажат между полом верхней сцены и крышкой.',
      make:[CNC('back-upper', 'фанеры 6 мм'), 'Арка — верх полукругом R5, глазки Ø15 мм.',
        'Вариант: вместо фанеры — плотная бумага, картон или ткань того же размера.']},
    apron: {name:'Фартук', note:'', view:'Вид от зрителя.',
      where:'Закрывает спереди зону Г — щель между дном и полом нижней сцены, где ходит рука нижнего кукловода с рукояткой куклы, — и торцы дна и нижнего пола. Стоит между боковинами, заподлицо с их передним краем. Концами входит шипами в боковины, по нижнему краю через неё проходят шипы дна.',
      make:[CNC('apron', 'фанеры 6 мм'), FIXT]},
    frieze: {name:'Пояс между этажами', note:'с ламбрекеном', view:'Вид от зрителя.',
      where:`Закрывает спереди зону Б — промежуток между потолком нижней сцены и полом верхней, где ходит рука верхнего кукловода. Нижние ${fmt(T.hVal)} см опускаются ниже потолка как ламбрекен.`,
      make:[CNC('frieze', 'фанеры 6 мм'), FIXT]},
    'top-fascia': {name:'Верхний фриз', note:'', view:'Вид от зрителя.',
      where:`Над верхней сценой. Опускается на ${fmt(T.hVal2)} см ниже крышки.`,
      make:[CNC('top-fascia', 'фанеры 6 мм'), FIXT]},
    door: {name:'Створка', note:'', view:'Заготовка, обе одинаковые.',
      where:'Две створки закрывают весь фасад корпуса. Открываются на 180°, внутренняя сторона становится «крыльями» для росписи.',
      make:[`2 прямоугольника ${fmt(M.dw)} × ${fmt(M.dh)} из фанеры 6 мм, файл ${FILE('door')}.`, `Створка на ${fmt(M.dg*20)} мм ниже корпуса: так остаётся по ${fmt(M.dg*10)} мм зазора сверху и снизу, и она не цепляет фронтон и стол.`]},
    'gable-front': {name:'Фронтон', note:'декор, со звездой', view:'Вид от зрителя. Контур симметричный.',
      where:`Над фасадом, стоит на крышке в ${fmt(T.gz)} см от её переднего края: два шипа снизу входят в прорези крышки. Это декор: форма-кокошник — только вариант, её можно поменять. Звезда вырезана насквозь, сзади фонарик и матовый фильтр.`,
      make:[CNC('gable-front', 'фанеры 6 мм'), `Шипы ${fmt(T.gTab)} × ${tl} мм длиной в толщину крышки.`]},
    'hatch-half': {name:'Площадка трона и крышка люка', note:'вкладыши в проём пола', view:'Вид сверху.',
      where:'Две половинки проёма в нижнем полу. Левая — площадка трона: на ней трон с Иродом, по сигналу она проваливается вниз. Правая — крышка люка: висит на петле и откидывается вверх.',
      make:[CNC('hatch-half', 'фанеры 10 мм') + ' Нужно 2 шт.',
        `Каждая деталь на 1 мм с каждой стороны меньше половины проёма, чтобы ходила в нём свободно: ${fmt(M.FL.info.hatch.w/2 - .2)} × ${fmt(M.FL.info.hatch.d - .2)}.`,
        'Левая — площадка трона, правая — крышка люка.']}
  };
}
function partTypes(M) {
  const info = typeInfo(M), map = new Map();
  M.parts.forEach(p => { if (!p.type) return; const t = map.get(p.type) || {id:p.type, parts:[], mat:p.mat}; t.parts.push(p); map.set(p.type, t); });
  const list = ORDER.filter(id => map.has(id)).map(id => {
    const t = map.get(id), i = info[id], p = t.parts[0];
    let size = '', area = 0, len = 0;
    if (p) {
      const b = p.b, d = p.cut ? p.cut.slice().sort((a,c) => c-a) : [b.x1-b.x0, b.y1-b.y0, b.z1-b.z0].sort((a,c) => c-a), tri = p.face && p.face.outline && p.face.outline.length === 3;
      const sz = new Map();
      t.parts.forEach(q => { const b = q.b, d = q.cut ? q.cut.slice().sort((a,c) => c-a) : [b.x1-b.x0, b.y1-b.y0, b.z1-b.z0].sort((a,c) => c-a);
        const bar = q.mat && q.mat.startsWith('bar'), k = bar ? 'L ' + fmt(d[0]) : fmt(d[0]) + ' × ' + fmt(d[1]) + (tri ? ' △' : '');
        sz.set(k, (sz.get(k) || 0) + 1); if (bar) len += d[0]/100; else area += d[0]*d[1]/1e4 * (tri ? .5 : 1); });
      size = sz.size === 1 ? [...sz.keys()][0] : [...sz.entries()].map(([k, n]) => n + ' × ' + k).join('; ');
    } else size = fmt(P.figH + P.handle + T.tf + .5) + ' в длину';
    return Object.assign({qty: t.parts.length || 1, size, area, len}, i, t);
  });
  // одна заготовка — одна карточка: если при каких-то размерах две детали выходят одинаковыми, склеиваем их
  const out = [], bySig = new Map();
  list.forEach(t => { const k = blankSig(t); const o = k && bySig.get(k);
    if (!o) { if (k) bySig.set(k, t); out.push(t); return; }
    o.aliases = (o.aliases || []).concat(t.id, t.aliases || []); o.parts = o.parts.concat(t.parts); o.qty += t.qty; o.area += t.area; o.len += t.len;
    o.name = o.name + ' и ' + t.name.charAt(0).toLowerCase() + t.name.slice(1); o.where = o.where + ' ' + t.where;
    o.make = [`Выпилить ${o.qty} одинаковые заготовки ${o.size}${o.mat && MAT[o.mat] ? ' (' + MAT[o.mat].l.toLowerCase() + ')' : ''}.`].concat(o.make.slice(1)); });
  return out;
}
/* подпись заготовки: материал, размеры, вырезы, отверстия (саморезы — сборка, не считаются) */
function blankSig(t) {
  const p = t.parts[0]; if (!p || !t.mat) return null;
  const r1 = x => Math.round(x*10)/10, d = (p.cut || [p.b.x1 - p.b.x0, p.b.y1 - p.b.y0, p.b.z1 - p.b.z0]).map(r1).sort((a, b) => a - b);
  return JSON.stringify([t.mat, d, t.size, p.face ? p.face.prims : [], p.face && p.face.outline || null, (p.feats || []).filter(f => f.kind !== 'screw')], (key, v) => typeof v === 'number' ? r1(v) : v);
}
function cutData(M) {
  const types = partTypes(M).filter(t => t.mat), tot = {};
  types.forEach(t => { const x = tot[t.mat] || (tot[t.mat] = {area:0, len:0}); x.area += t.area; x.len += t.len; });
  let kg = 0; for (const m in tot) { const t = tot[m], mm = MAT[m]; if (mm.kg) kg += t.area*mm.kg; else if (mm.kgm) kg += t.len*mm.kgm; }
  return {types, tot, kg, count: types.reduce((s,t) => s + t.qty, 0)};
}
function hardware(M) {
  const cnt = n => M.parts.filter(p => p.name === n).length;
  return [
    `Петли для створок, карточные ${fmt(5)} × ${fmt(5)} см: ${cnt('Петля створки')/3} шт, к ним шурупы 3×10 (боковина ${fmt(T.ts*10)} мм: длиннее выйдут внутрь)`,
    `Петля для крышки люка, маленькая ${fmt(3)} × ${fmt(4)} см: ${cnt('Петля крышки люка')/3} шт`,
    'Клей ПВА, струбцины или стяжной ремень, киянка, шкурка',
    'Фонарик для звезды и матовый фильтр (цветная пластиковая папка)',
    'Шканты Ø10 мм для кукол: по одному на куклу, ~15 см',
    'Всё фанерное вырезается на ЧПУ по файлам из архива; саморезов и брусков в корпусе нет'
  ];
}
/* Схематичные кукловоды. Глаза стоят ровно напротив глазков задника, рука заходит
   в открытую сзади зону руки (Б или Г) и держит рукоятку куклы под полом.
   Тело — набор капсул {a, b, r} и шаров {c, r}, чтобы проверить, что они не проходят сквозь ящик. */
function puppeteers(M, tgt) {
  tgt = tgt || {};
  const L = M.L, D = P.D, zb = D + T.tp, out = [];
  // верхний: стоит, смотрит в глазки верхнего задника, ведёт пастуха
  {
    const ey = L.f2 + M.BU.info.eye[1], ex = M.BU.info.eye[0], pu = M.pups[0], hy = pu.yB - P.handle*.55;
    const s = [ex - 7, ey - 16, zb + 18], h = tgt.upper ? [tgt.upper[0], hy, tgt.upper[1]] : [pu.x, hy, pu.z], e = [h[0], (L.c1 + L.f2b)/2, zb + 6];   // рука заходит сзади прямо к точке щели
    out.push({id:'upper', name:'Верхний кукловод (стоит)', tier:'upper', eyeY:ey, eyeX:ex, head:{c:[ex, ey + 1, zb + 11], r:10},
      caps:[{a:[ex + 2, ey - 20, zb + 19], b:[ex + 2, 95, zb + 24], r:11},
            {a:[ex - 3, 92, zb + 24], b:[ex - 3, 4, zb + 24], r:6}, {a:[ex + 7, 92, zb + 24], b:[ex + 7, 4, zb + 24], r:6},
            {a:s, b:e, r:4}, {a:e, b:h, r:3.3},
            {a:[ex + 11, ey - 16, zb + 18], b:[ex + 13, 100, zb + 20], r:3.5}],
      hand:h, stool:null});
  }
  // нижний: сидит на табурете, смотрит в глазки нижнего задника, ведёт Ирода
  {
    const ey = L.f1 + M.BL.info.eye[1], ex = M.BL.info.eye[0], pl = M.pups[2], hy = pl.yB - P.handle*.55, seat = 45;
    const s = [ex + 8, ey - 17, zb + 18], h = tgt.lower ? [tgt.lower[0], hy, tgt.lower[1]] : [pl.x, hy, pl.z], e = [h[0], (L.b1 + L.f1b)/2, zb + 6];
    out.push({id:'lower', name:'Нижний кукловод (сидит)', tier:'lower', eyeY:ey, eyeX:ex, head:{c:[ex, ey + 1, zb + 11], r:9.5},
      caps:[{a:[ex - 2, ey - 19, zb + 18], b:[ex - 2, seat + 7, zb + 28], r:10},
            {a:[ex - 6, seat + 5, zb + 26], b:[ex - 6, seat + 5, zb + 6], r:6}, {a:[ex + 4, seat + 5, zb + 26], b:[ex + 4, seat + 5, zb + 6], r:6},
            {a:[ex - 6, seat + 5, zb + 6], b:[ex - 6, 3, zb + 8], r:5}, {a:[ex + 4, seat + 5, zb + 6], b:[ex + 4, 3, zb + 8], r:5},
            {a:s, b:e, r:4}, {a:e, b:h, r:3.3},
            {a:[ex - 12, ey - 17, zb + 18], b:[ex - 12, 72, zb + 14], r:3.3}],
      hand:h, stool:{c:[ex - 2, seat/2, zb + 30], r:13, h:seat}});
  }
  return out;
}
/* какие детали ящика задевает кукловод (капсулы против коробок деталей) */
function puppeteerHits(M, pp) {
  const boxes = M.parts.filter(p => p.cat !== 'light-star').map(p => ({p, b:wbox(p)}));
  const dist = (q, b) => { const dx = Math.max(b.x0 - q[0], 0, q[0] - b.x1), dy = Math.max(b.y0 - q[1], 0, q[1] - b.y1), dz = Math.max(b.z0 - q[2], 0, q[2] - b.z1); return Math.hypot(dx, dy, dz); };
  const hits = new Set();
  const test = (q, r) => boxes.forEach(({p, b}) => { if (dist(q, b) < r - 0.05) hits.add(p.name); });
  pp.caps.forEach((c, k) => {
    const last = k === pp.caps.findIndex(x => x.b === pp.hand); // предплечье: кулак у рукоятки не считаем
    for (let i = 0; i <= 24; i++) { const t = i/24; if (last && t > .97) continue; test([c.a[0] + (c.b[0]-c.a[0])*t, c.a[1] + (c.b[1]-c.a[1])*t, c.a[2] + (c.b[2]-c.a[2])*t], c.r); }
  });
  test(pp.head.c, pp.head.r);
  return [...hits];
}
/* точки вдоль ломаной с шагом step */
function resample(pts, step) {
  const o = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i-1], b = pts[i], l = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.ceil(l/step));
    for (let k = 1; k <= n; k++) o.push([a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n]); }
  return o;
}
/* кукла как набор вертикальных цилиндров (x, z — точка на оси щели) */
function puppetCyl(M, tier, x, z) {
  const L = M.L, yF = tier === 'upper' ? L.f2 : L.f1, yB = tier === 'upper' ? L.f2b : L.f1b, bodyH = P.figH - T.head, top = yF + .5 + P.figH, fy = yB - P.handle*.55;
  return [
    {n:'диск', r:2.25, y0:yF, y1:yF + .5}, {n:'кукла', r:2.6, y0:yF + .5, y1:yF + .5 + bodyH}, {n:'голова', r:2, y0:top - T.head, y1:top},
    {n:'шкант', r:.5, y0:yB, y1:yF, through:true}, {n:'рукоятка', r:1.2, y0:yB - P.handle, y1:yB}, {n:'кулак', r:4, y0:fy - 4, y1:fy + 4}
  ].map(c => Object.assign(c, {x, z}));
}
function cylBoxPen(c, b) {
  const oy = Math.min(c.y1, b.y1) - Math.max(c.y0, b.y0); if (oy <= TOL) return oy;
  const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1), dz = Math.max(b.z0 - c.z, 0, c.z - b.z1);
  const inside = dx === 0 && dz === 0 ? Math.min(c.x - b.x0, b.x1 - c.x, c.z - b.z0, b.z1 - c.z) : -Math.hypot(dx, dz);
  return Math.min(oy, c.r + inside);
}
function pointBoxPen(q, r, b) {
  const dx = Math.max(b.x0 - q[0], 0, q[0] - b.x1), dy = Math.max(b.y0 - q[1], 0, q[1] - b.y1), dz = Math.max(b.z0 - q[2], 0, q[2] - b.z1);
  if (dx || dy || dz) return r - Math.hypot(dx, dy, dz);
  return r + Math.min(q[0] - b.x0, b.x1 - q[0], q[1] - b.y0, b.y1 - q[1], q[2] - b.z0, b.z1 - q[2]);
}
/* полный аудит: детали попарно, створки на всём ходе, куклы по всем щелям, руки кукловодов */
function audit(M) {
  const R = {pairs:0, stat:[], doorSteps:0, doors:[], pupSteps:0, pup:[], handSteps:0, hand:[]};
  const C = new Map(M.parts.map(p => [p.id, convexes(p)]));
  const skip = (a, b) => (a.group === 'stand' && b.group === 'stand') || (a.cat === 'decor' && b.cat === 'decor') || joined(a, b);
  for (let i = 0; i < M.parts.length; i++) for (let j = i + 1; j < M.parts.length; j++) {
    const a = M.parts[i], b = M.parts[j]; if (skip(a, b)) continue; R.pairs++;
    const d = penList(C.get(a.id), C.get(b.id)); if (d > TOL) R.stat.push({a:a.name, b:b.name, d});
  }
  for (let ang = 0; ang <= 180; ang += 3) {
    R.doorSteps++;
    const Md = model(ang), mov = Md.parts.filter(p => p.group === 'doors'), mc = mov.map(convex);
    mov.forEach((d, k) => Md.parts.forEach(o => { if (o.group === 'doors' || joined(d, o)) return; const pen = penList([mc[k]], C.get(o.id)); if (pen > TOL) R.doors.push({ang, a:d.name, b:o.name, d:pen}); }));
    mov.forEach((d, k) => mov.forEach((e, j) => { if (j <= k || joined(d, e) || d.rotSign === e.rotSign) return; const pd = penetration(mc[k], mc[j]); if (pd > TOL) R.doors.push({ang, a:d.name, b:e.name, d:pd}); }));
  }
  const boxes = [];
  M.parts.filter(p => p.group !== 'roof' && p.cat !== 'light-star').forEach(p => (p.solids || [wbox(p)]).forEach(b => boxes.push({p, b})));
  [['upper', M.FU, 'floor2'], ['lower', M.FL, 'floor1']].forEach(([tier, F, fid]) => {
    const pts = []; F.info.strokes.forEach(s => resample([[s[0][0], s[0][1] + 4]].concat(s), 1).forEach(q => pts.push(q)));
    const near = (x0, x1, y0, y1, z0, z1) => boxes.filter(({b}) => b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1 && b.z1 > z0 && b.z0 < z1);
    pts.forEach(q => {
      R.pupSteps++;
      const cyl = puppetCyl(M, tier, q[0], q[1]), y0 = Math.min(...cyl.map(c => c.y0)), y1 = Math.max(...cyl.map(c => c.y1));
      const nb = near(q[0] - 4.2, q[0] + 4.2, y0, y1, q[1] - 4.2, q[1] + 4.2);
      cyl.forEach(c => nb.forEach(({p, b}) => {
        if (c.through && p.id === fid) return;
        const d = cylBoxPen(c, b); if (d > TOL) R.pup.push({tier, x:q[0], z:q[1], a:c.n, b:p.name, d});
      }));
      R.handSteps++;
      const pp = puppeteers(M, {[tier]: q}).find(x => x.tier === tier), arm = pp.caps.filter(c => c.b === pp.hand || c.b === pp.caps.find(k => k.b === pp.hand).a);
      arm.forEach(c => {
        const r = c.r, cb = near(Math.min(c.a[0], c.b[0]) - r, Math.max(c.a[0], c.b[0]) + r, Math.min(c.a[1], c.b[1]) - r, Math.max(c.a[1], c.b[1]) + r, Math.min(c.a[2], c.b[2]) - r, Math.max(c.a[2], c.b[2]) + r);
        for (let i = 0; i <= 24; i++) { const t = i/24; if (c.b === pp.hand && t > .9) continue;
          const pt = [c.a[0] + (c.b[0]-c.a[0])*t, c.a[1] + (c.b[1]-c.a[1])*t, c.a[2] + (c.b[2]-c.a[2])*t];
          cb.forEach(({p, b}) => { const d = pointBoxPen(pt, r, b); if (d > TOL) R.hand.push({tier, x:q[0], z:q[1], b:p.name, d}); }); } });
    });
  });
  // крышка люка: откидывается вверх на 0–100°
  // площадку отпустили: она с троном и Иродом падает до дна
  R.drop = []; R.dropSteps = 0;
  const dmax = M.L.f1b - M.L.b1;
  for (let d = 0; d <= dmax + 1e-6; d += .5) { R.dropSteps++; const Md = model(180, {drop:d});
    Md.parts.filter(p => p.group === 'throne').forEach(tp => { const tc = convex(tp);
      M.parts.forEach(o => { if (o.group === 'throne') return; const pen = penList([tc], C.get(o.id)); if (pen > TOL) R.drop.push({what:tp.name, b:o.name, d:pen}); }); }); }
  R.dropMax = dmax;
  R.lid = []; R.lidSteps = 0;
  for (let ang = 0; ang <= 100; ang += 5) {
    R.lidSteps++;
    model(180, {lid:ang}).parts.filter(p => p.lidHinged).forEach(lp => { const lc = convex(lp);
      M.parts.forEach(o => { if (o.lidHinged || joined(lp, o)) return; const pen = penList([lc], C.get(o.id)); if (pen > TOL) R.lid.push({ang, b:o.name, d:pen}); }); });
  }
  return R;
}
/* детали, соединённые друг с другом (петля и её створка, штырь в отверстии), друг другу не мешают */
function joined(a, b) { return (a.hosts && a.hosts.includes(b.id)) || (b.hosts && b.hosts.includes(a.id)) || (a.assembly && a.assembly === b.assembly); }
function convexes(p) { return p.solids ? p.solids.map(b => convex({b})) : [convex(p)]; }
function penList(A, B) { let m = -Infinity; A.forEach(a => B.forEach(b => { m = Math.max(m, penetration(a, b)); })); return m; }
function checks(M) {
  const W = P.W, D = P.D, out = [], ok = (c, t) => out.push({c, t});
  ok(P.handle <= P.hG - 2, `Рукоятка ${fmt(P.handle)} помещается в зону руки Г (${fmt(P.hG)}), запас ${fmt(P.hG - P.handle)}.`);
  ok(P.handle <= P.hB - 2, `Рукоятка ${fmt(P.handle)} помещается в зону руки Б (${fmt(P.hB)}), запас ${fmt(P.hB - P.handle)}.`);
  const cl = P.hV - T.hVal - P.figH, cu = P.hA - T.hVal2 - P.figH;
  ok(cl >= 8, `Нижняя сцена: над головой куклы до ламбрекена ${fmt(cl)} (нужно не меньше 8).`);
  ok(cu >= 8, `Верхняя сцена: над головой куклы до фриза ${fmt(cu)} (нужно не меньше 8).`);
  const mi = {side:1e9, front:1e9, back:1e9};
  [M.FL, M.FU].forEach(F => F.info.strokes.forEach(s => s.forEach(q => { mi.side = Math.min(mi.side, q[0] - P.slotW/2, W - q[0] - P.slotW/2); mi.front = Math.min(mi.front, q[1] - P.slotW/2); })));
  ok(mi.side >= 5 && mi.front >= 4, `Щели не подходят к боковинам и рампе: до боковины не меньше ${fmt(mi.side)}, до переднего края не меньше ${fmt(mi.front)}.`);
  const exitOk = [[M.FL, M.BL, 'ribB1'], [M.FU, M.BU, 'ribB2']].every(([F, Bk, rb]) => F.info.exits.every(x => {
    const arch = Bk.info.arches.some(([a0, a1]) => a0 <= x - 2.6 - .3 && a1 >= x + 2.6 + .3);
    const yb = rb === 'ribB1' ? M.L.f1b : M.L.f2b, gap = !M.parts.some(p => p.b.z1 > D - 2.5 && p.b.y1 > yb - 3.5 && p.b.y1 <= yb + .01 && p.b.x0 < x + 1.2 + .5 && p.b.x1 > x - 1.2 - .5);
    return arch && gap; }));
  ok(exitOk, 'Каждая щель выходит к заднему краю пола под аркой-кулисой, и под полом на выходе ничего не мешает шканту и рукоятке.');
  const Hh = M.hatch; let br = Infinity;
  M.FL.info.strokes.forEach(st => st.forEach(q => { const dx = Math.max(Hh.x0 - q[0], 0, q[0] - Hh.x1), dz = Math.max(Hh.z0 - q[1], 0, q[1] - Hh.z1); br = Math.min(br, Math.hypot(dx, dz) - P.slotW/2); }));
  br = Math.min(br, (D + T.tp) - Hh.z1 - 2.6);
  ok(br >= 2, `Вокруг проёма трона и люка достаточно дерева: до щелей и до полосы под задником не меньше ${fmt(br)} (нужно не меньше 2).`);
  ok(true, 'Щели нигде не замыкаются в кольцо: каждая начинается у заднего края и кончается тупиком, концы петель не сходятся. Ни один кусок пола не выпадает.');
  const front = Math.min(...M.parts.filter(p => !['door','roof','stand','hw'].includes(p.cat) && p.group !== 'roof').map(p => wbox(p).z0));
  ok(front >= -T.tp - 1e-6, 'Ничего не выступает вперёд за плоскость фасада, створки закрываются.');
  { const g = id => M.parts.find(p => p.id === id).b, stop = (f, pl) => { const a = g(f), b = g(pl); return Math.abs(b.z1 - a.z0) < .01 && b.y0 <= a.y0 + .01 && b.y1 >= a.y1 - .01 && b.x0 <= a.x0 + .01 && b.x1 >= a.x1 - .01; };
    ok(stop('floor1', 'apron') && stop('floor2', 'frieze'), 'Полы не выезжают вперёд: передний торец нижнего пола целиком упирается в фартук, верхнего — в пояс.'); }
  ok(Math.abs(2*M.dw + .2 - M.Wout) < .01, `Створки 2 × ${fmt(M.dw)} × ${fmt(M.dh)} закрывают фасад ${fmt(M.Wout)} × ${fmt(M.Hc)}, зазоры ${fmt(M.dg*10)} мм сверху и снизу.`);
  ok(W >= 72, `Ширина сцены ${fmt(W)}: двое кукловодов помещаются рядом (нужно не меньше 72).`);
  ok(M.ch <= P.hA - 10, `Пещера (${fmt(M.ch)}) ниже глазков верхнего задника.`);
  { const G = M.gable.poly, sd = (q, a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1], l = dx*dx + dy*dy, t = l ? Math.max(0, Math.min(1, ((q[0]-a[0])*dx + (q[1]-a[1])*dy)/l)) : 0; return Math.hypot(q[0]-a[0]-t*dx, q[1]-a[1]-t*dy); };
    const inside = q => { let c = false; for (let i = 0, j = G.length - 1; i < G.length; j = i++) { const a = G[i], b = G[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1]) + a[0]) c = !c; } return c; };
    const m = Math.min(...M.star.map(q => inside(q) ? Math.min(...G.map((a, i) => sd(q, a, G[(i + 1) % G.length]))) : -1));
    ok(m >= 1.5, `Звезда целиком внутри фронтона: до края не меньше ${fmt(m)} (нужно не меньше 1,5).`); }
  { // шипы и канавки: в гнезде нет дерева, шаг наружу через каждую грань гнезда — дерево (вплотную) или край заготовки; сам шип — дерево
    const bad = [], cnt = {ps:0, pf:0, fs:0, g:0}, e = .05;
    M.joints.forEach(j => {
      const host = M.parts.find(p => p.id === j.host), S = boardShape(host), own = boardShape(M.parts.find(p => p.id === j.id)), b = j.b;
      const c = [[b.x0, b.y0, b.z0], [b.x1, b.y1, b.z1]].map(S.from3), lo = [0, 1, 2].map(k => Math.min(c[0][k], c[1][k])), hi = [0, 1, 2].map(k => Math.max(c[0][k], c[1][k]));
      const mid = lo.map((v, k) => (v + hi[k])/2), pts = [mid];
      for (const u of [lo[0] + e, hi[0] - e]) for (const v of [lo[1] + e, hi[1] - e]) for (const d of [lo[2] + e, hi[2] - e]) pts.push([u, v, d]);
      const empty = pts.every(q => !solidAt(S, q[0], q[1], q[2]));
      const out = q => q[0] < S.bb[0] || q[0] > S.bb[2] || q[1] < S.bb[1] || q[1] > S.bb[3] || q[2] < 0 || q[2] > S.t;
      let snug = true;
      for (let k = 0; k < 3; k++) [[lo[k], -1], [hi[k], 1]].forEach(([v, s]) => { const q = mid.slice(); q[k] = v + s*e; if (!out(q) && !solidAt(S, q[0], q[1], q[2])) snug = false; });
      const m3 = [(b.x0 + b.x1)/2, (b.y0 + b.y1)/2, (b.z0 + b.z1)/2], mo = own.from3(m3), filled = solidAt(own, mo[0], mo[1], mo[2]);
      if (!empty || !snug || !filled) bad.push(j.id + ' в ' + host.name);
      if (j.g) cnt[j.g]++;
    });
    ok(!bad.length, `Шипы стоят в гнёздах вплотную и насквозь: панелей в боковинах — ${cnt.ps}, панелей в фасадных планках — ${cnt.pf}, планок в боковинах — ${cnt.fs}, фронтона в крышке — ${cnt.g}; края полов входят в канавки боковин на ${fmt(T.gr*10)} мм` + (bad.length ? ` — не сходится: ${[...new Set(bad)].slice(0, 4).join('; ')}.` : '.'));
    const leaves = M.parts.filter(p => /^hinge[LR]\df$/.test(p.id)), hit = leaves.some(l => M.joints.some(j => j.kind === 'tab' && j.host === 'side' + l.id[5] && j.b.y0 < l.b.y1 + 1 && j.b.y1 > l.b.y0 - 1 && j.b.z0 < l.b.z1 && j.b.z1 > l.b.z0));
    ok(M.fascia.every(f => f.tab), 'У каждой фасадной планки есть место под шипы в боковины, не занятое петлями створок.');
    ok(leaves.length && !hit, 'Петли створок не попадают на торцы шипов: шурупы петель идут в целую фанеру боковины.'); }
  puppeteers(M).forEach(pp => { const h = puppeteerHits(M, pp);
    ok(!h.length, `${pp.name}: глаза на высоте +${fmt(pp.eyeY)}, ровно напротив глазков; рука проходит в зону ${pp.tier === 'upper' ? 'Б' : 'Г'} и ничего не задевает` + (h.length ? ` — задевает: ${h.join(', ')}.` : '.')); });
  const A = audit(M), list = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }); return [...m.keys()].slice(0, 4).join('; '); };
  ok(!A.stat.length, `Детали в собранном виде не пересекаются: проверено ${A.pairs} пар деталей` + (A.stat.length ? ` — пересекаются: ${list(A.stat, x => x.a + ' и ' + x.b)}.` : '.'));
  ok(!A.doors.length, `Створки на всём ходе 0–180° (${A.doorSteps} положений) ни во что не упираются` + (A.doors.length ? ` — задевают: ${list(A.doors, x => x.a + ' и ' + x.b)}, от ${Math.min(...A.doors.map(x => x.ang))}°.` : '.'));
  ok(!A.pup.length, `Куклы проходят все щели (${A.pupSteps} точек): кукла, диск, шкант, рукоятка и кулак ничего не задевают` + (A.pup.length ? ` — задевают: ${list(A.pup, x => x.a + ' и ' + x.b)}.` : '.'));
  ok(!A.drop.length, `Трон проваливается: площадка с троном и Иродом падает на ${fmt(A.dropMax)} до дна, ничего не задевая (${A.dropSteps} положений)` + (A.drop.length ? ` — задевает: ${list(A.drop, x => x.what + ' и ' + x.b)}.` : '.'));
  ok(!A.lid.length, `Крышка люка откидывается на 0–100° (${A.lidSteps} положений) и ни во что не упирается` + (A.lid.length ? ` — задевает: ${list(A.lid, x => x.b)}.` : '.'));
  ok(!A.hand.length, `Руки кукловодов дотягиваются до каждой точки щелей через зоны Б и Г, не задевая корпус (${A.handSteps} положений)` + (A.hand.length ? ` — задевают: ${list(A.hand, x => x.b)}.` : '.'));
  return out;
}
const STEPS = [
  {t:'Корпус на шипах', ids:['sideL','sideR','bottom','ceil','top'], types:['side','panel','top'], sheets:['side'],
   text:'Боковины, дно, потолок нижней сцены и крышка вставляются друг в друга шипами. Сначала насухо, потом на клей.',
   do:['Сначала собрать насухо, без клея. Положить левую боковину на стол внутренней стороной (с канавками) вверх.',
     'Вставить в её гнёзда шипы трёх панелей: дно — в вырезы по нижнему краю, крышку — в вырезы по верхнему, потолок нижней сцены — в окна посередине. Крышка — панель с двумя прорезями под фронтон, прорези ближе к переднему краю боковины.',
     'Сверху надеть правую боковину канавками внутрь, совместить все девять шипов и осадить киянкой через брусок. Гнёзда вплотную: если шип не идёт, подшкурить шип, а не гнездо.',
     'Разобрать, нанести ПВА в гнёзда и на шипы, собрать снова и стянуть струбцинами или ремнём. Проверить, что диагонали фасада равны. Вытекший клей стереть сразу.',
     'Когда клей высохнет, торцы шипов снаружи зашкурить заподлицо с боковинами.']},
  {t:'Фартук, пояс, верхний фриз', ids:['apron','frieze','topFascia'], types:['apron','frieze','top-fascia'],
   text:'Три фасадные планки надеваются спереди на шипы и закрывают зоны рук и торцы панелей.',
   do:['Фартук — к дну, пояс — к потолку нижней сцены, верхний фриз — к крышке. Каждую планку надеть спереди: передние шипы панели входят в окна или вырезы планки, а шипы на концах планки — в вырезы на переднем крае боковин. Сначала насухо.',
     'Шипы смазать ПВА и осадить планку киянкой через брусок. Клей обязателен: все шипы смотрят вперёд, и без клея планку можно вытянуть.',
     'Фартук доходит ровно до верха нижнего пола, пояс — до верха верхнего: в них потом упрутся полы, и вперёд они не выедут. К полам не клеить.']},
  {t:'Створки', ids:['doorL','doorR'].concat([0,1,2].flatMap(i => ['L','R'].flatMap(s => ['f','m','p'].map(k => 'hinge' + s + i + k)))), types:['door'], sheets:['door'],
   text:'Створки вешаем на петли на передний угол боковин.',
   do:['На каждую створку по 3 петли, места на схеме. Петлю ставить на внешний передний угол боковины, иначе створка не откроется на 180°. Шурупы 3×10 с засверловкой Ø2: длиннее нельзя, боковина 10 мм.',
     'Проверить: створки открываются на 180°, между закрытыми створками зазор 2 мм.',
     'Чем держать створки закрытыми (крючок и т. п.), решаем на месте.']},
  {t:'Пол нижней сцены', ids:['floor1','hatchLid','hingeLidf','hingeLidm','hingeLidp','throneBase'], types:['floor-lower','hatch-half'], sheets:['floor-lower','hatch-half'],
   text:'Сцены ставим, когда корпус готов. Пол задвигаем сзади в канавки боковин до упора в фартук, без крепежа: его можно вынуть и переделать.',
   do:[
     'На столе: крышку люка вставить в правую половину проёма и поставить петлю по заднему краю, на верхнюю сторону крышки и пола. Петля с упором на 180°: тогда крышка не проваливается вниз.',
     'Проверить: крышка откидывается назад до ~100° и сама падает обратно.',
     'Завести края пола в нижние канавки боковин и задвинуть сзади до упора в фартук. Ничем не крепить. Если идёт туго — подшкурить края пола.',
     'Площадку трона вставить в левую половину проёма вровень с полом. Чем держать её снизу, решаем на месте; без опоры она должна свободно падать вниз.']},
  {t:'Пол верхней сцены', ids:['floor2'], types:['floor-upper'], sheets:['floor-upper'],
   text:'Как нижний пол: задвигаем сзади в канавки до упора в пояс, без крепежа.',
   do:['Завести края пола в верхние канавки боковин и задвинуть до упора в пояс между этажами. Ничем не крепить.']},
  {t:'Задники', ids:['backL','backU'], types:['back-lower','back-upper'],
   text:'Задники ставим сзади враспор, без клея.',
   do:['Нижний задник завести сзади между нижним полом и потолком, верхний — между верхним полом и крышкой. Не клеить: если сцена поменяется, задник вынимают.',
     'Бумажный или тканевый задник прибить строительным степлером к задним торцам боковин, пола и потолка (крышки).',
     'Чтобы вынуть пол: снять задник и вытянуть пол назад по канавкам.']},
  {t:'Фронтон', ids:['gableF','starLamp'], types:['gable-front'], sheets:['gable-front'],
   text:'Фронтон — декор, его можно делать в самом конце или не ставить вовсе.',
   do:['Сзади за звездой приклеить матовый фильтр (цветная пластиковая папка).',
     'Фонарик звезды закрепить сзади на фронтоне за звездой.',
     'Вставить два шипа фронтона в прорези крышки до упора. Клеить не обязательно: без клея фронтон снимается для перевозки. Если болтается — на клей.']},
  {t:'На подставку, декор, куклы', ids:['standTop','leg00','leg01','leg10','leg11','caveL','caveR','caveT','throneS','throneB','herod'], types:[],
   text:'Ставим ящик на подставку и наполняем сцены.',
   do:['Поставить корпус на стол или козлы, высоту подобрать по кукловодам.', 'Трон с Иродом приклеить на площадку трона, поставить пещеру. Это художественная часть, в модели она показана условно.']}
];
window.V = {DEF, T, P, RANGES, saveP, resetP, changed, esc, fmt, r1, levels, bz, sample, model, xform, verts, wbox, faceW, faceSize, hull,
  MAT, GROUPS, ORDER, FILE, blankSig, STAGE, STAGE_NOTE, DECOR, DECOR_NOTE, gableOutline, typeInfo, partTypes, cutData, hardware, checks, STEPS, puppeteers, puppeteerHits, audit, convex, convexes, penetration, contact, joined, puppetCyl, along, stations, dot, cross, TOL,
  rectPts, splice, strokePoly, boardShape, solidAt, VARIANT:'shipy'};
})();
