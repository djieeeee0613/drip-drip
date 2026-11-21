'use strict';

/* ---------- 資料 ---------- */

const BEANS = [
  { id: 'yirga', name: '衣索比亞 耶加雪菲', en: 'Yirgacheffe', bag: '#2a5f5d', foil: '#e2ac90', roast: '淺焙', color: '#b9824f',
    desc: '花香、柑橘、茶感', level: '標準', tag: 'mid', diff: 1.0, grind: 5,
    profile: { 酸: 8, 甜: 7, 苦: 2, 醇厚: 4, 香氣: 9 } },
  { id: 'geisha', name: '巴拿馬 藝伎', en: 'Geisha', bag: '#342c48', foil: '#dcbf7c', roast: '淺焙', color: '#c99a63',
    desc: '茉莉、佛手柑、蜜桃', level: '困難', tag: 'hard', diff: 1.3, grind: 5,
    profile: { 酸: 7, 甜: 9, 苦: 1, 醇厚: 4, 香氣: 10 } },
  { id: 'huila', name: '哥倫比亞 薇拉', en: 'Huila', bag: '#9c4c31', foil: '#f4dcae', roast: '中焙', color: '#7a4a2b',
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
  { id: 'classic', name: '經典三段式', icon: 'sprout', dose: 15, grindAdj: 1,
    desc: '悶蒸後分兩段注水，最好上手', level: '新手', tag: '',
    stages: [
      { label: '悶蒸', cum: 30, at: 0 },
      { label: '第二段', cum: 130, at: 30 },
      { label: '第三段', cum: 240, at: 75 },
    ] },
  { id: 'hoffmann', name: 'Hoffmann 一刀流', icon: 'cyclone', dose: 15, grindAdj: 0,
    desc: '悶蒸 45 秒後幾乎一口氣注完', level: '標準', tag: 'mid',
    stages: [
      { label: '悶蒸', cum: 45, at: 0 },
      { label: '主注水（前半）', cum: 150, at: 45 },
      { label: '主注水（後半）', cum: 250, at: 75 },
    ] },
  { id: 'four6', name: '粕谷哲 4:6 法', icon: 'trophy', dose: 20, grindAdj: 2,
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
// 圖示：OpenMoji（CC BY-SA 4.0），檔案在 icons/
const icon = (name, cls = '') => `<img class="ic ${cls}" src="icons/${name}.svg" alt="" draggable="false">`;
// 每一幀都會更新的文字：內容有變才重寫，圖示才不會一直重新載入
const setHtml = (el, html) => {
  if (el.dataset.h === html) return;
  el.dataset.h = html;
  el.innerHTML = html;
};
const setText = (el, text) => { const t = String(text); if (el.textContent !== t) el.textContent = t; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pick = (x) => (Array.isArray(x) ? x[Math.floor(Math.random() * x.length)] : x);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('app').classList.toggle('calm', !['s-title', 's-result'].includes(id));
  // 店長只在動手的步驟出來監督
  const watching = ['s-weigh', 's-grind', 's-rinse', 's-brew'].includes(id);
  $('boss').hidden = !watching;
  if (watching && !$('boss').classList.contains('rage') && !$('boss').classList.contains('cheer')) $('boss-cat').innerHTML = catSvg('watch');
  // 秤豆、磨豆、濕濾紙、注水用 3D 場景（載入失敗時 Scene3D 不存在，就維持 2D）
  if (window.Scene3D) {
    const hosts = { 's-weigh': ['stage-weigh', 'weigh'], 's-grind': ['grinder', 'grind'], 's-rinse': ['rinse', 'rinse'], 's-brew': ['brew-wrap', 'brew'] };
    // 選豆、選濾杯用 3D 展示架
    const pk = id === 's-pick' ? PICKS[pickIdx] : null;
    if (pk && pk.key !== 'method') hosts['s-pick'] = ['stage-shelf', 'shelf'];
    const data = Object.assign({}, game, {
      rinsed: result.rinsed,
      kind: pk && pk.key,
      items: pk && pk.list,
      sel: pk ? pk.list.indexOf(game[pk.key]) : -1,
      onPick: (i) => { const c = $('pick-cards').children[i]; if (c) c.click(); },
    });
    if (hosts[id]) Scene3D.mount($(hosts[id][0]), hosts[id][1], data);
    else Scene3D.unmount();
  }
}

/* ---------- 店長台詞：夾雜台灣網路迷因，同一個情況每次隨機挑一句 ---------- */

const LINES = {
  title: [
    '哼，我是店長拿鐵。<br>我會盯著你，沖錯我就生氣喵！',
    '來都來了，<br>就沖一杯給本店長喝喝看。',
    '我是店長拿鐵，很派的那種。<br>沖錯一步，我就森77！',
    '先說好喔，<br>我不要你覺得，我要我覺得。',
    '從從容容、游刃有餘，<br>沖壞了我可是會傻眼貓咪。',
    '質疑、理解、成為咖啡師，<br>今天就從第一杯開始喵。',
    '今天也要大展鴻圖喵！<br>沖錯的話……你就知道了。',
    '尊嘟假嘟？你要挑戰本店長？<br>好啊，沖來看看。',
  ],
  rage: {
    weighOver: ['倒太多了喵！', '你是在歐印喔？太多了！', '是在哈囉？豆子爆量了！', '母湯母湯，倒太多了！', '傻眼貓咪，都滿出來了！'],
    weighLow: ['這麼少怎麼沖！', '這點豆子是在哈囉？', '這樣就夠？信你我是秦始皇', '豆子這麼少，芭比Q了'],
    skipRinse: ['竟敢跳過？！', '回答我！為什麼跳過！', '來都來了，濾紙不濕一下？', '傻眼貓咪，濾紙還是乾的！'],
    early: ['還沒到時間！', '我不要你覺得，我要我覺得！', '急什麼？從從容容啦！', '母湯！時間還沒到！'],
    edge: ['不要沖到濾紙！', '是在哈囉？沖到邊邊了！', '水都從旁邊溜走了啦！', '瞄準中間好嗎，我的老天鵝'],
    overWater: ['太多了，快放手！', '你是在歐印喔？快放手！', '芭比Q了，水太多了！', '放手啊！你暈船了喔？'],
    still: ['手要繞圈啦！', '建議手臂加強', '定格是在拍照喔？繞圈！', '一直沖同一點，是在哈囉？'],
    late: ['快點注水！', '回答我！Look in my eyes！', '人呢？時間到了啦！', '還在滑脆喔？快注水！'],
  },
  cheer: {
    weigh: ['很有觸，克數超準！', '水喔～分毫不差！', '尊嘟假嘟？這麼準！', '從從容容，游刃有餘～'],
    grind: ['刻度剛剛好，很可以喔！', '刻度選得好，水喔～', '這香氣把我硬控了三秒…', '很有觸，就是這個粗細！'],
    rinse: ['有濕濾紙，算你識相', '來都來了，就是要做好！', '很有觸，紙味掰掰～'],
    pour: ['剛剛好，水喔！', '很有觸！就是這樣！', '這一段漂亮，露比醬～嗨！', '從從容容、游刃有餘～', '大展鴻圖！繼續保持'],
  },
};

/* ---------- 監督店長：犯錯就生氣來干擾，做得好也會誇一句 ---------- */

const boss = { until: 0, count: 0, timer: null, cheerUntil: 0 };

// 回傳 true 代表這次真的發飆了（有冷卻時間，不會連續發飆）
function bossRage(msg) {
  const now = performance.now();
  if (now < boss.until) return false;
  boss.until = now + 3500;
  boss.count++;
  if (window.Scene3D) Scene3D.shake();
  $('boss').classList.remove('cheer');
  $('boss-cat').innerHTML = catSvg('angry');
  $('boss-say').textContent = pick(msg);
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
  }, 2400);
  return true;
}

// 做得好的時候誇一句（正在生氣、或剛誇過就不說）
function bossCheer(msg) {
  const now = performance.now();
  if (now < boss.until || now < boss.cheerUntil || $('boss').hidden) return;
  boss.cheerUntil = now + 4000;
  const b = $('boss');
  $('boss-cat').innerHTML = catSvg('happy');
  $('boss-say').textContent = pick(msg);
  b.classList.remove('cheer');
  void b.offsetWidth;
  b.classList.add('cheer');
  clearTimeout(boss.timer);
  boss.timer = setTimeout(() => {
    b.classList.remove('cheer');
    $('boss-cat').innerHTML = catSvg('watch');
  }, 2400);
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

// 收尾動畫的音效：用 Web Audio 合成，不需要音檔
let noiseBuf = null;
function sfx(name) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audioCtx;
    const now = ac.currentTime;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const noise = (dur, type, f0, f1, vol, q = 1, at = 0) => {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const fl = ac.createBiquadFilter();
      fl.type = type;
      fl.Q.value = q;
      fl.frequency.setValueAtTime(f0, now + at);
      fl.frequency.linearRampToValueAtTime(f1, now + at + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.linearRampToValueAtTime(vol, now + at + 0.05);
      g.gain.setValueAtTime(vol, now + at + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, now + at + dur);
      src.connect(fl).connect(g).connect(ac.destination);
      src.start(now + at);
      src.stop(now + at + dur);
      return g;
    };
    const tone = (f, dur, type = 'sine', vol = 0.08, at = 0) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, now + at);
      g.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
      o.connect(g).connect(ac.destination);
      o.start(now + at);
      o.stop(now + at + dur);
    };
    if (name === 'swirl') {
      const g = noise(1.4, 'lowpass', 450, 700, 0.12);
      for (let i = 0; i < 6; i++) g.gain.setValueAtTime(i % 2 ? 0.04 : 0.13, now + 0.1 + i * 0.2);
    } else if (name === 'pour') {
      noise(1.1, 'bandpass', 900, 1500, 0.14, 0.8, 0.5);
    } else if (name === 'clink') {
      tone(2100, 0.3, 'sine', 0.05);
      tone(3150, 0.2, 'sine', 0.025);
    } else if (name === 'sip') {
      noise(0.55, 'bandpass', 2600, 700, 0.2, 2);
    } else if (name === 'purr') {
      const g = noise(1.8, 'lowpass', 160, 200, 0.35);
      for (let i = 0; i < 22; i++) g.gain.setValueAtTime(i % 2 ? 0.08 : 0.35, now + 0.05 + i * 0.08);
    } else if (name === 'spit') {
      noise(0.35, 'highpass', 1500, 800, 0.25);
    } else if (name === 'hiss') {
      noise(0.9, 'highpass', 3500, 4500, 0.12);
    } else if (name === 'hmm') {
      tone(220, 0.35, 'triangle', 0.07);
      tone(180, 0.4, 'triangle', 0.06, 0.25);
    } else if (name === 'yay') {
      [660, 880].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.12));
    } else if (name === 'sniff') {
      noise(0.12, 'bandpass', 3200, 2600, 0.12, 2);
      noise(0.12, 'bandpass', 3200, 2600, 0.12, 2, 0.2);
      noise(0.16, 'bandpass', 3000, 2400, 0.14, 2, 0.4);
    } else if (name === 'stamp') {
      tone(95, 0.3, 'sine', 0.35);
      noise(0.12, 'lowpass', 900, 300, 0.25);
    } else if (name === 'fanfare') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, i * 0.13));
    }
  } catch (e) { /* 沒有音效也能玩 */ }
}

