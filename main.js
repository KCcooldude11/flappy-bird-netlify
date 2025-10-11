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

// === Basalt spire renderer (stylized, darker) ===
const ROCK_DARK  = '#473b2a'; // deep brown
const ROCK_MID   = '#6b5942'; // mid brown
const ROCK_LIGHT = '#b39b79'; // highlight brown
const ROCK_RIM   = '#efe6d2'; // warm rim light (subtle)

const MOSS_DARK  = '#5f8a3e';
const MOSS_MID   = '#78a44f';
const MOSS_LIGHT = '#a8d080';

// Rock spire image (load once)
const spireImg = new Image();
spireImg.src = './assets/rock_spire.png';
let spireReady = false;
spireImg.onload = () => { spireReady = true; };


function n01(rng, k=1) { return (rng() + rng()*0.5)*k; }

function makeRNG(seed) {
  let s = Math.floor(seed * 1e9) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

// soft “noise” helper
function n01(rng, k=1) { return (rng() + rng()*0.5)*k; }

// Draw a spire column using the PNG, tiled vertically so it doesn't stretch.
function drawSpireSlice(x, y, w, h, orientation='up') {
  if (!spireReady) return;

  // Fit width exactly; keep aspect ratio
  const scale = w / spireImg.width;
  const unitH = spireImg.height * scale;         // height of one spire at this width
  const overlap = unitH * 0.25;                  // small overlap so seams aren’t obvious
  const step = unitH - overlap;

  if (orientation === 'up') {
    // bottom→up fill
    let drawn = 0;
    while (drawn < h) {
      const drawH = Math.min(unitH, h - drawn + overlap);
      const dy = y + drawn - (drawH - unitH);    // pull down a bit to hide seam
      // draw
      ctx.drawImage(spireImg, x, dy, w, drawH);
      drawn += step;
    }
  } else {
    // orientation 'down' (flip vertically), fill from top downward
    // Flip around the top edge
    ctx.save();
    ctx.translate(0, y);
    ctx.scale(1, -1); // vertical flip
    // After flip, we draw "up" starting at -0 space, so y becomes -h
    let drawn = 0;
    while (drawn < h) {
      const drawH = Math.min(unitH, h - drawn + overlap);
      const dy = -drawn - drawH + (unitH - drawH);  // compensate for seam
      ctx.drawImage(spireImg, x, dy, w, drawH);
      drawn += step;
    }
    ctx.restore();
  }
}

// Optional tint; use 'multiply' to darken or add moss tone without changing the sprite.
function tintRect(x, y, w, h, color, alpha=0.25, mode='multiply') {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = mode; // 'multiply' or 'overlay'
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Convenience: draw both top & bottom columns for a single pipe
function drawSpireColumns(x, topH, gapY, w, h, floorH) {
  // Top column (points downward into the gap)
  drawSpireSlice(x, 0, w, topH, 'down');
  // Bottom column (points upward into the gap)
  const bottomH = h - gapY - floorH;
  drawSpireSlice(x, gapY, w, bottomH, 'up');

  // Optional: add darker + mossy tints to match your palette
  // Darken slightly
  tintRect(x, 0, w, topH, '#2a1e1a', 0.18, 'multiply');
  tintRect(x, gapY, w, bottomH, '#2a1e1a', 0.18, 'multiply');
  // Moss at cap edges (thin green strip)
  tintRect(x, topH - 10, w, 12, '#6fa85b', 0.35, 'multiply'); // bottom edge of top spire
  tintRect(x, gapY - 2,  w, 12, '#6fa85b', 0.35, 'multiply'); // top edge of bottom spire
}





  // Bird images
  const birdIdle = new Image();
  birdIdle.src = './assets/Apple_Fly.png';
  const birdFlap = new Image();
  birdFlap.src = './assets/Apple_Regular.png';

  // DPI scaling for crispness
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  function resizeCanvas() {
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = cssW * DPR;
    canvas.height = cssH * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Game constants
  const W = () => (canvas.clientWidth || canvas.width / DPR);
  const H = () => (canvas.clientHeight || canvas.height / DPR);
  const GRAVITY = 1400;       // px/s^2
  const JUMP_VY = -420;       // px/s
  const PIPE_SPEED = 160;     // px/s
  const PIPE_GAP = 140;       // px
  const PIPE_INTERVAL = 1500; // ms
  const PIPE_WIDTH = 70;      // px
  const FLOOR_HEIGHT = 90;    // logical floor for collisions (we won't draw it)
  const DRAW_H = 100;                     // the bh you use to draw
  const DRAW_W = 100;                     // the bw you use to draw
  const COLLIDER_R = Math.min(DRAW_W, DRAW_H) * 0.20; // ~32px for 100
  // State
  let state = 'ready'; // ready | playing | gameover
  let bird = { x:120, y:200, vy:0, r: COLLIDER_R, rot:0, flapTimer:0 };
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
  bestEl.textContent = 'Best: ' + best;

  function resetGame() {
    bird.x = 120;
    bird.y = H()/2 - 80;
    bird.vy = 0;
    bird.rot = 0;
    bird.flapTimer = 0;
    pipes = [];
    lastPipeAt = 0;
    score = 0;
    scoreEl.textContent = '0';
  }

  function start() {
    resetGame();
    state = 'playing';
    overlay.classList.add('hide'); overlay.classList.remove('show');
    gameoverEl.classList.add('hide'); gameoverEl.classList.remove('show');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'gameover';
    if (score > best) {
      best = score;
      localStorage.setItem('flappy-best', String(best));
      bestEl.textContent = 'Best: ' + best;
    }
    gameoverEl.classList.remove('hide'); gameoverEl.classList.add('show');
  }

  function flap() {
    if (state === 'ready') start();
    if (state !== 'playing') return;
    bird.vy = JUMP_VY;
    bird.flapTimer = 450; // show flap image for 750ms
  }

  // Inputs
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'gameover') { start(); }
      else { flap(); }
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
  canvas.addEventListener('pointerup', () => { pointerDown = false; });

  btnPlay.addEventListener('click', start);
  btnTry.addEventListener('click', start);
  btnRestart.addEventListener('click', () => {
    if (state === 'playing' || state === 'gameover') { start(); }
  });

  // Pipe helpers
  function spawnPipePair() {
    const marginTop = 40;
    const marginBot = 40 + FLOOR_HEIGHT;
    const maxTop = H() - marginBot - PIPE_GAP - marginTop;
    const topY = marginTop + Math.random() * Math.max(40, maxTop);
    const x = W() + 40;
    pipes.push({
      x,
      topH: topY,
      gapY: topY + PIPE_GAP,
      scored: false,
      seed: Math.random(), // <-- add this
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
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.rot = Math.atan2(bird.vy, 300); // velocity-based lean

    if (bird.flapTimer > 0) bird.flapTimer -= dt*1000;

    // Pipes
    if (lastPipeAt <= 0) {
      spawnPipePair();
      lastPipeAt = PIPE_INTERVAL;
    } else {
      lastPipeAt -= dt*1000;
    }

    for (let p of pipes) {
      p.x -= PIPE_SPEED * dt;
    }
    while (pipes.length && pipes[0].x + PIPE_WIDTH < -40) {
      pipes.shift();
    }

    // Collision + scoring
    const floorY = H() - FLOOR_HEIGHT;

    if (bird.y + bird.r >= floorY || bird.y - bird.r <= 0) {
      return gameOver();
    }

    for (let p of pipes) {
      const topRect = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.topH };
      const botRect = { x: p.x, y: p.gapY, w: PIPE_WIDTH, h: H() - p.gapY - FLOOR_HEIGHT };

      if (circleRectOverlap(bird.x, bird.y, bird.r, topRect.x, topRect.y, topRect.w, topRect.h) ||
          circleRectOverlap(bird.x, bird.y, bird.r, botRect.x, botRect.y, botRect.w, botRect.h)) {
        return gameOver();
      }

      if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
        p.scored = true;
        score += 1;
        scoreEl.textContent = String(score);
      }
    }
  }

  function draw() {
    const w = W(), h = H();

    // --- Background (cover, no distortion) ---
    if (bgReady) {
      const scale = Math.max(w / bg.width, h / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);
    } else {
      // Fallback gradient until image loads
      const skyGrad = ctx.createLinearGradient(0,0,0,h);
      skyGrad.addColorStop(0, '#8fd0ff');
      skyGrad.addColorStop(1, '#bfe8ff');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0,0,w,h);
    }

    for (let p of pipes) {
  drawSpireColumns(p.x, p.topH, p.gapY, PIPE_WIDTH, h, FLOOR_HEIGHT);
}

    // Bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.45); // a bit less nose-down for big sprite
    const img = (bird.flapTimer > 0) ? birdFlap : birdIdle;
    const bw = 100, bh = 100; // your requested draw size
    ctx.drawImage(img, -bw/2, -bh/2, bw, bh);
    ctx.restore();

    // (Optional) Don't draw a floor so your art remains visible
    // If you want a visible ground, re-add the floor rectangles here.

    if (state === 'ready') {
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
