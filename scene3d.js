// 秤豆、磨豆、濕濾紙、注水四個步驟的 3D 場景。
// 模型全部用程式組出來（不載入外部模型檔），材質用物理光照、環境反射和即時陰影。
// 載入失敗（沒網路、瀏覽器不支援 import map 或 WebGL）時 window.Scene3D 不存在，遊戲自動改用 2D 畫面。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const C = 300;      // 遊戲邏輯座標的中心（和 game.js 一致）
const BED_R = 215;  // 遊戲邏輯座標的粉床半徑
const TAU = Math.PI * 2;

/* ---------- 小工具 ---------- */

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rand = (a, b) => a + Math.random() * (b - a);

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const cyl = (rTop, rBottom, h, seg = 48, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);

// 不透明的物件投影、接收陰影；玻璃、水這類透明物件不投影
function shadows(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const t = o.material.transparent;
    o.castShadow = !t;
    o.receiveShadow = !t;
  });
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  g.clear();
}

/* ---------- 程式產生的貼圖 ---------- */

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.MirroredRepeatWrapping;
    t.wrapT = THREE.MirroredRepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// 木紋
const woodTex = canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#a8743f';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 170; i++) {
    const y0 = Math.random() * h;
    const amp = rand(3, 12);
    const f = rand(0.004, 0.014);
    const ph = rand(0, 6);
    x.strokeStyle = Math.random() < 0.55
      ? `rgba(96,56,26,${rand(0.05, 0.22)})`
      : `rgba(238,196,138,${rand(0.05, 0.2)})`;
    x.lineWidth = rand(0.6, 3);
    x.beginPath();
    for (let X = 0; X <= w; X += 8) {
      const Y = y0 + Math.sin(X * f + ph) * amp + Math.sin(X * f * 3.1 + ph) * amp * 0.3;
      if (X) x.lineTo(X, Y); else x.moveTo(X, Y);
    }
    x.stroke();
  }
}, { repeat: [2, 2] });

// 咖啡粉的顆粒（灰階，顏色由材質決定；同時拿來當凹凸貼圖）
const grainTex = canvasTex(256, 256, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.random() * Math.random() * 190;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
}, { repeat: [4, 4] });

// 濾紙的纖維和皺紋
const paperTex = canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 5) {
    x.fillStyle = `rgba(130,105,70,${rand(0.03, 0.08)})`;
    x.fillRect(0, y, w, rand(1, 2));
  }
  for (let i = 0; i < 1800; i++) {
    const X = Math.random() * w;
    const Y = Math.random() * h;
    const a = rand(0, TAU);
    const l = rand(3, 14);
    x.strokeStyle = `rgba(140,118,90,${rand(0.02, 0.09)})`;
    x.lineWidth = rand(0.4, 1.2);
    x.beginPath();
    x.moveTo(X, Y);
    x.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l);
    x.stroke();
  }
});

// 磨豆機刻度環：深色陽極鋁 + 白色數字
const dialTex = canvasTex(1024, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a3e45');
  g.addColorStop(0.5, '#23262b');
  g.addColorStop(1, '#3a3e45');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#f4efe6';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let i = 0; i < 40; i++) {
    const X = (i / 40) * w;
    const big = i % 4 === 0;
    x.fillRect(X - 1.5, 0, 3, big ? 38 : 22);
    if (big) {
      x.font = 'bold 40px sans-serif';
      x.fillText(String(i / 4 + 1), X, 82);
    }
  }
});

// 豆袋的牛皮紙 + 標籤（換豆子時重畫）
const bagCanvas = document.createElement('canvas');
bagCanvas.width = 512;
bagCanvas.height = 640;
const bagTex = new THREE.CanvasTexture(bagCanvas);
bagTex.colorSpace = THREE.SRGBColorSpace;
bagTex.anisotropy = 4;
function drawBag(bean) {
  const x = bagCanvas.getContext('2d');
  const w = bagCanvas.width;
  const h = bagCanvas.height;
  x.fillStyle = '#c49866';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = Math.random() < 0.5 ? `rgba(120,80,40,${rand(0.04, 0.14)})` : `rgba(240,210,160,${rand(0.04, 0.14)})`;
    x.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 8));
  }
  // 標籤
  x.fillStyle = '#fbf6ea';
  x.fillRect(70, 250, w - 140, 270);
  x.strokeStyle = '#4a2f1d';
  x.lineWidth = 5;
  x.strokeRect(84, 264, w - 168, 242);
  x.fillStyle = '#4a2f1d';
  x.textAlign = 'center';
  x.font = 'bold 30px "Huninn", sans-serif';
  x.fillText('DRIP DRIP ROASTERY', w / 2, 310);
  x.fillRect(150, 330, w - 300, 3);
  x.font = 'bold 44px "Huninn", sans-serif';
  const name = bean ? bean.name.split(' ') : ['精品咖啡豆'];
  x.fillText(name[name.length - 1], w / 2, 392);
  x.font = '30px "Huninn", sans-serif';
  x.fillText(bean ? `${name[0]}・${bean.roast}` : '', w / 2, 440);
  x.font = '24px "Huninn", sans-serif';
  x.fillText(bean ? bean.desc : '', w / 2, 482);
  bagTex.needsUpdate = true;
}
drawBag(null);

/* ---------- 材質 ---------- */

const std = (color, roughness = 0.5, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness, metalness, envMapIntensity: metalness > 0.5 ? 1 : 0.5, ...extra,
});
const phys = (opts) => new THREE.MeshPhysicalMaterial(opts);
const steel = (roughness = 0.25, color = 0xdfe3e8) => std(color, roughness, 1);
const ceramic = (color) => phys({ color, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.7 });
const glass = (opacity = 0.12, tint = 0xffffff) => phys({
  color: tint, roughness: 0.03, metalness: 0, transparent: true, opacity,
  clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
});
const wood = (tint = 0xffffff, roughness = 0.55) => std(tint, roughness, 0, { map: woodTex });

// 烘焙後豆子的顏色（卡片上的顏色太淺，不適合拿來當豆子本身的顏色）
const roastColor = (bean) => new THREE.Color(bean && bean.roast === '中焙' ? 0x3f2210 : 0x5c3519);

/* ---------- 共用幾何 ---------- */

// 咖啡豆：一面平、平面上有一道中線凹槽
function beanGeometry(size = 0.085) {
  const g = new THREE.SphereGeometry(1, 20, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 0.72;
    let y = p.getY(i);
    const z = p.getZ(i) * 1.0;
    y *= y < 0 ? 0.3 : 0.58;
    if (y < 0) y += Math.exp(-(x * x) / 0.01) * 0.2;
    p.setXYZ(i, x * size, y * size, z * size * 1.38);
  }
  g.computeVertexNormals();
  return g;
}
const BEAN_GEO = beanGeometry();

// 漸細的管子（手沖壺的鵝頸嘴）
function taperedTube(curve, segs, radial, r0, r1) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = lerp(r0, r1, i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  g.computeVertexNormals();
  return g;
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
const UP = new THREE.Vector3(0, 1, 0);

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
  rinse: {
    angle: [0.25, 4.9, 3.7, 0.25, 1.75, 0],
    top: [0, 5.8, 0.01, 0, 1.9, 0],
    side: [0.5, 2.6, 5.4, 0.4, 1.4, 0],
  },
  brew: {
    angle: [0.25, 4.7, 3.5, 0.25, 1.8, 0],
    top: [0, 5.6, 0.01, 0, 1.95, 0],
    side: [0.5, 2.7, 5.2, 0.4, 1.5, 0],
  },
};
const VIEW_NAMES = { angle: '斜角', top: '俯視', side: '側面' };

/* ==========================================================
   場景一：秤豆
   ========================================================== */

const W = { beans: [], grams: 0, pouring: false, shown: -1, tilt: 0, lift: 0 };
const HF_N = 20;   // 碗裡豆堆高度圖的格數
const HF_R = 0.85; // 高度圖涵蓋的半徑
// 玻璃碗內側：半徑 r 處的碗底高度、高度 y 處的碗壁半徑
const bowlFloor = (r) => (r < 0.48 ? 0.05 : r < 0.79 ? lerp(0.05, 0.31, (r - 0.48) / 0.31) : lerp(0.31, 0.64, (r - 0.79) / 0.14));
const bowlWall = (y) => (y < 0.31 ? lerp(0.48, 0.79, clamp01((y - 0.05) / 0.26)) : lerp(0.79, 0.93, clamp01((y - 0.31) / 0.33)));
const BOWL_Y = 0.34;
const BOWL_Z = -0.2;

function buildWeigh() {
  const g = new THREE.Group();

  // 電子秤：石墨色機身、不鏽鋼秤盤、橡膠腳
  g.add(mesh(new RoundedBoxGeometry(2.6, 0.26, 2.3, 5, 0.09), std(0x2f3237, 0.5), 0, 0.16, 0.05));
  g.add(mesh(new RoundedBoxGeometry(2.3, 0.05, 1.7, 4, 0.02), steel(0.32), 0, 0.315, BOWL_Z));
  [[-1.1, -0.95], [1.1, -0.95], [-1.1, 1.05], [1.1, 1.05]].forEach(([x, z]) => {
    g.add(mesh(cyl(0.1, 0.1, 0.03, 20), std(0x111111, 0.9), x, 0.015, z));
  });

  // 液晶螢幕（數字畫在貼圖上）+ 兩顆按鍵
  g.add(mesh(new RoundedBoxGeometry(1.3, 0.02, 0.38, 2, 0.008), std(0x0d0f11, 0.15), 0, 0.29, 0.93));
  W.canvas = document.createElement('canvas');
  W.canvas.width = 256;
  W.canvas.height = 80;
  W.tex = new THREE.CanvasTexture(W.canvas);
  W.tex.colorSpace = THREE.SRGBColorSpace;
  const screen = mesh(new THREE.PlaneGeometry(1.12, 0.3), new THREE.MeshBasicMaterial({ map: W.tex, toneMapped: false }), 0, 0.302, 0.93);
  screen.rotation.x = -Math.PI / 2;
  g.add(screen);
  [-0.88, 0.88].forEach((x) => g.add(mesh(cyl(0.075, 0.075, 0.03, 24), std(0x4a4e55, 0.35, 0.3), x, 0.295, 0.93)));

  // 玻璃碗（有厚度、圓唇）
  g.add(mesh(lathe([
    [0.001, 0], [0.5, 0], [0.82, 0.28], [0.96, 0.62], [0.975, 0.66], [0.955, 0.675], [0.93, 0.64],
    [0.79, 0.31], [0.48, 0.05], [0.001, 0.05],
  ]), glass(0.2), 0, BOWL_Y, BOWL_Z));

  // 牛皮紙豆袋：底部寬、往上收扁，袋口有封邊和鐵絲
  W.bag = new THREE.Group();
  W.bag.position.set(2.0, 0, BOWL_Z);
  const bagGeo = new THREE.BoxGeometry(0.95, 1.3, 0.56, 10, 16, 6);
  bagGeo.translate(0, 0.65, 0);
  const bp = bagGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const t = bp.getY(i) / 1.3;
    const zf = lerp(1, 0.09, t ** 1.7);
    const xf = 1 + 0.05 * Math.sin(Math.PI * t);
    bp.setXYZ(i, bp.getX(i) * xf + rand(-0.004, 0.004), bp.getY(i), bp.getZ(i) * zf + rand(-0.003, 0.003));
  }
  bagGeo.computeVertexNormals();
  W.bag.add(mesh(bagGeo, std(0xffffff, 0.85, 0, { map: bagTex })));
  W.bag.add(mesh(new RoundedBoxGeometry(0.98, 0.12, 0.06, 2, 0.02), std(0xb88a58, 0.8), 0, 1.33, 0));
  W.bag.add(mesh(new RoundedBoxGeometry(1.08, 0.035, 0.07, 2, 0.012), steel(0.4, 0xd8c08a), 0, 1.25, 0));
  const valve = mesh(cyl(0.065, 0.065, 0.02, 24), std(0xf2ede2, 0.4), 0.27, 0.98, 0.135);
  valve.rotation.x = Math.PI / 2;
  W.bag.add(valve);
  g.add(W.bag);

  W.group = g;
  W.beanMats = [0, 1, 2].map(() => phys({ color: 0x5a3218, roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.5 }));
  return g;
}

function drawScale(grams) {
  const c = W.canvas.getContext('2d');
  c.fillStyle = '#0f1a16';
  c.fillRect(0, 0, 256, 80);
  c.fillStyle = 'rgba(140,240,190,.12)';
  c.font = 'bold 58px monospace';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillText('888.8', 200, 44);
  c.fillStyle = '#9dffd0';
  c.fillText(grams.toFixed(1), 200, 44);
  c.font = 'bold 30px monospace';
  c.fillText('g', 236, 50);
  W.tex.needsUpdate = true;
}

function resetWeigh(game) {
  W.beans.forEach((b) => W.group.remove(b.m));
  W.beans = [];
  W.grams = 0;
  W.pouring = false;
  W.shown = -1;
  W.hf = new Float32Array(HF_N * HF_N);
  for (let j = 0; j < HF_N; j++) {
    for (let i = 0; i < HF_N; i++) {
      const x = ((i + 0.5) / HF_N) * 2 - 1;
      const z = ((j + 0.5) / HF_N) * 2 - 1;
      W.hf[j * HF_N + i] = bowlFloor(Math.hypot(x, z) * HF_R);
    }
  }
  if (game.bean) {
    const base = roastColor(game.bean);
    W.beanMats.forEach((m, i) => m.color.copy(base).multiplyScalar([1, 0.8, 1.2][i]));
    drawBag(game.bean);
  }
}

