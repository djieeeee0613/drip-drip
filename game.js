'use strict';

/* ---------- 資料 ---------- */

const BEANS = [
  { id: 'yirga', name: '衣索比亞 耶加雪菲', flag: '🇪🇹', roast: '淺焙', color: '#b9824f',
    desc: '花香、柑橘、茶感', level: '標準', tag: 'mid', diff: 1.0, grind: 5,
    profile: { 酸: 8, 甜: 7, 苦: 2, 醇厚: 4, 香氣: 9 } },
  { id: 'geisha', name: '巴拿馬 藝伎', flag: '🇵🇦', roast: '淺焙', color: '#c99a63',
    desc: '茉莉、佛手柑、蜜桃', level: '困難', tag: 'hard', diff: 1.3, grind: 5,
    profile: { 酸: 7, 甜: 9, 苦: 1, 醇厚: 4, 香氣: 10 } },
  { id: 'huila', name: '哥倫比亞 薇拉', flag: '🇨🇴', roast: '中焙', color: '#7a4a2b',
    desc: '焦糖、堅果、紅蘋果', level: '新手', tag: '', diff: 0.8, grind: 4,
    profile: { 酸: 5, 甜: 8, 苦: 4, 醇厚: 7, 香氣: 6 } },
];

const DRIPPERS = [
  { id: 'v60', name: 'Hario V60', color: '#e2725b',
    desc: '錐形單孔，流速快，最吃技術', level: '困難', tag: 'hard', diff: 1.2, grindAdj: 0 },
  { id: 'kalita', name: 'Kalita Wave', color: '#c9d3d6',
    desc: '平底三孔，萃取均勻又穩定', level: '新手', tag: '', diff: 0.8, grindAdj: 0 },
  { id: 'chemex', name: 'Chemex', color: '#cfe6ea',
    desc: '厚濾紙、口感乾淨，要磨粗一點', level: '標準', tag: 'mid', diff: 1.0, grindAdj: 2 },
];

// at = 該段建議開始注水的時間（秒），cum = 該段結束時的累計水量（g）
const METHODS = [
  { id: 'classic', name: '經典三段式', icon: '🌱', dose: 15, grindAdj: 1,
    desc: '悶蒸後分兩段注水，最好上手', level: '新手', tag: '',
    stages: [
      { label: '悶蒸', cum: 30, at: 0 },
      { label: '第二段', cum: 130, at: 30 },
      { label: '第三段', cum: 240, at: 75 },
    ] },
  { id: 'hoffmann', name: 'Hoffmann 一刀流', icon: '🌀', dose: 15, grindAdj: 0,
    desc: '悶蒸 45 秒後幾乎一口氣注完', level: '標準', tag: 'mid',
    stages: [
      { label: '悶蒸', cum: 45, at: 0 },
      { label: '主注水（前半）', cum: 150, at: 45 },
      { label: '主注水（後半）', cum: 250, at: 75 },
    ] },
  { id: 'four6', name: '粕谷哲 4:6 法', icon: '🏆', dose: 20, grindAdj: 2,
    desc: '300 g 水分五次，每 45 秒一段', level: '困難', tag: 'hard',
    stages: [
      { label: '第一段（酸甜）', cum: 60, at: 0 },
      { label: '第二段（酸甜）', cum: 120, at: 45 },
      { label: '第三段（濃度）', cum: 180, at: 90 },
      { label: '第四段（濃度）', cum: 240, at: 135 },
      { label: '第五段（濃度）', cum: 300, at: 180 },
    ] },
];

const TIME_SCALE = 4;   // 遊戲時間是現實的 4 倍
const FLOW = 14;        // 每秒（現實）注水克數
const GRIND_TURNS = 10; // 磨完要轉幾圈

/* ---------- 小工具 ---------- */

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  // 店長只在動手的步驟出來監督
  const watching = ['s-weigh', 's-grind', 's-rinse', 's-brew'].includes(id);
  $('boss').hidden = !watching;
  if (watching && !$('boss').classList.contains('rage')) $('boss-cat').innerHTML = catSvg('watch');
}

/* ---------- 監督店長：犯錯就生氣來干擾 ---------- */

const boss = { until: 0, count: 0, timer: null };

// 回傳 true 代表這次真的發飆了（有冷卻時間，不會連續發飆）
function bossRage(msg) {
  const now = performance.now();
  if (now < boss.until) return false;
  boss.until = now + 3500;
  boss.count++;
  $('boss-cat').innerHTML = catSvg('angry');
  $('boss-say').textContent = msg;
  // 重新觸發動畫：拍桌震動 + 貓掌橫掃
  ['boss', 'app', 'paw'].forEach((id) => {
    const el = $(id);
    el.classList.remove('rage');
    void el.offsetWidth;
    el.classList.add('rage');
  });
  beep(110, 0.35);
  setTimeout(() => beep(85, 0.3), 120);
  clearTimeout(boss.timer);
  boss.timer = setTimeout(() => {
    ['boss', 'app', 'paw'].forEach((id) => $(id).classList.remove('rage'));
    $('boss-cat').innerHTML = catSvg('watch');
  }, 1500);
  return true;
}

let audioCtx = null;
function beep(freq = 660, dur = 0.08) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'triangle';
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* 沒有音效也能玩 */ }
}