// 追蹤手指繞著元素中心轉了多少角度
function trackSpin(el, onDelta, onEnd) {
  let last = null;
  let r = null; // 開始畫圈時量一次元件位置，移動中不再量（每次量都會讓瀏覽器重排版面）
  const angle = (e) => Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    r = el.getBoundingClientRect();
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
  } else if (mood === 'sip') {
    // 閉眼啜飲：杯子擋在嘴前
    eyes = `<path d="M56 100 q14 6 28 0 M116 100 q14 6 28 0" ${line} stroke-width="6"/>`;
    mouth = '';
    front = `<path d="M90 120 q-6 -8 0 -14 M104 118 q-6 -8 0 -14" ${line} stroke-width="3" opacity=".45"/>
      <path d="M74 128 h52 l-6 32 q-20 8 -40 0 z" fill="${WHITE}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M74 128 h52" stroke="#d8b25a" stroke-width="3"/>
      <path d="M125 134 q16 0 14 11 q-2 10 -16 8" ${line} stroke-width="4"/>
      <ellipse cx="100" cy="129" rx="22" ry="3" fill="#5a2e14"/>`;
  } else if (mood === 'sour') {
    // 酸到瞇眼、嘴巴縮起來
    eyes = `<path d="M56 90 l18 10 l-18 10 M144 90 l-18 10 l18 10" ${line} stroke-width="6"/>`;
    mouth = `<circle cx="100" cy="132" r="6" fill="#7a2e22" stroke="${INK}" stroke-width="3"/>`;
    tint = `<ellipse cx="100" cy="100" rx="76" ry="56" fill="#e8df4a" opacity=".14"/>`;
    back = `<path d="M30 40 q-7 12 0 16 q7 -4 0 -16 z M172 52 q-7 12 0 16 q7 -4 0 -16 z" fill="#8fc4e0" stroke="${INK}" stroke-width="3"/>`;
  } else if (mood === 'bitter') {
    // 苦到吐舌頭、打冷顫
    eyes = `<path d="M54 98 q5 -8 10 0 q5 8 10 0 q5 -8 10 0 M116 98 q5 -8 10 0 q5 8 10 0 q5 -8 10 0" ${line} stroke-width="5"/>`;
    mouth = `<path d="M86 124 q14 -6 28 0" ${line} stroke-width="4"/>
      <path d="M93 125 q7 22 14 0 z" fill="#f29c8a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    tint = `<ellipse cx="100" cy="96" rx="76" ry="50" fill="#6fae5a" opacity=".28"/>`;
    back = `<path d="M8 90 l10 -6 M6 110 l12 0 M8 130 l10 6 M192 90 l-10 -6 M194 110 l-12 0 M192 130 l-10 6" ${line} stroke-width="4"/>`;
  } else if (mood === 'weak') {
    // 疑惑：一眼大一眼小，挑眉
    eyes = `${eye(70, 6)}<path d="M118 100 h24" ${line} stroke-width="5"/>
      <path d="M54 78 q16 -10 32 -2" ${line} stroke-width="5"/>`;
    mouth = `<path d="M100 120 v4 M90 130 h20" ${line} stroke-width="4"/>`;
    front = `<text x="160" y="62" font-size="46" font-weight="bold" fill="${INK}" font-family="sans-serif">?</text>`;
  } else if (mood === 'strong') {
    // 太濃：眼睛瞪大、毛炸開
    eyes = `<circle cx="70" cy="98" r="17" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="70" cy="98" r="4" fill="${INK}"/>
      <circle cx="130" cy="98" r="17" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="130" cy="98" r="4" fill="${INK}"/>`;
    mouth = `<ellipse cx="100" cy="133" rx="9" ry="11" fill="#7a2e22" stroke="${INK}" stroke-width="4"/>`;
    back = `<path transform="translate(100 100) scale(1.22) translate(-100 -100)" d="M100 22 L112 42 L132 28 L136 50 L160 44 L156 66 L182 70 L166 86 L188 100 L166 112 L184 130 L160 132 L164 156 L140 146 L134 170 L116 154 L100 176 L84 154 L66 170 L60 146 L36 156 L40 132 L16 130 L34 112 L12 100 L34 86 L18 70 L44 66 L40 44 L64 50 L68 28 L88 42 Z"
      fill="${FUR}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
  } else if (mood === 'paper') {
    // 紙味：皺鼻子、嘴巴歪
    eyes = `${eye(70, 4)}${eye(130, 4)}${lids(10)}`;
    mouth = `<path d="M84 104 l7 5 M116 104 l-7 5" ${line} stroke-width="3"/>
      <path d="M84 130 q4 -5 8 0 q4 5 8 0 q4 -5 8 0 q4 5 8 0" ${line} stroke-width="4"/>`;
    front = `<path d="M150 60 q8 -8 0 -16 q-8 -8 0 -16 M168 66 q8 -8 0 -16 q-8 -8 0 -16" fill="none" stroke="#7fae5a" stroke-width="5" stroke-linecap="round"/>`;
  } else if (mood === 'spit') {
    // 噴出來：鼓臉、瞇眼、嘴邊噴咖啡
    eyes = `<path d="M56 90 l18 10 l-18 10 M144 90 l-18 10 l18 10" ${line} stroke-width="6"/>`;
    mouth = `<ellipse cx="100" cy="132" rx="14" ry="9" fill="#5a2e14" stroke="${INK}" stroke-width="4"/>`;
    tint = `<ellipse cx="62" cy="126" rx="20" ry="14" fill="${FUR}" stroke="${INK}" stroke-width="3"/>
      <ellipse cx="138" cy="126" rx="20" ry="14" fill="${FUR}" stroke="${INK}" stroke-width="3"/>`;
    front = `<g fill="#5a2e14"><circle cx="124" cy="136" r="6"/><circle cx="140" cy="132" r="5"/><circle cx="156" cy="140" r="7"/>
      <circle cx="170" cy="128" r="4"/><circle cx="182" cy="142" r="6"/><circle cx="150" cy="150" r="4"/></g>`;
  } else if (mood === 'look') {
    // 低頭仔細看杯子（杯子在右下方）
    const peek = (x) => `<ellipse cx="${x}" cy="100" rx="15" ry="14" fill="#f2c94c" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="${x + 5}" cy="105" rx="6" ry="8" fill="${INK}"/><circle cx="${x + 8}" cy="100" r="3" fill="#fff"/>`;
    eyes = `${peek(70)}${peek(130)}<path d="M54 80 q16 -8 30 -2 M146 80 q-16 -8 -30 -2" ${line} stroke-width="5"/>`;
    mouth = `<path d="M100 120 v5 M90 128 q10 4 20 0" ${line} stroke-width="4"/>`;
  } else if (mood === 'sniff') {
    // 閉眼聞香、細品
    eyes = `<path d="M56 100 q14 6 28 0 M116 100 q14 6 28 0" ${line} stroke-width="6"/>`;
    mouth = `<path d="M100 122 v4 M92 130 q8 -4 16 0" ${line} stroke-width="4"/>`;
    front = `<path d="M80 108 q-8 -4 -12 2 M120 108 q8 -4 12 2 M76 117 q-8 0 -10 6 M124 117 q8 0 10 6" ${line} stroke-width="3" opacity=".55"/>`;
  } else if (mood === 'love' || mood === 'bow') {
    // 愛心眼、臉紅；bow 會把貝雷帽摘下來致敬
    const heart = (x) => `<path d="M${x} 108 l-14 -14 a8 8 0 0 1 14 -10 a8 8 0 0 1 14 10 z" fill="#e2463a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    eyes = mood === 'love' ? `${heart(70)}${heart(130)}` : `<path d="M55 102 q15 -18 30 0 M115 102 q15 -18 30 0" ${line} stroke-width="6"/>`;
    mouth = `<path d="M100 120 v5 M86 125 q7 10 14 0 q7 10 14 0" ${line} stroke-width="4"/>`;
    tint = `<ellipse cx="46" cy="124" rx="16" ry="9" fill="#f26a6a" opacity=".55"/><ellipse cx="154" cy="124" rx="16" ry="9" fill="#f26a6a" opacity=".55"/>`;
    back = `<path d="M18 56 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z M182 40 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#ffd95a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  } else {
    eyes = `${eye(70, 6)}${eye(130, 6)}`;
    mouth = `<path d="M100 120 v5 M88 127 q12 5 24 0" ${line} stroke-width="4"/>`;
  }
  const beretTf = mood === 'bow' ? 'translate(58 -10) rotate(32 100 36)' : 'rotate(-8 100 36)';

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
    <g transform="${beretTf}">
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
  // 和豆子架上一樣的平底方袋：正面、右側摺、頂端熱封、燙金徽章
  return `<svg viewBox="0 0 80 80"><g stroke="#4a2f1d" stroke-width="3" stroke-linejoin="round">
      <path d="M50 22 L62 26 L62 70 L50 74 Z" fill="${b.bag}"/>
      <path d="M50 22 L62 26 L62 70 L50 74 Z" fill="#000" fill-opacity=".28"/>
      <path d="M12 22 H50 V74 H12 Z" fill="${b.bag}"/>
      <path d="M11 9 H51 V22 H11 Z" fill="${b.bag}"/>
      <path d="M51 10 L57 14 L62 26 L50 22 Z" fill="${b.bag}"/>
    </g>
    <path d="M14 13 H48 M14 16 H48 M14 19 H48" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>
    <g fill="${b.foil}"><rect x="16" y="30" width="2" height="10"/><rect x="20" y="31" width="16" height="3" rx="1"/><rect x="20" y="36" width="12" height="3" rx="1"/>
      <rect x="16" y="66" width="22" height="2.4" rx="1"/></g>
    <circle cx="37" cy="52" r="9.5" fill="none" stroke="${b.foil}" stroke-width="2"/>
    <path d="M32.5 50 h9 q-.6 6 -4.5 6 t-4.5 -6 Z" fill="${b.foil}"/>
    <circle cx="31" cy="27" r="2.6" fill="#f0ece4" stroke="#4a2f1d" stroke-width="1.2"/></svg>`;
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
    <image href="icons/${m.icon}.svg" x="9" y="9" width="62" height="62"/></svg>`;
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
  $('dex').innerHTML = `圖鑑 ${keys.length} / 27　${icon('star').repeat(3)} ${three} 杯`;
  $('title-cat').innerHTML = catSvg('watch');
  $('title-say').innerHTML = pick(LINES.title);
  show('s-title');
}
$('btn-start').addEventListener('click', () => { beep(); playBgm(); boss.count = 0; startPick(0); });
// 3D 場景載入好之後，趁標題畫面閒著先預熱（做模型、編譯著色器、傳貼圖）
window.addEventListener('scene3d-ready', () => Scene3D.prewarm({ beans: BEANS, drippers: DRIPPERS }));

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

// 離開網頁（切到別的 App、鎖螢幕、換分頁）就暫停音樂和音效，回來再接著播，
// 不然手機上音樂會在背景一直跑
let bgmWasPlaying = false;
function pauseForBackground() {
  if (!bgm.paused) {
    bgmWasPlaying = true;
    bgm.pause();
  }
  if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
}
function resumeFromBackground() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  if (!bgmWasPlaying) return;
  bgmWasPlaying = false;
  if (!bgmOn) return;
  // 有些手機回來時不讓網頁自己播，就等玩家下一次點畫面再播
  bgm.play().catch(() => window.addEventListener('pointerdown', playBgm, { once: true }));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForBackground();
  else resumeFromBackground();
});
window.addEventListener('pagehide', pauseForBackground);
window.addEventListener('pageshow', () => { if (!document.hidden) resumeFromBackground(); });

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
  $('s-pick').classList.toggle('shelf', p.key !== 'method');
  $('shelf-hint').textContent = p.key === 'bean' ? '點袋子挑豆子' : '點濾杯挑一個';
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
      if (p.key !== 'method' && window.Scene3D && Scene3D.active) Scene3D.setShelf(p.list.indexOf(item));
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
  $('weigh-hint').innerHTML = `這個沖法需要 <b>${game.method.dose} g</b> 豆子，越準越好（快到時會自動倒慢一點）`;
  show('s-weigh');
}
function weighLoop(t) {
  if (!weigh.pouring) return;
  const dt = Math.min(0.05, (t - weigh.last) / 1000);
  weigh.last = t;
  const near = Math.abs(weigh.g - game.method.dose) < 1.5;
  weigh.g += dt * (near ? 1.6 + Math.random() : 4 + Math.random() * 3);
  $('weigh-val').textContent = weigh.g.toFixed(1);
  if (window.Scene3D) Scene3D.setWeigh(weigh.g, true);
  if (!weigh.warned && weigh.g > game.method.dose + 1) {
    weigh.warned = true;
    bossRage(LINES.rage.weighOver);
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
  const stop = () => {
    weigh.pouring = false;
    btn.classList.remove('down');
    if (window.Scene3D) Scene3D.setWeigh(weigh.g, false);
  };
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  $('btn-weigh-reset').addEventListener('click', startWeigh);
  $('btn-weigh-done').addEventListener('click', () => {
    if (weigh.g < 1) return;
    if (weigh.g < game.method.dose - 1.5) bossRage(LINES.rage.weighLow);
    result.dose = weigh.g;
    beep();
    startGrind();
    if (Math.abs(weigh.g - game.method.dose) <= 0.5) bossCheer(LINES.cheer.weigh);
  });
})();

/* ---------- 畫圈提示（磨豆、濕濾紙） ---------- */

const guideTimers = {};
function spinGuide(id, on, delay = 0) {
  clearTimeout(guideTimers[id]);
  const set = () => $(id).classList.toggle('on', on);
  if (delay) guideTimers[id] = setTimeout(set, delay);
  else set();
}

/* ---------- 研磨 ---------- */

const grind = { total: 0, done: false };
const grindName = (v) => (v <= 3 ? '細' : v <= 5 ? '中細' : v <= 7 ? '中' : '粗');
const idealGrind = () => clamp(game.bean.grind + game.dripper.grindAdj + game.method.grindAdj, 1, 10);

function startGrind() {
  Object.assign(grind, { total: 0, done: false });
  $('grind-size').value = 5;
  $('grind-size').disabled = false;
  updateGrindLabel();
  $('grinder-fill').style.height = '0';
  $('crank').style.transform = 'rotate(0rad)';
  $('btn-grind-done').disabled = true;
  $('grind-status').textContent = '手指在磨豆機上畫圈，磨滿就好';
  $('grind-hint').innerHTML = `店長提示：這個組合適合<b>「${grindName(idealGrind())}」</b>研磨。先調刻度再開始磨`;
  show('s-grind');
  spinGuide('grind-guide', true);
}
function updateGrindLabel() {
  const v = +$('grind-size').value;
  $('grind-size-val').textContent = v;
  $('grind-size-name').textContent = grindName(v);
  if (window.Scene3D) Scene3D.setGrind({ size: v });
}
$('grind-size').addEventListener('input', updateGrindLabel);

trackSpin($('grinder'), (d, a) => {
  if (grind.done) return;
  spinGuide('grind-guide', false);
  $('grind-size').disabled = true; // 開磨後不能再改刻度
  grind.total += Math.abs(d);
  const p = clamp(grind.total / (GRIND_TURNS * 2 * Math.PI));
  $('crank').style.transform = `rotate(${a}rad)`;
  if (window.Scene3D) Scene3D.setGrind({ angle: a, p });
  $('grinder-fill').style.height = `${p * 100}%`;
  if (Math.floor(grind.total / 1.2) !== Math.floor((grind.total - Math.abs(d)) / 1.2)) beep(180 + Math.random() * 60, 0.03);
  if (p >= 1) {
    grind.done = true;
    $('btn-grind-done').disabled = false;
    setText($('grind-status'), '磨好了！聞起來好香～');
    beep(880, 0.15);
  } else {
    setText($('grind-status'), `研磨中… ${Math.round(p * 100)}%`);
  }
}, () => { if (!grind.done) spinGuide('grind-guide', true, 700); });

$('btn-grind-done').addEventListener('click', () => {
  result.grind = +$('grind-size').value;
  beep();
  startRinse();
  if (result.grind === idealGrind()) bossCheer(LINES.cheer.grind);
});

/* ---------- 濕濾紙 ---------- */

const rinse = { total: 0 };
function startRinse() {
  rinse.total = 0;
  $('rinse-wet').style.strokeDashoffset = 440;
  $('btn-rinse-done').disabled = true;
  show('s-rinse');
  spinGuide('rinse-guide', true);
}
trackSpin($('rinse'), (d, a) => {
  spinGuide('rinse-guide', false);
  rinse.total += Math.abs(d);
  const p = clamp(rinse.total / (2 * Math.PI));
  $('rinse-wet').style.strokeDashoffset = 440 * (1 - p);
  if (window.Scene3D) Scene3D.setRinse({ angle: a, p, pouring: true });
  if (p >= 1 && $('btn-rinse-done').disabled) {
    $('btn-rinse-done').disabled = false;
    beep(880, 0.15);
  }
}, () => {
  if (window.Scene3D) Scene3D.setRinse({ pouring: false });
  if (rinse.total < 2 * Math.PI) spinGuide('rinse-guide', true, 700);
});
$('btn-rinse-skip').addEventListener('click', () => { result.rinsed = false; startBrew(); bossRage(LINES.rage.skipRinse); });
$('btn-rinse-done').addEventListener('click', () => { result.rinsed = true; beep(); startBrew(); bossCheer(LINES.cheer.rinse); });

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
  ctx.clearRect(0, 0, 600, 600);
  show('s-brew');
  requestAnimationFrame(brewLoop);
}

function brewPos(e) {
  if (window.Scene3D && Scene3D.active) {
    const p = Scene3D.brewPoint(e.clientX, e.clientY);
    brew.x = p.x;
    brew.y = p.y;
    return;
  }
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
    if (Math.abs(brew.water - stages[brew.stage].cum) <= 4) bossCheer(LINES.cheer.pour);
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
      if (brew.stage > 0 && brew.clock < st.at - 8) rage(LINES.rage.early);
    }
    // 沖到濾紙邊緣（被店長撞到的那段不算）
    brew.edgeRun = brew.onEdge && t >= brew.joltUntil ? brew.edgeRun + dt : 0;
    if (brew.edgeRun > 0.4) { brew.edgeRun = 0; rage(LINES.rage.edge); }
    if (!brew.overWarned && brew.water > st.cum + 10) { brew.overWarned = true; rage(LINES.rage.overWater); }
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
        if (++brew.stillRun >= 3) { brew.stillRun = 0; rage(LINES.rage.still); }
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
  setText($('brew-time'), fmtTime(brew.clock));
  setText($('brew-water'), Math.round(brew.water));
  const when = $('brew-when');
  let whenCls = 'when';
  if (brew.phase === 'pour') {
    const prev = brew.stage === 0 ? 0 : stages[brew.stage - 1].cum;
    const frac = (brew.water - prev) / (st.cum - prev);
    setText($('brew-stage'), `${st.label}：注水到 ${st.cum} g`);
    const bw = `${clamp(frac * 80, 0, 100).toFixed(1)}%`;
    if ($('brew-bar').style.width !== bw) $('brew-bar').style.width = bw;
    $('brew-bar').classList.toggle('over', brew.water > st.cum + 6);
    if (brew.pouring || brew.stageStarted) {
      setHtml(when, brew.water >= st.cum - 6 ? '夠了，放開手指！' : `注水中…到 ${st.cum} g 放開`);
      if (brew.water >= st.cum - 6) whenCls = 'when go';
    } else if (brew.stage === 0) {
      setHtml(when, '按住粉床開始注水');
    } else if (brew.clock < st.at - 5) {
      setHtml(when, `${icon('hourglass')} 等到 ${fmtTime(st.at)} 再注水`);
    } else if (brew.clock <= st.at + 6) {
      setHtml(when, '就是現在，注水！');
      whenCls = 'when go';
    } else {
      setHtml(when, '太晚了，快注水！');
      whenCls = 'when late';
      if (!brew.lateWarned && brew.clock > st.at + 12) { brew.lateWarned = true; bossRage(LINES.rage.late); }
    }
  } else {
    brew.drain += dt;
    setText($('brew-stage'), '等咖啡滴完…');
    $('brew-bar').style.width = '80%';
    setHtml(when, '');
    if (brew.drain > 2.4) {
      brew.running = false;
      finish();
      return;
    }
  }

  if (when.className !== whenCls) when.className = whenCls;

  if (window.Scene3D && Scene3D.active) {
    Scene3D.setBrew({
      px: brew.px, py: brew.py, pouring: brew.pouring, water: brew.water,
      total: stages[stages.length - 1].cum, pool: brew.pool, onEdge: brew.onEdge, phase: brew.phase,
    });
  } else {
    drawBrew(stages);
  }
  requestAnimationFrame(brewLoop);
}

// 把 #rrggbb 調亮（正數）或調暗（負數）
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// 用光影把俯視的濾杯畫出立體感：桌面影子、凹下去的濾紙和粉床、從壺嘴落下的水柱、熱氣
function drawBrew(stages) {
  const total = stages[stages.length - 1].cum;
  const now = performance.now();
  const TAU = Math.PI * 2;
  const INK = '#4a2f1d';
  const OUT_R = 272;
  const PAPER_R = 248;
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
  let g;
  ctx.clearRect(0, 0, 600, 600);

  // 桌面上的影子
  g = ctx.createRadialGradient(C + 10, C + 20, 215, C + 10, C + 20, 298);
  g.addColorStop(0, 'rgba(74,47,29,.4)');
  g.addColorStop(1, 'rgba(74,47,29,0)');
  ctx.fillStyle = g;
  circle(C + 10, C + 20, 298);
  ctx.fill();

  // 濾杯外圈：左上受光
  g = ctx.createRadialGradient(C - 110, C - 130, 30, C, C, OUT_R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, game.dripper.color);
  g.addColorStop(1, shade(game.dripper.color, -60));
  ctx.fillStyle = g;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  circle(C, C, OUT_R);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(C, C, OUT_R - 11, Math.PI * 1.08, Math.PI * 1.5);
  ctx.stroke();

  // 濾紙：越往中間越暗，看起來是往下凹的
  g = ctx.createRadialGradient(C, C, BED_R - 10, C, C, PAPER_R);
  g.addColorStop(0, result.rinsed ? '#bfb08e' : '#d6c8aa');
  g.addColorStop(1, result.rinsed ? '#f3ead8' : '#fffaf0');
  ctx.fillStyle = g;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  circle(C, C, PAPER_R);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    [['rgba(74,47,29,.28)', 0], ['rgba(255,255,255,.7)', 0.035]].forEach(([col, off]) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a + off) * BED_R, C + Math.sin(a + off) * BED_R);
      ctx.lineTo(C + Math.cos(a + off) * (PAPER_R - 3), C + Math.sin(a + off) * (PAPER_R - 3));
      ctx.stroke();
    });
  }

  // 粉床：越濕越深，中間最深
  const wet = clamp(brew.water / total);
  const base = [139 + (74 - 139) * wet, 90 + (44 - 90) * wet, 52 + (24 - 52) * wet];
  const rgb = (k) => `rgb(${base.map((v) => Math.round(clamp(v * k, 0, 255))).join(',')})`;
  g = ctx.createRadialGradient(C + 14, C + 22, 8, C, C, BED_R);
  g.addColorStop(0, rgb(0.55));
  g.addColorStop(0.65, rgb(0.95));
  g.addColorStop(1, rgb(1.2));
  ctx.fillStyle = g;
  circle(C, C, BED_R);
  ctx.fill();
  // 上緣的內陰影
  g = ctx.createLinearGradient(0, C - BED_R, 0, C + BED_R);
  g.addColorStop(0, 'rgba(0,0,0,.45)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(255,220,170,.12)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();

  // 水面：帶反光
  if (brew.pool > 0) {
    g = ctx.createRadialGradient(C - 60, C - 80, 10, C, C, BED_R);
    g.addColorStop(0, `rgba(236,190,130,${0.6 * brew.pool})`);
    g.addColorStop(1, `rgba(150,95,50,${0.45 * brew.pool})`);
    ctx.fillStyle = g;
    circle(C, C, BED_R - 6);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.3 * brew.pool})`;
    ctx.beginPath();
    ctx.ellipse(C - 78, C - 100, 74, 24, -0.6, 0, TAU);
    ctx.fill();
  }

  // 泡泡和水波
  ctx.save();
  circle(C, C, BED_R - 4);
  ctx.clip();
  brew.bubbles.forEach((b) => {
    ctx.fillStyle = `rgba(240,205,150,${b.life * 0.8})`;
    circle(b.x, b.y, b.r);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${b.life * 0.7})`;
    circle(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.28);
    ctx.fill();
  });
  brew.ripples = brew.ripples || [];
  if (brew.pouring && Math.random() < 0.2) brew.ripples.push({ x: brew.px, y: brew.py, r: 14, life: 1 });
  brew.ripples.forEach((p) => {
    p.r += 2.4;
    p.life -= 0.035;
    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, p.life) * 0.55})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.72, 0, 0, TAU);
    ctx.stroke();
  });
  brew.ripples = brew.ripples.filter((p) => p.life > 0);
  ctx.restore();

  // 引導圈
  if (brew.phase === 'pour') {
    ctx.setLineDash([14, 14]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,250,240,.6)';
    circle(C, C, BED_R * 0.48);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 沖到邊緣的警告
  if (brew.onEdge) {
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(226,114,91,.85)';
    circle(C, C, BED_R - 8);
    ctx.stroke();
  }

  // 熱氣往上飄
  if (brew.water > 0) {
    for (let i = 0; i < 5; i++) {
      const ph = (now / 2800 + i * 0.2) % 1;
      const x = C - 130 + i * 65 + Math.sin(now / 520 + i * 2) * 16;
      const y = C + 60 - ph * 300;
      ctx.fillStyle = `rgba(255,255,255,${Math.sin(ph * Math.PI) * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 + ph * 20, 26 + ph * 30, 0, 0, TAU);
      ctx.fill();
    }
  }

  // 水柱：從右上方的壺嘴落到手指的位置
  if (brew.pouring) {
    const x = brew.px;
    const y = brew.py;
    const sx = x + 56;
    const sy = y - 190;
    g = ctx.createLinearGradient(sx, sy, x, y);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(1, 'rgba(150,205,240,.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy);
    ctx.quadraticCurveTo(x + 18, y - 120, x - 9, y);
    ctx.lineTo(x + 9, y);
    ctx.quadraticCurveTo(x + 34, y - 120, sx + 6, sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 落點
    ctx.fillStyle = 'rgba(215,238,250,.92)';
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 14, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // 壺嘴
    g = ctx.createLinearGradient(sx, sy - 80, sx + 80, sy);
    g.addColorStop(0, '#aab4c0');
    g.addColorStop(1, '#4f5863');
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy + 8);
    ctx.lineTo(sx + 10, sy - 6);
    ctx.lineTo(sx + 110, sy - 92);
    ctx.lineTo(sx + 84, sy - 112);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/* ---------- 評鑑 ---------- */

function finish() {
  const { bean, dripper, method } = game;
  const m = 1 + (bean.diff * dripper.diff - 1) * 0.7; // 難度：誤差會被放大（放大幅度打七折）
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // 各項分數
  const doseErr = result.dose - method.dose;
  const sDose = 10 * clamp(1 - (Math.abs(doseErr) * m - 0.5) / 3.5);

  const gDiff = idealGrind() - result.grind; // 正數 = 磨得比理想細
  const sGrindSet = [15, 13, 8, 4][Math.abs(gDiff)] || 0;
  const sGrind = sGrindSet + 10; // 磨完就拿到這 10 分，不再看轉得穩不穩

  const sRinse = result.rinsed ? 5 : 0;

  const sWater = 25 * avg(brew.waterErr.map((e) => clamp(1 - (Math.abs(e) * m - 4) / 24)));
  const tErr = brew.timeErr.slice(1);
  const sTime = 20 * (tErr.length ? avg(tErr.map((e) => clamp(1 - (Math.abs(e) * m - 6) / 28))) : 1);

  const bad = (brew.edgeTime + brew.stillTime * 0.7) / Math.max(1, brew.pourTime);
  const tech = clamp(1 - bad * m * 0.85);
  const sTech = 15 * tech;

  const score = Math.round(sDose + sGrind + sRinse + sWater + sTime + sTech);
  const stars = score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0;

  // 萃取度：正 = 過萃（苦），負 = 萃取不足（酸）
  const finalWaterErr = brew.waterErr[brew.waterErr.length - 1] || 0;
  const E = clamp(gDiff * 0.3 + avg(tErr) / 34 + finalWaterErr / 46, -1.5, 1.5);

  const p = bean.profile;
  const c10 = (v) => clamp(v, 0, 10);
  const cup = {
    酸: c10(p.酸 - E * 3),
    甜: c10(p.甜 - Math.abs(E) * 3 - (1 - tech) * 2),
    苦: c10(p.苦 + (E > 0 ? E * 3.5 : E)),
    醇厚: c10(p.醇厚 + doseErr * 0.5 - finalWaterErr / 30),
    香氣: c10(p.香氣 - (result.rinsed ? 0 : 1) - Math.abs(E)),
  };

  // 找出最大的問題來給評語
  const flaws = [
    [Math.abs(gDiff) >= 2 && gDiff > 0, 15 - sGrindSet, pick(['磨太細了，苦到我炸毛！下次刻度調粗一點。', '磨太細，苦到我破防了！刻度調粗一點啦。']), 'bitter'],
    [Math.abs(gDiff) >= 2 && gDiff < 0, 15 - sGrindSet, pick(['磨太粗了，喝起來像酸酸的水……刻度調細一點喵。', '磨太粗，酸到我藍瘦香菇……刻度調細一點。']), 'sour'],
    [true, 10 - sDose, doseErr > 0
      ? pick(['豆子放太多，味道太濃了喵。', '豆子歐印下去，濃到我森77，下次少放一點。'])
      : pick(['豆子放太少，喝起來好淡。', '豆子太少，淡到我傻眼貓咪。']), doseErr > 0 ? 'strong' : 'weak'],
    [true, 25 - sWater, finalWaterErr > 0
      ? pick(['水加太多，味道被沖淡了。注水到目標就要放手！', '水加太多是在哈囉？到目標就要放手！'])
      : pick(['每一段的水量沒抓準，看著電子秤再放手喵。', '水量沒抓準，母湯喔，看著電子秤再放手。']), finalWaterErr > 0 ? 'weak' : 'strong'],
    [true, 20 - sTime, avg(tErr) > 0
      ? pick(['注水太慢，泡太久有點苦澀。跟著時間走喵。', '從從容容不是叫你慢吞吞！注水太慢，有點苦澀。'])
      : pick(['太心急了！還沒等夠就注水，味道出不來。', '我不要你覺得時間到，我要我覺得！太急了啦。']), avg(tErr) > 0 ? 'bitter' : 'sour'],
    [true, 15 - sTech, brew.edgeTime > brew.stillTime * 0.7
      ? pick(['水沖到濾紙邊緣了，會從旁邊流走。在中間繞圈就好。', '一直沖到濾紙邊邊是在哈囉？在中間繞圈就好。'])
      : pick(['手要一直繞圈，不要對著同一個點沖喵。', '手都不繞圈，建議手臂加強喵。']), 'tech'],
    [!result.rinsed, 5, pick(['有一點紙味……下次記得先濕濾紙。', '有紙味。來都來了，濕個濾紙很難嗎？']), 'paper'],
  ].filter((f) => f[0]).sort((a, b) => b[1] - a[1]);

  const note = bean.desc.split('、')[0];
  let comment;
  if (score === 87) comment = `87 分，不能再高了！這杯${note}很有誠意喵～`;
  else if (stars === 3) {
    comment = pick([
      `喵嗚～完美！這杯${bean.name}的${note}完全出來了！`,
      `大展鴻圖！這杯${note}完全出來了，可以開店了喵！`,
      `尊嘟假嘟？${note}這麼明顯，你偷練過吧！`,
      `質疑、理解、成為你的粉絲……這杯${note}太讚了！`,
      `很有觸！${bean.name}的${note}被你沖出來了喵！`,
    ]);
  } else if (stars === 2) comment = `${pick(['不錯喝喵！不過', '很可以喔！不過', '水喔～但是'])}${flaws[0][2]}`;
  else if (stars === 1) comment = flaws[0][2];
  else comment = `${pick(['芭比Q了……', '傻眼貓咪……', '累了，毀滅吧……'])}${flaws[0][2]}`;

  lastResult = { score, stars, comment, bean, dripper, method, anger: boss.count };

  // 店長品鑑要用的資料：和評鑑畫面用的是同一組數字
  const weakness = clamp(finalWaterErr / 40 - doseErr * 0.15, -1, 1);
  const tasting = {
    score, stars, comment, bean, cup, ideal: p, E, weakness,
    color: coffeeColor(E, weakness),
    rinsed: result.rinsed,
  };

  // 畫面
  saveDex(`${bean.id}-${dripper.id}-${method.id}`, stars);
  $('result-cat').innerHTML = catSvg(finalMood(lastResult));
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span>${icon('star', i < stars ? '' : 'off')}</span>`).join('');
  $('score').textContent = '0';
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
    + `<li><span>${icon('anger')} 惹店長生氣</span><b>${boss.count} 次</b></li>`;
  drawRadar(p, cup);
  playServe(tasting, () => {
    show('s-result');
    countUp($('score'), score);
    beep(stars >= 2 ? 990 : 330, 0.25);
  });
}

// 評鑑畫面、分享圖卡上店長的表情（和試喝反應的最後一個表情一致）
const finalMood = (r) => (r.score >= 100 ? 'bow' : ['angry', 'watch', 'ok', 'love'][r.stars]);

// 依萃取度和濃淡算出咖啡的顏色：萃取不足偏淺紅、過度偏黑；太淡偏淺、太濃偏深
function coffeeColor(E, weak) {
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  let c = [92, 40, 16];
  c = E < 0 ? mix(c, [150, 82, 34], Math.min(1, -E / 1.2)) : mix(c, [34, 16, 8], Math.min(1, E / 1.2));
  c = weak > 0 ? mix(c, [170, 112, 62], weak * 0.6) : mix(c, [26, 12, 6], -weak * 0.5);
  return (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
}

/* ---------- 店長品鑑：觀色 → 聞香 → 啜吸 → 細品 → 評分 ---------- */
// 每一步看到、聞到、喝到的東西，都直接從這杯的計算結果來，
// 所以動畫裡店長的反應和最後的分數、評語一定對得上。

const serveState = { timers: [], done: null, active: false };
const serveTimer = (fn, ms) => serveState.timers.push(setTimeout(fn, ms));
const hexColor = (n) => `#${n.toString(16).padStart(6, '0')}`;
const mixColor = (a, b, k) => {
  const ch = (n, s) => (n >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

// 五個風味項目：偏高 / 偏低時的標籤，以及店長會不會因此皺眉（mood 為 null 就只標示不反應）
const TASTE_ROWS = [
  { k: '酸', ok: '明亮', hi: ['太酸', 'sour', ['好酸！舌頭都縮起來了', '酸到我藍瘦香菇……', '好酸，酸得像極了愛情'], 'shake'], lo: ['不夠明亮', 'watch', ['酸質不見了，喝起來好平', '酸質呢？平到傻眼貓咪'], 'tilt'] },
  { k: '甜', ok: '甜感飽滿', hi: ['很甜', null], lo: ['甜感不足', 'watch', ['甜感出不來……', '說好的甜感呢？母湯喔'], 'tilt'] },
  { k: '苦', ok: '適中', hi: ['太苦', 'bitter', ['好苦……舌頭發麻', '苦到我破防了……', '苦到我嚇到吃手手'], 'shiver'], lo: ['苦味很輕', null] },
  { k: '醇厚', ok: '圓潤', hi: ['太厚重', 'strong', ['好濃！毛都炸起來了！', '濃到我森77，毛都炸了！'], 'puff'], lo: ['太稀薄', 'weak', ['口感好稀，這是水嗎？', '稀成這樣，是在哈囉？'], 'tilt'] },
  { k: '香氣', ok: '迷人', hi: ['很香', null], lo: ['香氣不足', 'watch', ['香氣都跑掉了……', '香氣呢？芭比Q了……'], 'tilt'] },
];

// 把這一杯的數據整理成品鑑時要演出的內容
function buildTasting(t) {
  // 觀色：顏色是由萃取度（E）和濃淡（weakness）決定的，這裡用同樣的數字描述它
  const ex = t.E / 1.2;
  const wk = t.weakness;
  let look;
  if (Math.abs(wk) > Math.max(0.35, Math.abs(ex))) {
    look = wk > 0
      ? { text: '顏色偏淡、很透光', say: pick(['顏色好淡……水是不是加太多了？', '淡成這樣，是在哈囉？']), good: false }
      : { text: '濃到不透光', say: pick(['顏色好深，會不會太濃？', '黑成這樣，我的老天鵝……']), good: false };
  } else if (ex < -0.4) {
    look = { text: '偏淺的琥珀色', say: pick(['顏色偏淺，可能萃取不足。', '顏色淺淺的，萃取不夠喔。']), good: false };
  } else if (ex > 0.4) {
    look = { text: '偏黑的深褐色', say: pick(['顏色太深，可能萃取過頭了。', '顏色這麼深，芭比Q了，萃取過頭。']), good: false };
  } else {
    look = { text: '透亮的紅棕色', say: pick(['顏色很漂亮，透亮的紅棕色！', '透亮的紅棕色，很可以喔！', '這個色澤……水喔！']), good: true };
  }

  // 聞香：香氣分數和杯測表上「香氣」那一列用的是同一個數字
  const notes = t.bean.desc.split('、');
  const d = t.cup.香氣 - t.ideal.香氣;
  const bright = d >= -1 ? notes.length : d >= -3 ? Math.max(1, notes.length - 1) : 0;
  let smellSay;
  if (bright === notes.length) smellSay = pick([`聞到${notes.slice(0, 2).join('和')}了～`, `${notes.slice(0, 2).join('和')}的香氣，把我硬控了三秒！`]);
  else if (bright > 0) smellSay = `香氣有點弱，只聞到${notes.slice(0, bright).join('、')}。`;
  else smellSay = pick(['幾乎聞不到香氣……', '香氣呢？是在哈囉？']);
  if (!t.rinsed) smellSay = pick(['嗯？有一股紙味……', '這紙味……信你有濕濾紙，我是秦始皇']);
  const smell = { notes: notes.map((n, i) => ({ text: n, muted: i >= bright })), paper: !t.rinsed, say: smellSay };

  // 細品：每一項和這支豆子的理想風味比，差 1 分以內算剛好
  const rows = TASTE_ROWS.map((def) => {
    const v = t.cup[def.k];
    const i = t.ideal[def.k];
    const diff = v - i;
    const status = diff > 1 ? 'hi' : diff < -1 ? 'lo' : 'ok';
    const info = status === 'ok' ? [def.ok, null] : def[status];
    let react = info[1] ? { mood: info[1], say: pick(info[2]), anim: info[3] } : null;
    if (react && def.k === '香氣' && !t.rinsed) react = { mood: 'paper', say: pick(['紙味把香氣都蓋掉了……', '紙味好重，回答我！有濕濾紙嗎？']), anim: 'shake' };
    return { k: def.k, v, i, diff, status, tag: info[0], react };
  });
  // 三星的杯子不挑毛病；其他就挑最明顯的一項皺眉。
  // 酸、苦、太濃、太淡、紙味這些「有個性」的缺點優先，只是「差一點」的（watch）打六折
  const weight = (r) => Math.abs(r.diff) * (r.react.mood === 'watch' ? 0.6 : 1);
  const worst = t.stars < 3
    ? rows.filter((r) => r.react && Math.abs(r.diff) > 1.5).sort((a, b) => weight(b) - weight(a))[0] || null
    : null;
  const summary = pick(rows.every((r) => r.status === 'ok') ? ['每一項都很平衡！', '五項都到位，很有觸！']
    : t.stars === 3 ? ['整體很協調喵。', '整體很協調，水喔～'] : ['有幾項沒到位喵……', '有幾項沒到位，母湯喔……']);

  // 評分：印章、最後的反應和評鑑畫面一致
  const stamp = t.score >= 100 ? '完美' : ['重沖！', '再加油', '還不錯', '超好喝'][t.stars];
  let finale;
  if (t.score >= 100) finale = [{ mood: 'bow', anim: 'bow', fx: 'confetti', sfx: 'fanfare', say: pick(['完美！本店長向你脫帽致敬！', '尊嘟假嘟？滿分！本店長脫帽致敬！', '質疑、理解、成為你的粉絲！滿分！']), ms: 2600 }];
  else if (t.stars === 3) finale = [{ mood: 'love', anim: 'bounce', fx: 'hearts', sfx: 'purr', say: t.comment, ms: 2600 }];
  else if (t.stars === 2) finale = [{ mood: 'ok', anim: 'nod', fx: 'sparkle', sfx: 'yay', say: t.comment, ms: 2600 }];
  else if (t.stars === 1) finale = [{ mood: 'watch', anim: 'push', sfx: 'hmm', say: t.comment, ms: 2600 }];
  else {
    finale = [
      { mood: 'spit', anim: 'shake', fx: 'spray', sfx: 'spit', say: '噗——！', ms: 1100 },
      { mood: 'angry', anim: 'rage', sfx: 'hiss', say: t.comment, ms: 2600 },
    ];
  }
  return { look, smell, rows, worst, summary, stamp, finale };
}

// 品鑑杯：杯面顏色就是這杯咖啡的顏色，分數越高油脂泡沫越多
function cupSvg(color, foam) {
  const INK = '#4a2f1d';
  const crema = hexColor(mixColor(color, 0xd9a56a, 0.55));
  const bubbles = Array.from({ length: Math.round(3 + foam * 10) }, (_, i) => {
    const a = (i / (3 + foam * 10)) * Math.PI * 2 + 0.4;
    return `<circle cx="${(80 + Math.cos(a) * 40).toFixed(1)}" cy="${(48 + Math.sin(a) * 6.5).toFixed(1)}" r="${(1.2 + (i % 3) * 0.6).toFixed(1)}" fill="${crema}"/>`;
  }).join('');
  return `<svg viewBox="0 0 160 132" xmlns="http://www.w3.org/2000/svg">
    <g class="steam" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round">
      <path d="M62 36 q-8 -9 0 -18 q8 -9 0 -18"/><path d="M80 32 q-8 -9 0 -18 q8 -9 0 -18"/><path d="M98 36 q-8 -9 0 -18 q8 -9 0 -18"/>
    </g>
    <ellipse cx="80" cy="118" rx="70" ry="11" fill="#fffaf0" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="80" cy="116" rx="44" ry="5.5" fill="#eadfca"/>
    <path d="M126 60 q24 0 22 18 q-2 18 -26 16" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M126 60 q24 0 22 18 q-2 18 -26 16" fill="none" stroke="#fffaf0" stroke-width="4" stroke-linecap="round"/>
    <path d="M30 48 h100 l-9 52 q-41 15 -82 0 z" fill="#fffaf0" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M42 58 l7 38" stroke="#efe4cf" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="80" cy="48" rx="50" ry="10" fill="${hexColor(color)}" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="80" cy="48" rx="43" ry="7" fill="none" stroke="${crema}" stroke-width="${(2 + foam * 4).toFixed(1)}" opacity="${(0.35 + foam * 0.65).toFixed(2)}"/>
    ${bubbles}
    <ellipse cx="66" cy="45.5" rx="12" ry="2.2" fill="#fff" opacity=".35"/>
    <ellipse cx="80" cy="48" rx="52.5" ry="11.5" fill="none" stroke="#d8b25a" stroke-width="2"/>
  </svg>`;
}

function playServe(t, done) {
  serveState.timers.forEach(clearTimeout);
  serveState.timers = [];
  serveState.done = done;
  serveState.active = true;
  show('s-serve');
  runTasting(t);
}

function runTasting(t) {
  const T = buildTasting(t);
  const at = (ms, fn) => serveTimer(() => { if (serveState.active) fn(); }, ms);
  const stage = $('t-stage');
  const catEl = $('react-cat');
  const cup = $('t-cup');

  // 重設畫面
  $('react-fx').innerHTML = '';
  $('t-notes').innerHTML = '';
  $('react-say').textContent = '';
  $('btn-skip').innerHTML = `跳過 ${icon('skip')}`;
  $('t-bean').textContent = `${t.bean.name}・${t.bean.roast}`;
  $('t-score').textContent = '--';
  $('t-stamp').className = 't-stamp';
  $('t-stamp').innerHTML = '';
  document.querySelectorAll('#t-steps li').forEach((li) => { li.className = ''; });
  $('t-rows').innerHTML = T.rows.map((r) => `<li class="t-row" data-k="${r.k}"><span class="t-label">${r.k}</span>`
    + `<span class="t-bar"><i class="t-fill"></i><i class="t-ideal" style="left:${r.i * 10}%"></i></span>`
    + '<span class="t-tag">待評</span></li>').join('');
  const swatch = $('t-swatch');
  swatch.className = 't-swatch';
  swatch.innerHTML = `<i style="background:${hexColor(t.color)}"></i><span>色澤<b>${T.look.text}</b></span>`;
  cup.className = 't-cup';
  cup.innerHTML = cupSvg(t.color, t.stars / 3);
  setCat('watch');

  // 店長嘴巴、鼻子在舞台上的位置（貓的 SVG 是 200×240）
  const spot = (fx, fy) => {
    const s = stage.getBoundingClientRect();
    const c = catEl.getBoundingClientRect();
    return { x: c.left - s.left + c.width * fx, y: c.top - s.top + c.height * fy };
  };

  // 0. 品鑑杯端上來
  at(0, () => { cup.classList.add('in'); });
  at(450, () => sfx('clink'));

  // 1. 觀色
  at(900, () => {
    setStep('look');
    setCat('look');
    say(T.look.say);
    swatch.classList.add('show', T.look.good ? 'good' : 'warn');
    if (!T.look.good) sfx('hmm');
  });

  // 2. 聞香：咖啡的風味飄向店長的鼻子，聞不到的會變灰
  at(2700, () => {
    setStep('smell');
    setCat('sniff', 'sniffing');
    sfx('sniff');
    const s = stage.getBoundingClientRect();
    const c = cup.getBoundingClientRect();
    const from = { x: c.left - s.left + c.width / 2, y: c.top - s.top + c.height * 0.2 };
    const nose = spot(0.5, 0.48);
    const list = T.smell.notes.map((n) => ({ ...n }));
    if (T.smell.paper) list.push({ text: '紙味', muted: false, paper: true });
    list.forEach((n, i) => {
      const el = document.createElement('span');
      el.className = `t-note${n.muted ? ' muted' : ''}${n.paper ? ' paper' : ''}`;
      el.textContent = n.text;
      const spread = (i - (list.length - 1) / 2);
      el.style.left = `${from.x + spread * 34}px`;
      el.style.top = `${from.y - Math.abs(spread) * 6}px`;
      el.style.setProperty('--tx', `${nose.x - from.x - spread * 34 + spread * 44}px`);
      el.style.setProperty('--ty', `${nose.y - from.y - Math.abs(spread) * 18}px`);
      el.style.animationDelay = `${i * 0.28}s`;
      $('t-notes').appendChild(el);
    });
  });
  at(3700, () => {
    say(T.smell.say);
    if (T.smell.paper) { setCat('paper', 'shake'); sfx('hmm'); }
  });

  // 3. 啜吸：杯子端到嘴邊
  at(5100, () => {
    setStep('sip');
    $('t-notes').innerHTML = '';
    const s = cup.getBoundingClientRect();
    const mouth = spot(0.5, 0.56);
    const st = stage.getBoundingClientRect();
    cup.style.setProperty('--mx', `${mouth.x - (s.left - st.left + s.width / 2)}px`);
    cup.style.setProperty('--my', `${mouth.y - (s.top - st.top + s.height * 0.4)}px`);
    cup.classList.add('lift');
  });
  at(5650, () => { setCat('sip', 'sip'); sfx('sip'); say('嘶溜～'); });

  // 4. 細品：一項一項填杯測表，最明顯的缺點讓店長皺眉
  at(6800, () => {
    setStep('taste');
    cup.classList.remove('lift');
    setCat('sniff');
    say('細細品嚐……');
  });
  let ms = 7200;
  T.rows.forEach((r, i) => {
    at(ms, () => fillRow(r, i));
    if (r === T.worst) at(ms + 350, () => { setCat(r.react.mood, r.react.anim); say(r.react.say); sfx('hmm'); });
    ms += 620;
  });
  at(ms + 250, () => {
    if (!T.worst) { setCat(t.stars >= 2 ? 'ok' : 'watch', t.stars >= 2 ? 'nod' : ''); say(T.summary); }
  });

  // 5. 評分：算總分、蓋章、最後的反應
  const v = ms + 1500;
  at(v, () => {
    setStep('verdict');
    setCat('watch');
    say('評分中……');
    countUp($('t-score'), t.score);
  });
  at(v + 1100, () => {
    const st = $('t-stamp');
    st.innerHTML = `<small>${icon('star').repeat(t.stars)}${icon('star', 'off').repeat(3 - t.stars)}</small>${T.stamp}`;
    st.className = `t-stamp slam s${t.stars}`;
    $('t-card').classList.remove('thud');
    void $('t-card').offsetWidth;
    $('t-card').classList.add('thud');
    sfx('stamp');
  });
  let f = v + 1450;
  T.finale.forEach((step) => {
    at(f, () => {
      setCat(step.mood, step.anim);
      say(step.say);
      if (step.fx) spawnFx(step.fx, spot(0.5, 0.56));
      if (step.sfx) sfx(step.sfx);
      $('app').classList.toggle('shake', step.anim === 'rage');
      $('btn-skip').innerHTML = `看結果 ${icon('play')}`;
    });
    f += step.ms;
  });
  at(f + 1200, finishServe);
}

function setStep(k) {
  let passed = true;
  document.querySelectorAll('#t-steps li').forEach((li) => {
    if (li.dataset.k === k) { li.className = 'now'; passed = false; } else li.className = passed ? 'done' : '';
  });
}

function setCat(mood, anim = '') {
  const cat = $('react-cat');
  cat.innerHTML = catSvg(mood);
  cat.className = 'react-cat';
  if (anim) {
    void cat.offsetWidth;
    cat.classList.add(anim);
  }
}

function say(text) {
  const el = $('react-say');
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function fillRow(r, i) {
  const li = document.querySelector(`#t-rows li[data-k="${r.k}"]`);
  li.classList.add(r.status);
  li.querySelector('.t-fill').style.width = `${Math.max(4, r.v * 10)}%`;
  const tag = li.querySelector('.t-tag');
  tag.textContent = `${r.status === 'hi' ? '▲ ' : r.status === 'lo' ? '▼ ' : '✓ '}${r.tag}`;
  tag.classList.add('pop');
  beep(620 + i * 90, 0.06);
}

// 愛心、彩帶、小星星、噴出來的咖啡（from：店長嘴巴在舞台上的位置）
function spawnFx(kind, from) {
  const box = $('react-fx');
  const n = { hearts: 14, confetti: 46, spray: 26, sparkle: 10 }[kind];
  const colors = ['#e2725b', '#ffd95a', '#8fb56a', '#8fc4e0', '#d9893b'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    const r = Math.random;
    if (kind === 'hearts' || kind === 'sparkle') {
      el.innerHTML = icon(kind === 'hearts' ? ['heart-growing', 'two-hearts', 'sparkles'][i % 3] : 'sparkles');
      el.style.cssText = `left:${from.x - 40 + r() * 80}px;top:${from.y - 30 - r() * 40}px;--dx:${(r() - 0.5) * 140}px;font-size:${16 + r() * 14}px;`
        + `animation:fxUp ${1.3 + r()}s ${r() * 0.7}s ease-out forwards`;
    } else if (kind === 'confetti') {
      el.className = 'confetti';
      el.style.cssText = `left:${r() * 100}%;top:-5%;background:${colors[i % colors.length]};--r:${(r() - 0.5) * 900}deg;`
        + `animation:fxFall ${1.6 + r() * 1.2}s ${r() * 0.6}s linear forwards`;
    } else {
      el.className = 'drop';
      el.style.cssText = `left:${from.x}px;top:${from.y}px;--dx:${60 + r() * 160}px;--dy:${(r() - 0.3) * 120}px;`
        + `animation:fxSpray ${0.5 + r() * 0.4}s ease-out forwards`;
    }
    box.appendChild(el);
  }
}

function finishServe() {
  if (!serveState.active) return;
  serveState.active = false;
  serveState.timers.forEach(clearTimeout);
  serveState.timers = [];
  $('app').classList.remove('shake');
  serveState.done();
}
$('btn-skip').addEventListener('click', () => { beep(); finishServe(); });


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

// 分數從 0 跳到最終分數
function countUp(el, target) {
  const t0 = performance.now();
  const step = (t) => {
    const k = clamp((t - t0) / 900);
    el.textContent = Math.round(target * (1 - (1 - k) ** 3));
    if (k < 1 && lastResult && lastResult.score === target) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

// 背景的豆子跟著手指稍微位移，做出景深
document.getElementById('app').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.currentTarget.classList.contains('calm')) return;
  const r = e.currentTarget.getBoundingClientRect();
  const bg = document.querySelector('.bg3d');
  bg.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * -24).toFixed(1));
  bg.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * -24).toFixed(1));
});

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
  // 圖示（直接開 index.html 檔案時，畫上檔案圖片會讓圖卡無法匯出，就略過）
  const ic = async (name) => {
    if (location.protocol === 'file:') return null;
    const img = new Image();
    img.src = `icons/${name}.svg`;
    try { await img.decode(); return img; } catch (e) { return null; }
  };
  const [starImg, angerImg] = await Promise.all([ic('star'), ic('anger')]);
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
  const cat = await svgToImage(catSvg(finalMood(r)), 250, 300);
  g.drawImage(cat, 70, 200, 250, 300);
  for (let i = 0; i < 3; i++) {
    const x = 490 + (i - 1) * 76 - 38;
    if (starImg) {
      g.globalAlpha = i < r.stars ? 1 : 0.25;
      g.drawImage(starImg, x, 222, 76, 76);
      g.globalAlpha = 1;
    } else {
      g.font = `60px ${FONT}`;
      g.fillText(i < r.stars ? '★' : '☆', x + 38, 290);
    }
  }
  g.font = `bold 130px ${FONT}`;
  g.fillText(r.score, 470, 420);
  const sw = g.measureText(r.score).width;
  g.font = `bold 40px ${FONT}`;
  g.fillText('分', 470 + sw / 2 + 30, 420);
  g.fillStyle = '#e2463a';
  g.font = `bold 30px ${FONT}`;
  const angerText = `惹店長生氣 ${r.anger} 次`;
  if (angerImg) {
    const tw = g.measureText(angerText).width;
    const x0 = 490 - (tw + 46) / 2;
    g.drawImage(angerImg, x0 - 4, 442, 46, 46);
    g.fillText(angerText, x0 + 46 + tw / 2, 478);
  } else {
    g.fillText(angerText, 490, 478);
  }

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
  g.fillText(gameUrl().replace(/^https?:\/\//, '') || '來挑戰店長拿鐵吧！', W / 2, H - 52);
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
        toast('圖片已下載，文字已複製，留友看！');
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