function updateWeigh(dt) {
  const shown = Math.round(W.grams * 10);
  if (shown !== W.shown) { W.shown = shown; drawScale(W.grams); }
  if (W.grams < 0.05 && W.beans.length) resetWeigh({});

  // 按住時先把袋子從桌上拿起來，再傾斜倒豆；放開就放回桌上
  W.lift = lerp(W.lift, W.pouring ? 1 : 0, 1 - 0.0004 ** dt);
  const up = ease(clamp01(W.lift * 1.3));
  W.bag.position.set(lerp(2.0, 1.75, up), lerp(0, 1.95, up), BOWL_Z);
  W.tilt = 2.05 * ease(clamp01((W.lift - 0.3) / 0.7));
  W.bag.rotation.z = W.tilt;

  // 袋口在世界座標的位置
  const mouth = new THREE.Vector3(-0.3, 1.32, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), W.tilt).add(W.bag.position);

  const want = Math.min(110, Math.floor(W.grams / 0.18));
  while (W.lift > 0.75 && W.beans.length < want) {
    const i = W.beans.length;
    // 試幾個落點，挑最低的地方，豆子才會一顆顆往低處堆，不會浮在半空
    let best = null;
    for (let tries = 0; tries < 5; tries++) {
      const r = Math.sqrt(Math.random()) * 0.62;
      const a = rand(0, TAU);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ci = Math.min(HF_N - 1, Math.max(0, Math.floor(((x / HF_R + 1) / 2) * HF_N)));
      const cj = Math.min(HF_N - 1, Math.max(0, Math.floor(((z / HF_R + 1) / 2) * HF_N)));
      const h = W.hf[cj * HF_N + ci];
      if (r < bowlWall(h) - 0.1 && (!best || h < best.h)) best = { x, z, h };
    }
    if (!best) best = { x: 0, z: 0, h: W.hf[(HF_N / 2) * HF_N + HF_N / 2] };
    const y = best.h + 0.03;
    for (let j = 0; j < HF_N; j++) {
      for (let k = 0; k < HF_N; k++) {
        const x = (((k + 0.5) / HF_N) * 2 - 1) * HF_R;
        const z = (((j + 0.5) / HF_N) * 2 - 1) * HF_R;
        const dd = Math.hypot(x - best.x, z - best.z);
        if (dd < 0.13) W.hf[j * HF_N + k] = Math.max(W.hf[j * HF_N + k], y + 0.035 - dd * 0.3);
      }
    }
    const m = new THREE.Mesh(BEAN_GEO, W.beanMats[i % 3]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    W.group.add(m);
    W.beans.push({
      m, t: 0, from: mouth.clone(), spin: rand(6, 12),
      to: new THREE.Vector3(best.x, BOWL_Y + y, BOWL_Z + best.z),
      rest: new THREE.Euler(rand(-0.25, 0.25), rand(0, TAU), rand(-0.25, 0.25)),
    });
  }
  W.beans.forEach((b) => {
    if (b.t >= 1) return;
    b.t = Math.min(1, b.t + dt / 0.42);
    b.m.position.lerpVectors(b.from, b.to, b.t);
    b.m.position.y += Math.sin(b.t * Math.PI) * 0.35; // 拋物線
    if (b.t < 1) b.m.rotation.x += dt * b.spin;
    else b.m.rotation.copy(b.rest); // 落定後平躺
  });
}

/* ==========================================================
   場景二：磨豆
   ========================================================== */

const G = { angle: 0, p: 0, size: 5, shownAngle: 0, moving: 0 };
const HOPPER_BEANS = 70;

function buildGrind() {
  const g = new THREE.Group();

  // 粉杯：厚玻璃 + 不鏽鋼底座 + 螺紋
  g.add(mesh(cyl(0.52, 0.52, 0.06, 64), steel(0.3), 0, 0.03, 0));
  g.add(mesh(lathe([[0.49, 0.06], [0.49, 0.8], [0.46, 0.8], [0.46, 0.08]]), glass(0.18), 0, 0, 0));
  [0.7, 0.745].forEach((y) => {
    const t = mesh(new THREE.TorusGeometry(0.493, 0.009, 8, 64), glass(0.35), 0, y, 0);
    t.rotation.x = Math.PI / 2;
    g.add(t);
  });
  // 杯裡的咖啡粉：頂端微微隆起
  G.groundsMat = std(0x5a3319, 0.95, 0, { map: grainTex, bumpMap: grainTex, bumpScale: 2 });
  G.grounds = mesh(lathe([[0.001, 0], [0.44, 0], [0.44, 0.9], [0.32, 0.96], [0.001, 1]], 48), G.groundsMat);
  g.add(G.grounds);

  // 刻度環（深色鋁，數字貼圖）
  G.ring = mesh(cyl(0.545, 0.545, 0.17, 96), std(0xffffff, 0.35, 0.55, { map: dialTex }), 0, 0.89, 0);
  g.add(G.ring);
  const mark = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), std(0xe2725b, 0.4), 0, 1.0, 0.535);
  g.add(mark);

  // 機身：滾花鋁 + 胡桃木握環
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 120, 1, true);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + 0.014 * (Math.round(((a + Math.PI) / TAU) * 120) % 2);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  body.computeVertexNormals();
  g.add(mesh(body, std(0xc9ced4, 0.38, 0.9), 0, 1.38, 0));
  g.add(mesh(cyl(0.53, 0.53, 0.3, 96), wood(0x8c7058, 0.45), 0, 1.38, 0));
  [0.98, 1.78].forEach((y) => g.add(mesh(cyl(0.525, 0.525, 0.035, 96), steel(0.18), 0, y, 0)));

  // 豆倉（透明）和裡面一顆顆的豆子
  g.add(mesh(cyl(0.5, 0.5, 0.5, 64, true), glass(0.16), 0, 2.03, 0));
  G.beanMat = phys({ color: 0x5a3218, roughness: 0.5, clearcoat: 0.18, envMapIntensity: 0.5 });
  G.beans = new THREE.InstancedMesh(BEAN_GEO, G.beanMat, HOPPER_BEANS);
  const d = new THREE.Object3D();
  for (let i = 0; i < HOPPER_BEANS; i++) {
    const layer = Math.floor(i / 16);
    const r = Math.sqrt(Math.random()) * 0.33;
    const a = rand(0, TAU);
    d.position.set(Math.cos(a) * r, 1.83 + layer * 0.068, Math.sin(a) * r);
    d.rotation.set(rand(-0.5, 0.5), rand(0, TAU), rand(-0.5, 0.5));
    d.updateMatrix();
    G.beans.setMatrixAt(i, d.matrix);
  }
  g.add(G.beans);

  // 蓋子、軸承
  g.add(mesh(cyl(0.535, 0.535, 0.06, 96), steel(0.2), 0, 2.31, 0));
  g.add(mesh(cyl(0.13, 0.15, 0.08, 40), steel(0.15), 0, 2.37, 0));

  // 把手：圓管曲柄 + 木頭握把
  G.crank = new THREE.Group();
  G.crank.position.y = 2.42;
  G.crank.add(mesh(cyl(0.1, 0.1, 0.07, 40), steel(0.15), 0, 0, 0));
  G.crank.add(mesh(cyl(0.035, 0.035, 0.06, 20), steel(0.2), 0, 0.06, 0));
  const arm = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.4, 0.06, 0), new THREE.Vector3(0.8, 0.16, 0), new THREE.Vector3(1.0, 0.2, 0),
  ]);
  G.crank.add(mesh(new THREE.TubeGeometry(arm, 32, 0.036, 16), steel(0.16)));
  G.crank.add(mesh(cyl(0.025, 0.025, 0.1, 16), steel(0.2), 1.0, 0.25, 0));
  G.crank.add(mesh(lathe([[0.001, 0], [0.06, 0], [0.11, 0.07], [0.135, 0.19], [0.12, 0.29], [0.07, 0.34], [0.001, 0.35]], 40),
    wood(0x9a7a5c, 0.4), 1.0, 0.29, 0));
  g.add(G.crank);

  // 掉進粉杯的細粉
  const pts = new Float32Array(90 * 3);
  G.dustGeo = new THREE.BufferGeometry();
  G.dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  G.dust = new THREE.Points(G.dustGeo, new THREE.PointsMaterial({ color: 0x4a2a14, size: 0.03, transparent: true, opacity: 0.9 }));
  G.dustSeed = Array.from({ length: 90 }, () => [rand(0, TAU), Math.sqrt(Math.random()) * 0.22, Math.random()]);
  g.add(G.dust);
  return g;
}

function resetGrind(game) {
  G.angle = 0;
  G.shownAngle = 0;
  G.p = 0;
  G.size = 5;
  G.moving = 0;
  if (game.bean) G.beanMat.color.copy(roastColor(game.bean));
}

function updateGrind(dt) {
  // 走最短的角度差，避免把手倒轉一大圈
  let d = G.angle - G.shownAngle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  G.shownAngle += d * (1 - 0.00001 ** dt);
  G.crank.rotation.y = -G.shownAngle;
  G.moving = Math.max(0, G.moving - dt);

  const gh = Math.max(0.001, 0.68 * G.p);
  G.grounds.scale.y = gh;
  G.grounds.position.y = 0.065;
  G.beans.count = Math.round(HOPPER_BEANS * (1 - G.p));
  G.ring.rotation.y = lerp(G.ring.rotation.y, -(G.size - 1) * (TAU / 10), 1 - 0.001 ** dt);

  // 轉動時細粉從刀盤掉下來
  G.dust.visible = G.moving > 0 && G.p < 1;
  if (G.dust.visible) {
    const top = 0.065 + gh;
    const p = G.dustGeo.attributes.position;
    G.dustSeed.forEach((s, i) => {
      s[2] = (s[2] + dt * 1.6) % 1;
      p.setXYZ(i, Math.cos(s[0]) * s[1], lerp(0.82, top, s[2]), Math.sin(s[0]) * s[1]);
    });
    p.needsUpdate = true;
  }
}

/* ==========================================================
   濾杯組（濕濾紙和注水共用）
   ========================================================== */

// 三款濾杯：濾紙的錐形剖面、粉床高度
const DRIPPERS = {
  v60: { bedY: 1.95, paper: [[0.14, 1.42], [1.0, 2.3]], seg: 64 },
  kalita: { bedY: 1.8, paper: [[0.49, 1.42], [0.9, 2.2]], seg: 120, wave: true },
  chemex: { bedY: 2.0, paper: [[0.3, 1.5], [0.97, 2.33]], seg: 8 },
};
// 多邊形濾紙的內切圓比例（圓形 = 1）
const inR = (d) => (d.seg <= 12 ? Math.cos(Math.PI / d.seg) : 1);
const paperR = (d, y) => {
  const [[r0, y0], [r1, y1]] = d.paper;
  return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
};
const PAPER_DRY = new THREE.Color(0xfffbf2);
const PAPER_WET = new THREE.Color(0xae8d63);

function buildKettle() {
  // 原點在壺嘴尖端，這樣只要把整支壺移到注水點上方就好
  const k = new THREE.Group();
  k.scale.setScalar(0.85);
  const body = steel(0.2, 0xe4e7ea);
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.14, 0.05, 0), new THREE.Vector3(0.5, -0.06, 0),
    new THREE.Vector3(0.86, -0.46, 0), new THREE.Vector3(1.12, -0.8, 0),
  ]);
  k.add(mesh(taperedTube(spout, 40, 16, 0.026, 0.065), body));
  k.add(mesh(lathe([[0.001, 0], [0.55, 0], [0.6, 0.03], [0.62, 0.12], [0.61, 0.66], [0.55, 0.8], [0.4, 0.86], [0.36, 0.88], [0.001, 0.88]]),
    body, 1.55, -0.95, 0));
  k.add(mesh(cyl(0.6, 0.6, 0.035, 64), steel(0.35, 0xb9bec4), 1.55, -0.93, 0));
  k.add(mesh(cyl(0.34, 0.34, 0.04, 48), steel(0.25), 1.55, -0.06, 0));
  k.add(mesh(lathe([[0.001, 0], [0.06, 0], [0.09, 0.05], [0.07, 0.11], [0.001, 0.12]], 32), wood(0x6b4428, 0.45), 1.55, -0.04, 0));
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.1, -0.2, 0), new THREE.Vector3(2.42, -0.28, 0), new THREE.Vector3(2.5, -0.55, 0),
    new THREE.Vector3(2.38, -0.8, 0), new THREE.Vector3(2.12, -0.84, 0),
  ]);
  k.add(mesh(new THREE.TubeGeometry(handle, 32, 0.055, 14), std(0x1e1f22, 0.6)));
  return k;
}

