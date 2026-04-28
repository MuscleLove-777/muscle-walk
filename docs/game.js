(() => {
'use strict';

// ===== Constants =====
const STEPS_PER_KO = 10;
const COMBO_WINDOW_MS = 3000;
const JUNK_TYPES = [
  { emoji: '🍕', name: 'Pizza', hp: 10 },
  { emoji: '🍔', name: 'Burger', hp: 12 },
  { emoji: '🍟', name: 'Fries', hp: 8 },
  { emoji: '🍩', name: 'Donut', hp: 9 },
  { emoji: '🍰', name: 'Cake', hp: 11 },
  { emoji: '🌭', name: 'HotDog', hp: 10 },
  { emoji: '🥤', name: 'Soda', hp: 7 },
  { emoji: '🍦', name: 'IceCream', hp: 8 },
];

// ===== State =====
const today = new Date().toISOString().slice(0, 10);
const LS_KEY = 'mlwalk_v1';
let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const s = {
      date: raw.date || today,
      todaySteps: raw.date === today ? (raw.todaySteps || 0) : 0,
      totalSteps: raw.totalSteps || 0,
      koCount: raw.date === today ? (raw.koCount || 0) : 0,
      totalKo: raw.totalKo || 0,
      bestCombo: raw.date === today ? (raw.bestCombo || 0) : 0,
      pendingDamage: raw.date === today ? (raw.pendingDamage || 0) : 0,
    };
    s.date = today;
    return s;
  } catch (e) {
    return { date: today, todaySteps: 0, totalSteps: 0, koCount: 0, totalKo: 0, bestCombo: 0, pendingDamage: 0 };
  }
}

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

// ===== UI refs =====
const $ = id => document.getElementById(id);
const todayEl = $('todaySteps'), koEl = $('koCount'), comboEl = $('comboCount');
const totalStepsEl = $('totalSteps'), totalKoEl = $('totalKo'), bestComboEl = $('bestCombo');
const startBtn = $('startBtn'), punchBtn = $('punchBtn'), burst10 = $('burst10'), burst100 = $('burst100');
const resetBtn = $('resetBtn'), comboFlash = $('comboFlash');

function refreshHUD() {
  todayEl.textContent = state.todaySteps.toLocaleString();
  koEl.textContent = state.koCount.toLocaleString();
  comboEl.textContent = 'x' + combo.count;
  totalStepsEl.textContent = state.totalSteps.toLocaleString();
  totalKoEl.textContent = state.totalKo.toLocaleString();
  bestComboEl.textContent = state.bestCombo.toLocaleString();
}

// ===== Combo =====
const combo = { count: 1, lastStepAt: 0, max: state.bestCombo };
function bumpCombo() {
  const now = Date.now();
  if (now - combo.lastStepAt < COMBO_WINDOW_MS) {
    combo.count = Math.min(combo.count + 1, 999);
  } else {
    combo.count = 1;
  }
  combo.lastStepAt = now;
  if (combo.count > combo.max) {
    combo.max = combo.count;
    state.bestCombo = combo.max;
  }
  if (combo.count > 1 && combo.count % 10 === 0) {
    flashCombo('COMBO x' + combo.count + '!');
  }
}
function flashCombo(text) {
  comboFlash.textContent = text;
  comboFlash.classList.add('show');
  setTimeout(() => comboFlash.classList.remove('show'), 600);
}

// ===== Canvas / Game world =====
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const girl = {
  x: 120, y: H - 180,
  punching: 0,    // frames
  bobPhase: 0,
  flashFrames: 0,
};
const enemies = [];
const particles = [];
const damageNumbers = [];

function spawnEnemy() {
  const t = JUNK_TYPES[Math.floor(Math.random() * JUNK_TYPES.length)];
  enemies.push({
    x: W + 60,
    y: H - 200 + Math.random() * 80,
    vx: -0.6 - Math.random() * 0.4,
    hp: t.hp,
    maxHp: t.hp,
    type: t,
    rot: 0,
    rotV: 0,
    dead: false,
    deadFrames: 0,
    size: 56 + Math.random() * 16,
  });
}
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 6 - 2,
      life: 30 + Math.random() * 20,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