// 追蹤手指繞著元素中心轉了多少角度
function trackSpin(el, onDelta, onEnd) {
  let last = null;
  const angle = (e) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    last = angle(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (last === null) return;
    const a = angle(e);
    let d = a - last;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    last = a;
    onDelta(d, a);
  });
  const end = () => { if (last !== null) { last = null; if (onEnd) onEnd(); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------- 圖 ---------- */

function catSvg(mood) {
  // 店長拿鐵：圓滾滾的灰藍色臭臉貓，紅色貝雷帽、紅領結、雙手抱胸
  const INK = '#4a2f1d';
  const FUR = '#9aa6b8';
  const FUR_DARK = '#76839a';
  const WHITE = '#fffaf0';
  const RED = '#e2725b';
  const line = `fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"`;

  // 琥珀色貓眼；slit 越小瞳孔越細
  const eye = (x, slit) => `<ellipse cx="${x}" cy="100" rx="15" ry="14" fill="#f2c94c" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="${x}" cy="100" rx="${slit}" ry="11" fill="${INK}"/>
    <circle cx="${x + 6}" cy="94" r="3.5" fill="#fff"/>`;
  // 半垂的眼皮：drop 越大越兇
  const lids = (drop) => `<path d="M50 78 H90 V${90 + drop} L50 ${90 - drop * 0.2} Z M150 78 H110 V${90 + drop} L150 ${90 - drop * 0.2} Z" fill="${FUR}"/>
    <path d="M51 ${90 - drop * 0.2} L89 ${90 + drop} M149 ${90 - drop * 0.2} L111 ${90 + drop}" ${line} stroke-width="6"/>`;

  let eyes;
  let mouth;
  let back = '';
  let front = '';
  let tint = '';
  if (mood === 'happy') {
    eyes = `<path d="M55 102 q15 -18 30 0 M115 102 q15 -18 30 0" ${line} stroke-width="6"/>`;
    mouth = `<path d="M100 120 v5 M86 125 q7 10 14 0 q7 10 14 0" ${line} stroke-width="4"/>`;
    back = `<path d="M18 56 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z M182 40 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#ffd95a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  } else if (mood === 'sad') {
    eyes = `${eye(70, 7)}${eye(130, 7)}
      <path d="M52 86 l26 -9 M148 86 l-26 -9" ${line} stroke-width="5"/>
      <path d="M152 114 q-7 12 0 16 q7 -4 0 -16 z" fill="#8fc4e0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    mouth = `<path d="M100 120 v4 M88 132 q6 -8 12 0 q6 -8 12 0" ${line} stroke-width="4"/>`;
  } else if (mood === 'watch') {
    eyes = `${eye(70, 5)}${eye(130, 5)}${lids(7)}`;
    mouth = `<path d="M100 120 v5 M87 131 q13 -8 26 0" ${line} stroke-width="4"/>`;
  } else if (mood === 'angry') {
    eyes = `${eye(70, 2.5)}${eye(130, 2.5)}${lids(13)}`;
    mouth = `<path d="M82 124 q18 -12 36 0 q-2 22 -18 22 q-16 0 -18 -22 z" fill="#7a2e22" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M89 122 l4 9 l4 -10 z M111 122 l-4 9 l-4 -10 z" fill="#fff"/>`;
    tint = `<ellipse cx="100" cy="86" rx="74" ry="36" fill="#e2463a" opacity=".3"/>`;
    front = `<g transform="translate(-38 26) scale(1.25)" fill="none" stroke="#e2463a" stroke-linecap="round" stroke-width="7"><path d="M160 14 q8 6 2 14 M178 18 q-8 6 -2 14 M156 36 q8 -6 14 2 M174 42 q-6 -8 4 -12"/></g>`;
  } else {
    eyes = `${eye(70, 6)}${eye(130, 6)}`;
    mouth = `<path d="M100 120 v5 M88 127 q12 5 24 0" ${line} stroke-width="4"/>`;
  }

  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
    ${back}
    <!-- 蓬尾巴 -->
    <path d="M146 222 q46 0 40 -44 q-4 -18 -18 -10" ${line} stroke-width="26"/>
    <path d="M146 222 q46 0 40 -44 q-4 -18 -18 -10" fill="none" stroke="${FUR}" stroke-width="17" stroke-linecap="round"/>
    <path d="M170 170 q-4 -4 -3 -3" fill="none" stroke="${WHITE}" stroke-width="15" stroke-linecap="round"/>
    <!-- 身體 -->
    <path d="M42 236 q-10 -74 58 -76 q68 2 58 76 z" fill="${FUR}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="100" cy="204" rx="28" ry="30" fill="${WHITE}"/>
    <!-- 耳朵 -->
    <path d="M30 70 Q16 20 32 18 Q54 22 78 46 Z" fill="${FUR}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M170 70 Q184 20 168 18 Q146 22 122 46 Z" fill="${FUR}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M38 58 Q30 32 38 30 Q50 34 62 46 Z" fill="#f6a6a0"/>
    <path d="M162 58 Q170 32 162 30 Q150 34 138 46 Z" fill="#f6a6a0"/>
    <!-- 臉頰的毛 -->
    <path d="M22 96 l-14 4 l12 8 l-10 8 l16 2 Z M178 96 l14 4 l-12 8 l10 8 l-16 2 Z" fill="${FUR}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <!-- 頭 -->
    <ellipse cx="100" cy="102" rx="82" ry="64" fill="${FUR}" stroke="${INK}" stroke-width="5"/>
    <path d="M34 64 q10 4 14 12 M166 64 q-10 4 -14 12" fill="none" stroke="${FUR_DARK}" stroke-width="7" stroke-linecap="round"/>
    <!-- 白色口鼻 -->
    <path d="M100 84 Q128 104 140 132 Q124 158 100 160 Q76 158 60 132 Q72 104 100 84 Z" fill="${WHITE}"/>
    ${tint}
    <ellipse cx="42" cy="126" rx="12" ry="7" fill="#f6a6a0" opacity=".7"/>
    <ellipse cx="158" cy="126" rx="12" ry="7" fill="#f6a6a0" opacity=".7"/>
    ${eyes}
    <path d="M93 112 h14 q2 0 0 3 l-5 6 q-2 2 -4 0 l-5 -6 q-2 -3 0 -3 z" fill="#f29c8a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${mouth}
    <path d="M56 134 l-22 -3 M56 142 l-22 5 M144 134 l22 -3 M144 142 l22 5" ${line} stroke-width="3"/>
    <!-- 貝雷帽 -->
    <g transform="rotate(-8 100 36)">
      <ellipse cx="102" cy="38" rx="46" ry="17" fill="${RED}" stroke="${INK}" stroke-width="5"/>
      <path d="M102 21 q2 -10 8 -10" ${line} stroke-width="5"/>
      <path d="M72 34 q26 -10 54 -2" fill="none" stroke="#f29c8a" stroke-width="5" stroke-linecap="round"/>
    </g>
    <!-- 領結 -->
    <path d="M100 170 l-22 -12 v24 z M100 170 l22 -12 v24 z" fill="${RED}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="100" cy="170" r="7" fill="${RED}" stroke="${INK}" stroke-width="4"/>
    <!-- 抱胸的手 -->
    <g fill="${FUR}" stroke="${INK}" stroke-width="5">
      <ellipse cx="82" cy="206" rx="34" ry="12" transform="rotate(-14 82 206)"/>
      <ellipse cx="118" cy="206" rx="34" ry="12" transform="rotate(14 118 206)"/>
    </g>
    <ellipse cx="110" cy="200" rx="10" ry="9" fill="${WHITE}" stroke="${INK}" stroke-width="4" transform="rotate(-14 110 200)"/>
    <ellipse cx="146" cy="213" rx="10" ry="9" fill="${WHITE}" stroke="${INK}" stroke-width="4" transform="rotate(14 146 213)"/>
    ${front}
  </svg>`;
}

function beanArt(b) {
  return `<svg viewBox="0 0 80 80"><ellipse cx="40" cy="42" rx="24" ry="32" fill="${b.color}" stroke="#4a2f1d" stroke-width="4" transform="rotate(20 40 42)"/>
    <path d="M46 14 q-18 26 -8 56" fill="none" stroke="#4a2f1d" stroke-width="4" stroke-linecap="round"/>
    <circle cx="30" cy="36" r="3" fill="#4a2f1d"/><circle cx="50" cy="40" r="3" fill="#4a2f1d"/>
    <path d="M34 50 q6 6 12 1" fill="none" stroke="#4a2f1d" stroke-width="3" stroke-linecap="round"/>
    <text x="58" y="76" font-size="22">${b.flag}</text></svg>`;
}

function dripperArt(d) {
  const shape = {
    v60: '<path d="M10 18 H70 L46 58 H34 Z"/><rect x="24" y="58" width="32" height="8" rx="3"/>',
    kalita: '<path d="M10 18 H70 L58 54 H22 Z"/><rect x="16" y="54" width="48" height="10" rx="3"/>',
    chemex: '<path d="M16 8 H64 L46 36 L66 70 H14 L34 36 Z"/><rect x="30" y="30" width="20" height="12" rx="3" fill="#b56a22"/>',
  }[d.id];
  return `<svg viewBox="0 0 80 80"><g fill="${d.color}" stroke="#4a2f1d" stroke-width="4" stroke-linejoin="round">${shape}</g></svg>`;
}

function methodArt(m) {
  return `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="#ffe9b8" stroke="#4a2f1d" stroke-width="4"/>
    <text x="40" y="52" font-size="34" text-anchor="middle">${m.icon}</text></svg>`;
}

/* ---------- 狀態 ---------- */

const game = { bean: null, dripper: null, method: null };
const result = {};

/* ---------- 標題 / 圖鑑 ---------- */

function loadDex() {
  try { return JSON.parse(localStorage.getItem('dripdrip.dex')) || {}; } catch (e) { return {}; }
}
function saveDex(key, stars) {
  const dex = loadDex();
  if ((dex[key] || 0) < stars) {
    dex[key] = stars;
    try { localStorage.setItem('dripdrip.dex', JSON.stringify(dex)); } catch (e) { /* 忽略 */ }
  }
}
function showTitle() {
  const dex = loadDex();
  const keys = Object.keys(dex);
  const three = keys.filter((k) => dex[k] >= 3).length;
  $('dex').textContent = `圖鑑 ${keys.length} / 27　⭐⭐⭐ ${three} 杯`;
  $('title-cat').innerHTML = catSvg('watch');
  show('s-title');
}
$('btn-start').addEventListener('click', () => { beep(); playBgm(); boss.count = 0; startPick(0); });

/* ---------- 背景音樂（資料夾裡有 bgm.mp3 才會出現開關） ---------- */

const bgm = new Audio('bgm.mp3');
bgm.loop = true;
bgm.volume = 0.35;
let bgmOn = true;
try { bgmOn = localStorage.getItem('dripdrip.bgm') !== 'off'; } catch (e) { /* 忽略 */ }
bgm.addEventListener('loadedmetadata', () => {
  $('btn-music').hidden = false;
  $('btn-music').classList.toggle('off', !bgmOn);
});
function playBgm() {
  if (bgmOn && bgm.paused) bgm.play().catch(() => {});
}
$('btn-music').addEventListener('click', () => {
  bgmOn = !bgmOn;
  try { localStorage.setItem('dripdrip.bgm', bgmOn ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
  $('btn-music').classList.toggle('off', !bgmOn);
  if (bgmOn) playBgm(); else bgm.pause();
});

/* ---------- 選擇 ---------- */

const PICKS = [
  { key: 'bean', title: '選一支豆子', list: BEANS, art: beanArt, sub: (b) => `${b.roast}・${b.desc}` },
  { key: 'dripper', title: '選一個濾杯', list: DRIPPERS, art: dripperArt, sub: (d) => d.desc },
  { key: 'method', title: '選一種沖法', list: METHODS, art: methodArt, sub: (m) => `${m.desc}（${m.dose} g 豆）` },
];
let pickIdx = 0;

function startPick(i) {
  pickIdx = i;
  const p = PICKS[i];
  game[p.key] = null;
  $('pick-step').textContent = `${i + 1} / 7`;
  $('pick-title').textContent = p.title;
  $('btn-pick-next').disabled = true;
  const box = $('pick-cards');
  box.innerHTML = '';
  p.list.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="art">${p.art(item)}</div><div><h3>${item.name}</h3><p>${p.sub(item)}</p><span class="tag ${item.tag}">${item.level}</span></div>`;
    el.addEventListener('click', () => {
      box.querySelectorAll('.card').forEach((c) => c.classList.remove('sel'));
      el.classList.add('sel');
      game[p.key] = item;
      $('btn-pick-next').disabled = false;
      beep(520);
    });
    box.appendChild(el);
  });
  show('s-pick');
}
$('btn-pick-next').addEventListener('click', () => {
  beep();
  if (pickIdx < PICKS.length - 1) startPick(pickIdx + 1);
  else startWeigh();
});

