(() => {
  // Canvas & Context
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // --- Assets ---
  // Background image (load once)
  const bg = new Image();
  bg.src = './assets/Untitled_Artwork.png'; // change if you rename it
  let bgReady = false;
  bg.onload = () => { bgReady = true; };

  // Rock spire image (one tall asset)
  const spireImg = new Image();
  spireImg.src = './assets/rock_spire.png';
  let spireReady = false;
  spireImg.onload = () => { spireReady = true; };

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
  // Tune BASE_H to change overall difficulty/feel globally.
  const BASE_H = 720;         // "design" height we based the old numbers on
  let S = 1;                  // global scale factor
  function recomputeScale() {
    S = H() / BASE_H;
    if (!Number.isFinite(S) || S <= 0) S = 1;
  }
  recomputeScale();

  // Derived sizes/speeds as functions (so they update when S changes)
  const GRAVITY      = () => 1400 * S;               // px/s^2
  const JUMP_VY      = () => -420 * S;               // px/s
  const PIPE_SPEED   = () => 160  * S;               // px/s
  const PIPE_GAP     = () => Math.round(160 * S);    // px
  const PIPE_INTERVAL = 1500;                        // ms (keep time constant)
  const PIPE_WIDTH   = () => Math.round(70  * S);    // px
  const FLOOR_HEIGHT = () => Math.round(90  * S);    // px
  const BIRD_W       = () => Math.round(100 * S);
  const BIRD_H       = () => Math.round(100 * S);
  const BIRD_R       = () => Math.round(Math.min(BIRD_W(), BIRD_H()) * 0.20);

  // Recompute scale + canvas on resize
  window.addEventListener('resize', () => {
    resizeCanvas();
    recomputeScale();
    // Optionally: restart a running game to avoid weird mid-flight resizes:
    // if (state === 'playing') start();
  });

  // ===== Spire drawing (cover + clip, no tiling) =====
  function drawSpireCover(x, y, w, h, orientation='up') {
    if (!spireReady) return;

    const iw = spireImg.width, ih = spireImg.height;
    const s  = Math.max(w / iw, h / ih); // cover
    const dw = iw * s;
    const dh = ih * s;
    const dx = x + (w - dw) / 2;         // center horizontally

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    if (orientation === 'up') {
      const dy = y + h - dh;             // anchor bottom
      ctx.drawImage(spireImg, dx, dy, dw, dh);
    } else {
      ctx.translate(0, y);
      ctx.scale(1, -1);
      const dy = -h;                      // anchor top in flipped space
      ctx.drawImage(spireImg, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // ===== Bird images =====
  const birdIdle = new Image();
  birdIdle.src = './assets/Apple_Fly.png';
  const birdFlap = new Image();
  birdFlap.src = './assets/Apple_Regular.png';

  // ===== Game state =====
  let state = 'ready'; // ready | playing | gameover
  let bird = { x: Math.round(120 * S), y: Math.round(H()/2 - 80 * S), vy: 0, r: BIRD_R(), rot: 0, flapTimer: 0 };
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
    bird.x = Math.round(120 * S);
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
    state = 'playing';
    if (overlay)   { overlay.classList.add('hide');   overlay.classList.remove('show'); }
    if (gameoverEl){ gameoverEl.classList.add('hide'); gameoverEl.classList.remove('show'); }
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'gameover';
    if (score > best) {
      best = score;
      localStorage.setItem('flappy-best', String(best));
      if (bestEl) bestEl.textContent = 'Best: ' + best;
    }
    if (gameoverEl){ gameoverEl.classList.remove('hide'); gameoverEl.classList.add('show'); }
  }

  function flap() {
    if (state === 'ready') start();
    if (state !== 'playing') return;
    bird.vy = JUMP_VY();
    bird.flapTimer = 450;
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

  // ===== Pipes (spires) =====
  function spawnPipePair() {
    const marginTop = Math.round(40 * S);
    const marginBot = Math.round(40 * S) + FLOOR_HEIGHT();
    const maxTop = H() - marginBot - PIPE_GAP() - marginTop;
    const topY = marginTop + Math.random() * Math.max(40 * S, maxTop);
    const x = W() + 40 * S;
    pipes.push({
      x,
      topH: topY,
      gapY: topY + PIPE_GAP(),
      scored: false,
      seed: Math.random(),
    });
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

    while (pipes.length && pipes[0].x + PIPE_WIDTH() < -40 * S) {
      pipes.shift();
    }

    // Collision + scoring
    const floorY = H() - FLOOR_HEIGHT();

    if (bird.y + bird.r >= floorY || bird.y - bird.r <= 0) {
      return gameOver();
    }

    for (let p of pipes) {
      const topRect = { x: p.x, y: 0, w: PIPE_WIDTH(), h: p.topH };
      const botRect = { x: p.x, y: p.gapY, w: PIPE_WIDTH(), h: H() - p.gapY - FLOOR_HEIGHT() };

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

  function draw() {
    const w = W(), h = H();

    // Background (cover, no distortion)
    if (bgReady) {
      const scale = Math.max(w / bg.width, h / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);
    } else {
      // fallback gradient
      const skyGrad = ctx.createLinearGradient(0,0,0,h);
      skyGrad.addColorStop(0, '#8fd0ff');
      skyGrad.addColorStop(1, '#bfe8ff');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0,0,w,h);
    }

    // Spires (pipes)
    for (let p of pipes) {
      // top spire (hangs down)
      drawSpireCover(p.x, 0, PIPE_WIDTH(), p.topH, 'down');

      // bottom spire (rises from gap)
      const bottomH = H() - p.gapY - FLOOR_HEIGHT();
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
