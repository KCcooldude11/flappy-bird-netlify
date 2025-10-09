(() => {
  // Canvas & Context
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

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
  const GRAVITY = 1400;      // px/s^2
  const JUMP_VY = -420;      // px/s
  const PIPE_SPEED = 160;    // px/s
  const PIPE_GAP = 140;      // px
  const PIPE_INTERVAL = 1500;// ms
  const PIPE_WIDTH = 70;     // px
  const FLOOR_HEIGHT = 90;

  // Bird images
  const birdIdle = new Image();
  birdIdle.src = './assets/Apple_Regular.png';
  const birdFlap = new Image();
  birdFlap.src = './assets/Apple_Fly.png';

  // State
  let state = 'ready'; // ready | playing | gameover
  let bird = {
    x: 120, y: 200, vy: 0, r: 18, rot: 0,
    flapTimer: 0, // ms remaining to show flap image
  };
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
    bird.y = H()/2 - 50;
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
    bird.flapTimer = 750; // show flap image for 140ms
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
    });
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    // clamp
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
    bird.rot = Math.atan2(bird.vy, 300);

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
    // Remove off-screen pipes
    while (pipes.length && pipes[0].x + PIPE_WIDTH < -40) {
      pipes.shift();
    }

    // Collision + scoring
    const floorY = H() - FLOOR_HEIGHT;
    const birdBox = { x: bird.x - bird.r, y: bird.y - bird.r, w: bird.r*2, h: bird.r*2 };

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
    // Sky
    const skyGrad = ctx.createLinearGradient(0,0,0,h);
    skyGrad.addColorStop(0, '#8fd0ff');
    skyGrad.addColorStop(1, '#bfe8ff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0,0,w,h);

    // Background hills
    ctx.fillStyle = '#74c465';
    ctx.fillRect(0, h - FLOOR_HEIGHT - 40, w, 20);
    ctx.fillStyle = '#6ab05c';
    ctx.fillRect(0, h - FLOOR_HEIGHT - 20, w, 20);

    // Pipes
    for (let p of pipes) {
      ctx.fillStyle = '#2fbf71';
      // top pipe
      ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
      // lip
      ctx.fillRect(p.x - 4, p.topH - 14, PIPE_WIDTH + 8, 14);
      // bottom pipe
      const bottomH = h - p.gapY - FLOOR_HEIGHT;
      ctx.fillRect(p.x, p.gapY, PIPE_WIDTH, bottomH);
      // lip
      ctx.fillRect(p.x - 4, p.gapY, PIPE_WIDTH + 8, 14);
    }

    // Bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.6);
    const img = (bird.flapTimer > 0) ? birdFlap : birdIdle;
    const bw = 230, bh = 230; // draw size
    ctx.drawImage(img, -bw/2, -bh/2, bw, bh);
    ctx.restore();

    // Floor
    ctx.fillStyle = '#d9bf8f';
    ctx.fillRect(0, h - FLOOR_HEIGHT, w, FLOOR_HEIGHT);
    ctx.fillStyle = '#c7ac7c';
    for (let x = 0; x < w; x += 24) {
      ctx.fillRect(x, h - FLOOR_HEIGHT, 16, 8);
    }

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