/* ---------- 秤豆 ---------- */

const weigh = { g: 0, pouring: false, last: 0, beans: 0 };

function startWeigh() {
  weigh.g = 0;
  weigh.beans = 0;
  weigh.pouring = false;
  weigh.warned = false;
  $('bowl').innerHTML = '';
  $('weigh-val').textContent = '0.0';
  $('weigh-hint').innerHTML = `這個沖法需要 <b>${game.method.dose} g</b> 豆子，越準越好`;
  show('s-weigh');
}
function weighLoop(t) {
  if (!weigh.pouring) return;
  const dt = Math.min(0.05, (t - weigh.last) / 1000);
  weigh.last = t;
  weigh.g += dt * (4 + Math.random() * 3);
  $('weigh-val').textContent = weigh.g.toFixed(1);
  if (!weigh.warned && weigh.g > game.method.dose + 1) {
    weigh.warned = true;
    bossRage('倒太多了喵！');
  }
  while (weigh.beans < weigh.g / 0.5 && weigh.beans < 60) {
    const b = document.createElement('i');
    b.style.left = `${10 + Math.random() * 165}px`;
    b.style.bottom = `${Math.random() * (10 + weigh.beans * 1.2)}px`;
    b.style.rotate = `${Math.random() * 180}deg`;
    $('bowl').appendChild(b);
    weigh.beans++;
  }
  requestAnimationFrame(weighLoop);
}
(function bindWeigh() {
  const btn = $('btn-pour-beans');
  btn.addEventListener('pointerdown', (e) => {
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    weigh.pouring = true;
    weigh.last = performance.now();
    requestAnimationFrame(weighLoop);
  });
  const stop = () => { weigh.pouring = false; btn.classList.remove('down'); };
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  $('btn-weigh-reset').addEventListener('click', startWeigh);
  $('btn-weigh-done').addEventListener('click', () => {
    if (weigh.g < 1) return;
    if (weigh.g < game.method.dose - 1.5) bossRage('這麼少怎麼沖！');
    result.dose = weigh.g;
    beep();
    startGrind();
  });
})();

