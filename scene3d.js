// 選豆、選濾杯的展示架，和秤豆、磨豆、濕濾紙、注水四個步驟的 3D 場景（最後的店長品鑑是 2D 動畫，不在這裡）。
// 模型全部用程式組出來（不載入外部模型檔），材質用物理光照、環境反射和即時陰影。
// 載入失敗（沒網路、瀏覽器不支援 import map 或 WebGL）時 window.Scene3D 不存在，遊戲自動改用 2D 畫面。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const C = 300;      // 遊戲邏輯座標的中心（和 game.js 一致）
const BED_R = 215;  // 遊戲邏輯座標的粉床半徑
const TAU = Math.PI * 2;

/* ---------- 小工具 ---------- */

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => k * k * (3 - 2 * k);
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
let table;
// 畫質：觸控裝置（手機、平板）解析度上限 1.5 倍、陰影小一點且隔一幀更新；
// 不管什麼裝置，連續掉幀就自動把解析度往下降，最低 1 倍
const LITE = window.matchMedia('(pointer: coarse)').matches;
const Q = { ratio: Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2), warm: 0, n: 0, sum: 0, frame: 0 };
// 量畫布位置會讓瀏覽器重排版面，手指移動時沿用剛量過的結果
let rectCache = { r: null, t: 0 };
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
   平底方袋（咖啡豆袋）：豆子架和秤豆共用
   ========================================================== */

// 袋子尺寸：寬、高、側摺厚度、頂端熱封條高度
const POUCH = { w: 0.9, h: 1.36, d: 0.5, seal: 0.11 };
const pouchTexCache = {};