// Apply pending damage to nearest enemy. Returns true if any KO happened.
function applyDamage(amount) {
  let koHappened = false;
  while (amount > 0) {
    let target = null;
    for (const e of enemies) {
      if (e.dead) continue;
      if (!target || e.x < target.x) target = e;
    }
    if (!target) break;
    const dealt = Math.min(amount, target.hp);
    target.hp -= dealt;
    amount -= dealt;
    girl.punching = 12;
    girl.flashFrames = 8;
    damageNumbers.push({ x: target.x, y: target.y - 20, text: '-' + dealt, life: 40, vy: -1 });
    spawnParticles(target.x - 20, target.y, '#ffeb3b', 4);
    if (target.hp <= 0) {
      target.dead = true;
      target.deadFrames = 30;
      target.rotV = (Math.random() - 0.5) * 0.4;
      koHappened = true;
      state.koCount++;
      state.totalKo++;
      spawnParticles(target.x, target.y, '#ff5252', 16);
      damageNumbers.push({ x: target.x, y: target.y - 50, text: 'KO!', life: 60, vy: -1.5, big: true });
    }
  }
  return koHappened;
}

function addStep(n) {
  for (let i = 0; i < n; i++) {
    state.todaySteps++;
    state.totalSteps++;
    state.pendingDamage++;
    bumpCombo();
  }
  // Apply pending: 1 step = 1 damage, combo multiplier
  const dmg = state.pendingDamage * Math.max(1, Math.floor(combo.count / 5));
  applyDamage(dmg);
  state.pendingDamage = 0;
  saveState();
  refreshHUD();
}

// ===== Step detection (DeviceMotion) =====
let motionActive = false;
let lastPeakAt = 0;
let smoothedMag = 9.8;
const PEAK_THRESHOLD = 2.6;     // m/s^2 above smoothed gravity
const MIN_STEP_INTERVAL_MS = 280;

function onMotion(ev) {
  const a = ev.accelerationIncludingGravity || ev.acceleration;
  if (!a || a.x == null) return;
  const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  smoothedMag = smoothedMag * 0.9 + mag * 0.1;
  const delta = mag - smoothedMag;
  const now = Date.now();
  if (delta > PEAK_THRESHOLD && now - lastPeakAt > MIN_STEP_INTERVAL_MS) {
    lastPeakAt = now;
    addStep(1);
  }
}

async function startMotion() {
  if (motionActive) {
    motionActive = false;
    window.removeEventListener('devicemotion', onMotion);
    startBtn.classList.remove('active');
    startBtn.textContent = '▶ START / 歩数センサー開始';
    return;
  }
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') { alert('センサー許可が必要です。手動ボタンで遊んでね。'); return; }
    }
    window.addEventListener('devicemotion', onMotion);
    motionActive = true;
    startBtn.classList.add('active');
    startBtn.textContent = '■ STOP (センサー稼働中)';
  } catch (e) {
    alert('このデバイスではセンサー使えません。手動ボタンで遊んでね。');
  }
}