/* ---------- 研磨 ---------- */

const grind = { total: 0, angle: 0, speeds: [], winAngle: 0, winStart: 0, done: false };
const grindName = (v) => (v <= 3 ? '細' : v <= 5 ? '中細' : v <= 7 ? '中' : '粗');
const idealGrind = () => clamp(game.bean.grind + game.dripper.grindAdj + game.method.grindAdj, 1, 10);

function startGrind() {
  Object.assign(grind, { total: 0, angle: 0, speeds: [], winAngle: 0, winStart: 0, done: false, jamUntil: 0 });
  $('grind-size').value = 5;
  $('grind-size').disabled = false;
  updateGrindLabel();
  $('grinder-fill').style.height = '0';
  $('crank').style.transform = 'rotate(0rad)';
  $('btn-grind-done').disabled = true;
  $('grind-status').textContent = '用手指繞著磨豆機畫圈，速度越穩越均勻';
  $('grind-hint').innerHTML = `店長提示：這個組合適合<b>「${grindName(idealGrind())}」</b>研磨。先調刻度再開始磨`;
  show('s-grind');
}
function updateGrindLabel() {
  const v = +$('grind-size').value;
  $('grind-size-val').textContent = v;
  $('grind-size-name').textContent = grindName(v);
}
$('grind-size').addEventListener('input', updateGrindLabel);

trackSpin($('grinder'), (d, a) => {
  if (grind.done) return;
  const now = performance.now();
  if (now < grind.jamUntil) return; // 店長拍桌，磨豆機卡住
  $('grind-size').disabled = true; // 開磨後不能再改刻度
  grind.total += Math.abs(d);
  grind.winAngle += Math.abs(d);
  if (!grind.winStart) grind.winStart = now;
  if (now - grind.winStart >= 200) {
    const v = grind.winAngle / ((now - grind.winStart) / 1000);
    const s = grind.speeds;
    if (s.length >= 4) {
      const mean = s.reduce((x, y) => x + y, 0) / s.length;
      // 忽快忽慢 → 店長生氣，磨豆機卡住一下
      if ((v < mean * 0.45 || v > mean * 2.2) && bossRage('轉穩一點！')) {
        grind.jamUntil = now + 900;
        $('grind-status').textContent = '店長拍桌，磨豆機卡住了！';
      }
    }
    s.push(v);
    grind.winAngle = 0;
    grind.winStart = now;
  }
  const p = clamp(grind.total / (GRIND_TURNS * 2 * Math.PI));
  $('crank').style.transform = `rotate(${a}rad)`;
  $('grinder-fill').style.height = `${p * 100}%`;
  if (Math.floor(grind.total / 1.2) !== Math.floor((grind.total - Math.abs(d)) / 1.2)) beep(180 + Math.random() * 60, 0.03);
  if (p >= 1) {
    grind.done = true;
    $('btn-grind-done').disabled = false;
    $('grind-status').textContent = '磨好了！聞起來好香～';
    beep(880, 0.15);
  } else {
    $('grind-status').textContent = `研磨中… ${Math.round(p * 100)}%`;
  }
}, () => { grind.winStart = 0; grind.winAngle = 0; });

