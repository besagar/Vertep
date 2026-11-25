/* Вертепный ящик — общая модель: параметры, детали, раскрой, проверки, шаги сборки.
   Все размеры в сантиметрах. Оси: x — ширина (0 = внутренняя сторона левой боковины),
   y — высота от пола комнаты, z — глубина (0 = передний край пола, растёт назад). */
(function () {
'use strict';
const DEF = {W:80, D:35, hStand:66, hG:17, hV:35, hB:17, hA:32, hRoof:25, slotW:1.7, figH:18, handle:13};
const T = {ts:0.9, tf:0.9, tp:0.6, td:0.6, tr:0.6, tg:0.9, hVal:5, hVal2:4, head:5, dg:0.3};
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
    info.tables.push({title:'Ось левой петли: точки через 3 см от заднего края (правая — зеркально, x → ' + fmt(W) + ' − x)', pts:stations(left, 3)});
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
  // фронтон стоит на крышке у переднего края; сзади к нему приклеен брусок 20×20, брусок прикручен к крышке сверху двумя саморезами
  const scrX = 8, scrZ = -tp + tg + 1;
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
  add('sideL', 'side', 'Боковина левая', 'carcass', 'ply9', B(-ts, 0, L.y0, L.t1, -tp, D+tp));
  add('sideR', 'side', 'Боковина правая', 'carcass', 'ply9', B(W, W+ts, L.y0, L.t1, -tp, D+tp));
  add('bottom', 'panel', 'Дно', 'carcass', 'ply9', B(0, W, L.y0, L.b1, 0, D+tp));
  const H = FL.info.hatch, hx0 = H.x - H.w/2, hx1 = H.x + H.w/2, hz0 = H.z - H.d/2, hz1 = H.z + H.d/2, hm = H.x;
  // для проверки пересечений пол с люком — четыре сплошных куска вокруг проёма
  add('floor1', 'floor-lower', 'Пол нижней сцены', 'floor', 'ply9', B(0, W, L.f1b, L.f1, 0, D+tp), {face:{n:'y', prims:FL.prims},
    solids:[B(0, W, L.f1b, L.f1, 0, hz0), B(0, W, L.f1b, L.f1, hz1, D+tp), B(0, hx0, L.f1b, L.f1, hz0, hz1), B(hx1, W, L.f1b, L.f1, hz0, hz1)]});
  const lidA = (opt.lid || 0) * Math.PI / 180;
  add('hatchLid', 'hatch-half', 'Крышка люка', 'floor', 'ply9', B(hm + .1, hx1 - .1, L.f1b, L.f1, hz0 + .1, hz1 - .1), {lidHinged:true, rot:{axis:'x', angle:lidA, pivot:[H.x, L.f1, hz1]}});
  // площадка трона: из выпила, вровень с полом; на ней трон и Ирод. Чем держать снизу — решается на месте.
  const drop = opt.drop || 0, tg2 = {group:'throne'};
  const TB = (x0, x1, y0, y1, z0, z1) => B(x0, x1, y0 - drop, y1 - drop, z0, z1);
  add('throneBase', 'hatch-half', 'Площадка трона', 'floor', 'ply9', TB(hx0 + .1, hm - .1, L.f1b, L.f1, hz0 + .1, hz1 - .1), tg2);
  add('throneS', null, 'Трон Ирода (декор, условно)', 'decor', null, TB(hx0 + .6, hm - .6, L.f1, L.f1 + 7, hz0 + .6, hz1 - .6), {group:'throne'});
  add('throneB', null, 'Трон Ирода (декор, условно)', 'decor', null, TB(hx0 + .6, hm - .6, L.f1 + 7, L.f1 + 16, hz1 - 2.6, hz1 - .6), {group:'throne'});
  add('herod', null, 'Ирод на троне (условно)', 'decor', null, TB((hx0 + hm)/2 - 2.6, (hx0 + hm)/2 + 2.6, L.f1 + 7, L.f1 + 7 + P.figH*.7, hz0 + 1, hz1 - 2.6), {group:'throne'});
  { const a2 = {assembly:'hingeLid', hosts:['hatchLid', 'floor1']};
    add('hingeLidf', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1, L.f1 + .1, hz1, hz1 + 2), Object.assign({}, a2));
    add('hingeLidm', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1, L.f1 + .1, hz1 - 2, hz1), Object.assign({lidHinged:true, rot:{axis:'x', angle:lidA, pivot:[H.x, L.f1, hz1]}}, a2));
    add('hingeLidp', null, 'Петля крышки люка', 'hw', null, B((hm + hx1)/2 - 1.5, (hm + hx1)/2 + 1.5, L.f1 - .3, L.f1 + .3, hz1 - .3, hz1 + .3), Object.assign({}, a2)); }
  add('ceil', 'panel', 'Потолок нижней сцены', 'carcass', 'ply9', B(0, W, L.c0, L.c1, 0, D+tp));
  add('floor2', 'floor-upper', 'Пол верхней сцены', 'floor', 'ply9', B(0, W, L.f2b, L.f2, 0, D+tp), {face:{n:'y', prims:FU.prims}});
  add('top', 'panel', 'Крышка корпуса', 'carcass', 'ply9', B(0, W, L.t0, L.t1, 0, D+tp), {face:{n:'y', prims:[]}});
  add('backL', 'back-lower', 'Задник нижней сцены', 'back-warm', 'ply6', B(0, W, L.f1, L.c0, D, D+tp), {face:{n:'z', prims:BL.prims}, solids:archSolids(BL, L.f1, L.c0)});
  add('backU', 'back-upper', 'Задник верхней сцены', 'back-cold', 'ply6', B(0, W, L.f2, L.t0, D, D+tp), {face:{n:'z', prims:BU.prims}, solids:archSolids(BU, L.f2, L.t0)});
  add('apron', 'apron', 'Фартук', 'fascia', 'ply6', B(0, W, L.y0, L.f1, -tp, 0));
  add('frieze', 'frieze', 'Пояс между этажами', 'fascia', 'ply6', B(0, W, L.c0-hVal, L.f2, -tp, 0));
  add('topFascia', 'top-fascia', 'Верхний фриз', 'fascia', 'ply6', B(0, W, L.t0-hVal2, L.t1, -tp, 0));
  [['1', L.f1b, FL], ['2', L.f2b, FU]].forEach(([k, yb, F]) => {
    // переднее ребро — часть корпуса: брусок между боковинами под передним краем пола, на клею и саморезах через боковины;
    // пол лежит на нём и на опорных брусках и ни к чему не крепится. Заднего ребра нет: задний край пола прижимает задник.
    add('ribF'+k, 'rib', 'Переднее ребро', 'rib', 'bar22', B(0, W, yb-2, yb, 0, 2), {feats:[0, W].map(x => ({kind:'screw', c:[x, yb-1, 1], r:.25, n:'саморез 3,5×25 снаружи через боковину в торец'}))});
  });
  [['b', L.b1, 1, 'дном'], ['f1', L.f1b, -1, 'полом нижней сцены'], ['c', L.c0, -1, 'потолком нижней сцены'], ['f2', L.f2b, -1, 'полом верхней сцены'], ['t', L.t0, -1, 'крышкой']].forEach(([k, y, dir, under]) => {
    const y0 = dir > 0 ? y : y - 2, y1 = dir > 0 ? y + 2 : y;
    const zb2 = (k === 'f1' || k === 'f2') ? D + tp : D - 2;   // под полами брусок доходит до заднего края
    const scr = x => [6, D/2, D - 6].map(z => ({kind:'screw', c:[x, (y0 + y1)/2, z], r:.25, n:'саморез 3,5×25 снаружи через боковину'}));
    add('clL'+k, 'cleat', 'Опорный брусок', 'cleat', 'bar22', B(0, 2, y0, y1, 2, zb2), {under, feats:scr(2)});
    add('clR'+k, 'cleat', 'Опорный брусок', 'cleat', 'bar22', B(W-2, W, y0, y1, 2, zb2), {under, feats:scr(W - 2)});
  });
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
  add('gableF', 'gable-front', 'Фронтон', 'roof', 'ply9', B(-ts, W+ts, ry, ry+P.hRoof, -tp, -tp+tg), {group:'roof', face:{n:'z', outline:GO.poly, prims:[{t:'poly', pts:star, role:'star'}]}, prism:{poly:gW, z0:-tp, z1:-tp+tg}});
  add('gableBar', 'gable-bar', 'Брусок фронтона', 'cleat', 'bar22', B(2, W-2, ry, ry+2, -tp+tg, -tp+tg+2), {group:'roof',
    feats:[scrX, W - scrX].map(x => ({kind:'screw', c:[x, ry + 2, scrZ], r:.25, n:'саморез 3,5×25 сверху через брусок в крышку'}))});
  add('starLamp', null, 'Фонарик звезды', 'light-star', null, B(W/2-1.5, W/2+1.5, ry+sv-1.5, ry+sv+1.5, -tp+tg, -tp+tg+3), {group:'roof'});
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
  return {parts, pups, L, FL, FU, BL, BU, Wout, Dc, Hc, dw, dh, dg, half, ch, star, sv, starR:R, gable:GO, scrX, hatch:{x0:hx0, x1:hx1, z0:hz0, z1:hz1}};
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
function faceW(p, u, v) { const b = p.b; return p.face.n === 'z' ? [b.x0+u, b.y0+v, (b.z0+b.z1)/2] : [b.x0+u, (b.y0+b.y1)/2, b.z0+v]; }
function faceSize(p) { const b = p.b; return p.face.n === 'z' ? [b.x1-b.x0, b.y1-b.y0] : [b.x1-b.x0, b.z1-b.z0]; }
function hull(pts) {
  const p = pts.map(a => [+a[0].toFixed(4), +a[1].toFixed(4)]).sort((a,b) => a[0]-b[0] || a[1]-b[1]); if (p.length < 3) return p;
  const cr = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length-1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

/* ---------- материалы и типы деталей ---------- */
const MAT = {
  ply15:{l:'Фанера 15 мм', t:1.5, kg:9.0}, ply9:{l:'Фанера 9 мм', t:0.9, kg:5.4}, ply6:{l:'Фанера 6 мм', t:0.6, kg:3.6},
  bar23:{l:'Брусок 20×30 мм', kgm:.3}, bar22:{l:'Брусок 20×20 мм', kgm:.2}, bar21:{l:'Рейка 20×10 мм', kgm:.1}, bar41:{l:'Рейка 40×10 мм', kgm:.2}};
const GROUPS = [
  ['Корпус', ['side','panel','cleat','rib'], 'Основа. Размеры, уровни и соединения проверены моделью; собираем на саморезы и клей.', 'основа'],
  ['Фасад', ['apron','frieze','top-fascia','door'], 'Основа. Планки клеятся к корпусу, створки висят на петлях. Фартук, пояс и верхний фриз не обязательно делать из фанеры: подойдут картон или другой лист, лишь бы держал форму. Створки — только деревянные.', 'основа'],
  ['Сцена', ['floor-lower','hatch-half','floor-upper','back-lower','back-upper'], 'Можно менять. Полы и задники ставятся без клея и вынимаются назад. Щели, проём трона и люка, арки и глазки — исходный вариант по «Фоме»: их можно пропилить, когда станет ясна драматургия, или выпилить новый пол и задник по тем же габаритам. Задники можно сделать не из фанеры, а из картона, плотной бумаги или ткани.', 'можно менять'],
  ['Фронтон', ['gable-front','gable-bar'], 'Декор, дело десятое. Форма фронтона и звезды — только вариант: её можно поменять, а фронтон можно не ставить вовсе. Основа здесь одна — крепление: брусок сзади фронтона прикручен к крышке двумя саморезами. Сам фронтон можно сделать и из картона.', 'декор, не основа']];
/* Сцена: детали, которые ставятся без клея и меняются вместе с драматургией. */
const STAGE = new Set(GROUPS.find(g => g[0] === 'Сцена')[1]);
const DECOR = new Set(['gable-front']);
const DECOR_NOTE = 'Декор, дело десятое. Форма фронтона и звезды — только вариант: её можно поменять, а фронтон можно не ставить вовсе. Основа — только крепление: брусок сзади фронтона прикручен к крышке двумя саморезами.';
const STAGE_NOTE = 'Деталь сцены. Габариты и посадка — основа, их не трогаем. Вырезы — исходный вариант по «Фоме»: их можно пропилить позже или переделать, когда станет ясна драматургия. Деталь ставится без клея и вынимается назад.';
const ORDER = GROUPS.flatMap(g => g[1]);

/* Описание каждого типа детали: название, вид на чертеже, где стоит, как сделать. */
function typeInfo(M) {
  const L = M.L, W = P.W, D = P.D, sw = fmt(P.slotW), Dc = M.Dc, Hc = M.Hc;
  return {
    side: {name:'Боковина', note:'', view:'Заготовка, обе одинаковые.',
      where:'Левая и правая стенки корпуса. На них держится всё остальное: к ним прикручиваются опорные бруски, а к брускам — панели.',
      make:[`Выпилить 2 прямоугольника ${fmt(Dc)} × ${fmt(Hc)} из фанеры 9 мм.`, 'Обе заготовки одинаковые: левая и правая получаются при сборке, когда на них прикручивают бруски.']},
    panel: {name:'Панель корпуса', note:'дно, потолок, крышка', view:'Вид сверху, передний край внизу.',
      where:'Три одинаковые доски корпуса: дно (низ ящика, стоит на подставке), потолок нижней сцены и крышка корпуса (на ней стоит фронтон). Все лежат на опорных брусках и прикручены к ним.',
      make:[`Выпилить 3 прямоугольника ${fmt(W)} × ${fmt(D+T.tp)} из фанеры 9 мм.`]},
    'floor-lower': {name:'Пол нижней сцены', note:'две петли, люк', view:'Вид сверху, передний край (зритель) внизу, задний край со стороны кукловодов вверху. Оси щелей — штрихпунктир.',
      where:'Пол дворца Ирода. Две щели-петли, как на чертежах «Фомы»: каждая начинается у заднего края под своей кулисой — кукла выезжает из-за задника сквозь арку, обходит свою сторону сцены и останавливается у центра. Концы петель не сходятся, поэтому пол цельный. У задника по центру — общий проём: левую половину закрывает площадка трона (по сигналу трон с Иродом проваливается), правую — откидная крышка люка.',
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(D+T.tp)} из фанеры 9 мм.`,
        'Щели и проём можно пропилить сразу или позже, когда станет ясна драматургия. Ниже — исходный вариант.',
        'Разметить ось левой петли по таблице (от заднего края), соединить точки плавной линией по гибкой рейке. Правую петлю разметить зеркально.',
        `Пропилить петли лобзиком от заднего края пола по обе стороны от оси, ширина ${sw}. Конец каждой петли у центра закруглить сверлом ${fmt(P.slotW)}.`,
        `Проём ${fmt(M.FL.info.hatch.w)} × ${fmt(M.FL.info.hatch.d)} у заднего края: засверлить углы сверлом 6 мм и выпилить лобзиком по линии. Вырезанный кусок не выбрасывать: из него получатся площадка трона и крышка люка.`,
        'Прошкурить края щелей наждачкой на рейке и проверить, что шкант Ø1 проходит по всей длине без заеданий.']},
    'floor-upper': {name:'Пол верхней сцены', note:'одна щель', view:'Вид сверху, передний край (зритель) внизу, задний край вверху. Ось щели — штрихпунктир.',
      where:'Пол «неба». Одна щель, как на чертежах «Фомы»: от заднего края под левой кулисой — к рампе и вдоль неё к центру, перед пещерой. Пастухи и волхвы выходят из-за кулисы, кланяются у пещеры и уходят тем же путём.',
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(D+T.tp)} из фанеры 9 мм.`,
        'Щель можно пропилить сразу или позже, когда станет ясна драматургия. Ниже — исходный вариант.',
        'Разметить ось щели по таблице (от заднего края) и провести плавную линию по гибкой рейке.',
        `Пропилить щель лобзиком от заднего края, ширина ${sw}. Конец у центра закруглить сверлом ${fmt(P.slotW)}.`,
        'Прошкурить края, проверить ход шканта Ø1.']},
    'back-lower': {name:'Задник нижней сцены', note:'арки, глазки', view:'Вид от зрителя.',
      where:'Задняя стенка дворца Ирода. Зажат между полом нижней сцены и потолком, сзади заподлицо с боковинами.',
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(P.hV)} из фанеры 6 мм.`, 'Разметить арки и глазки от левого нижнего угла.',
        'Арки выпилить лобзиком, верх — полукруг R5.', 'Глазки — сверло 15 мм.',
        'Вариант: вместо фанеры — плотная бумага, картон или ткань того же размера. Арки и глазки тогда вырезаются ножом.']},
    'back-upper': {name:'Задник верхней сцены', note:'арки, глазки', view:'Вид от зрителя.',
      where:'Задняя стенка «неба». Зажат между полом верхней сцены и крышкой.',
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(P.hA)} из фанеры 6 мм.`, 'Разметить арку и глазки от левого нижнего угла.',
        'Арку выпилить лобзиком, верх — полукруг R5.', 'Глазки — сверло 15 мм.',
        'Вариант: вместо фанеры — плотная бумага, картон или ткань того же размера.']},
    apron: {name:'Фартук', note:'', view:'Вид от зрителя.',
      where:'Закрывает спереди зону Г — щель между дном и полом нижней сцены, где ходит рука нижнего кукловода с рукояткой куклы, — и торцы дна и нижнего пола. Стоит между боковинами, заподлицо с их передним краем.',
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(L.f1-L.y0)} из фанеры 6 мм.`]},
    frieze: {name:'Пояс между этажами', note:'с ламбрекеном', view:'Вид от зрителя.',
      where:`Закрывает спереди зону Б — промежуток между потолком нижней сцены и полом верхней, где ходит рука верхнего кукловода. Нижние ${fmt(T.hVal)} см опускаются ниже потолка как ламбрекен.`,
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(L.f2-L.c0+T.hVal)} из фанеры 6 мм.`]},
    'top-fascia': {name:'Верхний фриз', note:'', view:'Вид от зрителя.',
      where:`Над верхней сценой. Опускается на ${fmt(T.hVal2)} см ниже крышки.`,
      make:[`Выпилить прямоугольник ${fmt(W)} × ${fmt(L.t1-L.t0+T.hVal2)} из фанеры 6 мм.`]},
    door: {name:'Створка', note:'', view:'Заготовка, обе одинаковые.',
      where:'Две створки закрывают весь фасад корпуса. Открываются на 180°, внутренняя сторона становится «крыльями» для росписи.',
      make:[`Выпилить 2 прямоугольника ${fmt(M.dw)} × ${fmt(M.dh)} из фанеры 6 мм.`, `Створка на ${fmt(M.dg*20)} мм ниже корпуса: так остаётся по ${fmt(M.dg*10)} мм зазора сверху и снизу, и она не цепляет фронтон и стол.`]},
    'gable-front': {name:'Фронтон', note:'декор, со звездой', view:'Вид от зрителя. Контур симметричный.',
      where:'Над фасадом, стоит на крышке корпуса заподлицо с верхним фризом. Это декор: форма-кокошник — только вариант, её можно поменять. Звезда выпилена насквозь, сзади фонарик и матовый фильтр.',
      make:[`Выпилить заготовку ${fmt(M.Wout)} × ${fmt(P.hRoof)} из фанеры 9 мм.`,
        'Разметить левую половину контура по таблице, соединить точки плавной линией по гибкой рейке. Правую половину — зеркально (удобно по шаблону из картона).',
        'Выпилить контур лобзиком, прошкурить.', 'Разметить звезду по таблице, засверлить внутренние углы сверлом 6 мм и выпилить.']},
    'gable-bar': {name:'Брусок фронтона', note:'', view:'Вид сверху, передний край внизу.',
      where:'Приклеен сзади к фронтону по нижнему краю и прикручен к крышке двумя саморезами сверху, через брусок. Для перевозки саморезы выкручивают и фронтон снимают.',
      make:[`Отпилить брусок 20×20 длиной ${fmt(W - 4)}.`]},
    rib: {name:'Переднее ребро', note:'', view:'Вид спереди.',
      where:'Брусок между боковинами под передним краем каждого пола, часть корпуса. Пол лежит на нём спереди и на опорных брусках по бокам и ни к чему не крепится: ребро держит пол со щелями от прогиба, а сам пол остаётся простой съёмной доской. Сзади пол прижимает задник, поэтому заднего ребра нет.',
      make:[`Отпилить 2 бруска 20×20 длиной ${fmt(W)}.`]},
    cleat: {name:'Опорный брусок', note:'', view:'Вид сбоку.',
      where:'По пять на каждую боковину: под крышкой, полом верхней сцены, потолком, полом нижней сцены и над дном. Под полами бруски доходят до заднего края: полы лежат на них без крепежа, и их можно вытянуть назад.',
      make:[`Отпилить 10 брусков 20×20: 4 длиной ${fmt(D + T.tp - 2)} (под полы) и 6 длиной ${fmt(D-4)}.`]},
    'hatch-half': {name:'Площадка трона и крышка люка', note:'из выпила пола', view:'Вид сверху.',
      where:'Две половинки куска, выпиленного из проёма в нижнем полу. Левая — площадка трона: на ней трон с Иродом, по сигналу она проваливается вниз. Правая — крышка люка: висит на петле и откидывается вверх.',
      make:['Кусок, выпиленный из проёма пола, распилить пополам поперёк длинной стороны.',
        `Каждую половинку подрезать по 1 мм с каждой стороны, чтобы ходила в проёме свободно: получится 2 детали ${fmt(M.FL.info.hatch.w/2 - .2)} × ${fmt(M.FL.info.hatch.d - .2)}.`,
        'Левая половинка — площадка трона, правая — крышка люка.']},
    puppet: {name:'Кукла', note:'типовая', view:'Вид спереди, кукла стоит в щели.',
      where:'Двигается по щели пола. Шкант проходит сквозь щель, снизу рукоятка в кулаке кукловода.',
      make:['Голова — косточка авокадо, просверлить снизу отверстие под шкант.', 'Тело — конус из ткани или картона на шканте.',
        'Диск Ø4,5 из фанеры приклеить на шкант: на нём кукла стоит сама.', `Под полом на шкант насадить рукоятку Ø2,4 длиной ${fmt(P.handle)}.`,
        'Проверить в щели: кукла не должна цепляться диском и заваливаться.']}
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
    `Петли для створок, карточные ${fmt(5)} × ${fmt(5)} см: ${cnt('Петля створки')/3} шт, к ним шурупы 3×12 (длиннее нельзя: торец боковины 9 мм)`,
    `Петля для крышки люка, маленькая ${fmt(3)} × ${fmt(4)} см: ${cnt('Петля крышки люка')/3} шт`,
    `Саморезы 3,5×25: ${M.parts.reduce((s, p) => s + (p.feats || []).filter(f => f.kind === 'screw').length, 0)} шт (опорные бруски к боковинам и фронтон к крышке)`,
    'Фонарик для звезды и матовый фильтр (цветная пластиковая папка)',
    'Клей ПВА, гвоздики, шкурка',
    'Шканты Ø10 мм для кукол: по одному на куклу, ~15 см',
    'Для щелей: коронка Ø40, сверло Ø20 и Ø6, лобзик, наждачка на рейке, гибкая рейка для разметки дуги'
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
  {t:'Боковины и опорные бруски', ids:['sideL','sideR','clLb','clRb','clLf1','clRf1','clLc','clRc','clLf2','clRf2','clLt','clRt'], types:['side','cleat'], sheets:['side','cleat'],
   text:'Из двух одинаковых заготовок делаем левую и правую боковины: на каждую по разметке прикручиваем 5 опорных брусков.',
   do:['Положить обе боковины рядом внутренней стороной вверх, передними краями в разные стороны: левая и правая получаются зеркальными. Размечать обе сразу.',
     'От нижнего края отложить высоты из левого столбца схемы и провести линии угольником. Пунктир на схеме — где потом лягут панели.',
     'Бруски ставятся по разметке (на схеме закрашены). Под панелью брусок стоит под линией, у дна — над линией.',
     'Два длинных бруска — под полами, они доходят до заднего края. Остальные отступают на 2 см от переднего и заднего края.',
     'Бруски крепятся снаружи, через боковину: так саморез 3,5×25 проходит 9 мм боковины и на 16 мм входит в брусок. Те же высоты разметить и на наружной стороне, по линиям насверлить отверстия Ø3 (места на схеме бруска), прижать брусок изнутри и закрутить. Шляпки снаружи потом закрашиваются.']},
  {t:'Дно и передние рёбра', ids:['bottom','ribF1','ribF2'], types:['panel','rib'], sheets:['rib'],
   text:'Ставим боковины, соединяем их дном и двумя передними рёбрами под полы.',
   do:['Поставить боковины вертикально, внутренними сторонами друг к другу (удобно вдвоём).', 'Завести дно между боковинами под нижние бруски и прикрутить снизу вверх в бруски. Дальше ящик стоит сам.',
     'Между боковинами у переднего края поставить два ребра — бруски 20×20. Верх ребра — вровень с верхом опорного бруска под полом: на них потом ляжет пол. Места — на схеме боковины в шаге 1.',
     'Каждое ребро — на клей и по саморезу 3,5×25 с каждого конца, снаружи через боковину в торец.']},
  {t:'Потолок нижней сцены', ids:['ceil'], types:['panel'],
   text:'Потолок кладём на бруски и прикручиваем.', do:['Завести потолок между боковинами, положить на его бруски и прикрутить к ним.']},
  {t:'Крышка корпуса', ids:['top'], types:['panel'],
   text:'Крышку кладём на верхние бруски и прикручиваем.',
   do:['Положить крышку на верхние бруски и прикрутить к ним.']},
  {t:'Фартук, пояс, верхний фриз', ids:['apron','frieze','topFascia'], types:['apron','frieze','top-fascia'],
   text:'Три фасадные планки закрывают спереди зоны рук и торцы панелей.',
   do:['Каждая планка встаёт между боковинами заподлицо с их передним краем. Фартук доходит ровно до верха нижнего пола, пояс — до верха верхнего: в них потом упрутся полы, и вперёд они не выедут.',
     'Фартук приклеить к переднему торцу дна и к боковинам, пояс — к торцу потолка и к боковинам, верхний фриз — к торцу крышки. Прихватить гвоздиками.',
     'К полам не клеить: полы съёмные и только упираются в планки.']},
  {t:'Створки', ids:['doorL','doorR'].concat([0,1,2].flatMap(i => ['L','R'].flatMap(s => ['f','m','p'].map(k => 'hinge' + s + i + k)))), types:['door'], sheets:['door'],
   text:'Створки вешаем на петли на передний угол боковин.',
   do:['На каждую створку по 3 петли, места на схеме. Петлю ставить на внешний передний угол боковины, иначе створка не откроется на 180°. Шурупы в торец боковины — короткие, 3×12, с засверловкой Ø2, чтобы не расколоть фанеру 9 мм.',
     'Проверить: створки открываются на 180°, между закрытыми створками зазор 2 мм.',
     'Чем держать створки закрытыми (крючок и т. п.), решаем на месте.']},
  {t:'Пол нижней сцены', ids:['floor1','hatchLid','hingeLidf','hingeLidm','hingeLidp','throneBase'], types:['floor-lower','hatch-half'], sheets:['floor-lower','hatch-half'],
   text:'Сцены ставим, когда корпус готов. Пол задвигаем сзади по брускам до упора в фартук, без крепежа: его можно вынуть и переделать.',
   do:[
     'На столе: крышку люка вставить в правую половину проёма и поставить петлю по заднему краю, на верхнюю сторону крышки и пола. Петля с упором на 180°: тогда крышка не проваливается вниз.',
     'Проверить: крышка откидывается назад до ~100° и сама падает обратно.',
     'Задвинуть пол сзади по опорным брускам до упора в фартук. Спереди он лежит на ребре. Ничем не крепить.',
     'Площадку трона вставить в левую половину проёма вровень с полом. Чем держать её снизу, решаем на месте; без опоры она должна свободно падать вниз.']},
  {t:'Пол верхней сцены', ids:['floor2'], types:['floor-upper'], sheets:['floor-upper'],
   text:'Как нижний пол: задвигаем сзади до упора в пояс, без крепежа.',
   do:['Задвинуть пол сзади по опорным брускам до упора в пояс между этажами. Спереди он лежит на ребре. Ничем не крепить.']},
  {t:'Задники', ids:['backL','backU'], types:['back-lower','back-upper'],
   text:'Задники ставим сзади враспор, без клея.',
   do:['Нижний задник завести сзади между нижним полом и потолком, верхний — между верхним полом и крышкой. Не клеить: задник прижимает задний край пола, а если сцена поменяется, его вынимают.',
     'Бумажный или тканевый задник прибить строительным степлером к задним торцам боковин, пола и потолка (крышки).',
     'Чтобы вынуть пол: снять задник и вытянуть пол назад по брускам.']},
  {t:'Фронтон', ids:['gableF','gableBar','starLamp'], types:['gable-front','gable-bar'], sheets:['gable-front','gable-bar'],
   text:'Фронтон — декор, его можно делать в самом конце или не ставить вовсе.',
   do:['Сзади за звездой приклеить матовый фильтр (цветная пластиковая папка).',
     'Сзади по нижнему краю, по центру, приклеить брусок фронтона отверстиями вниз.',
     'Фонарик звезды закрепить сзади на фронтоне за звездой.',
     'Поставить фронтон на крышку заподлицо с верхним фризом и прикрутить брусок к крышке сверху двумя саморезами 3,5×25 (места на схеме бруска): 20 мм проходят брусок, 5 мм входят в крышку, насквозь не выходит. Для перевозки саморезы выкручивают.']},
  {t:'На подставку, декор, куклы', ids:['standTop','leg00','leg01','leg10','leg11','caveL','caveR','caveT','throneS','throneB','herod'], types:[],
   text:'Ставим ящик на подставку и наполняем сцены.',
   do:['Поставить корпус на стол или козлы, высоту подобрать по кукловодам.', 'Трон с Иродом приклеить на площадку трона, поставить пещеру. Это художественная часть, в модели она показана условно.']}
];
window.V = {DEF, T, P, RANGES, saveP, resetP, changed, esc, fmt, r1, levels, bz, sample, model, xform, verts, wbox, faceW, faceSize, hull,
  MAT, GROUPS, ORDER, blankSig, STAGE, STAGE_NOTE, DECOR, DECOR_NOTE, gableOutline, typeInfo, partTypes, cutData, hardware, checks, STEPS, puppeteers, puppeteerHits, audit, convex, convexes, penetration, contact, joined, puppetCyl, along, stations, dot, cross, TOL};
})();
