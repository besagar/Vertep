/* Вертепный ящик — 3D. Строится из того же списка деталей, что и чертежи (assets/core.js).
   Режимы: full (обзор, всё управление), part (одна деталь подсвечена, остальное прозрачное),
   steps (сборка: видны детали до текущего шага, текущие подсвечены). */
(function () {
'use strict';
const {P, T, model, wbox, faceSize, MAT, fmt, bz} = V;
const COL = {carcass:0xd9bb8e, floor:0xe4c9a0, 'back-warm':0xa65038, 'back-cold':0x4d7592, fascia:0xc9a374, door:0xd2b285, roof:0xc6a274,
  rib:0xb08a58, cleat:0xb08a58, decor:0x8d877d, 'light-warm':0xffb36b, 'light-cold':0xa6d4ff, 'light-star':0xffe08a, stand:0x7b848d, hw:0x8e959c};
const T3 = q => new THREE.Vector3(q[0], q[1], -q[2]);
const PRESETS = {
  free:{theta:-.62, phi:.26, ortho:false, cut:null, plan:null},
  front:{theta:0, phi:0, ortho:true, cut:false, plan:null},
  section:{theta:Math.PI/2, phi:0, ortho:true, cut:true, plan:null},
  planU:{theta:0, phi:1.555, ortho:true, cut:false, plan:'upper'},
  planL:{theta:0, phi:1.555, ortho:true, cut:false, plan:'lower'},
  rear:{theta:Math.PI, phi:0, ortho:true, cut:false, plan:null}};

function create(host, opts) {
  opts = Object.assign({mode:'full', highlight:null, onPick:null}, opts || {});
  const fail = msg => { host.insertAdjacentHTML('beforeend', `<div class="nogl">${msg}</div>`); return null; };
  if (!window.THREE) return fail('3D-библиотека не загрузилась. Чертежи работают и без неё.');
  const canvas = document.createElement('canvas'); canvas.className = 'gl'; canvas.setAttribute('aria-label', '3D-модель вертепного ящика'); host.prepend(canvas);
  let renderer; try { renderer = new THREE.WebGLRenderer({canvas, antialias:true}); } catch (e) { canvas.remove(); return fail('Браузер не дал WebGL. Чертежи работают и без него.'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(), camP = new THREE.PerspectiveCamera(32, 1, 1, 6000), camO = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, .72));
  const dir = new THREE.DirectionalLight(0xffffff, .78); dir.position.set(-170, 330, 280); dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048);
  Object.assign(dir.shadow.camera, {left:-170, right:170, top:270, bottom:-60, near:10, far:1000}); dir.shadow.bias = -.0006;
  scene.add(dir, dir.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({opacity:.16})); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(400, 40, 0x888888, 0x888888); grid.material.transparent = true; grid.material.opacity = .18; grid.position.y = .02; scene.add(grid);
  const root = new THREE.Group(); scene.add(root);
  const lw = new THREE.PointLight(0xffa060, .55, 110, 2), lc = new THREE.PointLight(0x9cc8ff, .5, 110, 2); scene.add(lw, lc);
  const st = {doorAngle:180, puppets:true, hands:true, people:opts.mode === 'full', lights:true, stand:true, xray:false, cut:false, explode:false, anim:false, lid:false, planCut:null, ortho:false,
    visible:null, hl:opts.highlight ? new Set(opts.highlight) : null};
  const R = {M:null, objs:new Map(), pups:new Map(), pick:[], groups:null, orbit:{theta:-.62, phi:.26, r:400, target:new THREE.Vector3(40, 110, -18)}, need:true, planTarget:null, sel:null};

  function themeBg() { const c = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#e5e9ea'; scene.background = new THREE.Color(c); R.need = true; }
  function placeCam() {
    const o = R.orbit, cp = Math.cos(o.phi), asp = Math.max(.2, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const pos = new THREE.Vector3(o.target.x + o.r*cp*Math.sin(o.theta), o.target.y + o.r*Math.sin(o.phi), o.target.z + o.r*cp*Math.cos(o.theta));
    [camP, camO].forEach(c => { c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(o.target); });
    camP.aspect = asp; camP.updateProjectionMatrix();
    const hh = o.r*Math.tan(16*Math.PI/180); Object.assign(camO, {left:-hh*asp, right:hh*asp, top:hh, bottom:-hh}); camO.updateProjectionMatrix();
    R.need = true;
  }
  function matFor(p) {
    const c = COL[p.cat];
    if (p.cat.startsWith('light')) return new THREE.MeshStandardMaterial({color:c, emissive:c, emissiveIntensity:1});
    return new THREE.MeshStandardMaterial({color:c, roughness:.84, metalness:0});
  }
  /* доска: настоящий контур заготовки (шипы, вырезы с края, щели) с дырами, вытянутый на толщину;
     канавка — отдельным слоем на её глубину, где контур с канавкой */
  function boardObj(p) {
    const S = V.boardShape(p), mat = matFor(p), grp = new THREE.Group();
    mat.side = THREE.DoubleSide; mat.flatShading = true;   // нормаль грани — по экрану: без пятен на пластях
    const path = (pa, pts) => { pts.forEach((q, i) => i ? pa.lineTo(q[0], q[1]) : pa.moveTo(q[0], q[1])); pa.closePath(); return pa; };
    const shape = (outer, holes) => { const sh = path(new THREE.Shape(), outer);
      holes.forEach(h => sh.holes.push(path(new THREE.Path(), h)));
      S.circles.forEach(c => { const pa = new THREE.Path(); pa.absarc(c.c[0], c.c[1], c.r, 0, Math.PI*2, true); sh.holes.push(pa); });
      return sh; };
    const e0 = S.to3(0, 0, 0), ax = [[1,0,0],[0,1,0],[0,0,1]].map(a => { const q = S.to3(a[0], a[1], a[2]); return [q[0] - e0[0], q[1] - e0[1], -(q[2] - e0[2])]; });
    const flip = V.dot(ax[0], V.cross(ax[1], ax[2])) < 0;
    const layer = (sh, d0, d1) => {
      const g = new THREE.ExtrudeGeometry(sh, {depth:d1 - d0, bevelEnabled:false, curveSegments:12}), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const q = S.to3(pos.getX(i), pos.getY(i), d0 + pos.getZ(i)); pos.setXYZ(i, q[0], q[1], -q[2]); }
      if (flip) for (let i = 0; i + 2 < pos.count; i += 3) { const x = pos.getX(i+1), y = pos.getY(i+1), z = pos.getZ(i+1); pos.setXYZ(i+1, pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2)); pos.setXYZ(i+2, x, y, z); }
      g.deleteAttribute('normal'); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m); };
    if (!S.pockets.length) layer(shape(S.outer, S.holes), 0, S.t);
    else {
      const dp = S.pockets[0].depth, top = S.pockets[0].at === 'max', holes2 = S.holes.slice(); let o2 = S.outer;
      S.pockets.forEach(k => { const s2 = V.splice(o2, k.pts); if (s2) o2 = s2; else holes2.push(k.pts); });
      if (top) { layer(shape(S.outer, S.holes), 0, S.t - dp); layer(shape(o2, holes2), S.t - dp, S.t); }
      else { layer(shape(o2, holes2), 0, dp); layer(shape(S.outer, S.holes), dp, S.t); }
    }
    grp.userData.shape = S; grp.userData.mats = [mat];
    return grp;
  }
  function objFor(p) {
    let obj;
    if (p.face) obj = boardObj(p);
    else if (p.prism) {
      const sh = new THREE.Shape(); p.prism.poly.forEach((q, i) => i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1])); sh.closePath();
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {depth:p.prism.z1 - p.prism.z0, bevelEnabled:false}), matFor(p));
      m.position.z = -p.prism.z1; m.castShadow = m.receiveShadow = true; obj = m; obj.userData.mats = [m.material];
    }
    else { const b = p.b, m = new THREE.Mesh(new THREE.BoxGeometry(b.x1-b.x0, b.y1-b.y0, b.z1-b.z0), matFor(p)); m.castShadow = !p.cat.startsWith('light'); m.receiveShadow = true;
      m.position.copy(T3([(b.x0+b.x1)/2, (b.y0+b.y1)/2, (b.z0+b.z1)/2])); obj = m; obj.userData.mats = [m.material]; }
    if (p.rot) { const pv = new THREE.Group(); pv.position.copy(T3(p.rot.pivot)); obj.position.sub(pv.position); pv.add(obj); pv.rotation[p.rot.axis] = p.rot.axis === 'x' ? -p.rot.angle : p.rot.angle; pv.userData.mats = obj.userData.mats; obj = pv; }
    obj.traverse(o => { o.userData.part = p; });
    obj.userData.mats.forEach(m => { m.userData.base = {color:m.color.getHex(), emissive:m.emissive ? m.emissive.getHex() : 0}; });
    return obj;
  }
  function pupObj(pp) {
    const g = new THREE.Group(), head = T.head, bodyH = P.figH - head, yF = pp.yF, yB = pp.yB;
    const fab = new THREE.MeshStandardMaterial({color:pp.tier === 'upper' ? 0x5f88a8 : 0xb4583e, roughness:.9});
    const add = (geo, mat, y, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = cast; g.add(m); return m; };
    add(new THREE.CylinderGeometry(2.25, 2.25, .5, 28), fab, yF + .25);
    add(new THREE.CylinderGeometry(1.4, 2.6, bodyH, 24), fab, yF + .5 + bodyH/2);
    const hd = add(new THREE.SphereGeometry(head/2, 24, 16), new THREE.MeshStandardMaterial({color:0x7a5a2e, roughness:.6}), yF + .5 + bodyH + head/2); hd.scale.set(.8, 1, .8);
    const wood = new THREE.MeshStandardMaterial({color:0xc8a774, roughness:.8});
    add(new THREE.CylinderGeometry(.5, .5, yF - yB + .5, 12), wood, (yF + .5 + yB)/2);
    add(new THREE.CylinderGeometry(1.2, 1.2, P.handle, 16), wood, yB - P.handle/2);
    const fist = add(new THREE.SphereGeometry(4.2, 20, 14), new THREE.MeshStandardMaterial({color:0xd9a98a, roughness:.7, transparent:true, opacity:.55}), yB - P.handle*.55, false);
    fist.userData.fist = true;
    g.position.set(pp.x, 0, -pp.z);
    g.traverse(o => { o.userData.part = {name:'Кукла: ' + pp.name, cat:'puppet', type:'puppet', pp}; });
    return g;
  }
  function limb(a, b, r, mat) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
    m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; }
  /* кукловоды из V.puppeteers: капсулы тела, голова, глаза напротив глазков, линии взгляда */
  function capsule(a, b, r, mat) {
    const g = new THREE.Group(); g.add(limb([a[0], a[1], -a[2]], [b[0], b[1], -b[2]], r, mat));
    [a, b].forEach(q => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); s.position.set(q[0], q[1], -q[2]); g.add(s); });
    return g;
  }
  function peopleObj(M) {
    const g = new THREE.Group(), D = P.D, zb = D + T.tp;
    V.puppeteers(M).forEach(pp => {
      const col = pp.tier === 'upper' ? 0x6f8ea8 : 0xa8786a;
      const mat = new THREE.MeshStandardMaterial({color:col, roughness:.9, transparent:true, opacity:.55, depthWrite:false});
      const pg = new THREE.Group();
      pp.caps.forEach(c => pg.add(capsule(c.a, c.b, c.r, mat)));
      const hd = new THREE.Mesh(new THREE.SphereGeometry(pp.head.r, 24, 16), mat); hd.position.set(pp.head.c[0], pp.head.c[1], -pp.head.c[2]); pg.add(hd);
      if (pp.stool) { const s = new THREE.Mesh(new THREE.CylinderGeometry(pp.stool.r, pp.stool.r, pp.stool.h, 24), new THREE.MeshStandardMaterial({color:0x8a7f72, transparent:true, opacity:.5, depthWrite:false})); s.position.set(pp.stool.c[0], pp.stool.c[1], -pp.stool.c[2]); pg.add(s); }
      const eyeMat = new THREE.MeshBasicMaterial({color:0x1b2229}), lineMat = new THREE.LineDashedMaterial({color:pp.tier === 'upper' ? 0x2c6388 : 0xad482d, dashSize:2, gapSize:1.5});
      [-3.2, 3.2].forEach(dx => {
        const ex = pp.eyeX + dx, ez = zb + 1.6;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), eyeMat); eye.position.set(ex, pp.eyeY, -ez); pg.add(eye);
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ex, pp.eyeY, -ez), new THREE.Vector3(ex, pp.eyeY - 6, -8)]);
        const ln = new THREE.Line(geo, lineMat); ln.computeLineDistances(); pg.add(ln);
      });
      pg.traverse(o => { o.userData.part = {name:pp.name + ': смотрит в глазки на высоте +' + fmt(pp.eyeY) + ', рука держит рукоятку под полом', cat:'people'}; });
      g.add(pg);
    });
    return g;
  }
  function disposeTree(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); }
  function rebuild() {
    const M = model(st.doorAngle); R.M = M;
    root.children.slice().forEach(c => { root.remove(c); disposeTree(c); });
    R.objs.clear(); R.pups.clear(); R.pick = [];
    const groups = {corpus:new THREE.Group(), doors:new THREE.Group(), roof:new THREE.Group(), stand:new THREE.Group(), pups:new THREE.Group(), people:new THREE.Group(), throne:new THREE.Group(), bar:new THREE.Group()};
    Object.values(groups).forEach(g => root.add(g)); R.groups = groups;
    M.parts.forEach(p => { const o = objFor(p); groups[p.group].add(o); R.objs.set(p.id, o); R.pick.push(o); });
    M.pups.forEach(pp => { const o = pupObj(pp); groups.pups.add(o); R.pups.set(pp.id, o); R.pick.push(o); });
    groups.people.add(peopleObj(M));
    const L = M.L; lw.position.set(P.W/2, L.c0 - 4, -8); lc.position.set(P.W/2, L.t0 - 4, -8);
    dir.target.position.set(P.W/2, L.roof/2, -P.D/2);
    R.orbit.target.set(P.W/2, R.planTarget || L.roof/2, -P.D/2);
    R.sel = null; apply(); placeCam();
  }
  function paint(o, mode) {
    const p = o.userData.part, mats = o.userData.mats || [];
    const xr = st.xray && ['carcass','door','fascia','roof'].includes(p.cat);
    mats.forEach(m => {
      const b = m.userData.base || {color:m.color.getHex(), emissive:0};
      m.color.setHex(b.color); if (m.emissive) m.emissive.setHex(b.emissive);
      let tr = false, op = 1, dw = true;
      if (xr) { tr = true; op = .16; dw = false; }
      if (mode === 'ghost') { tr = true; op = .1; dw = false; }
      if (mode === 'hot' && m.emissive) m.emissive.setHex(0x8a3d00);
      if (mode === 'sel' && m.emissive) m.emissive.setHex(0x553300);
      m.transparent = tr; m.opacity = op; m.depthWrite = dw; m.needsUpdate = true;
    });
  }
  function apply() {
    if (!R.M) return; const L = R.M.L, g = R.groups;
    g.stand.visible = st.stand; g.pups.visible = st.puppets; g.people.visible = st.people && !st.planCut;
    g.roof.position.y = st.explode ? 30 : 0;
    const cutY = st.planCut === 'upper' ? L.t0 - .01 : st.planCut === 'lower' ? L.c0 - T.hVal - .01 : Infinity;
    R.objs.forEach((o, id) => {
      const p = o.userData.part; let v = true;
      if (st.cut && (id === 'sideR' || id === 'doorR')) v = false;
      if (p.b.y0 >= cutY) v = false;
      if (!st.lights && p.cat.startsWith('light')) v = false;
      if (st.visible && !st.visible.has(id)) v = false;
      o.visible = v;
      const mode = st.hl ? (st.hl.has(id) ? 'hot' : (opts.mode === 'part' ? 'ghost' : 'base')) : (R.sel === id ? 'sel' : 'base');
      paint(o, mode);
    });
    R.pups.forEach(o => { const pp = o.userData.part.pp; o.visible = !(st.planCut === 'lower' && pp.tier === 'upper') && !(st.visible && !st.visible.has('puppets'));
      o.traverse(c => { if (c.userData.fist) c.visible = st.hands; }); });
    lw.visible = lc.visible = st.lights;
    R.need = true;
  }
  function setDoor(deg) {
    st.doorAngle = deg; const a = deg*Math.PI/180;
    R.objs.forEach(o => { const p = o.userData.part; if (p.group === 'doors' && p.rotSign) o.rotation.y = p.rotSign*a; });
    R.need = true;
  }
  function preset(k) {
    const s = PRESETS[k], L = R.M.L;
    st.ortho = s.ortho; st.planCut = s.plan; if (s.cut !== null) st.cut = s.cut;
    R.planTarget = s.plan === 'upper' ? L.f2 : s.plan === 'lower' ? L.f1 : null;
    Object.assign(R.orbit, {theta:s.theta, phi:s.phi, r:s.plan ? P.W*2.9 : L.roof*1.95});
    R.orbit.target.set(P.W/2, R.planTarget || L.roof/2, -P.D/2);
    apply(); placeCam();
  }
  function frame(ids) {
    const box = new THREE.Box3(); ids.forEach(id => { const o = R.objs.get(id); if (o) box.expandByObject(o); });
    if (box.isEmpty()) return; const c = new THREE.Vector3(), s = new THREE.Vector3(); box.getCenter(c); box.getSize(s);
    R.orbit.target.copy(c); R.orbit.r = Math.max(120, Math.max(s.x, s.y, s.z)*2.6); placeCam();
  }
  function animPup(t) { const o = R.pups.get('pu1'); if (!o) return; const k = .02 + .96*(1 - Math.cos(t/1000*.6))/2, q = V.along(R.M.FU.info.hook, k); o.position.set(q[0], 0, -q[1]); }
  /* люк: крышка и подвижное крыло петли откидываются вместе, цикл 4 с */
  function setLidAngle(deg) { R.objs.forEach(o => { if (o.userData.part.lidHinged) o.rotation.x = -deg*Math.PI/180; }); R.need = true; }
  function animLid(t) { const k = (t/1000) % 4, e = q => q*q*(3 - 2*q); setLidAngle(100*(k < 1.2 ? e(k/1.2) : k < 2.2 ? 1 : k < 3.4 ? 1 - e((k - 2.2)/1.2) : 0)); }
  /* провал трона, цикл 5 с: площадку отпускают, она с троном и Иродом падает до дна, потом возвращается */
  function animThrone(t) {
    const k = (t/1000) % 5, e = q => q*q*(3 - 2*q), M = R.M, dmax = M.L.f1b - M.L.b1;
    const drop = k < .6 ? 0 : k < 1.4 ? dmax*(Math.min(1, (k - .6)/.8))**2 : k < 3.6 ? dmax : k < 4.4 ? dmax*(1 - e((k - 3.6)/.8)) : 0;
    R.groups.throne.position.y = -drop; R.need = true;
  }
  function setThrone(on) { st.throne = on; if (!on && R.groups) R.groups.throne.position.y = 0; R.need = true; }
  function setLid(on) { st.lid = on; if (!on) setLidAngle(0); R.need = true; }
  function stopAnim() { st.anim = false; const pp = R.M.pups[0], o = R.pups.get('pu1'); if (o) o.position.set(pp.x, 0, -pp.z); R.need = true; }
  function pick(e) {
    const r = canvas.getBoundingClientRect(), nd = new THREE.Vector2((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(nd, st.ortho ? camO : camP);
    const hit = rc.intersectObjects(R.pick, true).find(h => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    const p = hit ? hit.object.userData.part : null;
    R.sel = p && p.id ? p.id : null; apply();
    if (opts.onPick) opts.onPick(p);
  }
  function measure() {
    const M = R.M, L = M.L, rows = [], box = new THREE.Box3();
    const ry = R.groups.roof.position.y; R.groups.roof.position.y = 0; root.updateMatrixWorld(true);
    const bOf = ids => { box.makeEmpty(); ids.forEach(id => { const o = R.objs.get(id); if (o) box.expandByObject(o); }); return box.clone(); };
    const corpusIds = M.parts.filter(p => p.group === 'corpus' && ['carcass','floor','back-warm','back-cold','fascia'].includes(p.cat)).map(p => p.id);
    const sz = new THREE.Vector3(); bOf(corpusIds).getSize(sz);
    const add = (t, a, b) => rows.push({t, a, b});
    add('Ширина корпуса', M.Wout, sz.x); add('Высота корпуса', M.Hc, sz.y); add('Глубина корпуса', M.Dc, sz.z);
    add('Отметка пола нижней сцены', L.f1, bOf(['floor1']).max.y); add('Отметка пола верхней сцены', L.f2, bOf(['floor2']).max.y);
    add('Верх фронтона', L.roof, bOf(['gableF']).max.y);
    let dsz = 0; const dl = R.objs.get('doorL'); if (dl) dl.traverse(o => { if (o.geometry) { o.geometry.computeBoundingBox(); dsz = o.geometry.boundingBox.max.x - o.geometry.boundingBox.min.x; } });
    add('Ширина створки', M.dw, dsz);
    let dhz = 0; if (dl) dl.traverse(o => { if (o.geometry) { dhz = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y; } });
    add('Высота створки', M.dh, dhz);
    R.groups.roof.position.y = ry; root.updateMatrixWorld(true);
    // щель верхнего пола: в контуре, из которого построена 3D-доска, на оси щели — дыра, в 2,5 см поперёк — дерево
    const f2 = R.objs.get('floor2'), S = f2 && f2.userData.shape;
    let slot = null;
    if (S) { const q = V.along(M.FU.info.hook, .5), q2 = V.along(M.FU.info.hook, .52), tl = Math.hypot(q2[0] - q[0], q2[1] - q[1]) || 1, nx = -(q2[1] - q[1])/tl, nz = (q2[0] - q[0])/tl;
      const a = V.solidAt(S, q[0], q[1], S.t/2), b = V.solidAt(S, q[0] + nx*2.5, q[1] + nz*2.5, S.t/2); slot = {ok:!a && b, x:q[0], z:q[1]}; }
    return {rows, slot};
  }
  // управление камерой
  const pts = new Map(); let down = null, moved = false, pinch = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); down = [e.clientX, e.clientY]; moved = false;
    if (pts.size === 2) { const a = [...pts.values()]; pinch = {d:Math.hypot(a[0][0]-a[1][0], a[0][1]-a[1][1]), r:R.orbit.r}; } });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) moved = true; if (!moved) return;
      const o = R.orbit; o.theta -= dx*.008; o.phi = Math.max(-.25, Math.min(1.555, o.phi + dy*.006)); placeCam(); }
    else if (pts.size === 2 && pinch) { moved = true; const a = [...pts.values()], d = Math.hypot(a[0][0]-a[1][0], a[0][1]-a[1][1]); R.orbit.r = Math.max(60, Math.min(1400, pinch.r*pinch.d/Math.max(1, d))); placeCam(); }
  });
  const up = e => { const had = pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (had && !moved && pts.size === 0 && e.type === 'pointerup') pick(e); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); R.orbit.r = Math.max(60, Math.min(1400, R.orbit.r*Math.exp(e.deltaY*.0012))); placeCam(); }, {passive:false});
  new ResizeObserver(() => { const r = host.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); placeCam(); }).observe(host);
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', themeBg) : mq.addListener(themeBg));
  new MutationObserver(themeBg).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  themeBg();
  const loop = t => { if (st.anim) { animPup(t); R.need = true; } if (st.lid) animLid(t); if (st.throne) animThrone(t); if (R.need) { R.need = false; renderer.render(scene, st.ortho ? camO : camP); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  rebuild();
  return {st, R, rebuild, apply, setDoor, preset, frame, measure, stopAnim, setLid, setThrone, get M() { return R.M; }};
}
window.VV = {create};
})();