// 袋子的貼圖：一張彩色圖 + 金屬度圖 + 粗糙度圖，燙金的地方會反光、其他地方是霧面
function pouchTextures(bean) {
  if (pouchTexCache[bean.id]) return pouchTexCache[bean.id];
  const paint = (w, h, draw) => {
    const cv = [0, 1, 2].map(() => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });
    const ctx = { map: cv[0].getContext('2d'), metal: cv[1].getContext('2d'), rough: cv[2].getContext('2d') };
    // 霧面袋身：底色 + 上亮下暗 + 細小顆粒
    ctx.map.fillStyle = bean.bag;
    ctx.map.fillRect(0, 0, w, h);
    const gr = ctx.map.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,.10)');
    gr.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.map.fillStyle = gr;
    ctx.map.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 40; i++) {
      ctx.map.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rand(0.02, 0.05)})`;
      ctx.map.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.metal.fillStyle = '#000';
    ctx.metal.fillRect(0, 0, w, h);
    ctx.rough.fillStyle = '#d0d0d0';
    ctx.rough.fillRect(0, 0, w, h);
    // foil(fn)：同一個圖形同時畫在三張圖上，就是燙金
    const foil = (fn) => {
      [['map', bean.foil], ['metal', '#ffffff'], ['rough', '#4a4a4a']].forEach(([k, col]) => {
        const x = ctx[k];
        x.save();
        x.fillStyle = col;
        x.strokeStyle = col;
        fn(x);
        x.restore();
      });
    };
    draw(ctx, foil, w, h);
    const tex = (c, srgb) => {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return { map: tex(cv[0], true), metal: tex(cv[1], false), rough: tex(cv[2], false) };
  };

  // 正面：Estate Coffee、產地、燙金圓形徽章、重量
  const front = paint(512, 768, (ctx, foil, w) => {
    // 夾鏈的壓線
    const zy = 768 * ((POUCH.seal + 0.08) / POUCH.h);
    ctx.map.fillStyle = 'rgba(0,0,0,.2)';
    ctx.map.fillRect(0, zy, w, 3);
    ctx.map.fillStyle = 'rgba(255,255,255,.18)';
    ctx.map.fillRect(0, zy + 3, w, 2);
    foil((x) => {
      x.fillRect(44, 212, 5, 96);
      x.font = 'bold 44px Georgia, "Times New Roman", serif';
      x.fillText('Estate', 62, 250);
      x.fillText('Coffee', 62, 300);
      x.font = 'italic 32px Georgia, "Times New Roman", serif';
      x.fillText(bean.en, 64, 356);
    });
    foil((x) => {
      // 徽章：雙圓框 + 冒煙的杯子 + 店名
      x.lineWidth = 5;
      x.beginPath();
      x.arc(330, 496, 132, 0, TAU);
      x.stroke();
      x.lineWidth = 2;
      x.beginPath();
      x.arc(330, 496, 120, 0, TAU);
      x.stroke();
      x.lineWidth = 8;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(276, 478);
      x.lineTo(384, 478);
      x.quadraticCurveTo(378, 546, 330, 546);
      x.quadraticCurveTo(282, 546, 276, 478);
      x.stroke();
      x.beginPath();
      x.arc(388, 502, 16, -Math.PI / 2, Math.PI / 2);
      x.stroke();
      [306, 330, 354].forEach((sx) => {
        x.beginPath();
        x.moveTo(sx, 462);
        x.quadraticCurveTo(sx - 11, 446, sx, 430);
        x.quadraticCurveTo(sx + 11, 414, sx, 398);
        x.stroke();
      });
      x.font = 'bold 36px "Huninn", sans-serif';
      x.textAlign = 'center';
      x.fillText('滴滴手沖', 330, 596);
    });
    foil((x) => {
      x.font = '28px Georgia, "Times New Roman", serif';
      x.fillText('200g | 100% Arabica', 50, 700);
    });
  });

  // 背面：小徽章、說明文字、條碼
  const back = paint(512, 768, (ctx, foil, w) => {
    foil((x) => {
      x.lineWidth = 4;
      x.beginPath();
      x.arc(w / 2, 250, 52, 0, TAU);
      x.stroke();
      x.font = 'bold 30px "Huninn", sans-serif';
      x.textAlign = 'center';
      x.fillText('DRIP DRIP', w / 2, 350);
      x.font = '24px "Huninn", sans-serif';
      x.fillText(`${bean.name}・${bean.roast}`, w / 2, 392);
    });
    ctx.map.fillStyle = 'rgba(255,255,255,.32)';
    for (let i = 0; i < 7; i++) ctx.map.fillRect(70, 430 + i * 22, i === 6 ? 220 : 372, 6);
    ctx.map.fillStyle = '#f7f3ea';
    ctx.map.fillRect(150, 620, 212, 96);
    ctx.map.fillStyle = '#222';
    for (let bx = 162; bx < 350; bx += 4 + Math.floor(Math.random() * 4)) ctx.map.fillRect(bx, 630, Math.random() < 0.5 ? 2 : 4, 64);
  });

  // 側摺：中間一道摺線（凹進去的那條）
  const side = paint(256, 768, (ctx) => {
    const g = ctx.map.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.map.fillStyle = g;
    ctx.map.fillRect(0, 0, 256, 768);
    ctx.map.fillStyle = 'rgba(0,0,0,.28)';
    ctx.map.fillRect(126, 0, 2, 768);
    ctx.map.fillStyle = 'rgba(255,255,255,.16)';
    ctx.map.fillRect(129, 0, 2, 768);
  });

  // 熱封條：一條條橫向壓紋，兩端有撕口
  const seal = paint(512, 64, (ctx, foil, w, h) => {
    for (let y = 4; y < h - 4; y += 5) {
      ctx.map.fillStyle = 'rgba(0,0,0,.16)';
      ctx.map.fillRect(0, y, w, 2);
      ctx.map.fillStyle = 'rgba(255,255,255,.14)';
      ctx.map.fillRect(0, y + 2, w, 1);
    }
    ctx.map.fillStyle = 'rgba(0,0,0,.5)';
    [20, w - 20].forEach((nx) => {
      ctx.map.beginPath();
      ctx.map.moveTo(nx - 7, h);
      ctx.map.lineTo(nx + 7, h);
      ctx.map.lineTo(nx, h - 16);
      ctx.map.fill();
    });
  });
  pouchTexCache[bean.id] = { front, back, side, seal };
  return pouchTexCache[bean.id];
}

// 平底方袋：底部方正、正背面微鼓、兩側的側摺往內凹，到頂端收成一條熱封。
// open = true 是剪開的袋子（秤豆時倒豆用），袋口看得到豆子。原點在袋底中心，正面朝 +z。
function buildPouch(bean, { open = false } = {}) {
  const { w, h, d, seal } = POUCH;
  const T = pouchTextures(bean);
  const mat = (t) => phys({
    map: t.map, metalnessMap: t.metal, roughnessMap: t.rough, metalness: 1, roughness: 1,
    sheen: 0.15, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.55,
  });
  const topK = (y) => ease(clamp01((y / h - 0.72) / 0.28));
  const squeeze = open ? 0.46 : 0.05;
  const geo = new THREE.BoxGeometry(w, h, d, 20, 44, 12);
  geo.translate(0, h / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = topK(y);
    const fz = Math.abs(z) / (d / 2);
    const fy = clamp01(y / h);
    // 正背面裝了豆子微微鼓起；袋底一圈不鼓（平底）
    const bulge = (1 - (x / (w / 2)) ** 2) * Math.sin(Math.PI * fy) ** 0.8 * 0.032 * fz;
    const nz = z * lerp(1, squeeze, k) + Math.sign(z) * bulge * (1 - k * 0.6);
    // 側摺：中線往內凹，越上面凹越深
    let nx = x;
    if (Math.abs(x) > w / 2 - 1e-4) nx = Math.sign(x) * (w / 2 - (1 - fz) ** 1.5 * (0.012 + 0.08 * k));
    // 剪開的袋口邊緣有點不平
    const ny = open && y > h - 1e-4 ? y - 0.012 * Math.sin((x / w) * 9 + 1) : y;
    p.setXYZ(i, nx, ny, nz);
  }
  geo.computeVertexNormals();
  const sideMat = mat(T.side);
  const inside = std(0x24160d, 0.95);
  const g = new THREE.Group();
  // BoxGeometry 的面順序：+x, -x, +y, -y, +z, -z
  g.add(mesh(geo, [sideMat, sideMat, open ? inside : sideMat, sideMat, mat(T.front), mat(T.back)]));

  if (open) {
    // 袋口裡的豆子（倒豆時會藏起來）
    const top = new THREE.Group();
    const bm = phys({ color: roastColor(bean), roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const b = mesh(BEAN_GEO, bm, rand(-0.34, 0.34), h - 0.02, rand(-0.05, 0.05));
      b.rotation.set(rand(-0.4, 0.4), rand(0, TAU), rand(-0.4, 0.4));
      top.add(b);
    }
    g.add(top);
    g.userData.top = top;
  } else {
    // 頂端熱封條
    g.add(mesh(new RoundedBoxGeometry(w * 1.008, seal, 0.034, 2, 0.012), mat(T.seal), 0, h - seal / 2, 0));
  }
  // 單向排氣閥：白色底座 + 中間的小孔
  const vy = h * 0.68;
  const vz = (d / 2) * lerp(1, squeeze, topK(vy)) + Math.sin(Math.PI * (vy / h)) ** 0.8 * 0.032 + 0.006;
  const valve = new THREE.Group();
  valve.position.set(0, vy, vz);
  valve.rotation.x = Math.PI / 2;
  valve.add(mesh(cyl(0.05, 0.056, 0.012, 32), std(0xf0ece4, 0.35)));
  valve.add(mesh(cyl(0.03, 0.03, 0.018, 24), std(0xdcd6ca, 0.3)));
  [0, 1, 2, 3].forEach((i) => {
    const a = (i / 4) * TAU;
    valve.add(mesh(cyl(0.005, 0.005, 0.022, 8), std(0x8a8478, 0.6), Math.cos(a) * 0.014, 0, Math.sin(a) * 0.014));
  });
  g.add(valve);
  shadows(g);
  return g;
}

/* ==========================================================
   場景零：展示架（選豆、選濾杯）
   ========================================================== */

const SH = { sets: {}, set: null, kind: 'bean', items: [], sel: -1, onPick: null, t: 0, hop: [] };
// 展示架的鏡頭：豆袋平視；濾杯從高一點往下看，才看得到杯裡的螺旋肋和出水孔
const SHELF_CAM = {
  bean: [0, 1.25, 4.75, 0, 0.6, 0],
  dripper: [0, 2.8, 4.3, 0, 0.58, 0],
};
const SHELF_X = [-1.22, 0, 1.22];
const SHELF_Z = -0.38;

// 牆面的灰泥紋理
const plasterTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#f3e8d6';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '150,120,90'},${rand(0.03, 0.08)})`;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, rand(0.5, 2.5), 0, TAU);
    x.fill();
  }
}, { repeat: [4, 3] });