// 建出濾杯 + 下壺 + 濾紙 + 手沖壺，回傳之後要動畫的部件
function buildStation(g, game) {
  const id = game.dripper ? game.dripper.id : 'v60';
  const d = DRIPPERS[id];
  const color = new THREE.Color(game.dripper ? game.dripper.color : '#e2725b');
  const s = { d, id };
  s.srv = new THREE.Group();
  s.top = new THREE.Group();
  g.add(s.srv, s.top);
  const sv = s.srv;
  const tp = s.top;

  if (id === 'chemex') {
    // Chemex：沙漏形玻璃壺 + 木頸圈 + 皮繩
    sv.add(mesh(lathe([
      [0.001, 0], [0.86, 0], [0.93, 0.15], [0.86, 0.72], [0.37, 1.3], [0.37, 1.46], [1.0, 2.3], [1.02, 2.34],
      [0.98, 2.33], [0.34, 1.46], [0.34, 1.3], [0.82, 0.72], [0.89, 0.15], [0.82, 0.04], [0.001, 0.04],
    ]), glass(0.2)));
    sv.add(mesh(lathe([[0.53, 1.1], [0.4, 1.27], [0.4, 1.49], [0.53, 1.66]], 48), wood(0xd2a26a, 0.5)));
    const tie = mesh(new THREE.TorusGeometry(0.405, 0.02, 10, 64), std(0x6b4024, 0.7), 0, 1.38, 0);
    tie.rotation.x = Math.PI / 2;
    sv.add(tie);
    sv.add(mesh(new THREE.SphereGeometry(0.07, 20, 14), wood(0xe0b47a, 0.4), 0, 1.38, 0.47));
    s.coffeeR = 0.82;
    s.coffeeMax = 0.6;
  } else {
    // 玻璃下壺：厚度、把手、刻度線
    sv.add(mesh(lathe([
      [0.001, 0], [0.76, 0], [0.8, 0.06], [0.8, 0.9], [0.56, 1.18], [0.56, 1.3], [0.53, 1.3], [0.53, 1.19],
      [0.77, 0.9], [0.77, 0.07], [0.73, 0.04], [0.001, 0.04],
    ]), glass(0.2)));
    const h = mesh(new THREE.TorusGeometry(0.28, 0.045, 12, 32, Math.PI), glass(0.3), 0.98, 0.55, 0);
    h.rotation.z = -Math.PI / 2;
    sv.add(h);
    [0.25, 0.45, 0.65].forEach((y) => {
      const t = mesh(new THREE.BoxGeometry(0.16, 0.012, 0.01), std(0xffffff, 0.5), -0.15, y, 0.805);
      sv.add(t);
    });

    // 濾杯：陶瓷（有厚度）+ 底座 + 把手
    const cupPts = id === 'kalita'
      ? [[0.52, 1.36], [0.58, 1.36], [1.0, 2.12], [1.02, 2.16], [0.98, 2.17], [0.95, 2.13], [0.53, 1.41]]
      : [[0.18, 1.36], [0.24, 1.36], [1.08, 2.2], [1.1, 2.24], [1.06, 2.26], [1.02, 2.23], [0.17, 1.41]];
    const mat = ceramic(color);
    mat.side = THREE.DoubleSide;
    tp.add(mesh(lathe(cupPts, 72), mat));
    tp.add(mesh(lathe([[0.45, 1.3], [0.86, 1.3], [0.88, 1.33], [0.86, 1.36], [0.45, 1.36]], 72), mat));
    tp.add(mesh(cyl(0.5, 0.5, 0.1, 48), mat, 0, 1.26, 0));
    const handle = mesh(new THREE.TorusGeometry(0.2, 0.055, 14, 24, Math.PI), mat, id === 'kalita' ? -0.95 : -0.9, 1.78, 0);
    handle.rotation.z = Math.PI / 2;
    tp.add(handle);
    s.coffeeR = 0.75;
    s.coffeeMax = 0.8;
  }

  // 下壺裡的液體：側面深色、頂面稍淡
  s.liquidMats = [
    phys({ color: 0x2a1205, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.97, envMapIntensity: 0.35 }),
    phys({ color: 0x5a2e14, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.97, envMapIntensity: 0.5 }),
  ];
  s.liquid = mesh(new THREE.CylinderGeometry(s.coffeeR, s.coffeeR, 1, 48), [s.liquidMats[0], s.liquidMats[1], s.liquidMats[0]]);
  s.liquid.visible = false;
  sv.add(s.liquid);
  s.drip = mesh(new THREE.SphereGeometry(0.04, 12, 10), phys({ color: 0x3a1a08, roughness: 0.1, clearcoat: 1 }));
  s.drip.scale.y = 1.5;
  s.drip.visible = false;
  sv.add(s.drip);
  s.dripY = 1.3;
  s.dripT = 0;
  s.level = 0;

  // 濾紙：頂點色決定乾濕；Kalita 是波浪紙、Chemex 是摺疊的多邊形紙
  const paperGeo = lathe(d.paper.concat([[d.paper[1][0] + 0.03, d.paper[1][1] + 0.02]]), d.seg);
  const pp = paperGeo.attributes.position;
  s.paperAngles = new Float32Array(pp.count);
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const z = pp.getZ(i);
    const a = Math.atan2(z, x);
    s.paperAngles[i] = a;
    if (d.wave) {
      const k = 1 + 0.035 * Math.sin(a * 20) * clamp01((pp.getY(i) - 1.5) / 0.6);
      pp.setX(i, x * k);
      pp.setZ(i, z * k);
    }
  }
  paperGeo.computeVertexNormals();
  paperGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pp.count * 3).fill(1), 3));
  s.paperGeo = paperGeo;
  s.paper = mesh(paperGeo, std(0xffffff, 0.95, 0, { map: paperTex, vertexColors: true, side: THREE.DoubleSide }));
  tp.add(s.paper);
  // 濾紙底部（封住錐形底端）
  s.paperBottomMat = std(0xffffff, 0.95, 0, { map: paperTex, side: THREE.DoubleSide });
  const bottom = mesh(new THREE.CircleGeometry(d.paper[0][0] + 0.005, d.seg), s.paperBottomMat, 0, d.paper[0][1], 0);
  bottom.rotation.x = -Math.PI / 2;
  tp.add(bottom);
  s.wet = new Float32Array(48);
  setPaperWet(s, game.rinsed ? 1 : 0);

  // 手沖壺和水柱
  s.kettle = buildKettle();
  g.add(s.kettle);
  s.stream = mesh(new THREE.CylinderGeometry(0.022, 0.034, 1, 16, 1, true), phys({
    color: 0xe8f6ff, roughness: 0.02, transparent: true, opacity: 0.6, clearcoat: 1, envMapIntensity: 2.5,
  }));
  s.stream.visible = false;
  g.add(s.stream);
  s.tilt = -0.15;

  // 熱氣
  if (!buildStation.steamTex) {
    buildStation.steamTex = canvasTex(64, 64, (x) => {
      const rg = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      rg.addColorStop(0, 'rgba(255,255,255,.85)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = rg;
      x.fillRect(0, 0, 64, 64);
    });
  }
  s.steam = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: buildStation.steamTex, transparent: true, opacity: 0, depthWrite: false }));
    g.add(sp);
    s.steam.push(sp);
  }
  return s;
}

// 把濾紙依角度上色：s.wet 是 48 格的乾濕程度（0 乾、1 濕）
function paintPaper(s) {
  const col = s.paperGeo.attributes.color;
  const n = s.wet.length;
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const f = (((((s.paperAngles[i] + Math.PI) / TAU) * n) % n) + n) % n;
    const a = Math.floor(f) % n;
    const b = (a + 1) % n;
    const w = lerp(s.wet[a], s.wet[b], f - Math.floor(f));
    c.copy(PAPER_DRY).lerp(PAPER_WET, w);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  const avg = s.wet.reduce((x, y) => x + y, 0) / n;
  s.paperBottomMat.color.copy(PAPER_DRY).lerp(PAPER_WET, avg);
}
function setPaperWet(s, v) {
  s.wet.fill(v);
  paintPaper(s);
}

// 手沖壺：嘴尖移到 (x, tipY, z)，注水時傾斜，水柱落到 (x, landY, z)
function moveKettle(s, x, z, tipY, landY, pouring, dt, yaw = 1.0) {
  const k = 1 - 0.0001 ** dt;
  s.kettle.position.x = lerp(s.kettle.position.x, x, k);
  s.kettle.position.z = lerp(s.kettle.position.z, z, k);
  s.kettle.position.y = tipY;
  s.tilt = lerp(s.tilt, pouring ? 0.32 : -0.15, 1 - 0.002 ** dt);
  s.kettle.rotation.z = s.tilt;
  s.kettle.rotation.y = yaw; // 壺身轉到後方，才不會擋住濾杯
  s.kettle.visible = view !== 'top'; // 俯視時壺會擋住畫面
  s.stream.visible = pouring;
  if (pouring) {
    const h = tipY - landY;
    s.stream.scale.set(1 + Math.sin(performance.now() / 60) * 0.06, h, 1);
    s.stream.position.set(s.kettle.position.x, (tipY + landY) / 2, s.kettle.position.z);
  }
}

// 下壺的液體高度、滴落
function updateLiquid(s, target, dt, water) {
  s.level = lerp(s.level, target, 1 - 0.5 ** dt);
  const h = Math.max(0.001, s.coffeeMax * s.level);
  s.liquid.scale.y = h;
  s.liquid.position.y = 0.045 + h / 2;
  s.liquid.visible = s.level > 0.008;
  const dripping = target > 0.01 && s.level < target + 0.2 && water;
  s.drip.visible = dripping;
  if (dripping) {
    s.dripT = (s.dripT + dt * 2.6) % 1;
    s.drip.position.set(0, lerp(s.dripY, 0.045 + h, s.dripT * s.dripT), 0);
  }
}

function updateSteam(s, now, on, y) {
  s.steam.forEach((sp, i) => {
    const ph = (now / 3200 + i / s.steam.length) % 1;
    sp.position.set(-0.55 + i * 0.18 + Math.sin(now / 650 + i * 2) * 0.08, y + ph * 1.5, -0.25 + Math.cos(i * 1.7) * 0.15);
    sp.scale.setScalar(0.18 + ph * 0.42);
    sp.material.opacity = on ? Math.sin(ph * Math.PI) * 0.16 : 0;
  });
}

/* ==========================================================
   場景三：濕濾紙
   ========================================================== */

const R = { s: null, angle: -Math.PI / 2, pouring: false, p: 0, water: 0 };

function buildRinse(game) {
  const g = groups.rinse;
  disposeGroup(g);
  R.s = buildStation(g, Object.assign({}, game, { rinsed: false }));
  R.s.liquidMats[0].color.set(0xcfe6ee);
  R.s.liquidMats[1].color.set(0xe6f4f8);
  R.s.liquidMats.forEach((m) => { m.opacity = 0.45; });
  R.s.drip.material.color.set(0xd6eef6);
  R.s.drip.material.transparent = true;
  R.s.drip.material.opacity = 0.7;
  R.s.kettle.position.set(0, R.s.d.bedY + 1.6, -0.6);
  R.angle = -Math.PI / 2;
  R.pouring = false;
  R.p = 0;
  R.water = 0;
  shadows(g);
}

function updateRinse(dt, now) {
  const s = R.s;
  const d = s.d;
  // 沿著濾紙內壁繞圈注水
  const ry = d.paper[1][1] - 0.25;
  const rr = paperR(d, ry) * 0.8;
  const x = Math.cos(R.angle) * rr;
  const z = Math.sin(R.angle) * rr;
  // 濾紙錐面上半徑 rr 的那一圈有多高
  const [[r0, y0], [r1, y1]] = d.paper;
  const landY = y0 + ((rr - r0) / (r1 - r0)) * (y1 - y0) + 0.01;
  moveKettle(s, x, z, ry + 1.3, landY, R.pouring, dt, 1.0);

  if (R.pouring) {
    R.water = Math.min(1, R.water + dt * 0.25);
    const n = s.wet.length;
    const i = Math.round(((R.angle + Math.PI) / TAU) * n) % n;
    for (let k = -2; k <= 2; k++) {
      const j = (i + k + n) % n;
      s.wet[j] = Math.min(1, s.wet[j] + dt * (k === 0 ? 9 : 5));
    }
  }
  const n = s.wet.length;
  const spread = s.wet.slice();
  for (let j = 0; j < n; j++) {
    const nb = Math.max(spread[(j + 1) % n], spread[(j + n - 1) % n]);
    if (nb > spread[j]) s.wet[j] = Math.min(nb, spread[j] + dt * 0.6);
  }
  if (R.p >= 1) for (let j = 0; j < s.wet.length; j++) s.wet[j] = Math.min(1, s.wet[j] + dt * 0.8);
  paintPaper(s);
  updateLiquid(s, R.water * 0.18, dt, R.water > 0);
  updateSteam(s, now, R.water > 0, d.bedY - 0.2);
}

/* ==========================================================
   場景四：注水
   ========================================================== */

// 液面上的混合模擬：在格子上追蹤「剛倒進的熱水」和「泡沫」兩種濃度，
// 它們會跟著繞圈注水帶動的漩渦旋轉、泡沫被推到濾紙邊緣、熱水慢慢被咖啡染深。
const MIX_N = 64;
// 液面貼圖的解析度比模擬格子高，泡沫顆粒才不會一格一格的
const MIX_TEX = 128;
// 粉床被水浸濕的程度：沒沖到的地方會留著乾的淺色粉
const WET_N = 32;
const STAIN = new THREE.Color(0x8a5c34);
// 頂點色要用線性色彩空間（THREE.Color 會自動從 sRGB 轉換）
const BED_DRY = new THREE.Color(0xa7764a);
const BED_WET = new THREE.Color(0x1e0e05);

const B = { s: null, st: null, bubbles: [], ripples: [], rippleT: 0, splash: [] };

// 格子座標：u、v 都在 -1..1（以液面或粉床半徑正規化），u 對應世界 x、v 對應世界 z
function sampleField(arr, n, u, v) {
  const x = Math.min(n - 1.001, Math.max(0, ((u + 1) / 2) * n - 0.5));
  const y = Math.min(n - 1.001, Math.max(0, ((v + 1) / 2) * n - 0.5));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const k = j * n + i;
  return lerp(lerp(arr[k], arr[k + 1], fx), lerp(arr[k + n], arr[k + n + 1], fx), fy);
}

function splat(arr, n, cu, cv, rad, amt) {
  const i0 = Math.max(0, Math.floor(((cu - rad + 1) / 2) * n));
  const i1 = Math.min(n - 1, Math.ceil(((cu + rad + 1) / 2) * n));
  const j0 = Math.max(0, Math.floor(((cv - rad + 1) / 2) * n));
  const j1 = Math.min(n - 1, Math.ceil(((cv + rad + 1) / 2) * n));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const d2 = ((u - cu) ** 2 + (v - cv) ** 2) / (rad * rad);
      if (d2 < 2.5) {
        const k = j * n + i;
        arr[k] = Math.min(1, arr[k] + amt * Math.exp(-d2 * 1.6));
      }
    }
  }
}

