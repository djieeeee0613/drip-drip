// 秤豆、磨豆、注水三個步驟的 3D 場景。
// 模型全部用基本幾何體組出來，不載入外部模型檔。
// 載入失敗（沒網路、不支援 WebGL）時 window.Scene3D 不存在，遊戲會自動用原本的 2D 畫面。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const INK = 0x4a2f1d;
const C = 300;      // 遊戲邏輯座標的中心（和 game.js 一致）
const BED_R = 215;  // 遊戲邏輯座標的粉床半徑

/* ---------- 材質與小工具 ---------- */

// 三階色階：卡通風的光影
const grad = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = THREE.NearestFilter;
grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
const glass = (color = 0xdff1f5, opacity = 0.3) => new THREE.MeshPhongMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide, shininess: 120, depthWrite: false,
});
const flat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide,
});

// 描邊：把背面沿法線往外推一點
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  transformed += normalize(normal) * 0.03;',
  );
};

function mesh(geo, mat, x = 0, y = 0, z = 0, outlined = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (outlined) m.add(new THREE.Mesh(geo, outlineMat));
  return m;
}
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const cyl = (rTop, rBottom, h, seg = 32, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function blobShadow(r, x = 0, z = 0) {
  const m = mesh(new THREE.CircleGeometry(r, 32), flat(INK, 0.2), x, 0.006, z);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  g.clear();
}

/* ---------- 共用狀態 ---------- */

let renderer;
let scene;
let camera;
let viewsEl;
let host = null;
let mode = null;
let view = 'angle';
let raf = 0;
let shakeT = 0;
let last = 0;
const groups = {};
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

// 每個場景的三個鏡頭：[鏡頭 x, y, z, 看向 x, y, z]
const VIEWS = {
  weigh: {
    angle: [0.5, 3.0, 4.6, 0.5, 0.9, 0],
    top: [0.35, 6.6, 0.01, 0.35, 0.5, 0],
    side: [0.5, 1.3, 5.6, 0.5, 1.1, 0],
  },
  grind: {
    angle: [2.0, 3.4, 4.6, 0, 1.4, 0],
    top: [0, 7.0, 0.01, 0, 1.3, 0],
    side: [0, 1.6, 6.2, 0, 1.45, 0],
  },
  brew: {
    angle: [0.25, 4.7, 3.5, 0.25, 1.8, 0],
    top: [0, 5.6, 0.01, 0, 1.95, 0],
    side: [0.5, 2.7, 5.2, 0.4, 1.5, 0],
  },
};
const VIEW_NAMES = { angle: '斜角', top: '俯視', side: '側面' };

/* ---------- 場景一：秤豆 ---------- */

const W = { beans: [], grams: 0, pouring: false, shown: -1, tilt: 0.25 };

function buildWeigh() {
  const g = new THREE.Group();
  g.add(blobShadow(1.9));

  // 電子秤
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.28, 2.6), toon(0xeef2ee), 0, 0.14, 0, true));
  g.add(mesh(cyl(1.05, 1.05, 0.07, 40), toon(0xb9c4c8), 0, 0.315, -0.15, true));

  // 秤的螢幕（把數字畫在貼圖上）
  W.canvas = document.createElement('canvas');
  W.canvas.width = 256;
  W.canvas.height = 96;
  W.tex = new THREE.CanvasTexture(W.canvas);
  W.tex.colorSpace = THREE.SRGBColorSpace;
  const screen = mesh(new THREE.PlaneGeometry(1.15, 0.36), new THREE.MeshBasicMaterial({ map: W.tex }), 0, 0.285, 1.08);
  screen.rotation.x = -Math.PI / 2;
  g.add(screen);

  // 玻璃碗
  g.add(mesh(lathe([[0.05, 0], [0.5, 0.04], [0.8, 0.3], [0.93, 0.62], [0.96, 0.66]]), glass(), 0, 0.35, -0.15));

  // 豆袋：以袋底為軸傾斜
  W.bag = new THREE.Group();
  W.bag.position.set(1.7, 1.85, -0.15);
  W.bag.add(mesh(new THREE.BoxGeometry(0.9, 1.25, 0.55), toon(0xc89b6a), 0, 0.625, 0, true));
  const roll = mesh(cyl(0.11, 0.11, 0.6, 12), toon(0xb08454), 0.3, 1.27, 0, true);
  roll.rotation.x = Math.PI / 2;
  W.bag.add(roll);
  const label = mesh(new THREE.PlaneGeometry(0.55, 0.5), flat(INK), 0, 0.6, 0.281);
  W.bag.add(label);
  W.bag.add(mesh(new THREE.CircleGeometry(0.14, 20), flat(0xf6e7cf), 0, 0.6, 0.283));
  g.add(W.bag);

  W.group = g;
  W.beanGeo = new THREE.SphereGeometry(0.085, 10, 8);
  W.beanMat = toon(0x7a4a2b);
  return g;
}