// 層板前緣的小價卡
function shelfTag(title, sub) {
  const t = canvasTex(256, 96, (x, w, h) => {
    x.fillStyle = '#fffaf0';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#4a2f1d';
    x.lineWidth = 6;
    x.strokeRect(3, 3, w - 6, h - 6);
    x.fillStyle = '#4a2f1d';
    x.textAlign = 'center';
    x.font = 'bold 34px "Huninn", sans-serif';
    x.fillText(title, w / 2, 44);
    x.font = '24px "Huninn", sans-serif';
    x.fillText(sub, w / 2, 78);
  });
  return mesh(new THREE.PlaneGeometry(0.62, 0.23), std(0xffffff, 0.8, 0, { map: t }));
}

function buildShelf() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(16, 10), std(0xffffff, 0.95, 0, { map: plasterTex }), 0, 1.5, -1.0));
  // 木層板 + 黑鐵層架托
  g.add(mesh(new RoundedBoxGeometry(6.6, 0.16, 1.5, 3, 0.03), wood(0xe6cba8, 0.5), 0, -0.08, -0.25));
  const iron = std(0x2b2b2d, 0.45, 0.6);
  [-1.95, 1.95].forEach((x) => {
    g.add(mesh(new RoundedBoxGeometry(0.07, 0.9, 0.05, 2, 0.015), iron, x, -0.6, -0.97));
    g.add(mesh(new RoundedBoxGeometry(0.07, 0.05, 1.2, 2, 0.015), iron, x, -0.185, -0.4));
    const brace = mesh(new RoundedBoxGeometry(0.05, 0.05, 1.0, 2, 0.015), iron, x, -0.58, -0.6);
    brace.rotation.x = -0.72;
    g.add(brace);
    [-0.3, -0.9].forEach((y) => g.add(mesh(cyl(0.025, 0.025, 0.02, 12), steel(0.3), x, y, -0.96).rotateX(Math.PI / 2)));
  });
  // 架上撒了幾顆豆子
  const beanMat = phys({ color: 0x3a1d0b, roughness: 0.45, clearcoat: 0.25 });
  [[-0.61, 0.22], [-0.55, 0.3], [-0.68, 0.34], [0.6, 0.26], [0.66, 0.36], [0.56, 0.4], [0.62, 0.12]].forEach(([x, z]) => {
    const b = mesh(BEAN_GEO, beanMat, x, 0.025, z);
    b.rotation.set(rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2));
    g.add(b);
  });
  SH.itemsGroup = new THREE.Group();
  g.add(SH.itemsGroup);
  shadows(g);
  return g;
}

