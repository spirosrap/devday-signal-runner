const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const message = document.querySelector("#message");
const distanceEl = document.querySelector("#distance");
const clockEl = document.querySelector("#clock");
const fragmentsEl = document.querySelector("#fragments");

const assets = {
  background: loadImage("assets/generated/background.png"),
  atlas: loadImage("assets/generated/atlas.png"),
};

const config = {
  title: "DevDay Night Run",
  intro: "Deliver the early DevDay ticket before sunrise. Collect all three signals.",
  win: "Ticket delivered. DevDay unlocked.",
  lose: "Dawn caught you. Run again.",
  fragments: ["GPT", "Image", "Ship"],
  duration: 45,
};

const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };
let state = makeInitialState("ready");
let lastTime = 0;
let raf = 0;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function makeInitialState(mode = "playing") {
  return {
    mode,
    timeLeft: config.duration,
    distance: 0,
    bgOffset: 0,
    player: { x: 480, y: 424, r: 30, invuln: 0 },
    fragments: [
      { label: "GPT", x: 240, y: -180, speed: 132, collected: false },
      { label: "Image", x: 520, y: -520, speed: 152, collected: false },
      { label: "Ship", x: 760, y: -880, speed: 170, collected: false },
    ],
    hazards: [
      { x: 360, y: -280, speed: 184, size: 54 },
      { x: 680, y: -680, speed: 214, size: 60 },
      { x: 160, y: -1040, speed: 238, size: 50 },
      { x: 820, y: -1340, speed: 260, size: 58 },
    ],
    portal: { x: 480, y: -1700, speed: 170, size: 92 },
  };
}

function renderFragments() {
  fragmentsEl.innerHTML = "";
  for (const label of config.fragments) {
    const node = document.createElement("span");
    const found = state.fragments.some((frag) => frag.label === label && frag.collected);
    node.className = `fragment${found ? " is-collected" : ""}`;
    node.textContent = label;
    fragmentsEl.append(node);
  }
}

function setOverlay(text, buttonText = "Start run") {
  message.textContent = text;
  startButton.textContent = buttonText;
  overlay.hidden = false;
}