$('btn-grind-done').addEventListener('click', () => {
  const s = grind.speeds;
  let cv = 1;
  if (s.length > 2) {
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
    cv = sd / mean;
  }
  result.uniform = clamp(1 - (cv - 0.2) / 0.6);
  result.grind = +$('grind-size').value;
  beep();
  startRinse();
});

/* ---------- 濕濾紙 ---------- */

const rinse = { total: 0 };
function startRinse() {
  rinse.total = 0;
  $('rinse-wet').style.strokeDashoffset = 440;
  $('btn-rinse-done').disabled = true;
  show('s-rinse');
}
trackSpin($('rinse'), (d) => {
  rinse.total += Math.abs(d);
  const p = clamp(rinse.total / (2 * Math.PI));
  $('rinse-wet').style.strokeDashoffset = 440 * (1 - p);
  if (p >= 1 && $('btn-rinse-done').disabled) {
    $('btn-rinse-done').disabled = false;
    beep(880, 0.15);
  }
});
$('btn-rinse-skip').addEventListener('click', () => { result.rinsed = false; startBrew(); bossRage('竟敢跳過？！'); });
$('btn-rinse-done').addEventListener('click', () => { result.rinsed = true; beep(); startBrew(); });

/* ---------- 沖煮 ---------- */

const cv = $('brew-canvas');
const ctx = cv.getContext('2d');
const C = 300;      // 畫布中心
const BED_R = 215;  // 粉床半徑
const brew = {};

function startBrew() {
  Object.assign(brew, {
    running: true, phase: 'pour', stage: 0, water: 0, clock: 0, started: false,
    down: false, x: 0, y: 0, lastX: 0, lastY: 0, pouring: false, onEdge: false,
    pourTime: 0, edgeTime: 0, stillTime: 0, moveAcc: 0, moveT: 0, pool: 0, drain: 0,
    px: 0, py: 0, joltUntil: 0, edgeRun: 0, stillRun: 0, overWarned: false, lateWarned: false,
    waterErr: [], timeErr: [], stageStarted: false, bubbles: [], last: performance.now(),
  });
  $('brew-title').textContent = game.method.name;
  show('s-brew');
  requestAnimationFrame(brewLoop);
}

function brewPos(e) {
  const r = cv.getBoundingClientRect();
  brew.x = (e.clientX - r.left) * (cv.width / r.width);
  brew.y = (e.clientY - r.top) * (cv.height / r.height);
}
cv.addEventListener('pointerdown', (e) => {
  if (!brew.running || brew.phase !== 'pour') return;
  cv.setPointerCapture(e.pointerId);
  brewPos(e);
  brew.lastX = brew.x;
  brew.lastY = brew.y;
  brew.down = true;
});
cv.addEventListener('pointermove', (e) => { if (brew.down) brewPos(e); });
function brewRelease() {
  if (!brew.down) return;
  brew.down = false;
  brew.pouring = false;
  if (brew.phase !== 'pour') return;
  const stages = game.method.stages;
  // 水量達到這一段目標附近就算完成這一段
  while (brew.stage < stages.length && brew.water >= stages[brew.stage].cum - 6) {
    if (!brew.stageStarted) brew.timeErr.push(0); // 上一段沖過頭，直接吃掉這一段
    brew.waterErr.push(brew.water - stages[brew.stage].cum);
    brew.stage++;
    brew.stageStarted = false;
    brew.overWarned = false;
    brew.lateWarned = false;
    beep(700, 0.1);
  }
  if (brew.stage >= stages.length) {
    brew.phase = 'drain';
    brew.drain = 0;
  }
}
cv.addEventListener('pointerup', brewRelease);
cv.addEventListener('pointercancel', brewRelease);

