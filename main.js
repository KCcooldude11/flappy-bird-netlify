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

// --- Rock-spike rendering helpers (sandstone look) ---
const SAND_LIGHT  = '#e9ddc8';
const SAND_MID    = '#d8c7a8';
const SAND_SHADOW = '#cbb895';

// Tiny seeded RNG so each column keeps its shape frame-to-frame
function makeRNG(seed) {
  let s = Math.floor(seed * 1e9) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

// Build a jagged edge polygon along the “gap” side
function buildJaggedEdge(xStart, yStart, length, inward, teethCount, rng) {
  // returns an array of points [ {x,y}, ... ] from top→bottom (or bottom→top)
  const pts = [];
  const step = length / teethCount;
  for (let i = 0; i <= teethCount; i++) {
    const y = yStart + step * i;
    // varied tooth depth (2px–10px)
    const depth = inward * (4 + 6 * rng());
    // Alternate long/short for a more natural look
    const d = (i % 2 === 0) ? depth : depth * 0.45;
    pts.push({ x: xStart + d, y });
  }
  return pts;
}

function buildJaggedBottomEdge(x, y, w, inward, teethCount, rng) {
  // returns points left->right along a wavy edge pushed upward (negative inward)
  const pts = [];
  const step = w / teethCount;
  for (let i = 0; i <= teethCount; i++) {
    const xx = x + step * i;
    const depth = inward * (0.45 + 0.55 * rng());
    const d = (i % 2 === 0) ? depth : depth * 0.4;
    pts.push({ x: xx, y: y - d }); // edge pulled upward
  }
  return pts;
}

function drawSandstoneColumn(x, y, w, h, towardGap, rng) {
  // Base block (slightly rounded)
  const r = 8;
  ctx.fillStyle = SAND_MID;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + r, r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.arcTo(x,     y,     x + r, y, r);
  ctx.closePath();
  ctx.fill();

  // Light face overlay
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, SAND_LIGHT);
  grad.addColorStop(1, SAND_MID);
  ctx.fillStyle = grad;
  ctx.fillRect(x + 2, y + 2, w - 6, h - 6);

  // Jagged inner edge (toward the gap)
  const edgeX = towardGap === 'down' ? x : x; // using left edge as anchor
  const innerDir = (towardGap === 'down') ? 1 : 1; // positive = into gap
  const teeth = Math.max(6, Math.floor(h / 26));
  const pts = buildJaggedEdge(edgeX, y, h, innerDir * (w * 0.35), teeth, rng);

  ctx.beginPath();
  // Outer vertical edge (right side)
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  // bottom edge back to start of jagged
  ctx.lineTo(x, y + h);
  // jagged up along inner edge
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = SAND_SHADOW;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSandstoneBottom(x, y, w, h, rng) {
  // Bottom column: y..y+h, jagged TOP edge at y
  // Base block
  ctx.fillStyle = SAND_MID;
  ctx.fillRect(x, y, w, h);

  // Light face
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, SAND_MID);
  grad.addColorStop(1, SAND_LIGHT);
  ctx.fillStyle = grad;
  ctx.fillRect(x + 2, y + 4, w - 4, h - 6);

  // Jagged top shadow
  const teeth = Math.max(6, Math.floor(w / 18));
  const pts = buildJaggedBottomEdge(x, y, w, Math.min(18, w * 0.35), teeth, rng);

  ctx.beginPath();
  ctx.moveTo(x, y + h);           // bottom-left
  ctx.lineTo(x + w, y + h);       // bottom-right
  ctx.lineTo(x + w, y);           // up right
  // jagged along top from right->left
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(x, y + h);           // close
  ctx.closePath();
  ctx.fillStyle = SAND_SHADOW;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Draw both top and bottom “spike” columns
function drawRockColumns(x, topH, gapY, w, h, floorH, seed) {
  const rng = makeRNG(seed);

  // Top column (points downward into gap)
  drawSandstoneColumn(x, 0, w, topH, 'down', rng);

  // Bottom column (points upward into gap)
  const bottomH = h - gapY - floorH;
  drawSandstoneColumn(x, gapY, w, bottomH, 'up', rng);
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

    // Pipes
    for (let p of pipes) {
  drawRockColumns(p.x, p.topH, p.gapY, PIPE_WIDTH, h, FLOOR_HEIGHT, p.seed);
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