// 一個濃度場往前走一步：旋轉 + 往外推（半拉格朗日）→ 擴散 → 衰減
function stepField(f, omega, vr, blur, decay, dt) {
  const n = f.n;
  const src = f.a;
  const tmp = f.b;
  const c = Math.cos(-omega * dt);
  const sn = Math.sin(-omega * dt);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const r = Math.hypot(u, v);
      if (r > 1) { tmp[k] = 0; continue; }
      let su = u * c - v * sn;
      let sv = u * sn + v * c;
      if (vr && r > 1e-4) {
        const q = Math.max(0, r - vr * dt) / r;
        su *= q;
        sv *= q;
      }
      tmp[k] = sampleField(src, n, su, sv);
    }
  }
  const kk = Math.min(0.24, blur * dt * 60);
  const keep = Math.exp(-decay * dt);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const l = tmp[i > 0 ? k - 1 : k];
      const rt = tmp[i < n - 1 ? k + 1 : k];
      const up = tmp[j > 0 ? k - n : k];
      const dn = tmp[j < n - 1 ? k + n : k];
      src[k] = (tmp[k] * (1 - 4 * kk) + kk * (l + rt + up + dn)) * keep;
    }
  }
}
const makeField = (n) => ({ n, a: new Float32Array(n * n), b: new Float32Array(n * n) });

function buildBrew(game) {
  const g = groups.brew;
  disposeGroup(g);
  const s = buildStation(g, game);
  const d = s.d;
  B.s = s;
  B.d = d;
  B.bedR = paperR(d, d.bedY) * 0.97 * inR(d);

  // 粉床：多圈頂點，可以做出悶蒸鼓起、注水後下凹；頂點色表示乾濕
  const bedGeo = new THREE.RingGeometry(0.001, B.bedR, 64, 14);
  B.bedBase = bedGeo.attributes.position.array.slice();
  const bp = bedGeo.attributes.position;
  B.bedNoise = new Float32Array(bp.count);
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const y = bp.getY(i);
    const r = Math.hypot(x, y) / B.bedR;
    B.bedNoise[i] = (Math.sin(x * 37.1 + y * 11.7) * Math.cos(y * 29.3 - x * 7.9)) * 0.008 * Math.min(1, r * 4);
  }
  bedGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bp.count * 3), 3));
  B.bedGeo = bedGeo;
  B.bedMat = std(0xffffff, 0.95, 0, { map: grainTex, bumpMap: grainTex, bumpScale: 2.5, vertexColors: true });
  B.bed = mesh(bedGeo, B.bedMat, 0, d.bedY, 0);
  B.bed.rotation.x = -Math.PI / 2;
  g.add(B.bed);
  B.bedWet = new Float32Array(WET_N * WET_N);

  // 液面：貼圖每一格畫出咖啡、熱水、泡沫混在一起的樣子
  B.fresh = makeField(MIX_N);
  B.foam = makeField(MIX_N);
  B.mixNoise = new Float32Array(MIX_TEX * MIX_TEX).map(() => rand(0.8, 1.2));
  B.mixCanvas = document.createElement('canvas');
  B.mixCanvas.width = MIX_TEX;
  B.mixCanvas.height = MIX_TEX;
  B.mixCtx = B.mixCanvas.getContext('2d');
  B.mixImg = B.mixCtx.createImageData(MIX_TEX, MIX_TEX);
  B.mixTex = new THREE.CanvasTexture(B.mixCanvas);
  B.mixTex.colorSpace = THREE.SRGBColorSpace;
  B.waterMat = phys({
    color: 0xffffff, map: B.mixTex, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.18,
    transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 0.3,
  });
  B.water = mesh(new THREE.CircleGeometry(1, 64), B.waterMat, 0, d.bedY, 0);
  B.water.rotation.x = -Math.PI / 2;
  g.add(B.water);

  // 引導圈、邊緣警告
  const ringMat = (color, o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
  B.guide = mesh(new THREE.TorusGeometry(B.bedR * 0.48, 0.01, 8, 64), ringMat(0xfffaf0, 0.6), 0, d.bedY + 0.05, 0);
  B.guide.rotation.x = Math.PI / 2;
  g.add(B.guide);
  B.edge = mesh(new THREE.TorusGeometry(B.bedR * 0.94, 0.03, 8, 64), ringMat(0xe2463a, 0.9), 0, d.bedY + 0.06, 0);
  B.edge.rotation.x = Math.PI / 2;
  g.add(B.edge);

  // 泡泡：半球形、有反光，會跟著漩渦轉、被推到邊緣
  B.bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI / 2);
  const bubbleMat = phys({ color: 0xa8743f, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15, transparent: true, opacity: 0.85, envMapIntensity: 0.8 });
  for (let i = 0; i < 60; i++) {
    const m = mesh(bubbleGeo, bubbleMat);
    m.visible = false;
    g.add(m);
    B.bubbles.push({ m, life: 0, size: 1 });
  }
  // 漣漪：擴散的圓環
  B.ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.92, 1, 48);
  for (let i = 0; i < 6; i++) {
    const m = mesh(rippleGeo, ringMat(0xffffff, 0));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    g.add(m);
    B.ripples.push({ m, life: 0 });
  }
  // 水柱打進液面時濺起的小水滴
  B.splash = Array.from({ length: 48 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  B.splashGeo = new THREE.BufferGeometry();
  B.splashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
  B.splashPts = new THREE.Points(B.splashGeo, new THREE.PointsMaterial({ color: 0xe9d6b8, size: 0.028, transparent: true, opacity: 0.85, depthWrite: false }));
  B.splashPts.frustumCulled = false;
  g.add(B.splashPts);

  B.st = null;
  B.bloom = 0;
  B.omega = 0;
  B.prevA = null;
  B.maxY = d.bedY - 0.1;
  s.kettle.position.set(0.3, d.bedY + 1.45, 0);
  shadows(g);
  B.bed.castShadow = false;
}

// 粉床高度：只有吸到水的地方會悶蒸鼓起；後段整體往下凹
function shapeBed(bloom, sink) {
  const p = B.bedGeo.attributes.position;
  const col = B.bedGeo.attributes.color;
  const base = B.bedBase;
  const R = B.bedR;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const f = 1 - (x * x + y * y) / (R * R);
    // 粉床轉了 -90°，本地 y 對應世界 -z
    const w = sampleField(B.bedWet, WET_N, x / R, -y / R);
    p.setZ(i, f * (bloom * 0.1 * w - sink * 0.06) + B.bedNoise[i]);
    col.setXYZ(i, lerp(BED_DRY.r, BED_WET.r, w), lerp(BED_DRY.g, BED_WET.g, w), lerp(BED_DRY.b, BED_WET.b, w));
  }
  p.needsUpdate = true;
  col.needsUpdate = true;
  B.bedGeo.computeVertexNormals();
}

// 把兩個濃度場畫成液面貼圖
function paintMix() {
  const n = MIX_TEX;
  const data = B.mixImg.data;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const r = Math.hypot(u, v);
      const o = k * 4;
      if (r > 1.02) { data[o + 3] = 0; continue; }
      // 底色：萃取中的深色咖啡液，邊緣（彎月面）更深
      const edge = r > 0.88 ? 1 - (r - 0.88) * 1.4 : 1;
      let cr = 74 * edge;
      let cg = 36 * edge;
      let cb = 12 * edge;
      let a = 232;
      // 剛倒進的熱水：較淡、較透的琥珀色
      const f = Math.min(1, sampleField(B.fresh.a, MIX_N, u, v) * 1.25);
      cr = lerp(cr, 176, f);
      cg = lerp(cg, 122, f);
      cb = lerp(cb, 74, f);
      a = lerp(a, 128, f);
      // 泡沫：淺焦糖色、帶顆粒感
      const q = Math.min(0.85, sampleField(B.foam.a, MIX_N, u, v) * 1.3);
      const nz = B.mixNoise[k];
      cr = lerp(cr, 186 * nz, q);
      cg = lerp(cg, 132 * nz, q);
      cb = lerp(cb, 80 * nz, q);
      a = lerp(a, 248, q);
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = a;
    }
  }
  B.mixCtx.putImageData(B.mixImg, 0, 0);
  B.mixTex.needsUpdate = true;
}