// 架上的東西：豆子是平底方袋；濾杯是濾杯組（縮到和豆袋差不多寬）
function shelfItem(kind, item) {
  if (kind === 'bean') return buildPouch(item);
  const set = buildDripperSet(item.id, item.color);
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(set.srv, set.top);
  inner.scale.setScalar(0.46);
  // 把手轉到後面，拉出來時才不會伸出畫面；Chemex 的木珠留在正面
  if (item.id !== 'chemex') inner.rotation.y = -0.85;
  g.add(inner);
  shadows(g);
  return g;
}

function resetShelf(data) {
  const kind = data.kind || 'bean';
  SH.kind = kind;
  // 每一種只做一次，之後切換顯示就好
  if (!SH.sets[kind] && data.items) {
    const group = new THREE.Group();
    const items = data.items.map((item, i) => {
      const obj = shelfItem(kind, item);
      obj.position.set(SHELF_X[i], 0, SHELF_Z);
      const tag = kind === 'bean'
        ? shelfTag(item.name.split(' ').pop(), `${item.roast}・${item.level}`)
        : shelfTag(item.name, `${item.desc.split(/[，、]/)[0]}・${item.level}`);
      tag.position.set(SHELF_X[i], -0.1, 0.505);
      tag.receiveShadow = true;
      group.add(obj, tag);
      obj.traverse((o) => { o.userData.itemIdx = i; });
      tag.userData.itemIdx = i;
      return obj;
    });
    SH.itemsGroup.add(group);
    SH.sets[kind] = { group, items };
  }
  Object.entries(SH.sets).forEach(([k, set]) => { set.group.visible = k === kind; });
  SH.set = SH.sets[kind] || null;
  SH.items = SH.set ? SH.set.items : [];
  SH.items.forEach((obj) => {
    obj.position.set(obj.position.x, 0, SHELF_Z);
    obj.rotation.set(0, 0, 0);
  });
  SH.hop = SH.items.map(() => 1);
  SH.sel = data.sel === undefined ? -1 : data.sel;
  SH.onPick = data.onPick || null;
}