function brewLoop(t) {
  if (!brew.running) return;
  const dt = Math.min(0.05, (t - brew.last) / 1000);
  brew.last = t;
  const stages = game.method.stages;
  const st = stages[Math.min(brew.stage, stages.length - 1)];

  // 店長發飆時會撞你的手：水柱亂晃 1.2 秒
  brew.px = brew.x;
  brew.py = brew.y;
  if (t < brew.joltUntil) {
    brew.px += Math.sin(t / 40) * 80;
    brew.py += Math.cos(t / 55) * 80;
  }
  const rage = (msg) => { if (bossRage(msg)) brew.joltUntil = t + 1200; };
  const dx = brew.px - C;
  const dy = brew.py - C;
  const r = Math.hypot(dx, dy) / BED_R;
  brew.pouring = brew.down && brew.phase === 'pour' && r <= 1.08;
  brew.onEdge = brew.pouring && r > 0.8;

  if (brew.started) brew.clock += dt * TIME_SCALE;

  if (brew.pouring) {
    if (!brew.started) brew.started = true;
    if (!brew.stageStarted) {
      brew.stageStarted = true;
      brew.timeErr.push(brew.stage === 0 ? 0 : brew.clock - st.at);
      if (brew.stage > 0 && brew.clock < st.at - 8) rage('還沒到時間！');
    }
    // 沖到濾紙邊緣（被店長撞到的那段不算）
    brew.edgeRun = brew.onEdge && t >= brew.joltUntil ? brew.edgeRun + dt : 0;
    if (brew.edgeRun > 0.4) { brew.edgeRun = 0; rage('不要沖到濾紙！'); }
    if (!brew.overWarned && brew.water > st.cum + 10) { brew.overWarned = true; rage('太多了，快放手！'); }
    brew.water += FLOW * dt;
    brew.pool = clamp(brew.pool + dt * 0.8);
    brew.pourTime += dt;
    if (brew.onEdge) brew.edgeTime += dt;
    // 每 0.25 秒看一次手指有沒有在移動（逐幀判斷會誤判）
    brew.moveAcc += Math.hypot(brew.x - brew.lastX, brew.y - brew.lastY);
    brew.moveT += dt;
    if (brew.moveT >= 0.25) {
      if (brew.moveAcc / brew.moveT < 60) {
        brew.stillTime += brew.moveT;
        if (++brew.stillRun >= 3) { brew.stillRun = 0; rage('手要繞圈啦！'); }
      } else {
        brew.stillRun = 0;
      }
      brew.moveAcc = 0;
      brew.moveT = 0;
    }
    if (Math.random() < 0.5) {
      brew.bubbles.push({ x: brew.px + (Math.random() - 0.5) * 40, y: brew.py + (Math.random() - 0.5) * 40, r: 6 + Math.random() * 16, life: 1 });
    }
  } else {
    brew.pool = clamp(brew.pool - dt * 0.25);
  }
  brew.lastX = brew.x;
  brew.lastY = brew.y;
  brew.bubbles.forEach((b) => { b.life -= dt * 0.7; });
  brew.bubbles = brew.bubbles.filter((b) => b.life > 0);

  // 介面
  $('brew-time').textContent = fmtTime(brew.clock);
  $('brew-water').textContent = Math.round(brew.water);
  const when = $('brew-when');
  when.className = 'when';
  if (brew.phase === 'pour') {
    const prev = brew.stage === 0 ? 0 : stages[brew.stage - 1].cum;
    const frac = (brew.water - prev) / (st.cum - prev);
    $('brew-stage').textContent = `${st.label}：注水到 ${st.cum} g`;
    $('brew-bar').style.width = `${clamp(frac * 80, 0, 100)}%`;
    $('brew-bar').classList.toggle('over', brew.water > st.cum + 6);
    if (brew.pouring || brew.stageStarted) {
      when.textContent = brew.water >= st.cum - 6 ? '夠了，放開手指！' : `注水中…到 ${st.cum} g 放開`;
      if (brew.water >= st.cum - 6) when.classList.add('go');
    } else if (brew.stage === 0) {
      when.textContent = '按住粉床開始注水';
    } else if (brew.clock < st.at - 5) {
      when.textContent = `⏳ 等到 ${fmtTime(st.at)} 再注水`;
    } else if (brew.clock <= st.at + 6) {
      when.textContent = '就是現在，注水！';
      when.classList.add('go');
    } else {
      when.textContent = '太晚了，快注水！';
      when.classList.add('late');
      if (!brew.lateWarned && brew.clock > st.at + 12) { brew.lateWarned = true; bossRage('快點注水！'); }
    }
  } else {
    brew.drain += dt;
    $('brew-stage').textContent = '等咖啡滴完…';
    $('brew-bar').style.width = '80%';
    when.textContent = '';
    if (brew.drain > 2.4) {
      brew.running = false;
      finish();
      return;
    }
  }

  drawBrew(stages);
  requestAnimationFrame(brewLoop);
}