function updateBrew(dt, now) {
  const s = B.s;
  const d = B.d;
  const st = B.st || { px: C, py: C, pouring: false, water: 0, total: 1, pool: 0, onEdge: false, phase: 'pour' };
  const wx = ((st.px - C) / BED_R) * B.bedR;
  const wz = ((st.py - C) / BED_R) * B.bedR;
  const wet = clamp01(st.water / st.total);

  // 液面高度隨積水上升，半徑跟著錐形變大
  const wy = d.bedY + 0.03 + st.pool * 0.16;
  const wr = paperR(d, wy) * 0.985 * inR(d);
  B.water.position.y = wy;
  B.water.scale.set(wr, wr, 1);
  B.waterMat.opacity = clamp01(st.pool * 1.5) * lerp(0.18, 1, clamp01((st.water - 25) / 25));
  if (st.pool > 0.05) B.maxY = Math.max(B.maxY, wy);

  moveKettle(s, wx, wz, d.bedY + 1.45, wy, st.pouring, dt, 1.0);
  const kx = s.kettle.position.x;
  const kz = s.kettle.position.z;

  // 繞圈注水會帶動漩渦：用水柱繞中心轉的角速度來估
  const kr = Math.hypot(kx, kz);
  if (st.pouring && kr > B.bedR * 0.12) {
    const a = Math.atan2(kz, kx);
    if (B.prevA !== null) {
      let da = a - B.prevA;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const target = Math.max(-3, Math.min(3, (da / Math.max(dt, 1e-3)) * 0.45));
      B.omega = lerp(B.omega, target, 1 - 0.3 ** dt);
    }
    B.prevA = a;
  } else {
    B.prevA = null;
    B.omega *= Math.exp(-dt * 0.7);
  }

  // 熱水和泡沫從水柱落點加進來
  if (st.pouring) {
    const cu = kx / wr;
    const cv = kz / wr;
    splat(B.fresh.a, MIX_N, cu, cv, 0.16, dt * 7);
    splat(B.foam.a, MIX_N, cu, cv, 0.11, dt * 1.8);
    // 粉床：落點附近吸水最快，水會往四周擴散
    splat(B.bedWet, WET_N, kx / B.bedR, kz / B.bedR, 0.3, dt * 3.5);
  }
  if (st.pool > 0.25) {
    // 液面蓋過整個粉床後，沒沖到的地方也會慢慢泡濕
    for (let k = 0; k < B.bedWet.length; k++) B.bedWet[k] = Math.min(1, B.bedWet[k] + dt * 0.18 * st.pool);
  }
  const drained = st.pool < 0.08;
  stepField(B.fresh, B.omega, 0, 0.05, 0.6, dt);
  stepField(B.foam, B.omega, 0.12, 0.015, drained ? 0.9 : 0.2, dt);
  paintMix();

  // 粉床：悶蒸時吸到水的地方鼓起，後段下凹；剛滴完時表面濕亮
  const target = clamp01(st.water / 30) * (1 - clamp01((st.water - 30) / 70));
  B.bloom = lerp(B.bloom, target, 1 - 0.2 ** dt);
  shapeBed(B.bloom, wet);
  B.bedMat.roughness = st.water > 0 ? lerp(0.95, 0.55, clamp01(st.water / 60)) : 0.95;

  B.guide.visible = st.phase === 'pour';
  B.guide.position.y = wy + 0.02;
  B.edge.visible = st.onEdge;
  B.edge.position.y = wy + 0.03;

  // 濾紙：泡過咖啡的高度留下咖啡漬，最高水位有一圈較深的水痕
  if (st.water > 0) {
    const col = s.paperGeo.attributes.color;
    const pos = s.paperGeo.attributes.position;
    const c = new THREE.Color();
    const splashTop = wy + 0.1;
    const rinsed = s.wet[0];
    for (let i = 0; i < col.count; i++) {
      const y = pos.getY(i);
      if (y <= B.maxY + 0.01) {
        const line = clamp01(1 - (B.maxY - y) / 0.05);
        c.copy(PAPER_WET).lerp(STAIN, 0.55 + line * 0.3);
      } else {
        c.copy(PAPER_DRY).lerp(PAPER_WET, Math.max(rinsed, y < splashTop ? 1 : 0));
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // 泡泡：在落點冒出，跟著漩渦轉、慢慢漂到邊緣
  if (st.pouring && Math.random() < 0.75) {
    const b = B.bubbles.find((x) => x.life <= 0);
    if (b) {
      const a = rand(0, TAU);
      const r = Math.random() * 0.14;
      const bx = kx + Math.cos(a) * r;
      const bz = kz + Math.sin(a) * r;
      if (Math.hypot(bx, bz) < wr * 0.9) {
        b.life = 1;
        b.size = rand(0.35, 1.25);
        b.m.position.set(bx, wy - 0.005, bz);
        b.m.visible = true;
      }
    }
  }
  const cs = Math.cos(B.omega * dt);
  const sn = Math.sin(B.omega * dt);
  B.bubbles.forEach((b) => {
    if (b.life <= 0) return;
    b.life -= dt * (drained ? 1.2 : 0.35);
    const { x, z } = b.m.position;
    let nx = x * cs - z * sn;
    let nz = x * sn + z * cs;
    const r = Math.hypot(nx, nz);
    const maxR = wr * 0.92;
    if (r > 1e-4) {
      const nr = Math.min(maxR, r + dt * 0.1);
      nx *= nr / r;
      nz *= nr / r;
    }
    b.m.position.set(nx, wy - 0.005, nz);
    const grow = Math.min(1, (1 - b.life) * 5);
    b.m.scale.setScalar(b.size * grow * (b.life < 0.12 ? b.life / 0.12 : 1));
    if (b.life <= 0) b.m.visible = false;
  });

  // 漣漪
  B.rippleT -= dt;
  if (st.pouring && B.rippleT <= 0) {
    B.rippleT = 0.18;
    const r = B.ripples.find((x) => x.life <= 0);
    if (r) {
      r.life = 1;
      r.m.position.set(kx, wy + 0.004, kz);
      r.m.visible = true;
    }
  }
  B.ripples.forEach((r) => {
    if (r.life <= 0) return;
    r.life -= dt * 1.4;
    const sc = 0.04 + (1 - r.life) * 0.28;
    r.m.scale.set(sc, sc, 1);
    r.m.material.opacity = Math.max(0, r.life) * 0.45 * Math.min(1, st.pool * 3 + 0.3);
    if (r.life <= 0) r.m.visible = false;
  });

  // 濺起的水滴
  if (st.pouring) {
    for (let n = 0; n < 2; n++) {
      const p = B.splash.find((x) => x.life <= 0);
      if (!p) break;
      const a = rand(0, TAU);
      const v = rand(0.25, 0.6);
      p.life = 1;
      p.p.set(kx, wy + 0.01, kz);
      p.v.set(Math.cos(a) * v, rand(0.7, 1.3), Math.sin(a) * v);
    }
  }
  const sp = B.splashGeo.attributes.position;
  B.splash.forEach((p, i) => {
    if (p.life > 0) {
      p.v.y -= 7 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < wy) p.life = 0;
    }
    if (p.life > 0) sp.setXYZ(i, p.p.x, p.p.y, p.p.z);
    else sp.setXYZ(i, 0, -99, 0);
  });
  sp.needsUpdate = true;

  updateLiquid(s, wet, dt, st.water > 0);
  updateSteam(s, now, st.water > 0, d.bedY + 0.2);
}

/* ==========================================================
   場景五：收尾動畫（搖壺、倒進品鑑杯、端給店長）
   ========================================================== */

/* ---------- 真人手部模型 ---------- */

// immersive-web 的 WebXR Input Profiles「generic hand」（MIT 授權），有完整骨架的寫實手部網格。
// 它的關節軸向剛好和這裡的手一樣：手指朝 -Z、手背朝 +Y、小指在 +X。左手用同一個模型鏡像。
// 載入失敗時自動改用程式組出來的手。
const HAND_URL = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/right.glb';
const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'];
const chainOf = (f) => [`${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`, `${f}-finger-tip`];
const THUMB_CHAIN = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
let HAND_GLTF = null;
let HAND_REST = null;

// 皮膚細紋（毛孔、細小起伏）當凹凸貼圖
const skinBumpTex = canvasTex(256, 256, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 150 + Math.random() * 70 - (Math.random() < 0.04 ? 60 : 0);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
}, { repeat: [6, 6], srgb: false });

function loadHandModel() {
  new GLTFLoader().load(HAND_URL, (g) => {
    try {
      prepareHandModel(g);
      HAND_GLTF = g;
    } catch (e) {
      console.warn('手部模型處理失敗，改用簡易的手', e);
    }
  }, undefined, () => console.warn('手部模型載入失敗，改用簡易的手'));
}

function prepareHandModel(g) {
  let sk = null;
  const bones = {};
  g.scene.traverse((o) => {
    if (o.isSkinnedMesh) sk = o;
    if (o.isBone) bones[o.name] = o;
  });
  g.scene.updateMatrixWorld(true);
  const W = bones.wrist.matrixWorld.clone();
  const Winv = W.clone().invert();
  // 每個關節在「手腕座標」裡的靜止姿勢，和相對於上一節的姿勢
  const H = {};
  Object.keys(bones).forEach((n) => { H[n] = Winv.clone().multiply(bones[n].matrixWorld); });
  const L = {};
  const link = (c) => { for (let i = 1; i < c.length; i++) L[c[i]] = H[c[i - 1]].clone().invert().multiply(H[c[i]]); };
  FINGER_NAMES.forEach((f) => link(chainOf(f)));
  link(THUMB_CHAIN);
  // 縮放：讓手腕到中指尖的長度和原本的手一樣
  const k = 0.765 / new THREE.Vector3().setFromMatrixPosition(H['middle-finger-tip']).length();
  const segLen = (a, b) => new THREE.Vector3().setFromMatrixPosition(H[a]).distanceTo(new THREE.Vector3().setFromMatrixPosition(H[b]));
  const nailLen = {};
  FINGER_NAMES.forEach((f) => { nailLen[f] = segLen(`${f}-finger-phalanx-distal`, `${f}-finger-tip`); });
  nailLen.thumb = segLen('thumb-phalanx-distal', 'thumb-tip');

  // 頂點色：指尖、第二節血色較多，看起來比較有生命感
  const geo = sk.geometry;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const names = sk.skeleton.bones.map((b) => b.name);
  const colors = new Float32Array(si.count * 3);
  const base = new THREE.Color(0xffffff);
  const flush = new THREE.Color(0xffc4b4);
  const c = new THREE.Color();
  for (let v = 0; v < si.count; v++) {
    let red = 0;
    for (let j = 0; j < 4; j++) {
      const n = names[si.getComponent(v, j)] || '';
      const w = sw.getComponent(v, j);
      if (/distal|tip/.test(n)) red += w;
      else if (/intermediate/.test(n)) red += w * 0.45;
      else if (/proximal/.test(n)) red += w * 0.15;
    }
    c.copy(base).lerp(flush, Math.min(1, red) * 0.85);
    colors.set([c.r, c.g, c.b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  HAND_REST = { W, Winv, H, L, k, nailLen };
}

// 把真人手部模型裝到手的 root 上
function attachRealHand(h) {
  const model = SkeletonUtils.clone(HAND_GLTF.scene);
  const bones = {};
  let sk = null;
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) sk = o;
  });
  sk.material = phys({
    color: 0xe6ad88, vertexColors: true, roughness: 0.48, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff7a5c),
    clearcoat: 0.05, clearcoatRoughness: 0.6, bumpMap: skinBumpTex, bumpScale: 0.25, envMapIntensity: 0.55,
  });
  sk.castShadow = true;
  sk.receiveShadow = true;
  sk.frustumCulled = false;
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.matrix.makeScale(HAND_REST.k, HAND_REST.k, HAND_REST.k).multiply(HAND_REST.Winv);
  holder.add(model);
  h.root.add(holder);

  // 指甲：貼在最後一節的手背那面（單位是模型的公尺）
  const nail = phys({ color: 0xf7cfc2, roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.15, envMapIntensity: 0.5 });
  const addNail = (bone, len, r) => {
    const n = mesh(new THREE.SphereGeometry(1, 18, 10), nail, 0, r * 0.74, -len * 0.52);
    n.scale.set(r * 0.66, r * 0.14, len * 0.5);
    n.castShadow = false;
    bone.add(n);
  };
  FINGER_NAMES.forEach((f, i) => addNail(bones[`${f}-finger-phalanx-distal`], HAND_REST.nailLen[f], [0.0074, 0.0078, 0.0072, 0.0064][i]));
  addNail(bones['thumb-phalanx-distal'], HAND_REST.nailLen.thumb, 0.0078);
  h.real = { bones };
}

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
const rotY = (a) => new THREE.Matrix4().makeRotationY(a);

// 依手勢算出每個關節的姿勢（從指根一節一節往指尖算）
function poseRealHand(h, p, wiggle) {
  const R = HAND_REST;
  const b = h.real.bones;
  const put = (name, P) => {
    _m.copy(R.W).multiply(P);
    _m.decompose(b[name].position, b[name].quaternion, _s);
  };
  FINGER_NAMES.forEach((f, i) => {
    const c = p.curl[i] + Math.sin(wiggle * 1.7 + i * 1.3) * 0.015;
    const ch = chainOf(f);
    const Pp = R.H[ch[0]].clone().multiply(R.L[ch[1]]).multiply(rotY((1.5 - i) * 0.08 * p.spread)).multiply(rotX(-c * 1.3));
    const Pi = Pp.clone().multiply(R.L[ch[2]]).multiply(rotX(-c * 1.6));
    const Pd = Pi.clone().multiply(R.L[ch[3]]).multiply(rotX(-c * 1.1));
    const Pt = Pd.clone().multiply(R.L[ch[4]]);
    put(ch[1], Pp);
    put(ch[2], Pi);
    put(ch[3], Pd);
    put(ch[4], Pt);
  });
  const t = THUMB_CHAIN;
  const Pm = R.H[t[0]].clone().multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-p.tx * 0.55, p.ty * 0.6, p.tz * 0.5, 'YXZ')));
  const Pp = Pm.clone().multiply(R.L[t[1]]).multiply(rotX(-p.tc * 0.8 - p.tx * 0.25));
  const Pd = Pp.clone().multiply(R.L[t[2]]).multiply(rotX(-p.tc * 1.1));
  const Pt = Pd.clone().multiply(R.L[t[3]]);
  put(t[0], Pm);
  put(t[1], Pp);
  put(t[2], Pd);
  put(t[3], Pt);
}

/* ---------- 手 ---------- */

// 右手的座標：手腕在原點、手指朝 -Z、手背朝 +Y、拇指在 -X。左手用 scale.x 鏡像。
const FINGERS = [
  { x: -0.135, len: [0.155, 0.1, 0.08], r: 0.047 }, // 食指
  { x: -0.045, len: [0.17, 0.11, 0.085], r: 0.049 }, // 中指
  { x: 0.045, len: [0.16, 0.105, 0.08], r: 0.047 },  // 無名指
  { x: 0.13, len: [0.125, 0.085, 0.07], r: 0.041 },  // 小指
];
// 手的大小（和杯子、分享壺的比例）
const HAND_SCALE = 2.4;

// 手勢：curl 四指彎曲（0 伸直、1 握拳）、spread 張開、t* 拇指
const POSES = {
  open: { curl: [0.12, 0.1, 0.14, 0.18], spread: 0.9, tx: 0.15, ty: 0.15, tz: 0, tc: 0.12 },
  relax: { curl: [0.32, 0.4, 0.48, 0.55], spread: 0.35, tx: 0.35, ty: 0, tz: 0, tc: 0.3 },
  grip: { curl: [0.82, 0.88, 0.9, 0.92], spread: 0, tx: 0.95, ty: -0.25, tz: 0.35, tc: 0.45 },
  pinch: { curl: [0.5, 0.68, 0.8, 0.85], spread: 0.15, tx: 0.95, ty: -0.45, tz: 0.25, tc: 0.35 },
  flat: { curl: [0.04, 0.03, 0.05, 0.07], spread: 0.1, tx: 0.3, ty: -1.2, tz: 0, tc: 0.05 },
  thumbsUp: { curl: [1, 1, 1, 1], spread: 0, tx: 0, ty: 0.85, tz: 0, tc: 0 },
};
// 每個手勢「抓住的點」在手的座標裡的位置（拿來對準把手、杯碟）
const GRASP = {
  open: [0, -0.1, -0.3],
  relax: [0, -0.1, -0.35],
  grip: [0, -0.12, -0.47],
  pinch: [-0.12, -0.11, -0.46],
  flat: [0, -0.08, -0.3],
  thumbsUp: [0, -0.1, -0.35],
};

// 皮膚：sheen 做出皮膚透光的柔和邊緣
const skinMat = () => phys({
  color: 0xe7b08a, roughness: 0.5, sheen: 0.9, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff8a70),
  clearcoat: 0.06, clearcoatRoughness: 0.6, envMapIntensity: 0.5,
});

// 指節：尖端較細、上下略扁的膠囊（沿 -Z 從關節長到指尖）
function fingerSeg(r, L, taper) {
  const len = Math.max(0.01, L - r * 0.5);
  const g = new THREE.CapsuleGeometry(r, len, 8, 18);
  const p = g.attributes.position;
  const half = len / 2 + r;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + half) / (2 * half); // 0 = 指尖、1 = 關節
    const k = lerp(taper, 1, t);
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k * (p.getZ(i) > 0 ? 0.86 : 0.95));
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -L / 2);
  return g;
}

