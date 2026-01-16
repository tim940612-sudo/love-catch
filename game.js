(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });

  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const startBtn = document.getElementById('startBtn');
  const fsBtn = document.getElementById('fsBtn');

  // Assets
  const imgA = new Image();
  const imgB = new Image();
  imgA.src = 'assets/A.jpeg';
  imgB.src = 'assets/B.jpeg';

  // Device-safe resize
  function resize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // Game state
  const state = {
    running: false,
    score: 0,
    timeLeft: 60,
    lastTs: 0,
    spawnAcc: 0,
    objects: [],
    // player control
    targetX: window.innerWidth * 0.5,
    playerX: window.innerWidth * 0.5,
    playerY: 0,
    // difficulty
    baseFallSpeed: 240, // px/s
    spawnEvery: 520, // ms
    t0: 0,
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function computePlayerSize() {
    // Wide enough to feel like "catching"
    const w = clamp(window.innerWidth * 0.30, 150, 260);
    const h = w * 0.75;
    return { w, h };
  }

  function computeObjectSize() {
    const w = clamp(window.innerWidth * 0.16, 72, 140);
    const h = w;
    return { w, h };
  }

  function resetGame() {
    state.score = 0;
    state.timeLeft = 60;
    state.lastTs = 0;
    state.spawnAcc = 0;
    state.objects = [];
    state.targetX = window.innerWidth * 0.5;
    state.playerX = window.innerWidth * 0.5;
    state.t0 = performance.now();
  }

  // Touch / pointer controls
  function setTargetFromClientX(clientX) {
    state.targetX = clientX;
  }

  const onPointerMove = (e) => {
    if (!state.running) return;
    if (e.touches && e.touches.length) {
      setTargetFromClientX(e.touches[0].clientX);
    } else {
      setTargetFromClientX(e.clientX);
    }
  };

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('pointerdown', onPointerMove, { passive: false });
  window.addEventListener('touchstart', onPointerMove, { passive: false });

  // Prevent iOS pull-to-refresh/scroll while playing
  document.addEventListener('touchmove', (e) => {
    if (state.running) e.preventDefault();
  }, { passive: false });

  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el);
  }

  fsBtn.addEventListener('click', () => {
    enterFullscreen();
  });

  function startGame() {
    resetGame();
    state.running = true;
    overlay.style.display = 'none';
    scoreEl.textContent = String(state.score);
    timeEl.textContent = String(state.timeLeft);
    state.playerY = window.innerHeight - computePlayerSize().h - 22 - (safeAreaBottom());
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    overlayTitle.textContent = '時間到！';
    overlayDesc.textContent = `你在 60 秒內接住了 ${state.score} 顆 ❤️`;
    startBtn.textContent = '再玩一次';
    overlay.style.display = 'grid';
  }

  function safeAreaBottom() {
    // Best-effort for iOS safe area; if CSS env not accessible here, keep a small padding.
    return 8;
  }

  startBtn.addEventListener('click', startGame);

  // Visual helpers
  function drawBackground() {
    // subtle stars
    ctx.save();
    ctx.globalAlpha = 0.18;
    const count = 60;
    for (let i = 0; i < count; i++) {
      const x = (i * 9973) % window.innerWidth;
      const y = (i * 7919) % window.innerHeight;
      const r = 1 + (i % 3);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
    }
    ctx.restore();

    // ground glow
    ctx.save();
    ctx.globalAlpha = 0.12;
    const gy = window.innerHeight - 80;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(window.innerWidth / 2, gy, window.innerWidth * 0.55, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function spawnObject() {
    const { w, h } = computeObjectSize();
    const x = Math.random() * (window.innerWidth - w) + w / 2;
    const y = -h;

    const elapsed = (performance.now() - state.t0) / 1000;
    const speed = state.baseFallSpeed + elapsed * 22 + Math.random() * 40;

    state.objects.push({
      x, y,
      w, h,
      vy: speed,
      rot: (Math.random() * 2 - 1) * 2.2,
      a: Math.random() * Math.PI * 2,
    });
  }

  function aabbIntersect(a, b) {
    return (
      a.x - a.w / 2 < b.x + b.w / 2 &&
      a.x + a.w / 2 > b.x - b.w / 2 &&
      a.y - a.h / 2 < b.y + b.h / 2 &&
      a.y + a.h / 2 > b.y - b.h / 2
    );
  }

  function popHeart(x, y) {
    // simple burst
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '900 22px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial';
    ctx.fillText('❤️+1', x - 18, y - 8);
    ctx.restore();
    // vibration (optional)
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function drawPlayer() {
    const { w, h } = computePlayerSize();
    const x = state.playerX;
    const y = state.playerY;

    // Draw with rounded-rect clip so it looks like a "character card"
    ctx.save();
    roundRectClip(ctx, x - w/2, y - h/2, w, h, 18);

    // cover draw
    drawImageCover(imgB, x - w/2, y - h/2, w, h);

    ctx.restore();

    // subtle outline
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'white';
    roundRectStroke(ctx, x - w/2, y - h/2, w, h, 18);
    ctx.restore();

    return { x, y, w, h };
  }

  function drawObject(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.a);

    // circle clip for cute drop
    ctx.beginPath();
    ctx.arc(0, 0, o.w * 0.5, 0, Math.PI * 2);
    ctx.clip();

    drawImageCover(imgA, -o.w/2, -o.h/2, o.w, o.h);

    ctx.restore();

    // highlight ring
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.w * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function roundRectClip(c, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    c.clip();
  }

  function roundRectStroke(c, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    c.stroke();
  }

  // Draw image like CSS background-size: cover
  function drawImageCover(img, x, y, w, h) {
    if (!img || !img.complete || img.naturalWidth === 0) {
      // placeholder
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, h);
      return;
    }
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function loop(ts) {
    if (!state.running) return;

    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    // update time
    const elapsed = (ts - state.t0) / 1000;
    const remaining = Math.max(0, 60 - elapsed);
    const tInt = Math.ceil(remaining);
    if (tInt !== state.timeLeft) {
      state.timeLeft = tInt;
      timeEl.textContent = String(state.timeLeft);
    }
    if (remaining <= 0) {
      endGame();
      return;
    }

    // update player
    const { w: pw } = computePlayerSize();
    const half = pw / 2;
    const tx = clamp(state.targetX, half + 8, window.innerWidth - half - 8);
    // smoothing
    state.playerX += (tx - state.playerX) * (1 - Math.pow(0.001, dt));
    state.playerY = window.innerHeight - computePlayerSize().h - 22 - safeAreaBottom();

    // spawn
    state.spawnAcc += dt * 1000;
    const dynamicSpawn = Math.max(240, state.spawnEvery - elapsed * 6);
    while (state.spawnAcc >= dynamicSpawn) {
      state.spawnAcc -= dynamicSpawn;
      spawnObject();
    }

    // update objects
    const playerBox = { x: state.playerX, y: state.playerY, ...computePlayerSize() };

    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      o.y += o.vy * dt;
      o.a += o.rot * dt;

      // catch
      if (aabbIntersect(o, playerBox)) {
        state.objects.splice(i, 1);
        state.score += 1;
        scoreEl.textContent = String(state.score);
        popHeart(o.x, o.y);
        continue;
      }

      // missed (no penalty)
      if (o.y - o.h / 2 > window.innerHeight + 20) {
        state.objects.splice(i, 1);
      }
    }

    // draw
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawBackground();

    for (const o of state.objects) drawObject(o);
    drawPlayer();

    requestAnimationFrame(loop);
  }

  // Preload then ready
  function whenReady() {
    // We don't block start; but update overlay if images fail.
    const okA = imgA.complete && imgA.naturalWidth > 0;
    const okB = imgB.complete && imgB.naturalWidth > 0;
    if (!okA || !okB) {
      overlayDesc.textContent = '素材載入中…如果你是離線打開，請確認 assets 資料夾與 index.html 放在同一層。';
    }
  }

  imgA.onload = whenReady;
  imgB.onload = whenReady;
  imgA.onerror = whenReady;
  imgB.onerror = whenReady;
})();