function drawScale(grams) {
  const c = W.canvas.getContext('2d');
  c.fillStyle = '#20302a';
  c.fillRect(0, 0, 256, 96);
  c.fillStyle = '#8ff2c0';
  c.font = 'bold 64px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(`${grams.toFixed(1)} g`, 128, 52);
  W.tex.needsUpdate = true;
}

function resetWeigh(game) {
  W.beans.forEach((b) => W.group.remove(b.m));
  W.beans = [];
  W.grams = 0;
  W.pouring = false;
  W.shown = -1;
  W.beanMat.color.set(game.bean ? game.bean.color : '#7a4a2b');
}

function updateWeigh(dt) {
  const shown = Math.round(W.grams * 10);
  if (shown !== W.shown) { W.shown = shown; drawScale(W.grams); }
  if (W.grams < 0.05 && W.beans.length) resetWeigh({ bean: null });

  W.tilt = lerp(W.tilt, W.pouring ? 2.05 : 0.25, 1 - 0.0005 ** dt);
  W.bag.rotation.z = W.tilt;

  // 袋口在世界座標的位置
  const mouth = new THREE.Vector3(-0.25, 1.3, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), W.tilt).add(W.bag.position);

  const want = Math.min(90, Math.floor(W.grams / 0.22));
  while (W.beans.length < want) {
    const i = W.beans.length;
    const layer = Math.floor(i / 12);
    const r = Math.sqrt(Math.random()) * Math.min(0.78, 0.4 + layer * 0.07);
    const a = Math.random() * Math.PI * 2;
    const m = new THREE.Mesh(W.beanGeo, W.beanMat);
    m.scale.set(1, 0.62, 1.4);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    W.group.add(m);
    W.beans.push({
      m, t: 0, from: mouth.clone(),
      to: new THREE.Vector3(Math.cos(a) * r, 0.44 + layer * 0.075, -0.15 + Math.sin(a) * r),
    });
  }
  W.beans.forEach((b) => {
    if (b.t >= 1) return;
    b.t = Math.min(1, b.t + dt / 0.42);
    b.m.position.lerpVectors(b.from, b.to, b.t);
    b.m.position.y += Math.sin(b.t * Math.PI) * 0.35; // 拋物線
    b.m.rotation.x += dt * 9;
  });
}

/* ---------- 場景二：磨豆 ---------- */

const G = { angle: 0, p: 0, size: 5, shownAngle: 0 };