// 有皺褶的布料圓筒（袖子）
function clothTube(r0, r1, len, folds) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 48, 16, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const y = p.getY(i);
    const k = 1 + Math.sin(a * folds + y * 3.1) * 0.035 + Math.sin(a * 3 - y * 5.3) * 0.02;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function buildProcHand(left, extrasOnly = false) {
  const skin = skinMat();
  const nail = phys({ color: 0xe6a99a, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.35 });
  const root = new THREE.Group();
  const h = { root, fingers: [], thumb: [], left };

  if (!extrasOnly) {
  // 手掌：前寬後窄、手背微拱、掌心較平
  const palmGeo = new RoundedBoxGeometry(0.4, 0.13, 0.42, 6, 0.06);
  const pp = palmGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const t = (pp.getZ(i) + 0.21) / 0.42; // 0 = 指根、1 = 手腕
    const x = pp.getX(i) * lerp(1, 0.8, t);
    const y = pp.getY(i);
    pp.setXYZ(i, x, y > 0 ? y + Math.cos(x * 5) * 0.018 : y * 0.85, pp.getZ(i));
  }
  palmGeo.computeVertexNormals();
  root.add(mesh(palmGeo, skin, 0, 0, -0.21));
  // 大魚際（拇指根部的肉）、小魚際、虎口
  const pad = (x, y, z, sx, sy, sz) => {
    const m = mesh(new THREE.SphereGeometry(1, 20, 14), skin, x, y, z);
    m.scale.set(sx, sy, sz);
    root.add(m);
  };
  pad(-0.12, -0.035, -0.12, 0.1, 0.06, 0.13);
  pad(0.13, -0.035, -0.13, 0.07, 0.05, 0.13);
  pad(-0.17, -0.01, -0.27, 0.06, 0.045, 0.07);
  // 指節的小凸起
  FINGERS.forEach((f) => pad(f.x, 0.035, -0.4, f.r * 1.05, f.r * 0.75, f.r * 1.05));
  // 手腕骨的小凸起
  pad(0.15, 0.03, 0.04, 0.035, 0.03, 0.035);

  }

  // 前臂、捲起的袖口、有皺褶的袖子
  const arm = mesh(new THREE.CapsuleGeometry(0.13, 0.55, 8, 20), skin, 0, -0.01, 0.32);
  arm.rotation.x = Math.PI / 2;
  arm.scale.set(1.08, 0.82, 1);
  root.add(arm);
  const cuffGeo = new THREE.TorusGeometry(0.165, 0.058, 14, 48);
  const cp = cuffGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const a = Math.atan2(cp.getY(i), cp.getX(i));
    const k = 1 + Math.sin(a * 9) * 0.03;
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i) * k * 0.85, cp.getZ(i));
  }
  cuffGeo.computeVertexNormals();
  root.add(mesh(cuffGeo, std(0xf1e7d2, 0.9), 0, -0.01, 0.62));
  const sleeve = mesh(clothTube(0.2, 0.24, 2.2, 7), std(0x7f9f5a, 0.92), 0, -0.01, 1.75);
  sleeve.rotation.x = Math.PI / 2;
  root.add(sleeve);

  // 左手戴一支皮革錶帶的手錶
  if (left) {
    const band = mesh(new THREE.TorusGeometry(0.122, 0.018, 10, 40), std(0x5a3a24, 0.7), 0, -0.01, 0.13);
    band.scale.set(1.08, 0.82, 1.2);
    root.add(band);
    const watch = new THREE.Group();
    watch.position.set(0, 0.098, 0.13);
    watch.add(mesh(cyl(0.085, 0.085, 0.035, 40), steel(0.2)));
    const dial = mesh(new THREE.CircleGeometry(0.07, 40), std(0xfbf7ee, 0.4), 0, 0.019, 0);
    dial.rotation.x = -Math.PI / 2;
    watch.add(dial);
    const hand1 = mesh(new THREE.BoxGeometry(0.008, 0.004, 0.05), std(0x222222, 0.5), 0.012, 0.022, -0.012);
    hand1.rotation.y = 0.8;
    watch.add(hand1);
    const hand2 = mesh(new THREE.BoxGeometry(0.006, 0.004, 0.035), std(0x222222, 0.5), -0.01, 0.023, 0.008);
    hand2.rotation.y = -0.6;
    watch.add(hand2);
    root.add(watch);
  }

  if (!extrasOnly) {
  // 四根手指，每根三節，指尖較細、有指甲
  FINGERS.forEach((f) => {
    const joints = [];
    f.len.forEach((L, k) => {
      const j = new THREE.Group();
      if (k === 0) {
        j.position.set(f.x, 0.005, -0.4);
        root.add(j);
      } else {
        j.position.set(0, 0, -f.len[k - 1]);
        joints[k - 1].add(j);
      }
      const r = f.r * (1 - k * 0.1);
      j.add(mesh(fingerSeg(r, L, k === 2 ? 0.78 : 0.9), skin));
      joints.push(j);
    });
    const n = mesh(new THREE.SphereGeometry(f.r * 0.62, 16, 10), nail, 0, f.r * 0.55, -f.len[2] * 0.6);
    n.scale.set(1, 0.28, 1.3);
    joints[2].add(n);
    h.fingers.push(joints);
  });

  // 拇指：從手掌側邊斜著長出來，三節
  const tl = [0.15, 0.11, 0.085];
  tl.forEach((L, k) => {
    const j = new THREE.Group();
    if (k === 0) {
      j.position.set(-0.17, -0.03, -0.1);
      root.add(j);
    } else {
      j.position.set(0, 0, -tl[k - 1]);
      h.thumb[k - 1].add(j);
    }
    j.add(mesh(fingerSeg(0.054 * (1 - k * 0.1), L, k === 2 ? 0.8 : 0.92), skin));
    h.thumb.push(j);
  });
  const tn = mesh(new THREE.SphereGeometry(0.034, 16, 10), nail, 0, 0.032, -0.05);
  tn.scale.set(1, 0.28, 1.3);
  h.thumb[2].add(tn);

  }

  root.scale.set(left ? -HAND_SCALE : HAND_SCALE, HAND_SCALE, HAND_SCALE);
  h.pose = { ...POSES.open, curl: POSES.open.curl.slice() };
  if (!extrasOnly) applyPose(h, h.pose);
  return h;
}

function buildHand(left) {
  if (!HAND_GLTF) return buildProcHand(left);
  const h = buildProcHand(left, true);
  attachRealHand(h);
  applyPose(h, h.pose);
  return h;
}

function applyPose(h, p, wiggle = 0) {
  if (h.real) {
    poseRealHand(h, p, wiggle);
    return;
  }
  h.fingers.forEach((js, i) => {
    const c = p.curl[i] + Math.sin(wiggle * 1.7 + i * 1.3) * 0.015;
    js[0].rotation.set(-c * 1.2, (1.5 - i) * 0.09 * p.spread, 0);
    js[1].rotation.x = -c * 1.55;
    js[2].rotation.x = -c * 1.1;
  });
  h.thumb[0].rotation.set(-p.tx * 0.9, 0.75 + p.ty, p.tz);
  h.thumb[1].rotation.x = -p.tc * 0.9;
  h.thumb[2].rotation.x = -p.tc * 1.1;
}

// 手勢之間的過渡：手指從食指到小指依序彎下去，比較像真的手
function mixPose(a, b, k) {
  const fk = (i) => ease(clamp01((k - i * 0.08) / 0.76));
  return {
    curl: a.curl.map((v, i) => lerp(v, b.curl[i], fk(i))),
    spread: lerp(a.spread, b.spread, k),
    tx: lerp(a.tx, b.tx, k),
    ty: lerp(a.ty, b.ty, k),
    tz: lerp(a.tz, b.tz, k),
    tc: lerp(a.tc, b.tc, k),
  };
}

/* ---------- 品鑑杯、貓掌 ---------- */

// 杯中咖啡的表面：底色 + 邊緣一圈細泡沫 + 散落的小氣泡
const cremaCanvas = document.createElement('canvas');
cremaCanvas.width = 256;
cremaCanvas.height = 256;
const cremaTex = new THREE.CanvasTexture(cremaCanvas);
cremaTex.colorSpace = THREE.SRGBColorSpace;
function drawCrema(base, foam) {
  const x = cremaCanvas.getContext('2d');
  const c = `#${base.getHexString()}`;
  const light = `#${base.clone().lerp(new THREE.Color(0xd9a56a), 0.55).getHexString()}`;
  x.fillStyle = c;
  x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,.18)');
  g.addColorStop(0.62, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, light);
  g.addColorStop(1, light);
  x.globalAlpha = 0.35 + foam * 0.6;
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.globalAlpha = 1;
  const n = Math.round(80 + foam * 420);
  for (let i = 0; i < n; i++) {
    const r = 128 * Math.sqrt(0.35 + Math.random() * 0.65) * (Math.random() < 0.15 ? Math.random() : 1);
    const a = Math.random() * TAU;
    const s = 0.8 + Math.random() * 2.6;
    x.fillStyle = Math.random() < 0.7 ? light : 'rgba(255,240,220,.6)';
    x.beginPath();
    x.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, s, 0, TAU);
    x.fill();
  }
  cremaTex.needsUpdate = true;
}

function buildCup() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const porcelain = phys({ color: 0xfbf8f2, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 });
  const gold = std(0xd8b25a, 0.22, 1);
  // 杯碟：中間有放杯子的凹槽、金邊
  g.add(mesh(lathe([[0.001, 0], [0.32, 0], [0.5, 0.035], [0.56, 0.06], [0.55, 0.075], [0.48, 0.055], [0.3, 0.038],
    [0.24, 0.045], [0.2, 0.038], [0.001, 0.038]], 72), porcelain));
  const sRim = mesh(new THREE.TorusGeometry(0.555, 0.006, 8, 72), gold, 0, 0.07, 0);
  sRim.rotation.x = Math.PI / 2;
  g.add(sRim);
  // 杯子：有厚度、杯腳、金邊
  g.add(body);
  body.add(mesh(lathe([[0.001, 0.04], [0.17, 0.04], [0.19, 0.055], [0.2, 0.08], [0.27, 0.16], [0.315, 0.3], [0.33, 0.4], [0.333, 0.42],
    [0.318, 0.42], [0.31, 0.4], [0.296, 0.3], [0.255, 0.17], [0.2, 0.1], [0.001, 0.1]], 72), porcelain));
  const rim = mesh(new THREE.TorusGeometry(0.326, 0.007, 8, 72), gold, 0, 0.42, 0);
  rim.rotation.x = Math.PI / 2;
  body.add(rim);
  // 把手：上寬下窄的耳形
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.31, 0.36, 0), new THREE.Vector3(0.43, 0.38, 0), new THREE.Vector3(0.47, 0.28, 0),
    new THREE.Vector3(0.41, 0.18, 0), new THREE.Vector3(0.29, 0.15, 0),
  ]);
  body.add(mesh(taperedTube(hc, 32, 12, 0.03, 0.022), porcelain));
  // 杯裡的咖啡：側面深色、表面用油脂貼圖
  const coffeeSide = phys({ color: 0x2a1205, roughness: 0.15, clearcoat: 1 });
  const coffeeTop = phys({ color: 0xffffff, map: cremaTex, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
  const coffee = mesh(new THREE.CylinderGeometry(0.3, 0.2, 1, 48), [coffeeSide, coffeeTop, coffeeSide], 0, 0.1, 0);
  coffee.visible = false;
  body.add(coffee);
  // 咖啡打進杯子時的漣漪
  const ripples = [];
  for (let i = 0; i < 4; i++) {
    const m = mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe2c0, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    body.add(m);
    ripples.push({ m, life: 0 });
  }
  return { g, body, coffee, coffeeSide, coffeeTop, ripples, rippleT: 0 };
}

function buildPaw() {
  const g = new THREE.Group();
  const fur = std(0x9aa6b8, 0.95);
  const stripe = std(0x76839a, 0.95);
  const glove = std(0xfffaf0, 0.92);
  const pad = phys({ color: 0xf29c8a, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffc0b0) });
  // 毛茸茸的手臂：表面隨機起伏
  const armGeo = new THREE.CapsuleGeometry(0.21, 2.2, 10, 28);
  const ap = armGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const k = 1 + (Math.sin(ap.getY(i) * 31 + Math.atan2(ap.getZ(i), ap.getX(i)) * 7) * 0.5 + Math.random() * 0.5) * 0.06;
    ap.setX(i, ap.getX(i) * k);
    ap.setZ(i, ap.getZ(i) * k);
  }
  armGeo.computeVertexNormals();
  const arm = mesh(armGeo, fur, 1.35, 0, 0);
  arm.rotation.z = Math.PI / 2;
  g.add(arm);
  // 虎斑條紋
  [0.85, 1.25, 1.65].forEach((x) => {
    const r = mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 32), stripe, x, 0, 0);
    r.rotation.y = Math.PI / 2;
    r.scale.set(1, 1, 0.6);
    g.add(r);
  });
  // 蓬鬆的白手套袖口
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    g.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), glove, 0.4, Math.cos(a) * 0.2, Math.sin(a) * 0.2));
  }
  // 手掌 + 四根圓圓的腳趾
  const mitt = mesh(new THREE.SphereGeometry(0.26, 28, 20), glove, 0.08, -0.02, 0);
  mitt.scale.set(1.1, 0.8, 1);
  g.add(mitt);
  [-0.15, -0.05, 0.05, 0.15].forEach((z, i) => {
    const toe = mesh(new THREE.SphereGeometry(0.09, 18, 14), glove, -0.16 + Math.abs(z) * 0.4, 0.04, z * 1.05);
    toe.scale.set(1, 0.85, 0.9);
    g.add(toe);
    // 腳趾下面的小肉球
    const b = mesh(new THREE.SphereGeometry(0.045, 14, 10), pad, -0.19 + Math.abs(z) * 0.4, -0.06, z * 1.05);
    b.scale.y = 0.55;
    g.add(b);
    if (i === 0) g.userData.toeY = 0.04;
  });
  // 大肉球
  const big = mesh(new THREE.SphereGeometry(0.11, 18, 14), pad, 0.06, -0.2, 0);
  big.scale.set(1, 0.42, 1.15);
  g.add(big);
  return g;
}

/* ---------- 時間軸 ---------- */

const S = { t: 0, playing: false, cue: null, fired: {}, react: null };
const ease = (k) => k * k * (3 - 2 * k);
const easeBack = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // 稍微衝過頭再回來
// 在 [a, b] 秒之間從 0 平滑走到 1
const span = (t, a, b) => ease(clamp01((t - a) / (b - a)));
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const TIME_STRETCH = 1.25; // 整段動畫放慢一點，動作才不會太趕

const CUP0 = [-1.3, 0, 0.95];
const CUP1 = [0.85, 0, 1.4];

// 分享壺內側的形狀（拿來做會保持水平的咖啡液）
const INNER = {
  glass: [[0.001, 0.045], [0.72, 0.045], [0.765, 0.085], [0.765, 0.9], [0.53, 1.19], [0.52, 1.32]],
  chemex: [[0.001, 0.045], [0.8, 0.045], [0.875, 0.15], [0.815, 0.72], [0.35, 1.3], [0.33, 1.46], [0.96, 2.27], [0.97, 2.31]],
};

