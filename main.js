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

function n01(rng, k=1) { return (rng() + rng()*0.5)*k; }

function makeRNG(seed) {
  let s = Math.floor(seed * 1e9) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

// soft “noise” helper
function n01(rng, k=1) { return (rng() + rng()*0.5)*k; }


function drawMossStrip(x, y, w, thickness, orientation, rng) {
  // orientation: 'top' (bottom column cap) or 'bottom' (top column cap)
  const steps = Math.max(8, Math.floor(w / 18));
  const pts = [];
  const base = thickness;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const xx = x + w * t;
    // wavy height + a few dangling drips
    const wave = Math.sin(t * Math.PI * 2 + rng()*0.6) * 2 + (rng()-0.5)*2;
    const drip = (rng() < 0.18) ? (4 + rng()*12) : 0;
    const h = base + wave + drip;

    // top cap sits *above* y, bottom cap sits *below* y
    const yy = (orientation === 'top') ? (y - h) : (y + h);
    pts.push({ x: xx, y: yy });
  }

  // fill
  const grad = ctx.createLinearGradient(x, y, x, (orientation === 'top') ? (y - base) : (y + base));
  grad.addColorStop(0, MOSS_MID);
  grad.addColorStop(1, MOSS_LIGHT);
  ctx.fillStyle = grad;

  ctx.beginPath();
  if (orientation === 'top') {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
  } else {
    ctx.moveTo(x, y);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(x + w, y);
  }
  ctx.closePath();
  ctx.fill();

  // moss edge highlight
  ctx.strokeStyle = MOSS_DARK;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// silhouette for a spire: slight waist + cap bulge toward the gap
function buildVerticalProfile(x, y, w, h, towardGap, rng) {
  const steps = Math.max(10, Math.floor(h / 36));
  const left  = [], right = [];
  const waist = 0.88 + 0.04 * n01(rng);
  const belly = 1.06 + 0.05 * n01(rng);
  const capH  = Math.min(28, Math.max(16, h * 0.18));
  const capAtTop = (towardGap === 'down');

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const yy = y + h * t;
    const tFromCap = capAtTop ? t : (1 - t);
    const capBoost = Math.max(0, 1 - (tFromCap * h) / capH);
    const waistShape = 1 - 0.12 * Math.sin(Math.PI * t) + 0.02 * Math.sin(4*Math.PI*t);
    const base = w * (0.95 * waistShape * (waist + 0.02 * n01(rng)));
    const extra = (w * 0.12) * Math.pow(capBoost, 1.2);
    const total = Math.min(w, Math.max(w*0.72, base + extra));
    const jitter = (n01(rng)-0.5) * 3;
    const half = total * 0.5;
    left.push({ x: x + (w * 0.5 - half) + jitter, y: yy });
    right.push({ x: x + (w * 0.5 + half) + jitter, y: yy });
  }
  return { left, right };
}

function drawStrata(x, y, w, h, rng) {
  const lines = Math.max(6, Math.floor(h / 28));
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = ROCK_LIGHT;
  ctx.lineWidth = 2;
  for (let i = 0; i < lines; i++) {
    const yy = y + (h * (i + 1) / (lines + 1)) + (rng()-0.5)*2.5;
    ctx.beginPath();
    const wiggles = 6;
    for (let j = 0; j <= wiggles; j++) {
      const xx = x + (w * j / wiggles);
      const off = Math.sin((j + rng()*0.5) * 1.8) * 1.6;
      if (j === 0) ctx.moveTo(xx, yy + off); else ctx.lineTo(xx, yy + off);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBasaltTop(x, y, w, h, rng) {
  const { left, right } = buildVerticalProfile(x, y, w, h, 'down', rng);

  // base silhouette
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = ROCK_MID;
  ctx.fill();

  // warm vertical gradient
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, ROCK_LIGHT);
  grad.addColorStop(0.5, ROCK_MID);
  grad.addColorStop(1, ROCK_DARK);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.globalAlpha = 1;

  // rim light near cap
  ctx.beginPath();
  for (let i = right.length - 1; i >= Math.floor(right.length*0.75); i--) {
    const p = right[i];
    if (i === right.length - 1) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  for (let i = Math.floor(left.length*0.25); i < left.length; i++) {
    const p = left[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = ROCK_RIM;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // strata
  const topY = y, botY = y + h;
  const minX = Math.min(...left.map(p => p.x), ...right.map(p => p.x));
  const maxX = Math.max(...left.map(p => p.x), ...right.map(p => p.x));
  drawStrata(minX+6, topY+6, (maxX-minX)-12, (botY-topY)-12, rng);

  // MOSS on the bottom cap edge
  drawMossStrip(minX+4, y + h, (maxX-minX)-8, 12, 'bottom', rng);
}

function drawBasaltBottom(x, y, w, h, rng) {
  const { left, right } = buildVerticalProfile(x, y, w, h, 'up', rng);

  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = ROCK_MID;
  ctx.fill();

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, ROCK_DARK);
  grad.addColorStop(0.5, ROCK_MID);
  grad.addColorStop(1, ROCK_LIGHT);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.globalAlpha = 1;

  // rim light near cap
  ctx.beginPath();
  for (let i = 0; i <= Math.floor(right.length*0.25); i++) {
    const p = right[i];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  for (let i = left.length - 1; i >= Math.floor(left.length*0.75); i--) {
    const p = left[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = ROCK_RIM;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const topY = y, botY = y + h;
  const minX = Math.min(...left.map(p => p.x), ...right.map(p => p.x));
  const maxX = Math.max(...left.map(p => p.x), ...right.map(p => p.x));
  drawStrata(minX+6, topY+6, (maxX-minX)-12, (botY-topY)-12, rng);

  // MOSS on the top cap edge
  drawMossStrip(minX+4, y, (maxX-minX)-8, 12, 'top', rng);
}

function drawBasaltColumns(x, topH, gapY, w, h, floorH, seed) {
  const rng = makeRNG(seed);
  drawBasaltTop(x, 0, w, topH, rng);
  const bottomH = h - gapY - floorH;
  drawBasaltBottom(x, gapY, w, bottomH, rng);
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
  drawBasaltColumns(p.x, p.topH, p.gapY, PIPE_WIDTH, h, FLOOR_HEIGHT, p.seed);
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