function buildGrind() {
  const g = new THREE.Group();
  g.add(blobShadow(0.95));

  // 粉倉（透明）和裡面的咖啡粉
  g.add(mesh(cyl(0.5, 0.5, 0.8, 32, true), glass(), 0, 0.4, 0));
  g.add(mesh(cyl(0.5, 0.5, 0.04), toon(0xb9c4c8), 0, 0.02, 0, true));
  G.grounds = mesh(cyl(0.46, 0.46, 1), toon(0x5a3319));
  g.add(G.grounds);

  // 刻度環
  G.ring = new THREE.Group();
  G.ring.position.y = 0.89;
  G.ring.add(mesh(cyl(0.56, 0.56, 0.18), toon(0x4a4f57), 0, 0, 0, true));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tick = mesh(new THREE.BoxGeometry(0.03, i === 0 ? 0.16 : 0.09, 0.02), flat(i === 0 ? 0xe2725b : 0xfffaf0), Math.sin(a) * 0.565, 0, Math.cos(a) * 0.565);
    tick.rotation.y = a;
    G.ring.add(tick);
  }
  g.add(G.ring);

  // 金屬機身 + 木頭握環
  g.add(mesh(cyl(0.5, 0.5, 0.8), toon(0xd4dde0), 0, 1.38, 0, true));
  g.add(mesh(cyl(0.52, 0.52, 0.2), toon(0xb56a22), 0, 1.38, 0));

  // 豆倉（透明）和裡面的豆子
  g.add(mesh(cyl(0.5, 0.5, 0.5, 32, true), glass(), 0, 2.03, 0));
  G.beanMat = toon(0x7a4a2b);
  G.beans = mesh(cyl(0.46, 0.46, 1), G.beanMat);
  g.add(G.beans);

  // 蓋子和把手
  g.add(mesh(cyl(0.53, 0.53, 0.06), toon(0x4a4f57), 0, 2.31, 0, true));
  G.crank = new THREE.Group();
  G.crank.position.y = 2.38;
  G.crank.add(mesh(cyl(0.09, 0.09, 0.14, 16), toon(0x9aa6b8), 0, 0, 0, true));
  G.crank.add(mesh(new THREE.BoxGeometry(1.05, 0.07, 0.15), toon(0xb9c4c8), 0.5, 0.04, 0, true));
  G.crank.add(mesh(cyl(0.05, 0.05, 0.28, 12), toon(0x9aa6b8), 1.0, 0.2, 0));
  G.crank.add(mesh(new THREE.SphereGeometry(0.17, 20, 14), toon(0xe2725b), 1.0, 0.42, 0, true));
  g.add(G.crank);
  return g;
}

function resetGrind(game) {
  G.angle = 0;
  G.shownAngle = 0;
  G.p = 0;
  G.size = 5;
  G.beanMat.color.set(game.bean ? game.bean.color : '#7a4a2b');
}

function updateGrind(dt) {
  // 走最短的角度差，避免把手倒轉一大圈
  let d = G.angle - G.shownAngle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  G.shownAngle += d * (1 - 0.00001 ** dt);
  G.crank.rotation.y = -G.shownAngle;

  const gh = Math.max(0.001, 0.72 * G.p);
  G.grounds.scale.y = gh;
  G.grounds.position.y = 0.04 + gh / 2;
  const bh = Math.max(0.001, 0.44 * (1 - G.p));
  G.beans.scale.y = bh;
  G.beans.position.y = 1.79 + bh / 2;
  G.beans.visible = G.p < 0.995;
  G.ring.rotation.y = lerp(G.ring.rotation.y, (G.size - 5) * 0.35, 1 - 0.001 ** dt);
}

/* ---------- 場景三：注水 ---------- */

const B = { st: null, bubbles: [], coffee: 0, tilt: -0.15, dripT: 0, steam: [] };

// 三款濾杯的尺寸
const DRIPPERS = {
  v60: { bedY: 1.95, bedR: 0.74, cup: [[0.16, 1.34], [0.2, 1.36], [1.0, 2.2], [1.04, 2.2]], paper: [[0.14, 1.4], [0.98, 2.28]] },
  kalita: { bedY: 1.8, bedR: 0.77, cup: [[0.5, 1.34], [0.56, 1.36], [0.95, 2.1], [0.99, 2.1]], paper: [[0.5, 1.4], [0.93, 2.18]] },
  chemex: { bedY: 2.0, bedR: 0.75, paper: [[0.3, 1.5], [0.97, 2.33]] },
};

function buildKettle() {
  // 原點在壺嘴尖端，這樣只要把整支壺移到注水點上方就好
  const k = new THREE.Group();
  const steel = toon(0x6b7684);
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.14, 0.06, 0), new THREE.Vector3(0.5, -0.08, 0),
    new THREE.Vector3(0.85, -0.5, 0), new THREE.Vector3(1.08, -0.72, 0),
  ]);
  k.add(mesh(new THREE.TubeGeometry(spout, 24, 0.05, 10), steel, 0, 0, 0, true));
  k.add(mesh(lathe([[0.02, 0], [0.55, 0], [0.6, 0.1], [0.5, 0.85], [0.3, 0.9]]), steel, 1.55, -0.9, 0, true));
  k.add(mesh(cyl(0.32, 0.32, 0.06), toon(0x4a4f57), 1.55, 0.03, 0, true));
  k.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), toon(0xe2725b), 1.55, 0.12, 0, true));
  const handle = mesh(new THREE.TorusGeometry(0.38, 0.055, 8, 20, Math.PI), toon(0x4a4f57), 2.08, -0.42, 0, true);
  handle.rotation.z = -Math.PI / 2;
  k.add(handle);
  return k;
}