function selectShelf(i) {
  if (i === SH.sel) return;
  SH.sel = i;
  if (SH.hop[i] !== undefined) SH.hop[i] = 0;
}

function updateShelf(dt) {
  SH.t += dt;
  const k = 1 - 0.003 ** dt;
  SH.items.forEach((obj, i) => {
    const on = i === SH.sel;
    // 選中的從架上往前拉出來、輕輕跳一下，再慢慢左右轉、展示正面
    SH.hop[i] = Math.min(1, SH.hop[i] + dt / 0.45);
    obj.position.z = lerp(obj.position.z, on ? SHELF_Z + 0.5 : SHELF_Z, k);
    obj.position.y = Math.sin(Math.PI * SH.hop[i]) * 0.16;
    obj.rotation.y = lerp(obj.rotation.y, on ? Math.sin(SH.t * 1.3) * 0.2 : 0, k);
    obj.rotation.z = on ? Math.sin(Math.PI * SH.hop[i]) * 0.06 : 0;
  });
}

// 點到架上的哪一個（或它的價卡）
function shelfHit(clientX, clientY) {
  if (!SH.set) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(SH.set.group, true)[0];
  return hit ? hit.object.userData.itemIdx : -1;
}

function onShelfClick(e) {
  const i = shelfHit(e.clientX, e.clientY);
  if (i < 0) return;
  selectShelf(i);
  if (SH.onPick) SH.onPick(i);
}

function onShelfMove(e) {
  if (host) host.style.cursor = shelfHit(e.clientX, e.clientY) >= 0 ? 'pointer' : '';
}

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

  // 剪開的平底方袋（換豆子時換袋子）
  W.bag = new THREE.Group();
  W.bag.position.set(1.8, 0, BOWL_Z);
  W.pouches = {};
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
    const id = game.bean.id;
    if (!W.pouches[id]) W.pouches[id] = buildPouch(game.bean, { open: true });
    W.bag.clear();
    W.bag.add(W.pouches[id]);
    W.pouch = W.pouches[id];
  }
}