function buildServe(game) {
  const g = groups.serve;
  disposeGroup(g);
  const s = buildStation(g, Object.assign({}, game, { rinsed: true }));
  S.s = s;
  s.kettle.visible = false;
  s.steam.forEach((sp) => { sp.visible = false; });
  const chemex = s.id === 'chemex';

  // 濾杯裡留著泡過的咖啡渣（中間微凹、表面顆粒）
  const d = s.d;
  const bedR = paperR(d, d.bedY) * 0.95 * inR(d);
  const bedGeo = new THREE.CircleGeometry(bedR, 48, 0, TAU);
  const bed = mesh(bedGeo, std(0x2a160a, 0.55, 0, { map: grainTex, bumpMap: grainTex, bumpScale: 2.5 }), 0, d.bedY - 0.05, 0);
  bed.rotation.x = -Math.PI / 2;
  s.top.add(bed);
  setPaperWet(s, 1);
  s.paperBottomMat.color.copy(PAPER_WET).lerp(new THREE.Color(0x8a5c34), 0.6);
  // 濾紙上半段留下的咖啡漬
  const col = s.paperGeo.attributes.color;
  const pos = s.paperGeo.attributes.position;
  const stain = new THREE.Color(0x8a5c34);
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const w = clamp01((d.bedY + 0.25 - pos.getY(i)) / 0.25);
    c.copy(PAPER_WET).lerp(stain, 0.12 + w * 0.38);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;

  // 下壺放進一個以壺口為支點的「傾倒架」，倒咖啡時繞壺口旋轉
  S.pivot = chemex ? new THREE.Vector3(-1.0, 2.3, 0) : new THREE.Vector3(-0.56, 1.3, 0);
  S.tiltMax = chemex ? 1.45 : 1.15;
  S.rig = new THREE.Group();
  S.rig.position.copy(S.pivot);
  g.add(S.rig);
  S.rig.add(s.srv);
  s.srv.position.copy(S.pivot).negate();

  // 壺裡的咖啡：用切面切出液面，壺怎麼傾斜液面都保持水平
  s.liquid.visible = false;
  S.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.8);
  const inner = lathe(chemex ? INNER.chemex : INNER.glass, 64);
  S.liqSide = phys({ color: 0x2a1205, roughness: 0.1, clearcoat: 1, clippingPlanes: [S.plane], envMapIntensity: 0.4 });
  S.liqTop = new THREE.MeshStandardMaterial({ color: 0x5a2e14, roughness: 0.2, side: THREE.BackSide, clippingPlanes: [S.plane] });
  S.liqA = mesh(inner, S.liqSide);
  S.liqB = mesh(inner, S.liqTop);
  s.srv.add(S.liqA, S.liqB);
  S.fillH = 0.045 + s.coffeeMax * 0.95;
  S.fillLow = 0.045 + s.coffeeMax * 0.72;

  // 品鑑杯、壺口流出的咖啡（彎曲的水柱）、貓掌、兩隻手
  S.cup = buildCup();
  S.cup.g.position.set(...CUP0);
  g.add(S.cup.g);
  S.streamMat = phys({ color: 0x3a1a08, roughness: 0.06, clearcoat: 1, transparent: true, opacity: 0.93, envMapIntensity: 0.9 });
  S.stream = mesh(new THREE.BufferGeometry(), S.streamMat);
  S.stream.visible = false;
  g.add(S.stream);
  S.splash = Array.from({ length: 24 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  S.splashGeo = new THREE.BufferGeometry();
  S.splashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
  S.splashPts = new THREE.Points(S.splashGeo, new THREE.PointsMaterial({ color: 0x6b3a1c, size: 0.025, transparent: true, opacity: 0.9, depthWrite: false }));
  S.splashPts.frustumCulled = false;
  g.add(S.splashPts);
  // 拿起濾杯時滴下的咖啡
  S.drops = [0, 1, 2].map(() => {
    const m = mesh(new THREE.SphereGeometry(0.035, 12, 10), phys({ color: 0x3a1a08, roughness: 0.08, clearcoat: 1 }));
    m.scale.y = 1.5;
    m.visible = false;
    g.add(m);
    return { m, v: 0, on: false };
  });

  S.paw = buildPaw();
  S.paw.position.set(5, 0.5, 1.6);
  g.add(S.paw);
  S.hands = [buildHand(false), buildHand(true)];
  S.hands.forEach((h) => g.add(h.root));
  shadows(g);
  [S.stream, S.liqA, S.liqB].forEach((m) => { m.castShadow = false; });

  // 把手 / 杯碟 / 濾紙上要抓的點（各自物件的座標）
  S.grip = chemex
    ? { srv: [0.52, 1.24, 0], top: [-0.98, 2.33, 0], topPose: 'pinch', topF: [0.25, -1, 0], topB: [-1, 0, 0] }
    : { srv: [1.26, 0.55, 0], top: [s.id === 'kalita' ? -1.15 : -1.1, 1.78, 0], topPose: 'grip', topF: [1, 0, 0], topB: [0, 0, -1] };
  S.tip = new THREE.Vector3(0, d.paper[0][1] - 0.12, 0); // 濾杯底部出水口

  S.t = 0;
  S.fired = {};
  S.playing = false;
}

// 依結果設定咖啡顏色（sRGB hex）和油脂
function setServeLook(react) {
  const c = new THREE.Color(react.color);
  const top = c.clone().lerp(new THREE.Color(0xc89060), 0.22);
  S.liqSide.color.copy(c).multiplyScalar(0.55);
  S.liqTop.color.copy(top).multiplyScalar(0.8);
  S.cup.coffeeSide.color.copy(c).multiplyScalar(0.55);
  S.cup.coffeeTop.clearcoat = 0.3 + react.stars * 0.2;
  S.streamMat.color.copy(c).multiplyScalar(0.85);
  S.drops.forEach((dr) => dr.m.material.color.copy(c).multiplyScalar(0.6));
  drawCrema(top, react.stars / 3);
}

// 一隻手在某個關鍵影格的狀態（on: 跟著哪個物件）
function handKey(h, k) {
  const P = v3(k.p);
  const F = v3(k.f).normalize();
  const Bk = v3(k.b).normalize();
  if (k.on) {
    const m = S.anchor[k.on].matrixWorld;
    P.applyMatrix4(m);
    F.transformDirection(m);
    Bk.transformDirection(m);
  }
  const Z = F.clone().negate();
  const X = new THREE.Vector3().crossVectors(Bk, Z).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const gp = GRASP[k.pose].map((v) => v * HAND_SCALE);
  if (h.left) gp[0] = -gp[0];
  const pos = P.sub(v3(gp).applyQuaternion(q));
  return { pos, q, pose: POSES[k.pose] };
}

function driveHand(h, keys, t) {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const k = a === b ? 0 : ease(clamp01((t - a.t) / (b.t - a.t)));
  const sa = handKey(h, a);
  const sb = handKey(h, b);
  h.root.position.lerpVectors(sa.pos, sb.pos, k);
  // 在空中移動時走一道弧線，不是直線滑過去
  if (a.on !== b.on || !a.on) h.root.position.y += Math.sin(k * Math.PI) * Math.min(0.45, sa.pos.distanceTo(sb.pos) * 0.18);
  // 沒有抓著東西時，手會有一點自然的晃動
  const free = !(a.on && b.on && a.pose !== 'open');
  if (free) {
    h.root.position.x += Math.sin(t * 1.9 + (h.left ? 2 : 0)) * 0.012;
    h.root.position.y += Math.sin(t * 2.3 + (h.left ? 1 : 0)) * 0.01;
  }
  h.root.quaternion.copy(sa.q).slerp(sb.q, k);
  h.pose = mixPose(sa.pose, sb.pose, k);
  applyPose(h, h.pose, free ? t : 0);
}

// 收尾動畫結束後，手在畫面下方依結果比動作
function gestureHands(t) {
  const tier = S.react.stars;
  const w = 2.4 * t;
  const clap = Math.abs(Math.sin(w * 3)) ** 0.6;
  const sets = {
    3: [
      { p: [0.17 + 0.3 * clap, 0.95, 2.2], f: [0, 1, -0.25], b: [1, 0, 0], pose: 'flat' },
      { p: [-0.17 - 0.3 * clap, 0.95, 2.2], f: [0, 1, -0.25], b: [-1, 0, 0], pose: 'flat' },
    ],
    2: [
      { p: [0.45, 0.95 + Math.sin(w * 2) * 0.06, 2.2], f: [-1, 0, 0.15], b: [0, 0, -1], pose: 'thumbsUp' },
      { p: [-1.1, 0.35, 2.1], f: [0.4, 0, -1], b: [0, 1, 0], pose: 'relax' },
    ],
    1: [
      { p: [0.75, 0.75 + Math.sin(w * 2) * 0.08, 2.1], f: [0.5, 0.2, -1], b: [0, -1, 0], pose: 'open' },
      { p: [-0.75, 0.75 + Math.sin(w * 2) * 0.08, 2.1], f: [-0.5, 0.2, -1], b: [0, -1, 0], pose: 'open' },
    ],
    0: [
      { p: [0.16, 0.95 + Math.sin(w * 3) * 0.07, 2.2 - Math.abs(Math.sin(w * 3)) * 0.08], f: [0, 1, -0.2], b: [1, 0, 0], pose: 'flat' },
      { p: [-0.16, 0.95 + Math.sin(w * 3) * 0.07, 2.2 - Math.abs(Math.sin(w * 3)) * 0.08], f: [0, 1, -0.2], b: [-1, 0, 0], pose: 'flat' },
    ],
  }[tier];
  return sets;
}

const T_REACT = 7.3;

function updateServe(dt) {
  if (!S.playing) return;
  S.t += dt;
  const t = S.t / TIME_STRETCH;
  const ts = dt / TIME_STRETCH;
  const s = S.s;
  const chemex = s.id === 'chemex';

  // 提示事件（給 game.js 播字幕和音效）
  [['lift', 0.3], ['swirl', 2.0], ['pour', 3.9], ['serve', 5.9], ['react', T_REACT]].forEach(([name, at]) => {
    if (t >= at && !S.fired[name]) {
      S.fired[name] = true;
      if (S.cue) S.cue(name);
    }
  });

  // 1. 拿開濾杯：抬起時微微傾斜、底部滴幾滴咖啡，放下時輕輕彈一下（Chemex 是把濾紙拿出來丟掉）
  const lift = span(t, 0.8, 1.3);
  const moveRaw = clamp01((t - 1.3) / 0.75);
  if (chemex) {
    const away = span(t, 1.3, 2.3);
    s.top.position.set(-3.2 * away, 1.2 * lift + 0.8 * away, -0.4 * away);
    s.top.rotation.z = 0.5 * away;
  } else {
    const side = ease(clamp01(moveRaw / 0.7));
    const down = easeBack(clamp01((moveRaw - 0.45) / 0.55));
    s.top.position.set(lerp(0, -2.05, side), lerp(0.7 * lift, -1.21, down) + Math.sin(side * Math.PI) * 0.35, lerp(0, -1.4, side));
    s.top.rotation.z = Math.sin(moveRaw * Math.PI) * 0.14 + lift * (1 - moveRaw) * 0.05;
  }
  s.top.updateMatrixWorld(true);
  [0.95, 1.2, 1.42].forEach((at, i) => {
    const dr = S.drops[i];
    if (t >= at && !dr.on && dr.v === 0) {
      dr.on = true;
      dr.m.position.copy(S.tip).applyMatrix4(s.top.matrixWorld);
    }
    if (dr.on) {
      dr.v += 15 * ts;
      dr.m.position.y -= dr.v * ts;
      const floor = Math.hypot(dr.m.position.x, dr.m.position.z) < 0.75 ? S.fillH : 0.02;
      if (dr.m.position.y < floor) { dr.on = false; dr.v = -1; }
    }
    dr.m.visible = dr.on;
  });

  // 2. 搖晃分享壺：壺沿小圓圈晃，裡面的咖啡跟著甩動
  const swirlEnv = span(t, 2.0, 2.35) * (1 - span(t, 3.25, 3.65));
  const ph = (t - 2.0) * TAU * 2.0;
  const sx = Math.cos(ph) * 0.08 * swirlEnv;
  const sz = Math.sin(ph) * 0.08 * swirlEnv;

  // 3. 倒進品鑑杯：抬起 → 移到杯子上方邊傾斜 → 倒 → 收回
  const up = span(t, 3.6, 4.0) * (1 - span(t, 5.5, 5.95));
  const over = span(t, 3.9, 4.45) * (1 - span(t, 5.3, 5.75));
  const tilt = S.tiltMax * (0.7 * span(t, 3.95, 4.45) + 0.3 * span(t, 4.45, 4.7)) * (1 - span(t, 5.05, 5.45));
  const pourAt = v3(CUP0).add(new THREE.Vector3(0.17, chemex ? 1.25 : 0.95, 0));
  const home = S.pivot.clone();
  const raised = home.clone().add(new THREE.Vector3(0, chemex ? 0.5 : 0.75, 0.3));
  const rp = home.clone().lerp(raised, up).lerp(pourAt, over);
  S.rig.position.set(rp.x + sx, rp.y, rp.z + sz);
  S.rig.rotation.set(sz * 1.1, ph * 0.02 * swirlEnv, tilt + sx * 1.1);
  S.rig.updateMatrixWorld(true);

  // 液面：保持水平；搖晃時往外甩（反方向傾斜）；倒的時候液面跟到壺口
  const poured = span(t, 4.5, 5.1);
  const axis = new THREE.Vector3(0, lerp(S.fillH, S.fillLow, poured), 0).applyMatrix4(s.srv.matrixWorld);
  const lip = S.rig.getWorldPosition(new THREE.Vector3());
  let level = axis.y;
  const pouring = tilt > S.tiltMax * 0.8 && t < 5.1;
  if (pouring) level = Math.max(level, lip.y - 0.02);
  const lag = ph - 1.2;
  const n = new THREE.Vector3(Math.cos(lag) * 0.24 * swirlEnv, -1, Math.sin(lag) * 0.24 * swirlEnv).normalize();
  S.plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(axis.x, level, axis.z));

  // 壺口流到杯子的咖啡：一道彎曲、會晃動的水柱
  const flow = clamp01((tilt - S.tiltMax * 0.8) / (S.tiltMax * 0.15)) * (1 - span(t, 4.95, 5.12));
  S.stream.visible = flow > 0.02;
  const fill = span(t, 4.5, 5.15);
  const cupY = S.cup.g.position.y + 0.1 + fill * 0.27;
  if (S.stream.visible) {
    const end = new THREE.Vector3(S.cup.g.position.x + 0.05 + Math.sin(t * 23) * 0.012, cupY, S.cup.g.position.z + Math.cos(t * 19) * 0.01);
    const ctrl = lip.clone().add(new THREE.Vector3(-0.16, -0.05, 0));
    const curve = new THREE.QuadraticBezierCurve3(lip.clone().add(new THREE.Vector3(-0.03, -0.01, 0)), ctrl, end);
    S.stream.geometry.dispose();
    S.stream.geometry = taperedTube(curve, 24, 10, 0.05 * flow + 0.004, 0.026 * flow + 0.004);
    // 落點的漣漪和濺起的小水滴
    S.cup.rippleT -= ts;
    if (S.cup.rippleT <= 0) {
      S.cup.rippleT = 0.12;
      const r = S.cup.ripples.find((x) => x.life <= 0);
      if (r) { r.life = 1; r.m.visible = true; }
    }
    const sp = S.splash.find((x) => x.life <= 0);
    if (sp && Math.random() < 0.6) {
      const a = rand(0, TAU);
      sp.life = 1;
      sp.p.copy(end);
      sp.v.set(Math.cos(a) * rand(0.2, 0.45), rand(0.5, 1.0), Math.sin(a) * rand(0.2, 0.45));
    }
  }
  S.cup.ripples.forEach((r) => {
    if (r.life <= 0) return;
    r.life -= ts * 1.6;
    const sc = 0.03 + (1 - r.life) * 0.24;
    r.m.scale.set(sc, sc, 1);
    r.m.position.set(0.05, 0.1 + fill * 0.27 + 0.004, 0);
    r.m.material.opacity = Math.max(0, r.life) * 0.4;
    if (r.life <= 0) r.m.visible = false;
  });
  const spPos = S.splashGeo.attributes.position;
  S.splash.forEach((p, i) => {
    if (p.life > 0) {
      p.v.y -= 7 * ts;
      p.p.addScaledVector(p.v, ts);
      if (p.p.y < cupY) p.life = 0;
    }
    if (p.life > 0) spPos.setXYZ(i, p.p.x, p.p.y, p.p.z);
    else spPos.setXYZ(i, 0, -99, 0);
  });
  spPos.needsUpdate = true;
  S.cup.coffee.visible = fill > 0.01;
  S.cup.coffee.scale.y = Math.max(0.001, fill * 0.27);
  S.cup.coffee.position.y = 0.1 + (fill * 0.27) / 2;
  S.cup.coffeeTop.map.offset.set(Math.sin(t * 0.7) * 0.01, 0);
  S.cup.coffeeTop.map.rotation = t * 0.15; // 杯面的泡沫慢慢旋轉
  S.cup.coffeeTop.map.center.set(0.5, 0.5);

  // 4. 把杯子推給店長，貓掌伸進來端走（先往後縮一下再伸過來）
  const slide = span(t, 6.0, 6.55);
  const cupPos = v3(CUP0).lerp(v3(CUP1), slide);
  const pawIn = easeBack(clamp01((t - 6.3) / 0.6));
  const pawOut = span(t, 7.0, 7.8);
  const GRAB = new THREE.Vector3(0.7, 0.27, 0); // 貓掌相對於杯子的位置：剛好握住把手
  const pawAt = cupPos.clone().add(GRAB);
  const pawFrom = new THREE.Vector3(5, 0.8, 1.7);
  const pawUp = new THREE.Vector3(3.8, 3.6, 0.6);
  const pawPos = pawFrom.clone().lerp(pawAt, pawIn).lerp(pawUp, pawOut);
  pawPos.y += Math.sin(t * 6) * 0.015 * (1 - pawOut);
  S.paw.position.copy(pawPos);
  S.paw.rotation.set(0, 0, -0.25 * pawOut + Math.sin(clamp01((t - 6.85) / 0.25) * Math.PI) * 0.12);
  S.cup.g.position.copy(cupPos);
  if (pawOut > 0) {
    S.cup.body.position.copy(pawPos).sub(GRAB).sub(cupPos);
    S.cup.body.position.y += Math.sin(pawOut * Math.PI) * 0.05;
  } else {
    S.cup.body.position.set(0, 0, 0);
  }
  S.cup.body.rotation.z = -0.22 * pawOut + Math.sin(pawOut * Math.PI * 2) * 0.05;

  // 手要跟著的物件
  s.srv.updateMatrixWorld(true);
  S.cup.g.updateMatrixWorld(true);
  S.anchor = { srv: s.srv, cup: S.cup.g, top: s.top };

  // 5. 手
  const g = S.grip;
  const R_OFF = { p: [4.6, 1.9, 2.6], f: [-1, -0.2, 0], b: [0, 1, 0], pose: 'open' };
  const L_OFF = { p: [-4.6, 1.9, 2.6], f: [1, -0.2, 0], b: [0, 1, 0], pose: 'open' };
  const rKeys = [
    { t: 0, ...R_OFF },
    { t: 1.15, ...R_OFF },
    { t: 1.75, on: 'srv', p: [g.srv[0] + 0.95, g.srv[1] + 0.1, 0.35], f: [-1, 0, 0], b: [0, 0, -1], pose: 'open' },
    { t: 2.0, on: 'srv', p: g.srv, f: [-1, 0, 0], b: [0, 0, -1], pose: 'grip' },
    { t: 5.95, on: 'srv', p: g.srv, f: [-1, 0, 0], b: [0, 0, -1], pose: 'grip' },
    { t: 6.25, on: 'srv', p: [g.srv[0] + 0.8, g.srv[1] + 0.3, 0.3], f: [-1, 0, 0], b: [0, 0, -1], pose: 'open' },
    { t: 6.8, p: [2.9, 2.4, 0.9], f: [-0.6, 0, -1], b: [0, 1, 0], pose: 'relax' },
  ];
  const lKeys = chemex
    ? [
      { t: 0, ...L_OFF },
      { t: 0.5, on: 'top', p: [g.top[0] - 0.6, g.top[1] + 0.5, 0.45], f: g.topF, b: g.topB, pose: 'open' },
      { t: 0.8, on: 'top', p: g.top, f: g.topF, b: g.topB, pose: g.topPose },
      { t: 2.3, on: 'top', p: g.top, f: g.topF, b: g.topB, pose: g.topPose },
    ]
    : [
      { t: 0, ...L_OFF },
      { t: 0.5, on: 'top', p: [g.top[0] - 0.75, g.top[1] + 0.1, 0.55], f: g.topF, b: g.topB, pose: 'open' },
      { t: 0.8, on: 'top', p: g.top, f: g.topF, b: g.topB, pose: g.topPose },
      { t: 2.05, on: 'top', p: g.top, f: g.topF, b: g.topB, pose: g.topPose },
      { t: 2.35, on: 'top', p: [g.top[0] - 0.8, g.top[1] + 0.3, 0.6], f: g.topF, b: g.topB, pose: 'open' },
    ];
  lKeys.push(
    { t: 2.95, on: 'cup', p: [-0.75, 0.2, 0.15], f: [1, -0.2, 0], b: [0, 1, 0], pose: 'open' },
    { t: 3.3, on: 'cup', p: [-0.52, 0.06, 0], f: [1, -0.35, 0], b: [0, 1, 0], pose: 'pinch' },
    { t: 6.55, on: 'cup', p: [-0.52, 0.06, 0], f: [1, -0.35, 0], b: [0, 1, 0], pose: 'pinch' },
    { t: 6.9, p: [-1.4, 0.8, 2.3], f: [1, -0.2, -0.6], b: [0, 1, 0], pose: 'relax' },
    { t: 7.0, p: [-2.2, 1.1, 2.8], f: [0.6, 0, -1], b: [0, 1, 0], pose: 'relax' },
  );
  if (t < T_REACT) {
    driveHand(S.hands[0], rKeys, t);
    driveHand(S.hands[1], lKeys, t);
  } else {
    // 從最後的位置漸漸接到反應手勢
    const k = span(t, T_REACT, T_REACT + 0.5);
    const gs = gestureHands(t - T_REACT);
    [0, 1].forEach((i) => {
      const keys = i === 0 ? rKeys : lKeys;
      const last = keys[keys.length - 1];
      driveHand(S.hands[i], [{ ...last, t: 0 }, { ...gs[i], t: 1 }], k);
    });
  }

  // 鏡頭：每段之間平滑地推軌過去，再加一點手持攝影的晃動
  const shots = [
    [0, [-0.4, 2.6, 3.3], [-0.7, 1.4, 0]],
    [1.85, [0.6, 1.8, 2.8], [0.15, 0.85, 0.1]],
    [3.6, [-0.5, 1.6, 3.1], [-0.85, 0.75, 0.6]],
    [5.6, [0.8, 1.7, 4.0], [0.5, 0.65, 1.0]],
    [T_REACT - 0.2, [0, 1.6, 4.4], [0, 1.15, 1.6]],
  ];
  let i = 0;
  shots.forEach((x, j) => { if (t >= x[0]) i = j; });
  const cur = shots[i];
  const prev = shots[Math.max(0, i - 1)];
  const k = i === 0 ? 1 : span(t, cur[0], cur[0] + 0.85);
  camPos.fromArray(prev[1]).lerp(v3(cur[1]), k);
  camTarget.fromArray(prev[2]).lerp(v3(cur[2]), k);
  camPos.x += Math.sin(t * 0.7) * 0.03;
  camPos.y += Math.sin(t * 0.9 + 1) * 0.02;
}