function buildBrew(game) {
  const g = groups.brew;
  disposeGroup(g);
  const id = game.dripper ? game.dripper.id : 'v60';
  const d = DRIPPERS[id];
  const color = new THREE.Color(game.dripper ? game.dripper.color : '#e2725b');
  B.d = d;
  g.add(blobShadow(1.05));

  B.coffeeMat = toon(0x5a2f14);
  if (id === 'chemex') {
    // Chemex：沙漏形玻璃壺，濾杯和下壺一體
    g.add(mesh(lathe([[0.02, 0], [0.85, 0], [0.92, 0.15], [0.85, 0.7], [0.36, 1.3], [0.36, 1.45], [1.0, 2.3]]), glass(0xdff1f5, 0.32)));
    g.add(mesh(lathe([[0.53, 1.12], [0.4, 1.28], [0.4, 1.47], [0.53, 1.63]], 32), toon(0xb56a22), 0, 0, 0, true));
    g.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xe9c896), 0, 1.38, 0.47));
    B.coffeeR = 0.84;
    B.coffeeMax = 0.6;
    B.dripY = 1.3;
  } else {
    // 玻璃下壺 + 濾杯
    g.add(mesh(lathe([[0.02, 0], [0.75, 0], [0.8, 0.1], [0.8, 0.9], [0.55, 1.2], [0.55, 1.3]]), glass(0xdff1f5, 0.32)));
    g.add(mesh(cyl(0.82, 0.82, 0.07, 36), toon(color), 0, 1.32, 0, true));
    g.add(mesh(lathe(d.cup), toon(color, { side: THREE.DoubleSide }), 0, 0, 0, true));
    const handle = mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI), toon(color), -0.86, 1.78, 0, true);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    B.coffeeR = 0.76;
    B.coffeeMax = 0.8;
    B.dripY = 1.3;
  }
  B.coffeeMesh = mesh(cyl(B.coffeeR, B.coffeeR, 1, 32), B.coffeeMat);
  g.add(B.coffeeMesh);

  // 濾紙、粉床、水面
  g.add(mesh(lathe(d.paper), toon(0xfffaf0, { side: THREE.DoubleSide })));
  B.bedMat = toon(0x8b5a34);
  B.bed = mesh(new THREE.CircleGeometry(d.bedR, 40), B.bedMat, 0, d.bedY, 0);
  B.bed.rotation.x = -Math.PI / 2;
  g.add(B.bed);
  B.waterMat = new THREE.MeshPhongMaterial({ color: 0xc48c54, transparent: true, opacity: 0, shininess: 140, depthWrite: false });
  const water = mesh(new THREE.CircleGeometry(d.bedR * 0.98, 40), B.waterMat, 0, d.bedY + 0.02, 0);
  water.rotation.x = -Math.PI / 2;
  g.add(water);

  // 引導圈、邊緣警告
  B.guide = mesh(new THREE.TorusGeometry(d.bedR * 0.48, 0.012, 6, 48), flat(0xfffaf0, 0.65), 0, d.bedY + 0.035, 0);
  B.guide.rotation.x = Math.PI / 2;
  g.add(B.guide);
  B.edge = mesh(new THREE.TorusGeometry(d.bedR * 0.94, 0.035, 6, 48), flat(0xe2463a, 0.9), 0, d.bedY + 0.04, 0);
  B.edge.rotation.x = Math.PI / 2;
  g.add(B.edge);

  // 泡泡（重複使用固定數量）
  B.bubbles = [];
  const bubbleGeo = new THREE.CircleGeometry(0.07, 12);
  for (let i = 0; i < 40; i++) {
    const m = mesh(bubbleGeo, flat(0xf0cd96, 0.8), 0, d.bedY + 0.03, 0);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    g.add(m);
    B.bubbles.push({ m, life: 0 });
  }

  // 手沖壺、水柱、滴落的咖啡
  B.kettle = buildKettle();
  g.add(B.kettle);
  B.stream = mesh(cyl(0.028, 0.045, 1, 8), flat(0xbfe3f5, 0.88));
  g.add(B.stream);
  B.drip = mesh(new THREE.SphereGeometry(0.045, 8, 8), toon(0x5a2f14));
  g.add(B.drip);

  // 熱氣
  if (!B.steamTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    const rg = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, 'rgba(255,255,255,.9)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, 64, 64);
    B.steamTex = new THREE.CanvasTexture(c);
  }
  B.steam = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.steamTex, transparent: true, opacity: 0, depthWrite: false }));
    g.add(s);
    B.steam.push(s);
  }

  B.st = null;
  B.coffee = 0;
  B.tilt = -0.15;
  B.kettle.position.set(0.3, d.bedY + 1.15, 0);
}