function drawBrew(stages) {
  const total = stages[stages.length - 1].cum;
  ctx.clearRect(0, 0, 600, 600);
  // 濾杯
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#4a2f1d';
  ctx.fillStyle = game.dripper.color;
  ctx.beginPath(); ctx.arc(C, C, 285, 0, 7); ctx.fill(); ctx.stroke();
  // 濾紙
  ctx.fillStyle = result.rinsed ? '#f3ead8' : '#fffaf0';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(C, C, 255, 0, 7); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(74,47,29,.25)';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * BED_R, C + Math.sin(a) * BED_R);
    ctx.lineTo(C + Math.cos(a) * 255, C + Math.sin(a) * 255);
    ctx.stroke();
  }
  // 粉床：越濕越深
  const wet = clamp(brew.water / total);
  const col = (a, b) => Math.round(a + (b - a) * wet);
  ctx.fillStyle = `rgb(${col(139, 74)},${col(90, 44)},${col(52, 24)})`;
  ctx.strokeStyle = '#4a2f1d';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(C, C, BED_R, 0, 7); ctx.fill(); ctx.stroke();
  // 水面
  if (brew.pool > 0) {
    ctx.fillStyle = `rgba(196,140,84,${0.45 * brew.pool})`;
    ctx.beginPath(); ctx.arc(C, C, BED_R - 6, 0, 7); ctx.fill();
  }
  // 泡泡
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, BED_R - 4, 0, 7); ctx.clip();
  brew.bubbles.forEach((b) => {
    ctx.fillStyle = `rgba(240,205,150,${b.life * 0.8})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
  });
  ctx.restore();
  // 引導圈
  if (brew.phase === 'pour') {
    ctx.setLineDash([14, 14]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,250,240,.55)';
    ctx.beginPath(); ctx.arc(C, C, BED_R * 0.48, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
  // 沖到邊緣的警告
  if (brew.onEdge) {
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(226,114,91,.85)';
    ctx.beginPath(); ctx.arc(C, C, BED_R - 8, 0, 7); ctx.stroke();
  }
  // 水柱
  if (brew.pouring) {
    ctx.fillStyle = 'rgba(190,225,245,.9)';
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(brew.px, brew.py, 20, 0, 7); ctx.fill(); ctx.stroke();
  }
}

/* ---------- 評鑑 ---------- */

function finish() {
  const { bean, dripper, method } = game;
  const m = bean.diff * dripper.diff; // 難度：誤差會被放大
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // 各項分數
  const doseErr = result.dose - method.dose;
  const sDose = 10 * clamp(1 - (Math.abs(doseErr) * m - 0.3) / 2.7);

  const gDiff = idealGrind() - result.grind; // 正數 = 磨得比理想細
  const sGrindSet = [15, 12, 7, 3][Math.abs(gDiff)] || 0;
  const sGrind = sGrindSet + 10 * result.uniform;

  const sRinse = result.rinsed ? 5 : 0;

  const sWater = 25 * avg(brew.waterErr.map((e) => clamp(1 - (Math.abs(e) * m - 3) / 22)));
  const tErr = brew.timeErr.slice(1);
  const sTime = 20 * (tErr.length ? avg(tErr.map((e) => clamp(1 - (Math.abs(e) * m - 5) / 25))) : 1);

  const bad = (brew.edgeTime + brew.stillTime * 0.7) / Math.max(1, brew.pourTime);
  const tech = clamp(1 - bad * m);
  const sTech = 15 * tech;

  const score = Math.round(sDose + sGrind + sRinse + sWater + sTime + sTech);
  const stars = score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0;

  // 萃取度：正 = 過萃（苦），負 = 萃取不足（酸）
  const finalWaterErr = brew.waterErr[brew.waterErr.length - 1] || 0;
  const E = clamp(gDiff * 0.35 + avg(tErr) / 30 + finalWaterErr / 40, -1.5, 1.5);

  const p = bean.profile;
  const c10 = (v) => clamp(v, 0, 10);
  const cup = {
    酸: c10(p.酸 - E * 3),
    甜: c10(p.甜 - Math.abs(E) * 3 - (1 - tech) * 2),
    苦: c10(p.苦 + (E > 0 ? E * 3.5 : E)),
    醇厚: c10(p.醇厚 + doseErr * 0.5 - finalWaterErr / 30),
    香氣: c10(p.香氣 - (1 - result.uniform) * 3 - (result.rinsed ? 0 : 1) - Math.abs(E)),
  };

  // 找出最大的問題來給評語
  const flaws = [
    [Math.abs(gDiff) >= 2 && gDiff > 0, 15 - sGrindSet, '磨太細了，苦到我炸毛！下次刻度調粗一點。'],
    [Math.abs(gDiff) >= 2 && gDiff < 0, 15 - sGrindSet, '磨太粗了，喝起來像酸酸的水……刻度調細一點喵。'],
    [true, (1 - result.uniform) * 10, '粉磨得粗細不均，轉把手的速度要穩一點。'],
    [true, 10 - sDose, doseErr > 0 ? '豆子放太多，味道太濃了喵。' : '豆子放太少，喝起來好淡。'],
    [true, 25 - sWater, finalWaterErr > 0 ? '水加太多，味道被沖淡了。注水到目標就要放手！' : '每一段的水量沒抓準，看著電子秤再放手喵。'],
    [true, 20 - sTime, avg(tErr) > 0 ? '注水太慢，泡太久有點苦澀。跟著時間走喵。' : '太心急了！還沒等夠就注水，味道出不來。'],
    [true, 15 - sTech, brew.edgeTime > brew.stillTime * 0.7 ? '水沖到濾紙邊緣了，會從旁邊流走。在中間繞圈就好。' : '手要一直繞圈，不要對著同一個點沖喵。'],
    [!result.rinsed, 5, '有一點紙味……下次記得先濕濾紙。'],
  ].filter((f) => f[0]).sort((a, b) => b[1] - a[1]);

  let comment;
  if (stars === 3) comment = `喵嗚～完美！這杯${bean.name}的${bean.desc.split('、')[0]}完全出來了！`;
  else if (stars === 2) comment = `不錯喝喵！不過${flaws[0][2]}`;
  else comment = flaws[0][2];

  lastResult = { score, stars, comment, bean, dripper, method, anger: boss.count };

  // 畫面
  saveDex(`${bean.id}-${dripper.id}-${method.id}`, stars);
  $('result-cat').innerHTML = catSvg(['angry', 'watch', 'ok', 'happy'][stars]);
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span>${i < stars ? '⭐' : '☆'}</span>`).join('');
  $('score').textContent = score;
  $('comment').textContent = comment;
  const rows = [
    ['秤豆', sDose, 10, `${result.dose.toFixed(1)} g / ${method.dose} g`],
    ['研磨', sGrind, 25, `刻度 ${result.grind}（理想 ${idealGrind()}）`],
    ['濕濾紙', sRinse, 5, result.rinsed ? '有' : '跳過'],
    ['水量', sWater, 25, `最終 ${Math.round(brew.water)} g`],
    ['時機', sTime, 20, `總時間 ${fmtTime(brew.clock)}`],
    ['手法', sTech, 15, ''],
  ];
  $('breakdown').innerHTML = rows.map((r) => `<li><span>${r[0]} <small>${r[3]}</small></span><b>${Math.round(r[1])} / ${r[2]}</b></li>`).join('')
    + `<li><span>💢 惹店長生氣</span><b>${boss.count} 次</b></li>`;
  drawRadar(p, cup);
  show('s-result');
  beep(stars >= 2 ? 990 : 330, 0.25);
}