/* ---------- 鏡頭、迴圈 ---------- */

function setView(v, snap = false) {
  view = v;
  if (mode === 'serve') {
    camPos.set(-0.4, 2.6, 3.3);
    camTarget.set(-0.7, 1.4, 0);
    camera.position.copy(camPos);
    lookAt.copy(camTarget);
    return;
  }
  const cfg = VIEWS[mode][v];
  camPos.fromArray(cfg, 0);
  camTarget.fromArray(cfg, 3);
  const s = mode === 'brew' ? B.s : mode === 'rinse' ? R.s : null;
  if (s) {
    // 三款濾杯高度不同，鏡頭跟著粉床高度微調
    const dy = s.d.bedY - 1.95;
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
  // 直式窄畫面時把視角拉寬一點，模型才不會被切到；很窄的全螢幕畫面以水平視角為準
  if (camera.aspect < 0.8) {
    const h = (64 * Math.PI) / 180;
    camera.fov = (2 * Math.atan(Math.tan(h / 2) / camera.aspect) * 180) / Math.PI;
  } else {
    camera.fov = camera.aspect < 1.2 ? 40 : 34;
  }
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
  else if (mode === 'rinse') updateRinse(dt, now);
  else if (mode === 'brew') updateBrew(dt, now);
  else if (mode === 'serve') updateServe(dt);
  renderer.render(scene, camera);
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'gl';

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

  // 光：室內環境反射 + 一盞投影的主光 + 柔和補光
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x8a6a48, 0.25));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.8);
  sun.position.set(-3.5, 7, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffd6a0, 0.9);
  rim.position.set(2.5, 4, -6);
  scene.add(rim);

  // 圓木桌
  const top = wood(0xffffff, 0.5);
  const side = wood(0x9a6a40, 0.6);
  const table = mesh(cyl(4.4, 4.4, 0.3, 96), [side, top, side], 0, -0.15, 0);
  table.receiveShadow = true;
  scene.add(table);

  groups.weigh = buildWeigh();
  groups.grind = buildGrind();
  groups.rinse = new THREE.Group();
  groups.brew = new THREE.Group();
  groups.serve = new THREE.Group();
  shadows(groups.weigh);
  shadows(groups.grind);
  G.dust.castShadow = false;
  Object.values(groups).forEach((g) => { g.visible = false; scene.add(g); });

  // 視角切換按鈕
  viewsEl = document.createElement('div');
  viewsEl.className = 'views';
  Object.entries(VIEW_NAMES).forEach(([v, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = v;
    b.textContent = name;
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); // 不要被當成磨豆、濕濾紙或注水的手勢
    b.addEventListener('click', (e) => { e.stopPropagation(); setView(v); });
    viewsEl.appendChild(b);
  });

  window.addEventListener('resize', resize);
  loadHandModel();
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
    if (m === 'rinse') buildRinse(game);
    if (m === 'brew') buildBrew(game);
    if (m === 'serve') buildServe(game);
    host.appendChild(renderer.domElement);
    if (m === 'serve') viewsEl.remove();
    else host.appendChild(viewsEl);
    resize();
    setView('angle', true);
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  },

  unmount() {
    S.playing = false;
    S.cue = null;
    cancelAnimationFrame(raf);
    raf = 0;
    host = null;
    mode = null;
  },

  setWeigh(grams, pouring) { W.grams = grams; W.pouring = pouring; },

  setGrind({ angle, p, size }) {
    if (angle !== undefined) { G.angle = angle; G.moving = 0.25; }
    if (p !== undefined) G.p = p;
    if (size !== undefined) G.size = size;
  },

  setRinse({ angle, p, pouring }) {
    if (angle !== undefined) R.angle = angle;
    if (p !== undefined) R.p = p;
    if (pouring !== undefined) R.pouring = pouring;
  },

  setBrew(st) { B.st = st; },

  // 收尾動畫：react = { stars, score, color }，cue(name) 會在 lift / swirl / pour / serve / react 時被呼叫
  playServe(react, cue) {
    if (mode !== 'serve') return;
    S.react = react;
    S.cue = cue;
    setServeLook(react);
    S.t = 0;
    S.fired = {};
    S.playing = true;
  },

  // 把手指在螢幕上的位置投影到粉床平面，換算成遊戲邏輯座標
  brewPoint(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(UP, -B.d.bedY), new THREE.Vector3());
    if (!hit) return { x: -9999, y: -9999 };
    return { x: C + (hit.x / B.bedR) * BED_R, y: C + (hit.z / B.bedR) * BED_R };
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