function updateBrew(dt, now) {
  const d = B.d;
  const st = B.st || { px: C, py: C, pouring: false, water: 0, total: 1, pool: 0, onEdge: false, phase: 'pour' };
  const wx = ((st.px - C) / BED_R) * d.bedR;
  const wz = ((st.py - C) / BED_R) * d.bedR;
  const k = 1 - 0.0001 ** dt;

  // 手沖壺跟著手指，注水時傾斜
  const tipY = d.bedY + 1.15;
  B.kettle.position.x = lerp(B.kettle.position.x, wx, k);
  B.kettle.position.z = lerp(B.kettle.position.z, wz, k);
  B.kettle.position.y = tipY;
  B.tilt = lerp(B.tilt, st.pouring ? 0.32 : -0.15, 1 - 0.002 ** dt);
  B.kettle.rotation.z = B.tilt;
  B.kettle.rotation.y = 1.0; // 壺身轉到右後方，才不會擋住粉床
  B.kettle.visible = view !== 'top'; // 俯視時壺會擋住粉床

  // 水柱
  B.stream.visible = st.pouring;
  if (st.pouring) {
    B.stream.scale.y = tipY - d.bedY;
    B.stream.position.set(B.kettle.position.x, (tipY + d.bedY) / 2, B.kettle.position.z);
  }

  // 粉床越濕越深、水面反光
  const wet = clamp01(st.water / st.total);
  B.bedMat.color.setRGB(lerp(0.55, 0.26, wet), lerp(0.35, 0.15, wet), lerp(0.2, 0.08, wet));
  B.waterMat.opacity = st.pool * 0.6;
  B.guide.visible = st.phase === 'pour';
  B.edge.visible = st.onEdge;

  // 泡泡
  if (st.pouring && Math.random() < 0.6) {
    const b = B.bubbles.find((x) => x.life <= 0);
    if (b) {
      b.life = 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.12;
      b.m.position.x = B.kettle.position.x + Math.cos(a) * r;
      b.m.position.z = B.kettle.position.z + Math.sin(a) * r;
      b.m.scale.setScalar(0.5 + Math.random() * 1.1);
      b.m.visible = true;
    }
  }
  B.bubbles.forEach((b) => {
    if (b.life <= 0) return;
    b.life -= dt * 0.7;
    b.m.material.opacity = Math.max(0, b.life) * 0.8;
    if (b.life <= 0) b.m.visible = false;
    // 泡泡不要跑出粉床
    const rr = Math.hypot(b.m.position.x, b.m.position.z);
    if (rr > d.bedR * 0.95) b.m.visible = false;
  });

  // 下壺的咖啡慢慢變多，咖啡一滴滴落下
  B.coffee = lerp(B.coffee, wet, 1 - 0.5 ** dt);
  const h = Math.max(0.001, B.coffeeMax * B.coffee);
  B.coffeeMesh.scale.y = h;
  B.coffeeMesh.position.y = 0.03 + h / 2;
  B.coffeeMesh.visible = B.coffee > 0.01;
  const dripping = wet > 0.02 && B.coffee < 0.995;
  B.drip.visible = dripping;
  if (dripping) {
    B.dripT = (B.dripT + dt * 2.6) % 1;
    B.drip.position.set(0, lerp(B.dripY, 0.03 + h, B.dripT * B.dripT), 0);
  }

  // 熱氣
  B.steam.forEach((s, i) => {
    const ph = (now / 3000 + i * 0.2) % 1;
    s.position.set(-0.5 + i * 0.25 + Math.sin(now / 600 + i * 2) * 0.08, d.bedY + 0.2 + ph * 1.5, -0.2);
    s.scale.setScalar(0.35 + ph * 0.6);
    s.material.opacity = st.water > 0 ? Math.sin(ph * Math.PI) * 0.35 : 0;
  });
}

