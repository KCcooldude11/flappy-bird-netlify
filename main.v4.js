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
  const goSkin     = document.getElementById('gameover-skin');
  const BLUR_PX    = 6;
  const goNameEl   = document.getElementById('go-username');
  const btnEditName= document.getElementById('btn-edit-name');
  const renameDlg  = document.getElementById('rename-dlg');
  const renameForm = document.getElementById('rename-form');
  const renameInput= document.getElementById('rename-input');
  const renameSave = document.getElementById('rename-save');

  startHomeAppleLoop();

  const BG_FOCUS = {
    1: { desktop: { cx: 0.50, cy: 0.50 }, mobile: { cx: 0.50, cy: 0.50 } },
    // Theme 2: aim a little more to the right to feature the waterfall on mobile
    2: { desktop: { cx: 0.55, cy: 0.52 }, mobile: { cx: 0.72, cy: 0.52 } },
    // Theme 3: nudge left to show more of the dragon on mobile
    3: { desktop: { cx: 0.50, cy: 0.50 }, mobile: { cx: 0.38, cy: 0.50 } },
  };

  // If you want a tiny extra zoom on mobile to “fill” the focus subject:
  const BG_EXTRA_ZOOM = {
    1: { desktop: 1.00, mobile: 1.00 },
    2: { desktop: 1.00, mobile: 1.08 }, // zoom in a bit on waterfall
    3: { desktop: 1.00, mobile: 1.04 }, // slight zoom on dragon
  };

  function isMobileish() {
  // Simple heuristic; you can switch to CSS breakpoints or UA if you prefer
  return Math.min(W(), H()) < 700;
}

  // Ensure #score has an inner span we can rotate back upright
  const scoreTextEl = (() => {
    if (!scoreEl) return null;
    let t = scoreEl.querySelector('.txt');
    if (!t) {
      t = document.createElement('span');
      t.className = 'txt';
      t.textContent = scoreEl.textContent || '0';
      scoreEl.textContent = '';
      scoreEl.appendChild(t);
    }
    return t;
  })();

  function updateScoreBadge(val){
    const digits = String(val).length;
    let w = 28, h = 44;
    if (digits > 2){
      const extra = (digits - 2) * 10;
      w += extra; h += Math.round(extra * 1.2);
    }
    scoreEl?.style.setProperty('--w', `${w}px`);
    scoreEl?.style.setProperty('--h', `${h}px`);
  }
  updateScoreBadge(Number(scoreTextEl?.textContent || 0));

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

  const WaterParticles = (() => {
    const state = { parts: [], target: 140, lastW: 0, lastH: 0 };
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

    class P {
      constructor(w, h) { this.reset(w, h); this.y = Math.random() * h; }
      reset(w, h) {
        this.x = Math.random() * w;
        this.y = h + Math.random() * 50;          // start just below
        this.r = Math.random() * 3 + 1;           // 1..4 px
        this.vy = Math.random() * 1 + 0.5;        // up speed
        this.opacity = this.r / 4;                // small = more transparent
        this.wobble = Math.random() * 0.02 + 0.01;
        this.ang = Math.random() * Math.PI * 2;
      }
      step(w, h) {
        this.y -= this.vy;
        this.ang += this.wobble;
        this.x += Math.sin(this.ang) * 0.5;
        if (this.y < -this.r) this.reset(w, h);
      }
    }

    function desiredCount(w, h) {
      // scale particle count by area, but cap for perf
      const k = (w * h) / 26000;                  // tune density here
      return clamp(Math.round(k), 90, 220);
    }

    function ensureCount(w, h) {
      state.target = desiredCount(w, h);
      const arr = state.parts;
      while (arr.length < state.target) arr.push(new P(w, h));
      if (arr.length > state.target) arr.length = state.target;
    }

    return {
      onResize(w, h) {
        state.lastW = Math.max(1, Math.floor(w));
        state.lastH = Math.max(1, Math.floor(h));
        ensureCount(state.lastW, state.lastH);
      },
      update(dt) {
        const arr = state.parts, w = state.lastW, h = state.lastH;
        for (let i = 0; i < arr.length; i++) arr[i].step(w, h);
      },
      draw(alpha = 1) {
        if (alpha <= 0) return;
        const a = Math.max(0, Math.min(1, alpha));
        if (!a || !state.parts.length) return;

        ctx.save();
        // isolate any shadows so they don't leak
        ctx.globalAlpha = a;
        ctx.shadowColor = 'rgba(0,191,255,0.7)';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        for (const p of state.parts) {
          ctx.moveTo(p.x + p.r, p.y);
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        }
        ctx.fillStyle = 'rgba(173,216,230,1)'; // fill alpha comes from p.opacity below
        // Fill each circle with per-particle opacity (draw individually for correct opacity)
        ctx.restore(); // restore before per-dot to avoid compounding shadow on huge paths

        // draw individually to honor per-particle opacity + glow
        ctx.save();
        for (const p of state.parts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(173,216,230,${p.opacity * a})`;
          ctx.shadowColor = 'rgba(0,191,255,0.7)';
          ctx.shadowBlur = 10;
          ctx.fill();
        }
        ctx.restore();
      }
    };
  })();

  WaterParticles.onResize(W(), H());
 

  const START_X_FRAC = 0.28;
  const BIRD_X   = () => Math.round(W() * START_X_FRAC);
  const GRAVITY  = () => 1200 * S;
  const JUMP_VY  = () => -420  * S;
  const PIPE_SPEED = () => 160 * S;
  const PIPE_GAP   = () => Math.round(160 * S);
  const PIPE_INTERVAL = 1500; // ms
  const PIPE_WIDTH = () => Math.round(70 * S);
  const BIRD_BASE_H = () => Math.round(100 * S);
  const BIRD_R = () => Math.round(BIRD_BASE_H() * 0.20);

  // Max vertical move of the gap *center* between consecutive columns
  const MAX_CENTER_DELTA = () => Math.round(0.99 * PIPE_GAP());

  // Collision tuning
  const HIT_INSET_X = () => Math.round(PIPE_WIDTH() * 0.14);
  const CAP_INSET_Y = () => Math.round(8 * S);


  
  function theme2Alpha() {
  if (!transition) return (theme === 2) ? 1 : 0;
  const a = Math.min(1, Math.max(0, (frameNow - transition.start) / THEME_FADE_MS));
  if (transition.to === 2)   return a;
  if (transition.from === 2) return 1 - a;
  return 0;
}


  // ===== Assets (Backgrounds per theme) =====
  const bg1 = new Image(); bg1.src = './assets/Untitled_Artwork.png';
  const bg2 = new Image(); bg2.src = './assets/background2.png';
  const bg3 = new Image(); bg3.src = './assets/background3.png';

  let bg1Ready=false, bg2Ready=false, bg3Ready=false;
  bg1.onload = () => bg1Ready = true;
  bg2.onload = () => bg2Ready = true;
  bg3.onload = () => bg3Ready = true;

  // ===== Spire art per theme (tile + cap) =====
  const SEG_SRC_TILE_H = 22; // source px for tiling math (used only for scale calc fallback)
  const TOP_CAP_NUDGE  = -6;

  const segTile1 = new Image(); segTile1.src = './assets/rock_spire_bottom.png';
  const segCap1  = new Image(); segCap1.src  = './assets/rock_spire_top.png';

  const segTile2 = new Image(); segTile2.src = './assets/rock_spire_bottom2.png';
  const segCap2  = new Image(); segCap2.src  = './assets/rock_spire_top2.png';

  const segTile3 = new Image(); segTile3.src = './assets/rock_spire_bottom3.png';
  const segCap3  = new Image(); segCap3.src  = './assets/rock_spire_top3.png';

  const ready1 = { tile:false, cap:false };
  const ready2 = { tile:false, cap:false };
  const ready3 = { tile:false, cap:false };
  segTile1.onload=()=>ready1.tile=true; segCap1.onload=()=>ready1.cap=true;
  segTile2.onload=()=>ready2.tile=true; segCap2.onload=()=>ready2.cap=true;
  segTile3.onload=()=>ready3.tile=true; segCap3.onload=()=>ready3.cap=true;

  // current active spire images (swapped when theme finalizes)
  let segTile = segTile1, segCap = segCap1;
  let segReady = ready1;

  function segScaleX(imgTile) {
    if (!imgTile.width) return 1;
    return PIPE_WIDTH() / imgTile.width;
  }
  function scaledHeightsF(imgTile, imgCap) {
    const sx = segScaleX(imgTile);
    const tileH = (imgTile?.height ? imgTile.height : SEG_SRC_TILE_H) * sx;
    const capH  = (imgCap?.height  || 0) * sx;
    return { tileH, capH, sx };
  }
  function quantizeSpireHeight(desiredH, imgTile, imgCap){
    const { tileH, capH } = scaledHeightsF(imgTile, imgCap);
    if (tileH <= 0) return desiredH;
    const usable = Math.max(0, desiredH - capH);
    const n = Math.max(0, Math.floor(usable / tileH + 1e-6));
    return n * tileH + capH;
  }

  // Draw a background image by cropping around a "focus" point so we can pan.
function drawFocusedBg(img, themeNum, alpha = 1) {
  if (!img || !img.width || !img.height) return;

  const vw = W(), vh = H();
  const mobile = isMobileish();
  const f = BG_FOCUS[themeNum] ? (mobile ? BG_FOCUS[themeNum].mobile : BG_FOCUS[themeNum].desktop) : { cx: 0.5, cy: 0.5 };
  const extraZoom = (BG_EXTRA_ZOOM[themeNum] ? (mobile ? BG_EXTRA_ZOOM[themeNum].mobile : BG_EXTRA_ZOOM[themeNum].desktop) : 1) || 1;

  // Scale so the image covers the canvas, then apply extra zoom if any
  const coverScale = Math.max(vw / img.width, vh / img.height) * extraZoom;

  // The portion of the source we need to sample (in source pixels)
  const sw = Math.min(img.width,  Math.ceil(vw / coverScale));
  const sh = Math.min(img.height, Math.ceil(vh / coverScale));

  // Center that crop around the chosen focus point and clamp
  let sx = Math.round(f.cx * img.width  - sw / 2);
  let sy = Math.round(f.cy * img.height - sh / 2);
  sx = Math.max(0, Math.min(sx, img.width  - sw));
  sy = Math.max(0, Math.min(sy, img.height - sh));

  ctx.save();
  ctx.globalAlpha = alpha;

  // Keep backgrounds smooth (tile art can remain unsmoothed in your spire draw)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // If you still want a bit of background blur, keep it small
  // (Large blur on a scaled image increases softness)
  const localBlur = Math.max(0, Math.min(BLUR_PX, 3)); // clamp 0..3
  if (localBlur > 0) ctx.filter = `blur(${localBlur}px)`;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, vw, vh);

  ctx.restore();
}

// Small helper to draw the right background for a theme number (1|2|3)
function drawThemeBg(themeNum, alpha) {
  if (themeNum === 1)      drawFocusedBg(bg1, 1, alpha);
  else if (themeNum === 2) drawFocusedBg(bg2, 2, alpha);
  else if (themeNum === 3) drawFocusedBg(bg3, 3, alpha);
}

  function drawStackUp(imgTile, imgCap, ready, x, y, w, h, capNudgeY = 0) {
    const { tileH, capH, sx } = scaledHeightsF(imgTile, imgCap);
    if (!ready.tile || tileH <= 0 || w <= 0 || h <= 0) return;

    const overlap = 1;
    const drawW = imgTile.width * sx;
    const capY  = y + capNudgeY;

    const pad = Math.max(2, Math.ceil((window.devicePixelRatio || 1)));
    const clipTop    = Math.min(y, capY);
    const clipBottom = Math.max(y + h, capY + (ready.cap ? capH : 0));
    const clipX = Math.floor(x) - pad;
    const clipY = Math.floor(clipTop) - pad;
    const clipW = Math.ceil(w) + pad * 2;
    const clipH = Math.ceil(clipBottom - clipTop) + pad * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;

    let cursorY = y + h - tileH;
    const limit = capY + (ready.cap ? capH : 0) - overlap;
    while (cursorY + tileH > limit) {
      ctx.drawImage(imgTile, x, cursorY, drawW, tileH);
      cursorY -= (tileH - overlap);
    }
    if (ready.cap) ctx.drawImage(imgCap, x, capY, drawW, capH);
    ctx.restore();
  }

  function drawSpireSegmented(x, y, w, h, orientation = 'up') {
    if (orientation === 'up') {
      drawStackUp(segTile, segCap, segReady, x, y, w, h, 0);
    } else {
      ctx.save();
      ctx.translate(x + w, y + h);
      ctx.scale(-1, -1);
      drawStackUp(segTile, segCap, segReady, 0, 0, w, h, TOP_CAP_NUDGE);
      ctx.restore();
    }
  }

  // ===== Background cache (per theme) =====
  const bgCache = {
    1: { w: 0, h: 0, dpr: 0, canvas: null },
    2: { w: 0, h: 0, dpr: 0, canvas: null },
    3: { w: 0, h: 0, dpr: 0, canvas: null },
  };

  function offscreenDpr() {
  // cap at 1.5x to reduce work while still looking crisp
  return Math.min(DPR, 1.5);
}

function getBgForTheme(t) {
  return t === 1 ? bg1 : (t === 2 ? bg2 : bg3);
}

  function ensureBgCached(themeIndex, vw, vh) {
    const img = getBgForTheme(themeIndex);
    if (!img || !img.width || !img.height) return null;

    const entry = bgCache[themeIndex];
    const ODR = offscreenDpr();
    const needRebuild =
      !entry.canvas || entry.w !== vw || entry.h !== vh || entry.dpr !== ODR;

    if (needRebuild) {
      entry.w = vw; entry.h = vh; entry.dpr = ODR;

      const off = document.createElement('canvas');
      off.width  = Math.max(1, Math.round(vw * ODR));
      off.height = Math.max(1, Math.round(vh * ODR));
      const octx = off.getContext('2d');
      octx.setTransform(ODR, 0, 0, ODR, 0, 0);

      // ---- Focused crop (same math as drawFocusedBg), but done once into cache ----
      const mobile = isMobileish();
      const f = BG_FOCUS[themeIndex] ? (mobile ? BG_FOCUS[themeIndex].mobile : BG_FOCUS[themeIndex].desktop) : { cx: 0.5, cy: 0.5 };
      const extraZoom = (BG_EXTRA_ZOOM[themeIndex] ? (mobile ? BG_EXTRA_ZOOM[themeIndex].mobile : BG_EXTRA_ZOOM[themeIndex].desktop) : 1) || 1;

      const coverScale = Math.max(vw / img.width, vh / img.height) * extraZoom;
      const sw = Math.min(img.width,  Math.ceil(vw / coverScale));
      const sh = Math.min(img.height, Math.ceil(vh / coverScale));

      let sx = Math.round(f.cx * img.width  - sw / 2);
      let sy = Math.round(f.cy * img.height - sh / 2);
      sx = Math.max(0, Math.min(sx, img.width  - sw));
      sy = Math.max(0, Math.min(sy, img.height - sh));

      // one-time light blur to soften scale artifacts (cheap because it’s cached)
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      const localBlur = Math.max(0, Math.min(BLUR_PX, 2));
      if (localBlur > 0) octx.filter = `blur(${localBlur}px)`;

      octx.drawImage(img, sx, sy, sw, sh, 0, 0, vw, vh);

      entry.canvas = off;
    }
    return entry.canvas;
  }

  function invalidateBgCache() {
    for (const k in bgCache) {
      bgCache[k].canvas = null;
      bgCache[k].w = bgCache[k].h = bgCache[k].dpr = 0;
    }
  }
  
  function ensureDeviceId(){
      let id = localStorage.getItem('deviceId');
      if (!id){ id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
      return id;
    }
  async function registerIdentityIfNeeded(){
    const id = ensureDeviceId();
    const name = getSavedName();

    if (!isValidName(name)) return { deviceId: id, name: '' };

    try {
      await fetch('/.netlify/functions/register-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: id, name })
      });
    } catch {}

    return { deviceId: id, name };
  }
  registerIdentityIfNeeded();
  const DEVICE_ID = ensureDeviceId();

  // ===== Leaderboard / identity =====
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
    wrap.innerHTML = list.map((r,i)=>`
      <div class="row">
        <span class="rank"><span class="txt">${i+1}</span></span>
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
    let list = [];
    try {
      const res = await fetch('/.netlify/functions/get-leaderboard?limit=10');
      const { scores } = await res.json();
      list = scores || [];
      renderLeaderboard(list);
    } catch(e){
      console.warn('leaderboard fetch error', e);
    }

    // show "your ranking" only if you're NOT already on the visible leaderboard
    const yourRankEl = document.getElementById('your-rank');
    const myId = ensureDeviceId();
    const onBoard = Array.isArray(list) && list.some(r => r.device_id === myId);

    if (yourRankEl) {
      if (onBoard) {
        yourRankEl.textContent = ''; // or "You're on the board!"
        yourRankEl.classList.add('hide');
        return;
      } else {
        yourRankEl.classList.remove('hide');
      }
    }

    await loadMyRank();
  }


  loadLeaderboard();

  function renderYourRank(info){
    const el = document.getElementById('your-rank');
    if (!el) return;

    if (!info || !info.hasScore) {
      el.textContent = 'Play a run to earn a ranking.';
      return;
    }

    el.textContent = `Your ranking: #${info.rank} of ${info.totalPlayers} (Best ${info.bestScore})`;
  }

  async function loadMyRank(){
    try{
      const myId = ensureDeviceId();
      const res = await fetch(`/.netlify/functions/get-my-rank?deviceId=${encodeURIComponent(myId)}`);
      const data = await res.json();
      renderYourRank(data);
    } catch(e){
      console.warn('rank fetch error', e);
    }
  }


  

  // ===== Skins queue (pickup cycles to next) =====
  const SKINS = [
    { name:'Apple',  idle:'./assets/Apple_Fly.png',  flap:'./assets/Apple_Regular.png' },
    { name:'Comet',  idle:'./assets/Comet_Fly.png',  flap:'./assets/Comet_Regular.png' },
    { name:'Theo',   idle:'./assets/Theo_Fly.png',   flap:'./assets/Theo_Regular.png' },
    { name:'Orange', idle:'./assets/Orange_Fly.png', flap:'./assets/Orange_Regular.png', scale: 0.95 },
    { name:'Lottie', idle:'./assets/Lottie_Fly.png', flap:'./assets/Lottie_Regular.png' },
    { name:'Clovia', idle:'./assets/Clovia_Fly.png', flap:'./assets/Clovia_Regular.png' },
    { name:'Salem',  idle:'./assets/Salem_Fly.png',  flap:'./assets/Salem_Regular.png',  scale: 1.08 },
    { name:'Roni',   idle:'./assets/Roni_Fly.png',   flap:'./assets/Roni_Regular.png' },
    { name:'Knogle', idle:'./assets/Knogle_Fly.png', flap:'./assets/Knogle_Regular.png', scale: 1.08 },
    { name:'Orchard',idle:'./assets/Orchard_Fly.png',flap:'./assets/Orchard_Regular.png',scale: 1.08 },
    { name:'Ephedra',idle:'./assets/Ephedra_Fly.png',flap:'./assets/Ephedra_Regular.png',scale: 1.08 },
    { name:'Merrikh',idle:'./assets/Merrikh_Fly.png',flap:'./assets/Merrikh_Regular.png',scale: 1.08 },
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
  const APPLE_INDEX   = SKINS.findIndex(s => s.name === 'Apple');
  const MERRIKH_INDEX = SKINS.findIndex(s => s.name === 'Merrikh');
  let skinLocked = false;

  const MERRIKH_UNLOCK_COLUMN = 301;                 // the “spire 500” target
  const LOCK_AFTER_MERRIKH    = true;                // optional: keep Merrikh once earned

  let merrikhUnlockedThisRun = false;

  // ===== Theme 2: relaxed water particles (from Sorodyn's CodePen) =====
// source: "Relaxed Water Particles" by Sorodyn (CodePen qEdvzaE)

function fetchWithTimeout(url, options = {}, ms = 2000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

function startHomeAppleLoop(){
  const apple = document.getElementById("homeApple");
  if (!apple) return;

  const REG = "./assets/apple_regular.png";
  const FLY = "./assets/apple_fly.png";

  // Preload so swaps are instant
  const img1 = new Image(); img1.src = REG;
  const img2 = new Image(); img2.src = FLY;

  // Timing must match your CSS keyframes above
  // total: 2400ms, swap to fly near the "fall", swap back near the top
  const TOTAL = 2400;
  
  // bottom is at 55% (we also hold bottom until 72%, but swap happens at 55%)
  const TO_REG_AT = Math.floor(TOTAL * 0.55);

  // top is at the end of the cycle, swap back right near the end
  const TO_FLY_AT = Math.floor(TOTAL * 0.98);

  let flyTimer = null;
  let regTimer = null;
  let loopTimer = null;

  const clearTimers = () => {
    if (flyTimer) clearTimeout(flyTimer);
    if (regTimer) clearTimeout(regTimer);
    if (loopTimer) clearInterval(loopTimer);
    flyTimer = regTimer = loopTimer = null;
  };

  const scheduleSwaps = () => {
    apple.src = FLY; // start at top flying
    regTimer = setTimeout(() => { apple.src = REG; }, TO_REG_AT); // bottom -> regular
    flyTimer = setTimeout(() => { apple.src = FLY; }, TO_FLY_AT); // back at top -> fly
  };

  // Start immediately
  clearTimers();
  scheduleSwaps();
  loopTimer = setInterval(scheduleSwaps, TOTAL);

  // Stop swaps if overlay hides (optional safety)
  const obs = new MutationObserver(() => {
    const showing = document.getElementById("overlay")?.classList.contains("show");
    if (!showing) clearTimers();
  });
  const overlay = document.getElementById("overlay");
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ["class"] });
}


  const nameInput = document.getElementById('username');
  function getSavedName() { return (localStorage.getItem('playerName') || '').trim(); }
  const skinScale = i => (SKINS[i] && typeof SKINS[i].scale === 'number') ? SKINS[i].scale : 1;
  function currentSkinScale(){ return skinScale(currentSkinIndex); }
  async function saveName(name) {
    localStorage.setItem('playerName', name);

    // fire-and-forget, never block gameplay
    fetchWithTimeout('/.netlify/functions/register-identity', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ deviceId: ensureDeviceId(), name })
    }, 1500).catch(() => {});
  }
  const skinReady = i => !!(SKINS[i] && SKINS[i].idleReady && SKINS[i].flapReady);

  let currentSkinIndex = 0;
  for (let i = 0; i < SKINS.length; i++) if (skinReady(i)) { currentSkinIndex = i; break; }
  if (APPLE_INDEX >= 0 && skinReady(APPLE_INDEX)) currentSkinIndex = APPLE_INDEX;

  let currentIdleImg = SKINS[currentSkinIndex].idleImg;
  let currentFlapImg = SKINS[currentSkinIndex].flapImg;

  function canUseSkin(i){
    if (i === MERRIKH_INDEX && !merrikhUnlockedThisRun) return false;
    return skinReady(i);
  }

  function switchToSkin(i){
    if (!canUseSkin(i)) return false;   // <- central block
    currentSkinIndex = i;
    currentIdleImg = SKINS[i].idleImg;
    currentFlapImg = SKINS[i].flapImg;
    bird.r = Math.round(BIRD_BASE_H() * 0.20 * currentSkinScale());
    return true;
  }

  function advanceSkinOneStepBlockingMerrikh(){
    const next = (currentSkinIndex + 1);          // NO modulo wrap
    if (next >= SKINS.length) return false;       // at end? do nothing

    if (!canUseSkin(next)) return false;          // blocks Merrikh if locked
    return switchToSkin(next);
  }



  function isValidName(s){
    if (typeof s !== 'string') return false;
    s = s.trim();
    if (s.length < 3 || s.length > 16) return false;
    if (s.toLowerCase() === 'guest') return false;
    return true;
  }
  const existing = getSavedName();
  if (nameInput) nameInput.value = existing;
  if (goNameEl)  goNameEl.textContent = existing || 'Player';

  function refreshNameUI() {
    const okHome = isValidName(nameInput?.value || '');
    if (btnPlay) btnPlay.disabled = !okHome;
  }
  nameInput?.addEventListener('input', refreshNameUI);
  refreshNameUI();

  // ===== Game state =====
  let state = 'ready'; // ready | playing | gameover
  document.body.dataset.state = state;

  function setState(next){
    state = next;
    document.body.dataset.state = state;
  }

  let bird  = {
    x:BIRD_X(), y:Math.round(H()/2 - 80*S), vy:0, rot:0, flapTimer:0,
    r: Math.round(BIRD_BASE_H() * 0.20 * currentSkinScale())
  };

  window.addEventListener('resize', () => {
    resizeCanvas(); recomputeScale();
    WaterParticles.onResize(W(), H());
    bird.x = BIRD_X();
    bird.r = Math.round(BIRD_BASE_H() * 0.20 * currentSkinScale());
    if (state !== 'playing') bird.y = Math.round(H()/2 - 80*S);
    invalidateBgCache();
  });

  let pipes = [];
  let lastPipeAt = 0;
  let lastTime = 0;
  let frameNow = 0; // single timestamp per frame
  let score = 0;
  let best = Number(localStorage.getItem('flappy-best') || 0);
  if (bestEl) bestEl.textContent = 'Best: ' + best;

  // Theme transition state
  let theme = 1;
  const THEME_THRESHOLDS = [100, 200]; // 1->2 at 100, 2->3 at 200
  const THEME_FADE_MS = 800;
  let transition = null; // {from,to,start}

  // Medallions
  function nextMedalJump() { return 13 + Math.floor(Math.random() * 8); } // [13..20]
  const medalImg = new Image(); medalImg.src = './assets/medallion.png';
  let medalReady = false; medalImg.onload = () => medalReady = true;

  let medallions = []; // {x,y,size,r,taken}
  let columnsSpawned = 0;
  let nextMedalColumn = 16;

  // ===== Core helpers =====
  function resetGame(){
    bird.r = Math.round(BIRD_BASE_H() * 0.20 * currentSkinScale());
    bird.x = BIRD_X(); bird.y = Math.round(H()/2 - 80*S);
    bird.vy = 0; bird.rot = 0; bird.flapTimer = 0;
    pipes = []; lastPipeAt = 0; score = 0;
    if (scoreTextEl) scoreTextEl.textContent = '0';
    updateScoreBadge(0);
    medallions = []; columnsSpawned = 0; nextMedalColumn = 16;
    merrikhUnlockedThisRun = false; 
    // theme reset
    theme = 1; transition = null;
    segTile = segTile1; segCap = segCap1; segReady = ready1;
    invalidateBgCache();

    // skins: always start as Apple again and unlock
    skinLocked = false;
      if (APPLE_INDEX >= 0 && skinReady(APPLE_INDEX)) {
        switchToSkin(APPLE_INDEX);
      } else {
        for (let i = 0; i < SKINS.length; i++) {
          if (i === MERRIKH_INDEX && !merrikhUnlockedThisRun) continue; // don't start as Merrikh pre-unlock
          if (skinReady(i)) { switchToSkin(i); break; }
        }
      }
  }

  let runStartTime = 0;
  function markRunStart(){ runStartTime = frameNow; }

  function start(){
    const name = getSavedName();
    if (!isValidName(name)) { overlay?.classList.add('show'); return; }
    resetGame(); markRunStart();
    setState('playing');
    overlay?.classList.add('hide'); overlay?.classList.remove('show');
    gameoverEl?.classList.add('hide'); gameoverEl?.classList.remove('show');
    if (goSkin) { goSkin.src = ''; goSkin.classList.add('hide'); }
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  async function gameOver(){
    setState('gameover');
    if (score > best){ best = score; localStorage.setItem('flappy-best', String(best)); bestEl && (bestEl.textContent = 'Best: ' + best); }
    const playMs = Math.round(frameNow - runStartTime);
    const result = await postScore(ensureDeviceId(), score, playMs);
    if (result?.error) console.warn('submit-score error:', result.error);
    await loadLeaderboard();
    if (goNameEl) goNameEl.textContent = getSavedName() || 'Player';
    if (goSkin) {
      const skin = SKINS[currentSkinIndex];
      const src = (skin?.flapImg && skin.flapImg.src) ? skin.flapImg.src : (skin?.flap || '');
      goSkin.src = src;
      goSkin.alt = skin?.name ? `${skin.name} (Regular)` : 'Character';
      goSkin.classList.remove('hide');
    }
    gameoverEl?.classList.remove('hide');
    gameoverEl?.classList.add('show');
  }

  function flap(){
    if (state === 'ready'){ start(); return; }
    if (state !== 'playing') return;
    bird.vy = JUMP_VY(); bird.flapTimer = 300;
  }

  function refreshRenameUI(){
    const ok = isValidName((renameInput?.value || '').trim());
    if (renameSave) renameSave.disabled = !ok;
  }
  btnEditName?.addEventListener('click', () => {
    if (!renameDlg) return;
    const current = getSavedName();
    if (renameInput) { renameInput.value = current || ''; renameInput.select(); }
    refreshRenameUI();
    renameDlg.showModal();
  });
  renameInput?.addEventListener('input', refreshRenameUI);
  renameForm?.addEventListener('submit', async (e) => {
    const submitterId = e.submitter?.id;
    if (submitterId !== 'rename-save') return; // cancel button path
    e.preventDefault();
    const name = (renameInput?.value || '').trim();
    if (!isValidName(name)) { renameInput?.focus(); return; }
    await saveName(name);
    if (goNameEl) goNameEl.textContent = name || 'Player';
    try { renameDlg?.close(); } catch {}
  });

  // ===== Input =====
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;

    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'playing') flap();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      if (state !== 'playing') {
        const name = (nameInput?.value || getSavedName()).trim();
        if (!isValidName(name)) { nameInput?.focus(); return; }
        saveName(name).then(start);
      }
    }
  });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'playing') flap(); });
  btnPlay?.addEventListener('click', (e) => {
    e.preventDefault();
    const name = (nameInput?.value || '').trim();
    if (!isValidName(name)) { nameInput?.focus(); return; }
    saveName(name);   // <- no await
    start();
  });
  btnTry?.addEventListener('click', (e)=>{ e.preventDefault(); start(); });
  btnRestart?.addEventListener('click', (e)=>{ e.preventDefault(); start(); });

  // ===== Pipes / Medallions =====
  function spawnPipePair(){
    const marginTop = Math.round(40*S), marginBot = Math.round(40*S);
    const maxTopRaw = H() - marginBot - PIPE_GAP() - marginTop;

    let topY = marginTop + Math.random() * Math.max(40*S, maxTopRaw);
    const prev = pipes[pipes.length - 1];

    // quantize to current theme's tiles
    if (segReady.tile){
      const qTop = quantizeSpireHeight(topY, segTile, segCap);
      const desiredBottomH = H() - (qTop + PIPE_GAP());
      const qBottom = quantizeSpireHeight(desiredBottomH, segTile, segCap);
      const total = qTop + PIPE_GAP() + qBottom;
      if (total <= H() - marginBot) topY = qTop;
    }

    if (prev){
      const prevCenter = prev.topH + PIPE_GAP()/2;
      let   thisCenter = topY      + PIPE_GAP()/2;
      const lim = MAX_CENTER_DELTA();
      if (thisCenter > prevCenter + lim) thisCenter = prevCenter + lim;
      if (thisCenter < prevCenter - lim) thisCenter = prevCenter - lim;

      topY = thisCenter - PIPE_GAP()/2;
      topY = Math.max(marginTop, Math.min(topY, H() - marginBot - PIPE_GAP()));

      if (segReady.tile){
        const qTop = quantizeSpireHeight(topY, segTile, segCap);
        const desiredBottomH = H() - (qTop + PIPE_GAP());
        const qBottom = quantizeSpireHeight(desiredBottomH, segTile, segCap);
        const total = qTop + PIPE_GAP() + qBottom;
        topY = (total <= H() - marginBot) ? qTop : topY;
      }
    }

    const x = W() + 40*S;
    const p = { x, topH: topY, gapY: topY + PIPE_GAP(), scored:false };
    pipes.push(p);
    columnsSpawned++;
    if (columnsSpawned === MERRIKH_UNLOCK_COLUMN && !merrikhUnlockedThisRun) {
      const prevPipe = pipes[pipes.length - 2];
      const thisPipe = pipes[pipes.length - 1];
      const base     = prevPipe || thisPipe;

      const mx = prevPipe ? Math.round((prevPipe.x + thisPipe.x) / 2)
                          : Math.round(thisPipe.x - PIPE_WIDTH() * 0.4);

      const gapTop = base.topH, gapBot = base.gapY;
      const safeMargin = Math.round(0.2 * PIPE_GAP());
      const minY = gapTop + safeMargin, maxY = gapBot - safeMargin;
      const centerY = (minY + maxY)/2;
      const jitter  = (Math.random() * 0.3 - 0.15) * (maxY - minY);
      const my = Math.round(Math.max(minY, Math.min(maxY, centerY + jitter)));

      const size = Math.max(72, Math.round(32 * S));
      medallions.push({ x: mx, y: my, size, r: Math.round(size * 0.42), taken: false, type: 'merrikh' });
    } else {
      // ----- Regular medallion spawn (unchanged), use a DIFFERENT name than above -----
      const prevPipe2 = pipes[pipes.length - 2];
      if (columnsSpawned === nextMedalColumn && prevPipe2){
        const mx = Math.round((prevPipe2.x + x) / 2);
        const gapTop = prevPipe2.topH, gapBot = prevPipe2.gapY;
        const safeMargin = Math.round(0.2 * PIPE_GAP());
        const minY = gapTop + safeMargin, maxY = gapBot - safeMargin;
        const centerY = (minY + maxY) / 2;
        const jitter = (Math.random() * 0.4 - 0.2) * (maxY - minY);
        const my = Math.round(centerY + jitter);
        const size = Math.max(68, Math.round(28*S));
        medallions.push({ x:mx, y:my, size, r:Math.round(size*0.42), taken:false });
        nextMedalColumn += nextMedalJump();
      }
    }
  }

  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return (dx*dx + dy*dy) < cr*cr;
  }

  // ===== Update / Draw / Loop =====
  function currentDrawSize() {
    const baseH  = BIRD_BASE_H() * currentSkinScale();
    const img    = (bird?.flapTimer > 0) ? currentFlapImg : currentIdleImg;
    const aspect = (img && img.width && img.height) ? (img.width / img.height) : 1;
    return { w: Math.round(baseH * aspect), h: Math.round(baseH) };
  }

  function maybeStartThemeFade() {
    if (transition) return;
    if (theme === 1 && score >= THEME_THRESHOLDS[0] && bg2Ready) {
      transition = { from: 1, to: 2, start: frameNow };
    } else if (theme === 2 && score >= THEME_THRESHOLDS[1] && bg3Ready) {
      transition = { from: 2, to: 3, start: frameNow };
    }
  }

  function finalizeThemeIfDone() {
    if (!transition) return;
    if (frameNow - transition.start >= THEME_FADE_MS) {
      theme = transition.to;
      transition = null;
      // swap spire art to match new theme
      if (theme === 2) { segTile = segTile2; segCap = segCap2; segReady = ready2; }
      else if (theme === 3) { segTile = segTile3; segCap = segCap3; segReady = ready3; }
      invalidateBgCache();
    }
  }

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
        p.scored = true;
        score += 1;
        if (scoreTextEl) scoreTextEl.textContent = String(score);
        updateScoreBadge(score);
        maybeStartThemeFade();
      }
    }

    finalizeThemeIfDone();

    // Medallions
    if (medallions.length){
      for (let m of medallions){
        m.x -= PIPE_SPEED() * dt;
        const dx = bird.x - m.x, dy = bird.y - m.y, rr = bird.r + m.r;
        if (!m.taken && (dx*dx + dy*dy) < rr*rr) { 
          m.taken = true;

          if (m.type === 'merrikh') {
            merrikhUnlockedThisRun = true;
            switchToSkin(MERRIKH_INDEX);
            if (LOCK_AFTER_MERRIKH) skinLocked = true; // keep them on Merrikh for the rest of the run, if you like
          } else {
            advanceSkinOneStepBlockingMerrikh(); // still blocks Merrikh until unlocked this run
          }

        }
      }
      medallions = medallions.filter(m => !m.taken && (m.x + m.size) > -40*S);
    }
    if (theme2Alpha() > 0) WaterParticles.update(dt);
  }
  window.addEventListener('orientationchange', () => {
  resizeCanvas(); recomputeScale();
  WaterParticles.onResize(W(), H());
  invalidateBgCache();
})

  function drawBackground() {
  const vw = W(), vh = H();

  if (!transition) {
    const can = ensureBgCached(theme, vw, vh);
    if (can) ctx.drawImage(can, 0, 0, vw, vh);
    return;
  }

  // crossfade cached canvases
  const a = Math.min(1, Math.max(0, (frameNow - transition.start) / THEME_FADE_MS));
  const fromCan = ensureBgCached(transition.from, vw, vh);
  const toCan   = ensureBgCached(transition.to,   vw, vh);

  if (fromCan) ctx.drawImage(fromCan, 0, 0, vw, vh);
  if (toCan) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(toCan, 0, 0, vw, vh);
    ctx.restore();
  }
}


  function draw(){
    const vw = W(), vh = H();

    // Background (cached)
    drawBackground();
    if (theme2Alpha() > 0) {
      ctx.save();
      ctx.filter = 'none';
      WaterParticles.draw(theme2Alpha());
      ctx.restore();
    }

      if (state === 'ready'){
        overlay?.classList.add('show');
        overlay?.classList.remove('hide');
        return;
      }
    // Spires
    for (let p of pipes){
      drawSpireSegmented(p.x, 0, PIPE_WIDTH(), p.topH, 'down');
      drawSpireSegmented(p.x, p.gapY, PIPE_WIDTH(), vh - p.gapY, 'up');
    }

    // Medallions
    if (medalReady && medallions.length){
      const aspect = medalImg.width / medalImg.height;
      for (let m of medallions){
        const hpx = m.size;
        const wpx = Math.round(hpx * aspect);
        const dx = Math.round(m.x - wpx / 2);
        const dy = Math.round(m.y - hpx / 2);
        ctx.drawImage(medalImg, dx, dy, wpx, hpx);
      }
    }

    // Bird (preserve aspect)
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot * 0.45);
    const img = (bird.flapTimer > 0) ? currentFlapImg : currentIdleImg;
    const { w: birdW, h: birdH } = currentDrawSize();
    ctx.drawImage(img, -birdW/2, -birdH/2, birdW, birdH);
    ctx.restore();

    if (state === 'ready'){
      overlay?.classList.add('show');
      overlay?.classList.remove('hide');
    }
  }

  function loop(t){
    frameNow = t; // single timestamp used everywhere this frame
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    if (state === 'playing') requestAnimationFrame(loop);
  }

  // First paint
  draw();
})();

