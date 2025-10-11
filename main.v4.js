(() => {
  // ========= Canvas & Context =========
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;

  // Block browser gestures inside the canvas (iOS/Android)
  ['touchstart','touchmove','touchend','touchcancel'].forEach(type => {
    canvas.addEventListener(type, e => e.preventDefault(), { passive: false });
  });
  canvas.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });

  document.addEventListener('DOMContentLoaded', () => {
    loadLeaderboard();
  });

  // ========= Assets =========
  const bg = new Image();
  bg.src = './assets/Untitled_Artwork.png';
  let bgReady = false;
  bg.onload = () => { bgReady = true; };

  const spireImg = new Image();
  spireImg.src = './assets/rock_spire.png';
  let spireReady = false;
  spireImg.onload = () => { spireReady = true; };

  const birdIdle = new Image();  birdIdle.src = './assets/Apple_Fly.png';
  const birdFlap = new Image();  birdFlap.src = './assets/Apple_Regular.png';

  // ========= Canvas DPI scaling =========
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  function resizeCanvas() {
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width  = cssW * DPR;
    canvas.height = cssH * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resizeCanvas();

  const W = () => (canvas.clientWidth  || canvas.width  / DPR);
  const H = () => (canvas.clientHeight || canvas.height / DPR);
  const BIRD_X = () => Math.round(W() * 0.5);

  // ========= Responsive scaling =========
  const BASE_H = 720;
  let S = 1;
  function recomputeScale() {
    S = H() / BASE_H;
    if (!Number.isFinite(S) || S <= 0) S = 1;
  }
  recomputeScale();

  window.addEventListener('resize', () => {
    resizeCanvas();
    recomputeScale();
    bird.x = BIRD_X();
    if (state !== 'playing') bird.y = Math.round(H()/2 - 80 * S);
  });

  // ========= Gameplay tunables =========
  const GRAVITY       = () => 1400 * S;
  const JUMP_VY       = () => -420 * S;
  const PIPE_SPEED    = () => 160  * S;
  const PIPE_GAP      = () => Math.round(160 * S);
  const PIPE_INTERVAL = 1500; // ms
  const PIPE_WIDTH    = () => Math.round(70  * S);
  const BIRD_W        = () => Math.round(100 * S);
  const BIRD_H        = () => Math.round(100 * S);
  const BIRD_R        = () => Math.round(Math.min(BIRD_W(), BIRD_H()) * 0.20);

  // ========= Stretch+Clip spire drawing =========
  // Horizontal bleed so edges don’t get cut off by the clip rect
  const BLEED_FRAC = 0.14; // try 0.12–0.18

  function drawSpireCover(x, y, w, h, orientation='up') {
    if (!spireReady || h <= 0 || w <= 0) return;

    const iw = spireImg.width, ih = spireImg.height;

    // widen the clip horizontally a bit
    const bleed = Math.ceil(Math.max(6 * S, w * BLEED_FRAC));
    const clipX = x - bleed;
    const clipW = w + bleed * 2;

    // cover-fit the image into the widened clip rect (no distortion)
    const s  = Math.max(clipW / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    const dx = clipX + (clipW - dw) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, y, clipW, h);
    ctx.clip();

    if (orientation === 'up') {
      // pillar that grows upward from bottom: anchor image to bottom
      const dy = y + h - dh;
      ctx.drawImage(spireImg, dx, dy, dw, dh);
    } else {
      // pillar that hangs down from top: flip vertically and anchor to top
      ctx.translate(0, y);
      ctx.scale(1, -1);
      const dy = -h;
      ctx.drawImage(spireImg, dx, dy, dw, dh);
    }

    ctx.restore();
  }

  // ========= Identity & leaderboard =========
  registerIdentityIfNeeded();
  const DEVICE_ID = ensureDeviceId();

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderLeaderboard(list){
    const wrap = document.getElementById('leaderboard-rows');
    if (!wrap) return;
    if (!Array.isArray(list) || list.length === 0){
      wrap.innerHTML = `<div style="opacity:.8">No scores yet.</div>`;
      return;
    }
    wrap.innerHTML = list.map((r, i) => `
      <div class="row">
        <span class="rank">${i+1}.</span>
        <span class="name">${escapeHtml(r.name ?? 'Player')}</span>
        <span class="score">${Number(r.score ?? 0)}</span>
      </div>
    `).join('');
  }

  async function postScore(deviceId, score, playMs) {
    try {
      const res = await fetch('/.netlify/functions/submit-score', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ deviceId, score, playMs })
      });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch('/.netlify/functions/get-leaderboard?limit=10');
      const { scores } = await res.json();
      renderLeaderboard(scores || []);
    } catch (e) {
      console.warn('leaderboard fetch error', e);
    }
  }

  function ensureDeviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('deviceId', id);
    }
    return id;
  }

  function getOrAskName() {
    let name = localStorage.getItem('playerName');
    if (!name) {
      name = (prompt('Choose a username (max 16):') || 'Guest').slice(0,16).trim();
      localStorage.setItem('playerName', name);
    }
    return name;
  }

  async function registerIdentityIfNeeded() {
    const deviceId = ensureDeviceId();
    let name = localStorage.getItem('playerName');
    if (!name) name = getOrAskName();
    try {
      await fetch('/.netlify/functions/register-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name })
      });
    } catch {}
    return { deviceId, name };
  }

  // ========= Game state =========
  let state = 'ready'; // ready | playing | gameover
  let bird = { x: BIRD_X(), y: Math.round(H()/2 - 80 * S), vy: 0, r: BIRD_R(), rot: 0, flapTimer: 0 };
  let pipes = [];
  let lastPipeAt = 0;
  let lastTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem('flappy-best') || 0);

  // UI elements
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const btnPlay = document.getElementById('btn-play');
  const btnTry = document.getElementById('btn-try');
  const btnRestart = document.getElementById('btn-restart');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  if (bestEl) bestEl.textContent = 'Best: ' + best;

  function resetGame() {
    bird.x = BIRD_X();
    bird.y = Math.round(H()/2 - 80 * S);
    bird.vy = 0;
    bird.rot = 0;
    bird.flapTimer = 0;
    bird.r = BIRD_R();
    pipes = [];
    lastPipeAt = 0;
    score = 0;
    if (scoreEl) scoreEl.textContent = '0';
  }

  function start() {
    resetGame();
    markRunStart();
    state = 'playing';
    if (overlay)   { overlay.classList.add('hide');   overlay.classList.remove('show'); }
    if (gameoverEl){ gameoverEl.classList.add('hide'); gameoverEl.classList.remove('show'); }
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // ========= Inputs =========
  function flap() {
    if (state === 'ready') start();
    if (state !== 'playing') return;
    bird.vy = JUMP_VY();
    bird.flapTimer = 300;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'gameover') start();
      else flap();
    } else if (e.code === 'Enter' && state === 'ready') {
      start();
    }
  });

  let pointerDown = false;
  function onTap() { if (state === 'gameover') start(); else flap(); }
  canvas.addEventListener('pointerdown', () => { pointerDown = true; onTap(); });
  canvas.addEventListener('pointerup',   () => { pointerDown = false; });

  if (btnPlay)    btnPlay.addEventListener('click', start);
  if (btnTry)     btnTry.addEventListener('click', start);
  if (btnRestart) btnRestart.addEventListener('click', () => {
    if (state === 'playing' || state === 'gameover') start();
  });

  // ========= Pipes =========
  function spawnPipePair() {
    const marginTop = Math.round(40 * S);
    const marginBot = Math.round(40 * S);
    const maxTop = H() - marginBot - PIPE_GAP() - marginTop;
    const topY = marginTop + Math.random() * Math.max(40 * S, maxTop);
    const x = W() + 40 * S;
    pipes.push({ x, topH: topY, gapY: topY + PIPE_GAP(), scored: false, seed: Math.random() });
  }

  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx*dx + dy*dy) < cr*cr;
  }

  // ========= Game over / scoring =========
  let runStartTime = 0;
  function markRunStart(){ runStartTime = performance.now(); }

  async function gameOver() {
    state = 'gameover';
    if (score > best) {
      best = score;
      localStorage.setItem('flappy-best', String(best));
      if (bestEl) bestEl.textContent = 'Best: ' + best;
    }
    if (gameoverEl) { gameoverEl.classList.remove('hide'); gameoverEl.classList.add('show'); }

    const playMs = Math.round(performance.now() - runStartTime);
    const result = await postScore(DEVICE_ID, score, playMs);
    if (result?.error) console.warn('submit-score error:', result.error);
    await loadLeaderboard();
  }

  // ========= Update =========
  function update(dt) {
    if (state !== 'playing') return;

    // Bird physics
    bird.vy += GRAVITY() * dt;
    bird.y  += bird.vy * dt;
    bird.rot = Math.atan2(bird.vy, 300);
    if (bird.flapTimer > 0) bird.flapTimer -= dt*1000;

    // Pipes
    if (lastPipeAt <= 0) { spawnPipePair(); lastPipeAt = PIPE_INTERVAL; }
    else { lastPipeAt -= dt*1000; }

    for (let p of pipes) p.x -= PIPE_SPEED() * dt;
    while (pipes.length && pipes[0].x + PIPE_WIDTH() < -40 * S) pipes.shift();

    // Collision + scoring
    const floorY = H();
    if (bird.y + bird.r >= floorY || bird.y - bird.r <= 0) return gameOver();

    // inset hitboxes so the visual bleed doesn't unfairly collide
    const hitInset = Math.ceil(Math.max(2 * S, PIPE_WIDTH() * (BLEED_FRAC * 0.6)));

    for (let p of pipes) {
      const topRect = { x: p.x + hitInset, y: 0,       w: PIPE_WIDTH() - hitInset*2, h: p.topH };
      const botRect = { x: p.x + hitInset, y: p.gapY,  w: PIPE_WIDTH() - hitInset*2, h: H() - p.gapY };

      if (circleRectOverlap(bird.x, bird.y, bird.r, topRect.x, topRect.y, topRect.w, topRect.h) ||
          circleRectOverlap(bird.x, bird.y, bird.r, botRect.x, botRect.y, botRect.w, botRect.h)) {
        return gameOver();
      }

      if (!p.scored && p.x + PIPE_WIDTH() < bird.x) {
        p.scored = true;
        score += 1;
        if (scoreEl) scoreEl.textContent = String(score);
      }
    }
  }

  // ========= Draw =========
  function draw() {
    const w = W(), h = H();

    // Background
    if (bgReady) {
      const scale = Math.max(w / bg.width, h / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);
    } else {
      const skyGrad = ctx.createLinearGradient(0,0,0,h);
      skyGrad.addColorStop(0, '#8fd0ff');
      skyGrad.addColorStop(1, '#bfe8ff');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0,0,w,h);
    }

    // Spires (stretch+clip)
    for (let p of pipes) {
      // top (hanging) spire
      drawSpireCover(p.x, 0, PIPE_WIDTH(), p.topH, 'down');

      // bottom (rising) spire
      const bottomH = H() - p.gapY;
      drawSpireCover(p.x, p.gapY, PIPE_WIDTH(), bottomH, 'up');
    }

    // Bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.45);
    const img = (bird.flapTimer > 0) ? birdFlap : birdIdle;
    ctx.drawImage(img, -BIRD_W()/2, -BIRD_H()/2, BIRD_W(), BIRD_H());
    ctx.restore();

    if (state === 'ready' && overlay) {
      overlay.classList.add('show');
      overlay.classList.remove('hide');
    }
  }

  // ========= Main loop =========
  function loop(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    if (state === 'playing') requestAnimationFrame(loop);
  }

  // Initial draw
  draw();
})();
