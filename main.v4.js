(() => {
  // ===== Canvas & Context =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Stop browser gestures over the canvas
  ['touchstart','touchmove','touchend','touchcancel'].forEach(type => {
    canvas.addEventListener(type, e => e.preventDefault(), { passive: false });
  });
  canvas.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });

  // ===== UI refs =====
  const overlay    = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const btnPlay    = document.getElementById('btn-play');
  const btnTry     = document.getElementById('btn-try');
  const btnRestart = document.getElementById('btn-restart');
  const scoreEl    = document.getElementById('score');
  const bestEl     = document.getElementById('best');

  // ===== Assets =====
  const bg = new Image(); bg.src = './assets/Untitled_Artwork.png';
  let bgReady = false; bg.onload = () => bgReady = true;

  const TOP_CAP_NUDGE = -3; 

  // Segmented spire art (tile + cap)
  const SEG_SRC_TILE_H = 22; // px in source
  const segTile = new Image(); segTile.src = './assets/rock_spire_bottom.png';
  const segCap  = new Image(); segCap.src  = './assets/rock_spire_top.png';
  const segReady = { tile:false, cap:false };
  segTile.onload = () => segReady.tile = true;
  segCap.onload  = () => segReady.cap  = true;

  // Medallion
  const medalImg = new Image(); medalImg.src = './assets/medallion.png';
  let medalReady = false; medalImg.onload = () => medalReady = true;

  // ===== Skins queue (pickup cycles to next) =====
  const SKINS = [
    { name:'Apple', idle:'./assets/Apple_Fly.png',  flap:'./assets/Apple_Regular.png' },
    { name:'Comet', idle:'./assets/Comet_Fly.png',  flap:'./assets/Comet_Regular.png' }, // add when ready
  ];
  for (const s of SKINS) {
    s.idleImg = new Image(); s.flapImg = new Image();
    s.idleReady = false; s.flapReady = false;
    s.idleImg.onload = () => s.idleReady = true;
    s.flapImg.onload = () => s.flapReady = true;
    s.idleImg.onerror = () => s.idleReady = false;
    s.flapImg.onerror = () => s.flapReady = false;
    s.idleImg.src = s.idle; s.flapImg.src = s.flap;
  }
  const skinReady = i => !!(SKINS[i] && SKINS[i].idleReady && SKINS[i].flapReady);
  let currentSkinIndex = 0;
  for (let i = 0; i < SKINS.length; i++) if (skinReady(i)) { currentSkinIndex = i; break; }
  let currentIdleImg = SKINS[currentSkinIndex].idleImg;
  let currentFlapImg = SKINS[currentSkinIndex].flapImg;
  function switchToSkin(i){
    if (!skinReady(i)) return false;
    currentSkinIndex = i;
    currentIdleImg = SKINS[i].idleImg; currentFlapImg = SKINS[i].flapImg;
    return true;
  }
  function nextSkin(){
    const start = (currentSkinIndex + 1) % SKINS.length;
    for (let k = 0; k < SKINS.length; k++){
      const idx = (start + k) % SKINS.length;
      if (switchToSkin(idx)) return true;
    }
    return false;
  }

  // ===== Sizing / physics =====
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  function resizeCanvas(){
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = cssW * DPR; canvas.height = cssH * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resizeCanvas();

  const W = () => (canvas.clientWidth  || canvas.width  / DPR);
  const H = () => (canvas.clientHeight || canvas.height / DPR);

  const BASE_H = 720; let S = 1;
  function recomputeScale(){ S = H() / BASE_H; if (!Number.isFinite(S) || S <= 0) S = 1; }
  recomputeScale();

  const START_X_FRAC = 0.28; // start further left
  const BIRD_X   = () => Math.round(W() * START_X_FRAC);
  const GRAVITY  = () => 1200 * S;
  const JUMP_VY  = () => -420  * S;
  const PIPE_SPEED = () => 160 * S;
  const PIPE_GAP   = () => Math.round(160 * S);
  const PIPE_INTERVAL = 1500; // ms
  const PIPE_WIDTH = () => Math.round(70 * S);
  const BIRD_W = () => Math.round(100 * S);
  const BIRD_H = () => Math.round(100 * S);
  const BIRD_R = () => Math.round(Math.min(BIRD_W(), BIRD_H()) * 0.20);

  // Collision tuning
  const HIT_INSET_X = () => Math.round(PIPE_WIDTH() * 0.14);
  const CAP_INSET_Y = () => Math.round(8 * S);

  window.addEventListener('resize', () => {
    resizeCanvas(); recomputeScale();
    bird.x = BIRD_X();
    if (state !== 'playing') bird.y = Math.round(H()/2 - 80*S);
  });

  // ===== Segmented spire helpers =====
  function segScaleX() {
    // scale by width so aspect of art is preserved
    if (!segTile.width) return 1;
    return PIPE_WIDTH() / segTile.width;
  }

  // return *float* heights to avoid cumulative rounding seams
  function scaledHeightsF() {
    const sx = segScaleX();
    const tileH = SEG_SRC_TILE_H * sx;                  // float
    const capH  = (segCap.height || 0) * sx;            // float
    return { tileH, capH, sx };
  }

  // keep the “quantize to tiles + cap” behavior using float math
  function quantizeSpireHeight(desiredH) {
    const { tileH, capH } = scaledHeightsF();
    if (tileH <= 0) return desiredH;
    const usable = Math.max(0, desiredH - capH);
    const n = Math.max(0, Math.floor(usable / tileH + 1e-6));
    return n * tileH + capH;
  }

  function drawStackUp(x, y, w, h) {
    const { tileH, capH, sx } = scaledHeightsF();
    if (!segReady.tile || tileH <= 0 || w <= 0 || h <= 0) return;

    const overlap = 1;
    const drawW = segTile.width * sx;
    const capY  = y + capNudgeY;

    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.imageSmoothingEnabled = false;

    // fill from bottom up, slightly overlapping so seams disappear
    let cursorY = y + h - tileH;
    const limit = capY + capH - overlap;
    while (cursorY + tileH > limit) {
      ctx.drawImage(segTile, x, cursorY, drawW, tileH);
      cursorY -= (tileH - overlap);
    }

    if (segReady.cap) ctx.drawImage(segCap, x, capY, drawW, capH);
    ctx.restore();
  }

  // orientation: 'up' grows upward; 'down' is a 180° flip of the rect (top spire)
  function drawSpireSegmented(x, y, w, h, orientation = 'up') {
    if (orientation === 'up') {
      drawStackUp(x, y, w, h, 0);
    } else {
      // flip the rect, but nudge the cap upward toward the gap
      ctx.save();
      ctx.translate(x + w, y + h);
      ctx.scale(-1, -1);
      drawStackUp(0, 0, w, h, TOP_CAP_NUDGE);
      ctx.restore();
    }
  }
  // ===== Leaderboard / identity =====
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function renderLeaderboard(list){
    const wrap = document.getElementById('leaderboard-rows'); if (!wrap) return;
    if (!Array.isArray(list) || list.length === 0){ wrap.innerHTML = `<div style="opacity:.8">No scores yet.</div>`; return; }
    wrap.innerHTML = list.map((r,i)=>`
      <div class="row">
        <span class="rank">${i+1}.</span>
        <span class="name">${escapeHtml(r.name ?? 'Player')}</span>
        <span class="score">${Number(r.score ?? 0)}</span>
      </div>`).join('');
  }
  async function postScore(deviceId, score, playMs){
    try {
      const res = await fetch('/.netlify/functions/submit-score', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ deviceId, score, playMs })
      });
      return await res.json();
    } catch(e){ return { error: e.message }; }
  }
  async function loadLeaderboard(){
    try {
      const res = await fetch('/.netlify/functions/get-leaderboard?limit=10');
      const { scores } = await res.json();
      renderLeaderboard(scores || []);
    } catch(e){ console.warn('leaderboard fetch error', e); }
  }
  document.addEventListener('DOMContentLoaded', loadLeaderboard);

  function ensureDeviceId(){
    let id = localStorage.getItem('deviceId');
    if (!id){ id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
    return id;
  }
  function getOrAskName(){
    let name = localStorage.getItem('playerName');
    if (!name){ name = (prompt('Choose a username (max 16):') || 'Guest').slice(0,16).trim(); localStorage.setItem('playerName', name); }
    return name;
  }
  async function registerIdentityIfNeeded(){
    const deviceId = ensureDeviceId(); let name = localStorage.getItem('playerName');
    if (!name) name = getOrAskName();
    try {
      await fetch('/.netlify/functions/register-identity', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ deviceId, name })
      });
    } catch {}
    return { deviceId, name };
  }
  registerIdentityIfNeeded();
  const DEVICE_ID = ensureDeviceId();

  // ===== Game state =====
  let state = 'ready'; // ready | playing | gameover
  let bird  = { x:BIRD_X(), y:Math.round(H()/2 - 80*S), vy:0, r:BIRD_R(), rot:0, flapTimer:0 };
  let pipes = [];
  let lastPipeAt = 0;
  let lastTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem('flappy-best') || 0);
  if (bestEl) bestEl.textContent = 'Best: ' + best;

  // Medallions
  let medallions = []; // {x,y,size,r,taken}
  let columnsSpawned = 0;
  let nextMedalColumn = 6;

  // ===== Core helpers =====
  function resetGame(){
    bird.x = BIRD_X(); bird.y = Math.round(H()/2 - 80*S);
    bird.vy = 0; bird.rot = 0; bird.flapTimer = 0; bird.r = BIRD_R();
    pipes = []; lastPipeAt = 0; score = 0;
    if (scoreEl) scoreEl.textContent = '0';
    medallions = []; columnsSpawned = 0; nextMedalColumn = 6;
    if (!skinReady(currentSkinIndex)){
      for (let i=0;i<SKINS.length;i++) if (skinReady(i)){ switchToSkin(i); break; }
    }
  }

  let runStartTime = 0;
  function markRunStart(){ runStartTime = performance.now(); }

  function start(){
    resetGame(); markRunStart();
    state = 'playing';
    overlay?.classList.add('hide'); overlay?.classList.remove('show');
    gameoverEl?.classList.add('hide'); gameoverEl?.classList.remove('show');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  async function gameOver(){
    state = 'gameover';
    if (score > best){ best = score; localStorage.setItem('flappy-best', String(best)); bestEl && (bestEl.textContent = 'Best: ' + best); }
    gameoverEl?.classList.remove('hide'); gameoverEl?.classList.add('show');
    const playMs = Math.round(performance.now() - runStartTime);
    const result = await postScore(DEVICE_ID, score, playMs);
    if (result?.error) console.warn('submit-score error:', result.error);
    await loadLeaderboard();
  }

  function flap(){
    if (state === 'ready'){ start(); return; }
    if (state !== 'playing') return;
    bird.vy = JUMP_VY(); bird.flapTimer = 300;
  }

  // ===== Input =====
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp'){
      e.preventDefault();
      if (state === 'ready' || state === 'gameover') start(); else flap();
    } else if (e.code === 'Enter' && state !== 'playing'){
      start();
    }
  });
  const onTap = () => { if (state === 'ready' || state === 'gameover') start(); else flap(); };
  canvas.addEventListener('pointerdown', onTap);
  btnPlay?.addEventListener('click', (e)=>{ e.preventDefault(); start(); });
  btnTry?.addEventListener('click', (e)=>{ e.preventDefault(); start(); });
  btnRestart?.addEventListener('click', (e)=>{ e.preventDefault(); start(); });
  overlay?.addEventListener('click', (e)=>{ if (state !== 'playing') { e.preventDefault(); start(); } });

  // ===== Pipes / medallions =====
  function spawnPipePair(){
    const marginTop = Math.round(40*S), marginBot = Math.round(40*S);
    const maxTop = H() - marginBot - PIPE_GAP() - marginTop;

    let topY = marginTop + Math.random() * Math.max(40*S, maxTop);

    // Quantize to tile+cap heights so stacks look clean
    if (segReady.tile){
      const qTop = quantizeSpireHeight(topY);
      const desiredBottomH = H() - (qTop + PIPE_GAP());
      const qBottom = quantizeSpireHeight(desiredBottomH);
      const total = qTop + PIPE_GAP() + qBottom;
      if (total <= H() - marginBot) topY = qTop;
    }

    const x = W() + 40*S;
    const prev = pipes[pipes.length - 1];
    const p = { x, topH: topY, gapY: topY + PIPE_GAP(), scored:false };
    pipes.push(p);

    columnsSpawned++;

    if (columnsSpawned === nextMedalColumn && prev){
      const mx = Math.round((prev.x + x) / 2);
      const gapTop = prev.topH, gapBot = prev.gapY;
      const safeMargin = Math.round(0.2 * PIPE_GAP());
      const minY = gapTop + safeMargin, maxY = gapBot - safeMargin;
      const centerY = (minY + maxY) / 2;
      const jitter = (Math.random() * 0.4 - 0.2) * (maxY - minY);
      const my = Math.round(centerY + jitter);
      const size = Math.max(68, Math.round(28*S));
      medallions.push({ x:mx, y:my, size, r:Math.round(size*0.42), taken:false });
      nextMedalColumn += 10 + (Math.floor(Math.random()*5) - 2);
    }
  }

  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return (dx*dx + dy*dy) < cr*cr;
  }

  // ===== Update / Draw / Loop =====
  function update(dt){
    if (state !== 'playing') return;

    bird.vy += GRAVITY() * dt;
    bird.y  += bird.vy * dt;
    bird.rot = Math.atan2(bird.vy, 300);
    if (bird.flapTimer > 0) bird.flapTimer -= dt*1000;

    if (lastPipeAt <= 0){ spawnPipePair(); lastPipeAt = PIPE_INTERVAL; }
    else { lastPipeAt -= dt*1000; }

    for (let p of pipes) p.x -= PIPE_SPEED() * dt;
    while (pipes.length && pipes[0].x + PIPE_WIDTH() < -40*S) pipes.shift();

    // World bounds
    if (bird.y + bird.r >= H() || bird.y - bird.r <= 0) return gameOver();

    // Pipe collisions + scoring
    for (let p of pipes){
      const ix = HIT_INSET_X(), iy = CAP_INSET_Y();
      const topRect = { x:p.x + ix, y:0,           w:Math.max(0, PIPE_WIDTH()-ix*2), h:Math.max(0, p.topH - iy) };
      const botRect = { x:p.x + ix, y:p.gapY + iy, w:Math.max(0, PIPE_WIDTH()-ix*2), h:Math.max(0, H() - (p.gapY + iy)) };

      if (circleRectOverlap(bird.x, bird.y, bird.r, topRect.x, topRect.y, topRect.w, topRect.h) ||
          circleRectOverlap(bird.x, bird.y, bird.r, botRect.x, botRect.y, botRect.w, botRect.h)){
        return gameOver();
      }

      if (!p.scored && p.x + PIPE_WIDTH() < bird.x){
        p.scored = true; score += 1; if (scoreEl) scoreEl.textContent = String(score);
      }
    }

    // Medallions
    if (medallions.length){
      for (let m of medallions){
        m.x -= PIPE_SPEED() * dt;
        const dx = bird.x - m.x, dy = bird.y - m.y, rr = bird.r + m.r;
        if (!m.taken && (dx*dx + dy*dy) < rr*rr){ m.taken = true; nextSkin(); }
      }
      medallions = medallions.filter(m => !m.taken && (m.x + m.size) > -40*S);
    }
  }

  function draw(){
    const w = W(), h = H();

    // Background
    if (bgReady){
      const scale = Math.max(w / bg.width, h / bg.height);
      const dw = bg.width * scale, dh = bg.height * scale;
      const dx = (w - dw)/2, dy = (h - dh)/2;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, dx, dy, dw, dh); ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0, '#8fd0ff'); g.addColorStop(1, '#bfe8ff');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    }

    // Spires
    for (let p of pipes){
      drawSpireSegmented(p.x, 0, PIPE_WIDTH(), p.topH, 'down');         // top (hanging)
      drawSpireSegmented(p.x, p.gapY, PIPE_WIDTH(), h - p.gapY, 'up');  // bottom (growing)
    }

    // Medallions
        // Medallions (preserve original aspect ratio; m.size = target height)
    if (medalReady && medallions.length){
      const aspect = medalImg.width / medalImg.height; // width / height
      for (let m of medallions){
        const hpx = m.size;
        const wpx = Math.round(hpx * aspect);
        const dx = Math.round(m.x - wpx / 2);
        const dy = Math.round(m.y - hpx / 2);
        ctx.drawImage(medalImg, dx, dy, wpx, hpx);
      }
    }


    // Bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.45);
    const img = (bird.flapTimer > 0) ? currentFlapImg : currentIdleImg;
    ctx.drawImage(img, -BIRD_W()/2, -BIRD_H()/2, BIRD_W(), BIRD_H());
    ctx.restore();

    if (state === 'ready'){ overlay?.classList.add('show'); overlay?.classList.remove('hide'); }
  }

  function loop(t){
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    if (state === 'playing') requestAnimationFrame(loop);
  }

  // First paint
  draw();
})();
