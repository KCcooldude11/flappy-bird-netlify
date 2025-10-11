(() => {
  // Canvas & Context
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Block browser gestures inside the canvas (iOS/Android)
  ['touchstart','touchmove','touchend','touchcancel'].forEach(type => {
    canvas.addEventListener(type, e => e.preventDefault(), { passive: false });
  });
  canvas.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });
  document.addEventListener('DOMContentLoaded', () => { loadLeaderboard(); });

  // --- Assets ---
  const bg = new Image();
  bg.src = './assets/Untitled_Artwork.png';
  let bgReady = false;
  bg.onload = () => { bgReady = true; };

  // New segmented spire art
  const SEG_SRC_TILE_H = 22; // source tile height in px (as you said)
  const segTile = new Image();         // ./assets/rock_spire_bottom.png
  const segCap  = new Image();         // ./assets/rock_spire_top.png
  segTile.src = './assets/rock_spire_bottom.png';
  segCap.src  = './assets/rock_spire_top.png';
  let segReady = { tile:false, cap:false };
  segTile.onload = () => segReady.tile = true;
  segCap.onload  = () => segReady.cap  = true;

  // Medallion art
  const medalImg = new Image();
  medalImg.src = './assets/medallion.png';
  let medalReady = false;
  medalImg.onload = () => { medalReady = true; };

  // ===== Skins queue =====
  const SKINS = [
    { name: 'Apple', idle: './assets/Apple_Fly.png',  flap: './assets/Apple_Regular.png' },
    { name: 'Comet', idle: './assets/Comet_Fly.png',  flap: './assets/Comet_Regular.png' }, // (optional until you add)
  ];
  for (const s of SKINS) {
    s.idleImg = new Image();
    s.flapImg = new Image();
    s.idleReady = false;
    s.flapReady = false;
    s.idleImg.onload = () => { s.idleReady = true; };
    s.flapImg.onload = () => { s.flapReady = true; };
    s.idleImg.onerror = () => { s.idleReady = false; };
    s.flapImg.onerror = () => { s.flapReady = false; };
    s.idleImg.src = s.idle;
    s.flapImg.src = s.flap;
  }
  const skinReady = (i) => !!(SKINS[i] && SKINS[i].idleReady && SKINS[i].flapReady);
  let currentSkinIndex = 0;
  for (let i = 0; i < SKINS.length; i++) { if (skinReady(i)) { currentSkinIndex = i; break; } }
  let currentIdleImg = SKINS[currentSkinIndex].idleImg;
  let currentFlapImg = SKINS[currentSkinIndex].flapImg;
  function switchToSkin(i) {
    if (!skinReady(i)) return false;
    currentSkinIndex = i;
    currentIdleImg = SKINS[i].idleImg;
    currentFlapImg = SKINS[i].flapImg;
    return true;
  }
  function nextSkin() {
    const start = (currentSkinIndex + 1) % SKINS.length;
    for (let k = 0; k < SKINS.length; k++) {
      const idx = (start + k) % SKINS.length;
      if (switchToSkin(idx)) return true;
    }
    return false;
  }

  // --- Spire collision tuning ---
  const HIT_INSET_X = () => Math.round(PIPE_WIDTH() * 0.14);
  const CAP_INSET_Y = () => Math.round(8 * S);

  // Player X (further left)
  const START_X_FRAC = 0.28;
  const BIRD_X = () => Math.round(W() * START_X_FRAC);

  // --- Canvas DPI scaling ---
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  function resizeCanvas() {
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width  = cssW * DPR;
    canvas.height = cssH * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resizeCanvas();

  // Helpers to read CSS pixel size of the canvas
  const W = () => (canvas.clientWidth  || canvas.width  / DPR);
  const H = () => (canvas.clientHeight || canvas.height / DPR);

  // ===== Responsive scaling =====
  const BASE_H = 720;
  let S = 1;
  function recomputeScale() {
    S = H() / BASE_H;
    if (!Number.isFinite(S) || S <= 0) S = 1;
  }
  recomputeScale();

  registerIdentityIfNeeded();
  const DEVICE_ID = ensureDeviceId();

  // Derived sizes/speeds as functions
  const GRAVITY       = () => 1200 * S;
  const JUMP_VY       = () => -420 * S;
  const PIPE_SPEED    = () => 160  * S;
  const PIPE_GAP      = () => Math.round(160 * S);
  const PIPE_INTERVAL = 1500;                 // ms
  const PIPE_WIDTH    = () => Math.round(70 * S);
  const BIRD_W        = () => Math.round(100 * S);
  const BIRD_H        = () => Math.round(100 * S);
  const BIRD_R        = () => Math.round(Math.min(BIRD_W(), BIRD_H()) * 0.20);

  // Recompute scale + canvas on resize
  window.addEventListener('resize', () => {
    resizeCanvas();
    recomputeScale();
    bird.x = BIRD_X();
    if (state !== 'playing') {
      bird.y = Math.round(H()/2 - 80 * S);
    }
  });

  // ===== Segmented spire helpers =====
  function segScaleX() {
    // scale by width so we don't distort aspect; use tile's source width
    if (!segReady.tile) return 1;
    return PIPE_WIDTH() / segTile.width;
  }
  function scaledHeights() {
    const sx = segScaleX();
    // Using the actual cap image height; tile is 22px in the source
    const tileH = Math.round(SEG_SRC_TILE_H * sx);
    const capH  = segReady.cap ? Math.round(segCap.height * sx) : 0;
    return { tileH, capH, sx };
  }

  // Quantize a desired spire height to N*tile + cap (never exceed desired)
  function quantizeSpireHeight(desiredH) {
    const { tileH, capH } = scaledHeights();
    if (tileH <= 0) return desiredH;
    const usable = Math.max(0, desiredH - capH);
    const n = Math.max(0, Math.floor(usable / tileH));
    return n * tileH + capH;
  }

  // Draw a segmented spire into (x, y, w, h)
  // orientation: 'up'   -> grows upward (bottom spire: stack from bottom, cap at top near the gap)
  //               'down' -> hangs downward (top spire: stack from top, cap at bottom near the gap)
  function drawSpireSegmented(x, y, w, h, orientation = 'up') {
    if (!segReady.tile) return;              // need tile at least
    if (w <= 0 || h <= 0) return;

    const { tileH, capH, sx } = scaledHeights();
    if (tileH <= 0) return;

    // Clip to the target rect so we never overdraw
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

    // number of tiles that fit with a cap
    const usable = Math.max(0, h - capH);
    const nTiles = Math.max(0, Math.floor(usable / tileH));

    // common draw helper
    function drawTile(dx, dy) {
      ctx.drawImage(segTile, dx, dy, Math.round(segTile.width * sx), tileH);
    }
    function drawCap(dx, dy) {
      if (!segReady.cap) return;
      ctx.drawImage(segCap, dx, dy, Math.round(segCap.width * sx), capH);
    }

    const drawW = Math.round(segTile.width * sx); // equals PIPE_WIDTH()
    const startX = Math.round(x);

    if (orientation === 'up') {
      // Start from bottom of rect, stack tiles upward, then cap at the top near the gap
      let cursorY = Math.round(y + h - tileH);
      for (let i = 0; i < nTiles; i++) {
        drawTile(startX, cursorY);
        cursorY -= tileH;
      }
      // place cap flush at top inside the rect
      const capY = Math.round(y);
      drawCap(startX, capY);
    } else {
      // orientation 'down' — start from top, stack tiles downward, cap at the bottom near the gap
      let cursorY = Math.round(y);
      for (let i = 0; i < nTiles; i++) {
        drawTile(startX, cursorY);
        cursorY += tileH;
      }
      // cap at the bottom inside the rect
      const capY = Math.round(y + h - capH);
      drawCap(startX, capY);
    }

    ctx.restore();
  }

  // ===== Game state =====
  let state = 'ready'; // ready | playing | gameover
  let bird  = { x: BIRD_X(), y: Math.round(H()/2 - 80 * S), vy: 0, r: BIRD_R(), rot: 0, flapTimer: 0 };
  let pipes = [];
  let lastPipeAt = 0;
  let lastTime = 0;
  let score = 0;
  let best  = Number(localStorage.getItem('flappy-best') || 0);

  // Medallions (column-based scheduling)
  let medallions = [];          // {x, y, size, r, taken}
  let columnsSpawned = 0;       // how many columns we've spawned
  let nextMedalColumn = 6;      // first medal between column 5 and 6

  // UI elements
  const overlay   = document.getElementById('overlay');
  const gameoverEl= document.getElementById('gameover');
  const btnPlay   = document.getElementById('btn-play');
  const btnTry    = document.getElementById('btn-try');
  const btnRestart= document.getElementById('btn-restart');
  const scoreEl   = document.getElementById('score');
  const bestEl    = document.getElementById('best');
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

    medallions = [];
    columnsSpawned = 0;
    nextMedalColumn = 6;

    if (!skinReady(currentSkinIndex)) {
      for (let i = 0; i < SKINS.length; i++) {
        if (skinReady(i)) { switchToSkin(i); break; }
      }
    }
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

  let runStartTime = 0;
  function markRunStart() { runStartTime = performance.now(); }

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

  function flap() {
    if (state === 'ready') start();
    if (state !== 'playing') return;
    bird.vy = JUMP_VY();
    bird.flapTimer = 300;
  }

  // Inputs
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
  function onTap() {
    if (state === 'gameover') start();
    else flap();
  }
  canvas.addEventListener('pointerdown', () => { pointerDown = true; onTap(); });
  canvas.addEventListener('pointerup',   () => { pointerDown = false; });

  if (btnPlay)    btnPlay.addEventListener('click', start);
  if (btnTry)     btnTry.addEventListener('click', start);
  if (btnRestart) btnRestart.addEventListener('click', () => {
    if (state === 'playing' || state === 'gameover') start();
  });

  // ===== Pipes (spires) + medallion spawn by column index =====
  function spawnPipePair() {
    const marginTop = Math.round(40 * S);
    const marginBot = Math.round(40 * S);
    const maxTop = H() - marginBot - PIPE_GAP() - marginTop;

    // Start with a continuous (float) topY…
    let topY = marginTop + Math.random() * Math.max(40 * S, maxTop);

    // …then quantize it so the drawn spires use whole 22px tiles + cap.
    // We quantize both the top spire height and the bottom spire height.
    if (segReady.tile) {
      // Top spire quantization:
      const qTop = quantizeSpireHeight(topY);
      // Bottom spire quantization (height below the gap):
      const desiredBottomH = H() - (qTop + PIPE_GAP());
      const qBottom = quantizeSpireHeight(desiredBottomH);
      // Recompute topY so that (qTop + PIPE_GAP + qBottom) fits exactly.
      // If images just loaded and numbers mismatch, clamp sanely.
      const total = qTop + PIPE_GAP() + qBottom;
      if (total <= H() - marginBot) {
        topY = qTop; // cleanly quantized
      } // else fall back to original topY (rare, only when margins extremely tight)
    }

    const x = W() + 40 * S;

    const prev = pipes[pipes.length - 1];
    const p = { x, topH: topY, gapY: topY + PIPE_GAP(), scored: false, seed: Math.random() };
    pipes.push(p);

    // Column counter
    columnsSpawned++;

    // Place a medallion between the previous and current column at specific indices
    if (columnsSpawned === nextMedalColumn && prev) {
      const mx = Math.round((prev.x + x) / 2);

      // Safe vertical inside previous gap, with a bit of jitter
      const gapTop = prev.topH;
      const gapBot = prev.gapY;
      const safeMargin = Math.round(0.2 * PIPE_GAP());
      const minY = gapTop + safeMargin;
      const maxY = gapBot - safeMargin;
      const centerY = (minY + maxY) / 2;
      const jitter = (Math.random() * 0.4 - 0.2) * (maxY - minY);
      const my = Math.round(centerY + jitter);

      const size = Math.max(68, Math.round(28 * S));
      medallions.push({ x: mx, y: my, size, r: Math.round(size * 0.42), taken: false });

      // Next one around every 10 columns with a small random offset (±2)
      nextMedalColumn += 10 + (Math.floor(Math.random() * 5) - 2);
    }
  }

  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx*dx + dy*dy) < cr*cr;
  }

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

    for (let p of pipes) { p.x -= PIPE_SPEED() * dt; }
    while (pipes.length && pipes[0].x + PIPE_WIDTH() < -40 * S) pipes.shift();

    // Collision + scoring
    const floorY = H();
    if (bird.y + bird.r >= floorY || bird.y - bird.r <= 0) {
      return gameOver();
    }

    for (let p of pipes) {
      const ix = HIT_INSET_X();
      const iy = CAP_INSET_Y();

      const topRect = {
        x: p.x + ix,
        y: 0,
        w: Math.max(0, PIPE_WIDTH() - ix * 2),
        h: Math.max(0, p.topH - iy)
      };
      const botRect = {
        x: p.x + ix,
        y: p.gapY + iy,
        w: Math.max(0, PIPE_WIDTH() - ix * 2),
        h: Math.max(0, H() - (p.gapY + iy))
      };

      if (circleRectOverlap(bird.x, bird.y, bird.r, topRect.x, topRect.y, topRect.w, topRect.h) ||
          circleRectOverlap(bird.x, bird.y, bird.r, botRect.x, botRect.y, botRect.w, botRect.h)) {
        return gameOver();
      }

      // Scoring: pass column
      if (!p.scored && p.x + PIPE_WIDTH() < bird.x) {
        p.scored = true;
        score += 1;
        if (scoreEl) scoreEl.textContent = String(score);
      }
    }

    // === Medallions: move, collide, cleanup ===
    if (medallions.length) {
      for (let m of medallions) {
        m.x -= PIPE_SPEED() * dt; // scroll with world
        const dx = bird.x - m.x;
        const dy = bird.y - m.y;
        const rr = (bird.r + m.r);
        if (!m.taken && (dx*dx + dy*dy) < rr*rr) {
          m.taken = true;           // vanish
          nextSkin();               // switch to next skin
        }
      }
      medallions = medallions.filter(m => !m.taken && (m.x + m.size) > -40*S);
    }
  }

  function draw() {
    const w = W(), h = H();

    // Background (smooth upscale)
    if (bgReady) {
      const scale = Math.max(w / bg.width, h / bg.height);
      const dw = bg.width  * scale;
      const dh = bg.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, dx, dy, dw, dh);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0, '#8fd0ff'); g.addColorStop(1, '#bfe8ff');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,w,h);
    }

    // Spires (segmented)
    for (let p of pipes) {
      // top spire (hangs down)
      drawSpireSegmented(p.x, 0, PIPE_WIDTH(), p.topH, 'down');
      // bottom spire (grows up)
      const bottomH = h - p.gapY;
      drawSpireSegmented(p.x, p.gapY, PIPE_WIDTH(), bottomH, 'up');
    }

    // Medallions
    if (medalReady && medallions.length) {
      for (let m of medallions) {
        const s = m.size;
        ctx.drawImage(medalImg, Math.round(m.x - s/2), Math.round(m.y - s/2), s, s);
      }
    }

    // Bird using current skin images
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.45);
    const img = (bird.flapTimer > 0) ? currentFlapImg : currentIdleImg;
    ctx.drawImage(img, -BIRD_W()/2, -BIRD_H()/2, BIRD_W(), BIRD_H());
    ctx.restore();

    if (state === 'ready' && overlay) {
      overlay.classList.add('show');
      overlay.classList.remove('hide');
    }
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    if (state === 'playing') requestAnimationFrame(loop);
  }

  // Initial draw
  draw();

  // ===== Leaderboard/helpers (unchanged) =====
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
  let runStartTime = 0;
  function markRunStart() { runStartTime = performance.now(); }
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
})();