function updateWeigh(dt) {
  const shown = Math.round(W.grams * 10);
  if (shown !== W.shown) { W.shown = shown; drawScale(W.grams); }
  if (W.grams < 0.05 && W.beans.length) resetWeigh({});

  // 按住時先把袋子從桌上拿起來，再傾斜倒豆；放開就放回桌上
  W.lift = lerp(W.lift, W.pouring ? 1 : 0, 1 - 0.0004 ** dt);
  const up = ease(clamp01(W.lift * 1.3));
  W.bag.position.set(lerp(1.8, 1.75, up), lerp(0, 1.95, up), BOWL_Z);
  W.tilt = 2.05 * ease(clamp01((W.lift - 0.3) / 0.7));
  W.bag.rotation.z = W.tilt;
  // 袋口的豆子：袋子一傾斜就是倒出去了
  if (W.pouch) W.pouch.userData.top.visible = W.tilt < 0.5;

  // 袋口在世界座標的位置
  const mouth = new THREE.Vector3(-0.3, POUCH.h, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), W.tilt).add(W.bag.position);

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

// 濾杯組的外觀：玻璃下壺 + 濾杯（Chemex 是一體的玻璃壺）。展示架和濕濾紙、注水共用。
// 原點在下壺底部中心。回傳 { srv: 下壺, top: 濾杯, coffeeR, coffeeMax: 壺裡咖啡的半徑和最高液面 }
function buildDripperSet(id, colorHex) {
  const srv = new THREE.Group();
  const top = new THREE.Group();
  const out = { srv, top };

  if (id === 'chemex') {
    // Chemex：沙漏形玻璃壺 + 木頸圈 + 皮繩 + 木珠
    srv.add(mesh(lathe([
      [0.001, 0], [0.86, 0], [0.93, 0.15], [0.86, 0.72], [0.37, 1.3], [0.37, 1.46], [1.0, 2.3], [1.02, 2.34],
      [0.98, 2.33], [0.34, 1.46], [0.34, 1.3], [0.82, 0.72], [0.89, 0.15], [0.82, 0.04], [0.001, 0.04],
    ], 96), glass(0.2)));
    srv.add(mesh(lathe([[0.53, 1.1], [0.4, 1.27], [0.4, 1.49], [0.53, 1.66]], 48), wood(0xd2a26a, 0.5)));
    const tie = mesh(new THREE.TorusGeometry(0.405, 0.02, 10, 64), std(0x6b4024, 0.7), 0, 1.38, 0);
    tie.rotation.x = Math.PI / 2;
    srv.add(tie);
    srv.add(mesh(new THREE.SphereGeometry(0.07, 20, 14), wood(0xe0b47a, 0.4), 0, 1.38, 0.47));
    // 壺身上的小圓點（半滿的刻度）
    srv.add(mesh(new THREE.SphereGeometry(0.045, 16, 12), glass(0.35), 0, 0.9, 0.735));
    out.coffeeR = 0.82;
    out.coffeeMax = 0.6;
    return out;
  }

  // 玻璃下壺：厚度、把手、刻度線
  srv.add(mesh(lathe([
    [0.001, 0], [0.76, 0], [0.8, 0.06], [0.8, 0.9], [0.56, 1.18], [0.56, 1.3], [0.53, 1.3], [0.53, 1.19],
    [0.77, 0.9], [0.77, 0.07], [0.73, 0.04], [0.001, 0.04],
  ], 96), glass(0.2)));
  const h = mesh(new THREE.TorusGeometry(0.28, 0.045, 12, 32, Math.PI), glass(0.3), 0.98, 0.55, 0);
  h.rotation.z = -Math.PI / 2;
  srv.add(h);
  [0.25, 0.45, 0.65].forEach((y) => srv.add(mesh(new THREE.BoxGeometry(0.16, 0.012, 0.01), std(0xffffff, 0.5), -0.15, y, 0.805)));
  out.coffeeR = 0.75;
  out.coffeeMax = 0.8;

  if (id === 'kalita') {
    // Kalita Wave：不鏽鋼、平底三孔、捲邊杯口、寬底座
    const st = steel(0.24, 0xe1e5e9);
    st.side = THREE.DoubleSide;
    top.add(mesh(lathe([[0.52, 1.36], [0.58, 1.36], [1.0, 2.12], [1.02, 2.16], [0.98, 2.17], [0.95, 2.13], [0.53, 1.41]], 120), st));
    const rim = mesh(new THREE.TorusGeometry(1.0, 0.022, 10, 120), st, 0, 2.165, 0);
    rim.rotation.x = Math.PI / 2;
    top.add(rim);
    const floor = mesh(new THREE.CircleGeometry(0.54, 72), st, 0, 1.405, 0);
    floor.rotation.x = -Math.PI / 2;
    top.add(floor);
    const holeMat = std(0x141414, 0.7);
    [0, 1, 2].forEach((i) => {
      const a = (i / 3) * TAU + Math.PI / 2;
      const hole = mesh(new THREE.CircleGeometry(0.035, 20), holeMat, Math.cos(a) * 0.13, 1.408, Math.sin(a) * 0.13);
      hole.rotation.x = -Math.PI / 2;
      top.add(hole);
    });
    top.add(mesh(lathe([[0.45, 1.3], [0.92, 1.3], [0.95, 1.33], [0.92, 1.36], [0.45, 1.36]], 120), st));
    top.add(mesh(cyl(0.5, 0.5, 0.1, 64), st, 0, 1.26, 0));
    return out;
  }

  // Hario V60：陶瓷錐形、內壁螺旋肋、底部一個大孔、側邊把手
  const mat = ceramic(new THREE.Color(colorHex));
  mat.side = THREE.DoubleSide;
  top.add(mesh(lathe([[0.18, 1.36], [0.24, 1.36], [1.08, 2.2], [1.1, 2.24], [1.06, 2.26], [1.02, 2.23], [0.17, 1.41]], 120), mat));
  const rIn = (y) => 0.17 + (y - 1.41) * (0.85 / 0.82); // 內壁半徑
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * TAU;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const y = lerp(1.5, 2.14, t);
      const a = a0 + t * 0.9;
      const r = rIn(y) - 0.012;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    top.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 8), mat));
  }
  top.add(mesh(lathe([[0.45, 1.3], [0.86, 1.3], [0.88, 1.33], [0.86, 1.36], [0.45, 1.36]], 96), mat));
  top.add(mesh(lathe([[0.17, 1.21], [0.5, 1.21], [0.5, 1.31], [0.17, 1.31], [0.17, 1.21]], 64), mat));
  const handle = mesh(new THREE.TorusGeometry(0.2, 0.055, 14, 24, Math.PI), mat, -0.9, 1.78, 0);
  handle.rotation.z = Math.PI / 2;
  top.add(handle);
  return out;
}

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
  const s = { d, id };
  const set = buildDripperSet(id, game.dripper ? game.dripper.color : '#e2725b');
  s.srv = set.srv;
  s.top = set.top;
  s.coffeeR = set.coffeeR;
  s.coffeeMax = set.coffeeMax;
  g.add(s.srv, s.top);
  const sv = s.srv;
  const tp = s.top;

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
  // 手機上把重的計算拆兩半輪流做：這一幀算液面，下一幀算粉床和濾紙（時間有累積，看起來一樣）
  B.acc = (B.acc || 0) + dt;
  const heavy = !LITE || (Q.frame & 1) === 0;
  const light = !LITE || !heavy;
  if (heavy) {
    stepField(B.fresh, B.omega, 0, 0.05, 0.6, B.acc);
    stepField(B.foam, B.omega, 0.12, 0.015, drained ? 0.9 : 0.2, B.acc);
    B.acc = 0;
    paintMix();
  }

  // 粉床：悶蒸時吸到水的地方鼓起，後段下凹；剛滴完時表面濕亮
  const target = clamp01(st.water / 30) * (1 - clamp01((st.water - 30) / 70));
  B.bloom = lerp(B.bloom, target, 1 - 0.2 ** dt);
  if (light) shapeBed(B.bloom, wet);
  B.bedMat.roughness = st.water > 0 ? lerp(0.95, 0.55, clamp01(st.water / 60)) : 0.95;

  B.guide.visible = st.phase === 'pour';
  B.guide.position.y = wy + 0.02;
  B.edge.visible = st.onEdge;
  B.edge.position.y = wy + 0.03;

  // 濾紙：泡過咖啡的高度留下咖啡漬，最高水位有一圈較深的水痕
  if (st.water > 0 && light) {
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

/* ---------- 鏡頭、迴圈 ---------- */

function setView(v, snap = false) {
  view = v;
  const cfg = mode === 'shelf' ? SHELF_CAM[SH.kind] : VIEWS[mode][v];
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

// 平均每幀超過 26 毫秒（約低於 38 fps）就把解析度降一階；剛掛載的前幾十幀在編譯著色器，不算
function adaptQuality(raw) {
  Q.frame++;
  if (Q.warm > 0) { Q.warm--; return; }
  if (!(raw > 0 && raw < 250)) return; // 切到背景之類的長停頓不算
  Q.sum += raw;
  if (++Q.n < 45) return;
  const avg = Q.sum / Q.n;
  Q.n = 0;
  Q.sum = 0;
  if (avg > 26 && Q.ratio > 1) {
    Q.ratio = Math.max(1, Q.ratio - 0.25);
    renderer.setPixelRatio(Q.ratio);
    resize();
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const raw = now - last;
  const dt = Math.min(0.05, raw / 1000 || 0.016);
  last = now;
  adaptQuality(raw);
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
  if (mode === 'shelf') updateShelf(dt);
  else if (mode === 'weigh') updateWeigh(dt);
  else if (mode === 'grind') updateGrind(dt);
  else if (mode === 'rinse') updateRinse(dt, now);
  else if (mode === 'brew') updateBrew(dt, now);
  if (LITE && (Q.frame & 1) === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.ratio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = !LITE;
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
  sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
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
  table = mesh(cyl(4.4, 4.4, 0.3, 96), [side, top, side], 0, -0.15, 0);
  table.receiveShadow = true;
  scene.add(table);

  groups.shelf = buildShelf();
  groups.weigh = buildWeigh();
  groups.grind = buildGrind();
  groups.rinse = new THREE.Group();
  groups.brew = new THREE.Group();
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
}

/* ---------- 給 game.js 用的介面 ---------- */

const api = {
  get active() { return !!host; },

  mount(hostEl, m, game) {
    if (host) {
      host.removeEventListener('click', onShelfClick);
      host.removeEventListener('pointermove', onShelfMove);
    }
    host = hostEl;
    mode = m;
    Object.entries(groups).forEach(([name, g]) => { g.visible = name === m; });
    table.visible = m !== 'shelf'; // 豆子架是靠牆的層板，不放在圓桌上
    if (m === 'shelf') {
      resetShelf(game);
      host.addEventListener('click', onShelfClick);
      host.addEventListener('pointermove', onShelfMove);
    }
    if (m === 'weigh') resetWeigh(game);
    if (m === 'grind') resetGrind(game);
    if (m === 'rinse') buildRinse(game);
    if (m === 'brew') buildBrew(game);
    host.appendChild(renderer.domElement);
    Q.warm = 30;
    Q.n = 0;
    Q.sum = 0;
    rectCache.r = null;
    renderer.shadowMap.needsUpdate = true;
    if (m === 'shelf') viewsEl.remove();
    else host.appendChild(viewsEl);
    resize();
    setView('angle', true);
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  },

  unmount() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (host) {
      host.removeEventListener('click', onShelfClick);
      host.removeEventListener('pointermove', onShelfMove);
      host.style.cursor = '';
    }
    host = null;
    mode = null;
  },

  setShelf(i) { selectShelf(i); },

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

  // 把手指在螢幕上的位置投影到粉床平面，換算成遊戲邏輯座標
  brewPoint(clientX, clientY) {
    const t = performance.now();
    if (!rectCache.r || t - rectCache.t > 300) rectCache = { r: renderer.domElement.getBoundingClientRect(), t };
    const r = rectCache.r;
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