/* ---------- 鏡頭、迴圈 ---------- */

function setView(v, snap = false) {
  view = v;
  const cfg = VIEWS[mode][v];
  camPos.fromArray(cfg, 0);
  camTarget.fromArray(cfg, 3);
  if (mode === 'brew' && B.d) {
    // 三款濾杯高度不同，鏡頭跟著粉床高度微調
    const dy = B.d.bedY - 1.95;
    camPos.y += dy;
    camTarget.y += dy;
  }
  if (snap) {
    camera.position.copy(camPos);
    lookAt.copy(camTarget);
  }
  viewsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
}

function resize() {
  if (!host) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 直式窄畫面時把視角拉寬一點，模型才不會被切到
  camera.fov = camera.aspect < 1.2 ? 40 : 34;
  camera.updateProjectionMatrix();
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  const k = 1 - 0.002 ** dt;
  camera.position.lerp(camPos, k);
  lookAt.lerp(camTarget, k);
  if (shakeT > 0) {
    shakeT -= dt;
    const s = Math.max(0, shakeT) * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(lookAt);
  if (mode === 'weigh') updateWeigh(dt);
  else if (mode === 'grind') updateGrind(dt);
  else if (mode === 'brew') updateBrew(dt, now);
  renderer.render(scene, camera);
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'gl';

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0xc09a6a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);

  // 圓木桌
  scene.add(mesh(cyl(4.4, 4.4, 0.3, 56), toon(0xe9c896), 0, -0.15, 0, true));
  scene.add(mesh(cyl(4.0, 4.0, 0.01, 56), flat(0xdcb67e), 0, 0.003, 0));

  groups.weigh = buildWeigh();
  groups.grind = buildGrind();
  groups.brew = new THREE.Group();
  Object.values(groups).forEach((g) => { g.visible = false; scene.add(g); });

  // 視角切換按鈕
  viewsEl = document.createElement('div');
  viewsEl.className = 'views';
  Object.entries(VIEW_NAMES).forEach(([v, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = v;
    b.textContent = name;
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); // 不要被當成磨豆或注水的手勢
    b.addEventListener('click', (e) => { e.stopPropagation(); setView(v); });
    viewsEl.appendChild(b);
  });

  window.addEventListener('resize', resize);
}

/* ---------- 給 game.js 用的介面 ---------- */

const api = {
  get active() { return !!host; },

  mount(hostEl, m, game) {
    host = hostEl;
    mode = m;
    Object.entries(groups).forEach(([name, g]) => { g.visible = name === m; });
    if (m === 'weigh') resetWeigh(game);
    if (m === 'grind') resetGrind(game);
    if (m === 'brew') buildBrew(game);
    host.appendChild(renderer.domElement);
    host.appendChild(viewsEl);
    resize();
    setView('angle', true);
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  },

  unmount() {
    cancelAnimationFrame(raf);
    raf = 0;
    host = null;
    mode = null;
  },

  setWeigh(grams, pouring) { W.grams = grams; W.pouring = pouring; },

  setGrind({ angle, p, size }) {
    if (angle !== undefined) G.angle = angle;
    if (p !== undefined) G.p = p;
    if (size !== undefined) G.size = size;
  },

  setBrew(st) { B.st = st; },

  // 把手指在螢幕上的位置投影到粉床平面，換算成遊戲邏輯座標
  brewPoint(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -B.d.bedY), new THREE.Vector3());
    if (!hit) return { x: -9999, y: -9999 };
    return { x: C + (hit.x / B.d.bedR) * BED_R, y: C + (hit.z / B.d.bedR) * BED_R };
  },

  shake() { shakeT = 0.6; },
};

try {
  init();
  window.Scene3D = api;
  document.getElementById('app').classList.add('has3d');
} catch (e) {
  console.warn('3D 場景無法啟動，改用 2D 畫面', e);
}