function startGame() {
  state = makeInitialState("playing");
  lastTime = performance.now();
  overlay.hidden = true;
  renderFragments();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function endGame(mode, text) {
  state.mode = mode;
  setOverlay(text, mode === "win" ? "Run again" : "Retry");
  renderFragments();
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  if (state.mode === "playing") {
    update(dt);
  }
  draw();
  raf = requestAnimationFrame(tick);
}

function update(dt) {
  state.timeLeft -= dt;
  state.distance += dt * 58;
  state.bgOffset = (state.bgOffset + dt * 20) % canvas.height;
  state.player.invuln = Math.max(0, state.player.invuln - dt);

  const speed = 330;
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;

  if (pointer.active) {
    const target = screenToCanvas(pointer.x, pointer.y);
    dx += (target.x - state.player.x) / 130;
    dy += (target.y - state.player.y) / 130;
  }

  const mag = Math.hypot(dx, dy) || 1;
  state.player.x = clamp(state.player.x + (dx / mag) * speed * dt, 56, canvas.width - 56);
  state.player.y = clamp(state.player.y + (dy / mag) * speed * dt, 120, canvas.height - 54);

  for (const fragment of state.fragments) {
    if (!fragment.collected) {
      fragment.y += fragment.speed * dt;
      if (fragment.y > canvas.height + 80) {
        fragment.y = -240 - Math.random() * 360;
        fragment.x = 130 + Math.random() * (canvas.width - 260);
      }
      if (hits(state.player, fragment, 42)) {
        fragment.collected = true;
        state.player.invuln = 0.32;
        renderFragments();
      }
    }
  }

  for (const hazard of state.hazards) {
    hazard.y += hazard.speed * dt;
    hazard.x += Math.sin((state.distance + hazard.y) / 90) * 0.35;
    if (hazard.y > canvas.height + 90) {
      hazard.y = -260 - Math.random() * 650;
      hazard.x = 100 + Math.random() * (canvas.width - 200);
      hazard.speed = 176 + Math.random() * 110;
    }
    if (state.player.invuln <= 0 && hits(state.player, hazard, hazard.size * 0.54)) {
      state.timeLeft -= 5.5;
      hazard.y = canvas.height + 120;
      state.player.invuln = 0.9;
    }
  }

  if (state.fragments.every((fragment) => fragment.collected)) {
    state.portal.y += state.portal.speed * dt;
    if (state.portal.y > canvas.height + 120) {
      state.portal.y = -220;
      state.portal.x = 130 + Math.random() * (canvas.width - 260);
    }
    if (hits(state.player, state.portal, 74)) {
      endGame("win", config.win);
    }
  }

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame("lose", config.lose);
  }

  distanceEl.textContent = `${Math.floor(state.distance)} m`;
  clockEl.textContent = `${Math.ceil(state.timeLeft)}`;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawLaneGlow();

  for (const fragment of state.fragments) {
    if (!fragment.collected) {
      drawAtlas(512, 0, 512, 512, fragment.x - 30, fragment.y - 30, 60, 60);
      drawLabel(fragment.label, fragment.x, fragment.y + 48, "#51ffd6");
    }
  }

  for (const hazard of state.hazards) {
    drawAtlas(0, 512, 512, 512, hazard.x - hazard.size / 2, hazard.y - hazard.size / 2, hazard.size, hazard.size);
  }

  if (state.fragments.every((fragment) => fragment.collected)) {
    drawAtlas(512, 512, 512, 512, state.portal.x - 50, state.portal.y - 58, 100, 116);
  }

  const pulse = state.player.invuln > 0 ? Math.sin(performance.now() / 70) * 0.18 + 0.82 : 1;
  ctx.save();
  ctx.globalAlpha = pulse;
  drawAtlas(0, 0, 512, 512, state.player.x - 38, state.player.y - 42, 76, 84);
  ctx.restore();

  if (state.mode === "ready") {
    distanceEl.textContent = "0 m";
    clockEl.textContent = `${config.duration}`;
  }
}

function drawBackground() {
  const img = assets.background;
  if (!img.complete || !img.naturalWidth) {
    ctx.fillStyle = "#07111f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2 + Math.sin(state.bgOffset / 40) * 8;
  ctx.drawImage(img, x, y, w, h);
  ctx.fillStyle = "rgba(2, 7, 18, 0.34)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawLaneGlow() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(81,255,214,0)");
  gradient.addColorStop(0.65, "rgba(81,255,214,0.08)");
  gradient.addColorStop(1, "rgba(255,184,77,0.12)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(81,255,214,0.24)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.38, canvas.height);
  ctx.lineTo(canvas.width * 0.47, 150);
  ctx.moveTo(canvas.width * 0.62, canvas.height);
  ctx.lineTo(canvas.width * 0.53, 150);
  ctx.stroke();
}

function drawAtlas(sx, sy, sw, sh, dx, dy, dw, dh) {
  const img = assets.atlas;
  if (!img.complete || !img.naturalWidth) return;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawLabel(text, x, y, color) {
  ctx.save();
  ctx.font = "700 16px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(7,17,31,0.72)";
  roundRect(ctx, x - 34, y - 14, 68, 28, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function hits(a, b, radius) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + radius;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function screenToCanvas(x, y) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((x - rect.left) / rect.width) * canvas.width,
    y: ((y - rect.top) / rect.height) * canvas.height,
  };
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "Space" && state.mode !== "playing") {
    startGame();
    return;
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointerdown", (event) => {
  pointer.active = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

canvas.addEventListener("pointerup", () => {
  pointer.active = false;
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

Promise.all([assets.background.decode().catch(() => {}), assets.atlas.decode().catch(() => {})]).then(() => {
  renderFragments();
  setOverlay(config.intro);
  draw();
});