// ===== Render =====
function drawBackground() {
  // Sky gradient handled by CSS bg, but we draw clouds + sun
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(W - 80, 80, 36, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const cx = (i * 200 + (Date.now() * 0.01) % 200) % (W + 100) - 50;
    drawCloud(cx, 60 + i * 18);
  }
  // Ground line
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, H * 0.65, W, 4);
}
function drawCloud(x, y) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.arc(x + 18, y - 6, 22, 0, Math.PI * 2);
  ctx.arc(x + 38, y, 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawGirl() {
  const bob = Math.sin(girl.bobPhase) * 4;
  const punch = girl.punching > 0 ? Math.sin((12 - girl.punching) / 12 * Math.PI) * 50 : 0;
  girl.bobPhase += 0.15;

  ctx.save();
  ctx.translate(girl.x, girl.y + bob);

  // Flash on hit
  if (girl.flashFrames > 0) {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 20;
    girl.flashFrames--;
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 130, 50, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body / leotard
  ctx.fillStyle = '#ff4081';
  ctx.beginPath();
  ctx.moveTo(-30, -20);
  ctx.lineTo(30, -20);
  ctx.lineTo(40, 50);
  ctx.lineTo(-40, 50);
  ctx.closePath();
  ctx.fill();

  // Skin: arms & legs
  ctx.fillStyle = '#f8c8a8';
  // Legs
  ctx.fillRect(-22, 50, 16, 70);
  ctx.fillRect(8, 50, 16, 70);
  // Right arm (punching)
  ctx.save();
  ctx.translate(28, -10);
  ctx.rotate(-0.2);
  ctx.fillRect(0, 0, 16 + punch, 22);
  // Bicep bump
  ctx.beginPath();
  ctx.arc(8, 11, 14, 0, Math.PI * 2);
  ctx.fill();
  // Fist
  ctx.fillStyle = '#e88c63';
  ctx.beginPath();
  ctx.arc(20 + punch, 11, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Left arm
  ctx.fillStyle = '#f8c8a8';
  ctx.save();
  ctx.translate(-44, -8);
  ctx.rotate(0.4);
  ctx.fillRect(0, 0, 14, 38);
  ctx.beginPath();
  ctx.arc(7, 12, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Head
  ctx.fillStyle = '#f8c8a8';
  ctx.beginPath();
  ctx.arc(0, -50, 28, 0, Math.PI * 2);
  ctx.fill();
  // Hair (high ponytail, sporty)
  ctx.fillStyle = '#3b2820';
  ctx.beginPath();
  ctx.arc(0, -62, 24, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-22, -70, 10, 22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-8, -50, 3, 0, Math.PI * 2);
  ctx.arc(10, -50, 3, 0, Math.PI * 2);
  ctx.fill();
  // Determined mouth
  ctx.strokeStyle = '#5c2a1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -38);
  ctx.lineTo(6, -38);
  ctx.stroke();
  // Headband
  ctx.fillStyle = '#e63946';
  ctx.fillRect(-26, -72, 52, 6);

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  ctx.font = e.size + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillText(e.type.emoji, 2, 4);
  ctx.fillStyle = '#fff';
  ctx.fillText(e.type.emoji, 0, 0);
  ctx.restore();

  // HP bar
  if (!e.dead) {
    const w = 50, h = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w/2, e.y - e.size/2 - 14, w, h);
    ctx.fillStyle = e.hp > e.maxHp * 0.4 ? '#4caf50' : '#e63946';
    ctx.fillRect(e.x - w/2, e.y - e.size/2 - 14, w * (e.hp / e.maxHp), h);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / 50);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawDamageNumbers() {
  for (const d of damageNumbers) {
    ctx.globalAlpha = Math.max(0, d.life / 60);
    ctx.font = (d.big ? 'bold 36px' : 'bold 22px') + ' system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = d.big ? '#ff5252' : '#ffeb3b';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(d.text, d.x, d.y);
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}

let lastSpawn = 0;
function update() {
  const now = Date.now();
  // Spawn new enemies
  const aliveCount = enemies.filter(e => !e.dead).length;
  if (now - lastSpawn > 1500 && aliveCount < 4) {
    spawnEnemy();
    lastSpawn = now;
  }
  // Move enemies
  for (const e of enemies) {
    if (e.dead) {
      e.deadFrames--;
      e.x += 4;
      e.y += 6;
      e.rot += e.rotV;
    } else {
      e.x += e.vx;
      e.rot = Math.sin(now * 0.005 + e.y) * 0.15;
      // If enemy reaches the girl, push them back (damage girl visually)
      if (e.x < girl.x + 40) {
        e.vx = Math.abs(e.vx) * 0.5;
        e.x = girl.x + 40;
      }
    }
  }
  // GC dead
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead && enemies[i].deadFrames <= 0) enemies.splice(i, 1);
    else if (enemies[i].x < -100) enemies.splice(i, 1);
  }
  // Particles
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  // Damage numbers
  for (const d of damageNumbers) { d.y += d.vy; d.life--; }
  for (let i = damageNumbers.length - 1; i >= 0; i--) if (damageNumbers[i].life <= 0) damageNumbers.splice(i, 1);
  // Punch frame
  if (girl.punching > 0) girl.punching--;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  // Enemies behind girl based on x
  enemies.sort((a, b) => a.y - b.y);
  for (const e of enemies) drawEnemy(e);
  drawGirl();
  drawParticles();
  drawDamageNumbers();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// ===== Wire UI =====
startBtn.addEventListener('click', startMotion);
punchBtn.addEventListener('click', () => addStep(1));
burst10.addEventListener('click', () => addStep(10));
burst100.addEventListener('click', () => addStep(100));
resetBtn.addEventListener('click', () => {
  if (confirm('今日の歩数とKOをリセットする？(累計は残ります)')) {
    state.todaySteps = 0; state.koCount = 0; state.bestCombo = 0;
    combo.count = 1; combo.max = 0;
    saveState(); refreshHUD();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); addStep(1); }
  if (e.code === 'Enter') { addStep(10); }
});

// Initial spawn
for (let i = 0; i < 2; i++) spawnEnemy();
refreshHUD();
loop();

// Expose for debug
window.__mlwalk = { state, addStep, enemies };

})();