function drawRadar(ideal, cup) {
  const c = $('radar');
  const g = c.getContext('2d');
  const keys = Object.keys(ideal);
  const cx = 260, cy = 205, R = 140;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
    return [cx + Math.cos(a) * R * (v / 10), cy + Math.sin(a) * R * (v / 10)];
  };
  const poly = (vals) => {
    g.beginPath();
    vals.forEach((v, i) => { const [x, y] = pt(i, v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
  };
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d8c19c';
  g.lineWidth = 2;
  [2.5, 5, 7.5, 10].forEach((v) => { poly(keys.map(() => v)); g.stroke(); });
  // 理想風味（虛線）
  g.setLineDash([8, 8]);
  g.strokeStyle = '#4a2f1d';
  g.lineWidth = 3;
  poly(keys.map((k) => ideal[k])); g.stroke();
  g.setLineDash([]);
  // 這一杯
  g.fillStyle = 'rgba(217,137,59,.55)';
  g.strokeStyle = '#b56a22';
  g.lineWidth = 4;
  poly(keys.map((k) => cup[k])); g.fill(); g.stroke();
  g.fillStyle = '#4a2f1d';
  g.font = 'bold 24px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  keys.forEach((k, i) => { const [x, y] = pt(i, 12.4); g.fillText(k, x, y); });
  g.font = '18px sans-serif';
  g.textAlign = 'left';
  g.fillText('橘色：這一杯　虛線：理想風味', 10, 388);
}

/* ---------- 分享結果 ---------- */

let lastResult = null;
let toastTimer = null;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function svgToImage(svg, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', `<svg width="${w}" height="${h}" `))}`;
  });
}

const gameUrl = () => (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/index\.html$/, '') : '');

function shareText() {
  const r = lastResult;
  const stars = '⭐'.repeat(r.stars) || '零星';
  return `我在《滴滴手沖》用 ${r.bean.name}＋${r.dripper.name}＋${r.method.name} 沖出 ${r.score} 分 ${stars}，惹店長生氣 ${r.anger} 次！你也來挑戰 ☕ ${gameUrl()}`.trim();
}

// 把這一杯的成績畫成一張可以分享的圖卡
async function makeShareCard() {
  const r = lastResult;
  const W = 720;
  const H = 1250;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const INK = '#4a2f1d';
  const FONT = '"Huninn", "Microsoft JhengHei", "PingFang TC", sans-serif';
  const box = (x, y, w, h, rad) => {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  };

  // 背景點點 + 白卡
  g.fillStyle = '#f6e7cf';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e6cfa8';
  for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  box(32, 32, W - 64, H - 64, 40);
  g.fillStyle = '#fffaf0';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();

  // 標題
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#b56a22';
  g.font = `bold 68px ${FONT}`;
  g.fillText('滴滴手沖', W / 2, 130);
  g.fillStyle = INK;
  g.font = `26px ${FONT}`;
  g.fillText('Drip Drip・店長評鑑', W / 2, 172);

  // 店長 + 分數
  const cat = await svgToImage(catSvg(['angry', 'watch', 'ok', 'happy'][r.stars]), 250, 300);
  g.drawImage(cat, 70, 200, 250, 300);
  g.font = `60px ${FONT}`;
  g.fillText('⭐'.repeat(r.stars) + '☆'.repeat(3 - r.stars), 490, 290);
  g.font = `bold 130px ${FONT}`;
  g.fillText(r.score, 470, 420);
  const sw = g.measureText(r.score).width;
  g.font = `bold 40px ${FONT}`;
  g.fillText('分', 470 + sw / 2 + 30, 420);
  g.fillStyle = '#e2463a';
  g.font = `bold 30px ${FONT}`;
  g.fillText(`💢 惹店長生氣 ${r.anger} 次`, 490, 478);

  // 這一杯的組合
  box(70, 525, W - 140, 110, 24);
  g.fillStyle = '#ffe9b8';
  g.fill();
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = INK;
  g.font = `bold 34px ${FONT}`;
  g.fillText(r.bean.name, W / 2, 573);
  g.font = `26px ${FONT}`;
  g.fillText(`${r.dripper.name}・${r.method.name}`, W / 2, 614);

  // 風味雷達（直接用評鑑畫面那張）
  g.drawImage($('radar'), 100, 650, 520, 400);

  // 店長評語，自動換行
  g.font = `28px ${FONT}`;
  const lines = [];
  let cur = '';
  for (const ch of `「${r.comment}」`) {
    if (g.measureText(cur + ch).width > 560) { lines.push(cur); cur = ''; }
    cur += ch;
  }
  lines.push(cur);
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, W / 2, 1105 + i * 40));

  g.fillStyle = '#b56a22';
  g.font = `22px ${FONT}`;
  g.fillText(gameUrl().replace(/^https?:\/\//, '') || '來挑戰店長拿鐵吧 ☕', W / 2, H - 52);
  return c;
}

async function shareResult() {
  if (!lastResult) return;
  const btn = $('btn-share');
  btn.disabled = true;
  try {
    const canvas = await makeShareCard();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], 'drip-drip.png', { type: 'image/png' });
    const text = shareText();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      // 手機：叫出系統的分享選單
      await navigator.share({ files: [file], title: '滴滴手沖', text });
    } else {
      // 電腦：下載圖片，並把文字複製到剪貼簿
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'drip-drip.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      try {
        await navigator.clipboard.writeText(text);
        toast('圖片已下載，文字已複製！');
      } catch (e) {
        toast('圖片已下載！');
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('分享失敗，再試一次喵');
  }
  btn.disabled = false;
}
$('btn-share').addEventListener('click', () => { beep(); shareResult(); });

$('btn-again').addEventListener('click', () => { beep(); showTitle(); });

showTitle();
