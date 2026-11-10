const CELL = 24;
const COLS = 19;
const ROWS = 19;
const TICK_MS = 160;
const FRIGHTENED_TICKS = 40;
const DEATH_PAUSE_MS = 1000;
const bestKey = "dinoman-best-score";

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const ALL_DIRECTIONS = [DIRECTIONS.up, DIRECTIONS.down, DIRECTIONS.left, DIRECTIONS.right];

const NEST = { row: 9, col: 9 };
const PLAYER_START = { row: 15, col: 9 };
const GHOST_DEFS = [
  { row: 9, col: 7, color: "#ef4444" },
  { row: 9, col: 11, color: "#f472b6" },
  { row: 7, col: 9, color: "#38bdf8" },
  { row: 11, col: 9, color: "#fb923c" },
];

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const scoreLabel = document.getElementById("score");
const livesLabel = document.getElementById("lives");
const bestLabel = document.getElementById("best");
const statusMessage = document.getElementById("status-message");
const restartButton = document.getElementById("restart-button");
const dpadButtons = document.querySelectorAll("[data-direction]");

let walls = new Set();
let dots = new Set();
let pellets = new Set();

const state = {
  player: null,
  ghosts: [],
  score: 0,
  lives: 3,
  tickCount: 0,
  frightenedUntilTick: 0,
  chainMultiplier: 1,
  paused: false,
  gameOver: false,
  tickHandle: null,
  mouthOpen: true,
};

restartButton.addEventListener("click", startGame);
window.addEventListener("keydown", handleKeydown);
dpadButtons.forEach((button) => {
  button.addEventListener("click", () => queueDirection(button.dataset.direction));
});

loadBest();
startGame();

function startGame() {
  if (state.tickHandle) {
    clearInterval(state.tickHandle);
  }

  buildMaze();

  state.player = { row: PLAYER_START.row, col: PLAYER_START.col, dir: null, pending: null };
  state.ghosts = GHOST_DEFS.map((def) => ({
    row: def.row,
    col: def.col,
    spawnRow: def.row,
    spawnCol: def.col,
    color: def.color,
    dir: pickInitialDirection(def.row, def.col),
    frightened: false,
    eaten: false,
  }));
  state.score = 0;
  state.lives = 3;
  state.tickCount = 0;
  state.frightenedUntilTick = 0;
  state.chainMultiplier = 1;
  state.paused = false;
  state.gameOver = false;
  state.mouthOpen = true;

  scoreLabel.textContent = "0";
  updateLivesLabel();
  hideStatus();

  draw();
  state.tickHandle = setInterval(tick, TICK_MS);
}

function buildMaze() {
  walls = new Set();
  dots = new Set();
  pellets = new Set();

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const isBorder = row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1;
      const isPillar = row % 2 === 0 && col % 2 === 0;
      if (isBorder || isPillar) {
        walls.add(key(row, col));
      }
    }
  }

  // Open a small nest room in the center for the ghosts.
  [[8, 8], [8, 10], [10, 8], [10, 10]].forEach(([row, col]) => {
    walls.delete(key(row, col));
  });

  const noDotCells = new Set([
    key(PLAYER_START.row, PLAYER_START.col),
    ...GHOST_DEFS.map((def) => key(def.row, def.col)),
  ]);
  const pelletCells = [[1, 1], [1, 17], [17, 1], [17, 17]].map(([row, col]) => key(row, col));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cellKey = key(row, col);
      if (walls.has(cellKey) || noDotCells.has(cellKey)) {
        continue;
      }
      if (pelletCells.includes(cellKey)) {
        pellets.add(cellKey);
      } else {
        dots.add(cellKey);
      }
    }
  }
}

function pickInitialDirection(row, col) {
  return ALL_DIRECTIONS.find((dir) => isOpen(row + dir.y, col + dir.x)) || DIRECTIONS.up;
}

function key(row, col) {
  return `${row},${col}`;
}

function isOpen(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
    return false;
  }
  return !walls.has(key(row, col));
}

function tick() {
  if (state.gameOver || state.paused) {
    draw();
    return;
  }

  state.tickCount += 1;
  state.mouthOpen = !state.mouthOpen;

  movePlayer();
  handleFrightenedTimeout();
  state.ghosts.forEach((ghost) => moveGhost(ghost));
  checkCollisions();
  draw();
}

function movePlayer() {
  const player = state.player;
  if (player.pending && isOpen(player.row + player.pending.y, player.col + player.pending.x)) {
    player.dir = player.pending;
    player.pending = null;
  }
  if (player.dir && isOpen(player.row + player.dir.y, player.col + player.dir.x)) {
    player.row += player.dir.y;
    player.col += player.dir.x;
  }

  const cellKey = key(player.row, player.col);
  if (dots.has(cellKey)) {
    dots.delete(cellKey);
    state.score += 10;
    scoreLabel.textContent = String(state.score);
  } else if (pellets.has(cellKey)) {
    pellets.delete(cellKey);
    state.score += 50;
    scoreLabel.textContent = String(state.score);
    state.frightenedUntilTick = state.tickCount + FRIGHTENED_TICKS;
    state.chainMultiplier = 1;
    state.ghosts.forEach((ghost) => {
      if (!ghost.eaten) {
        ghost.frightened = true;
      }
    });
  }

  if (dots.size === 0 && pellets.size === 0) {
    endGame(true);
  }
}

function handleFrightenedTimeout() {
  if (state.tickCount >= state.frightenedUntilTick) {
    state.ghosts.forEach((ghost) => {
      if (!ghost.eaten) {
        ghost.frightened = false;
      }
    });
  }
}

function moveGhost(ghost) {
  if (ghost.frightened && !ghost.eaten && state.tickCount % 2 !== 0) {
    return;
  }

  const nonReverse = ALL_DIRECTIONS.filter((dir) => {
    if (ghost.dir && dir.x === -ghost.dir.x && dir.y === -ghost.dir.y) {
      return false;
    }
    return isOpen(ghost.row + dir.y, ghost.col + dir.x);
  });
  const candidates = nonReverse.length > 0
    ? nonReverse
    : ALL_DIRECTIONS.filter((dir) => isOpen(ghost.row + dir.y, ghost.col + dir.x));

  if (candidates.length === 0) {
    return;
  }

  const target = ghost.eaten ? NEST : { row: state.player.row, col: state.player.col };
  const wantFar = ghost.frightened && !ghost.eaten;

  let chosen = candidates[0];
  let bestDist = null;
  candidates.forEach((dir) => {
    const row = ghost.row + dir.y;
    const col = ghost.col + dir.x;
    const dist = distanceSq(row, col, target.row, target.col);
    if (bestDist === null || (wantFar ? dist > bestDist : dist < bestDist)) {
      bestDist = dist;
      chosen = dir;
    }
  });

  ghost.dir = chosen;
  ghost.row += chosen.y;
  ghost.col += chosen.x;

  if (ghost.eaten && ghost.row === NEST.row && ghost.col === NEST.col) {
    ghost.eaten = false;
    ghost.frightened = false;
  }
}

function distanceSq(row1, col1, row2, col2) {
  const dRow = row1 - row2;
  const dCol = col1 - col2;
  return dRow * dRow + dCol * dCol;
}

function checkCollisions() {
  const player = state.player;
  for (const ghost of state.ghosts) {
    if (ghost.row !== player.row || ghost.col !== player.col) {
      continue;
    }

    if (ghost.eaten) {
      continue;
    }

    if (ghost.frightened) {
      ghost.eaten = true;
      ghost.frightened = false;
      state.score += 200 * state.chainMultiplier;
      state.chainMultiplier = Math.min(state.chainMultiplier * 2, 8);
      scoreLabel.textContent = String(state.score);
    } else {
      loseLife();
      return;
    }
  }
}

function loseLife() {
  state.lives -= 1;
  updateLivesLabel();

  if (state.lives <= 0) {
    endGame(false);
    return;
  }

  state.paused = true;
  resetPositions();
  setTimeout(() => {
    state.paused = false;
  }, DEATH_PAUSE_MS);
}

function resetPositions() {
  state.player.row = PLAYER_START.row;
  state.player.col = PLAYER_START.col;
  state.player.dir = null;
  state.player.pending = null;

  state.ghosts.forEach((ghost) => {
    ghost.row = ghost.spawnRow;
    ghost.col = ghost.spawnCol;
    ghost.dir = pickInitialDirection(ghost.row, ghost.col);
    ghost.frightened = false;
    ghost.eaten = false;
  });
  state.frightenedUntilTick = 0;
}

function endGame(won) {
  state.gameOver = true;
  clearInterval(state.tickHandle);
  if (won) {
    showStatus(`You cleared the maze! Final score: ${state.score}.`, "win");
  } else {
    showStatus(`Game over! Final score: ${state.score}.`, "lose");
  }
  saveBest(state.score);
}

function handleKeydown(event) {
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  const direction = keyMap[event.key];
  if (direction) {
    event.preventDefault();
    queueDirection(direction);
  }
}

function queueDirection(directionName) {
  const next = DIRECTIONS[directionName];
  if (next && state.player) {
    state.player.pending = next;
  }
}

function updateLivesLabel() {
  livesLabel.textContent = state.lives > 0 ? "🥚".repeat(state.lives) : "💥";
}

function showStatus(text, kind) {
  statusMessage.textContent = text;
  statusMessage.classList.remove("hidden", "win", "lose");
  statusMessage.classList.add(kind);
}

function hideStatus() {
  statusMessage.textContent = "";
  statusMessage.classList.add("hidden");
  statusMessage.classList.remove("win", "lose");
}

function loadBest() {
  const saved = Number(localStorage.getItem(bestKey)) || 0;
  bestLabel.textContent = String(saved);
}

function saveBest(score) {
  const saved = Number(localStorage.getItem(bestKey)) || 0;
  if (score > saved) {
    localStorage.setItem(bestKey, String(score));
  }
  loadBest();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawWalls();
  drawDots();
  drawPellets();
  state.ghosts.forEach((ghost) => drawGhost(ghost));
  drawPlayer();
}

function drawWalls() {
  ctx.fillStyle = "#4c1d95";
  walls.forEach((cellKey) => {
    const [row, col] = cellKey.split(",").map(Number);
    roundedRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2, 5);
    ctx.fill();
  });
}

function drawDots() {
  ctx.fillStyle = "#fde68a";
  dots.forEach((cellKey) => {
    const [row, col] = cellKey.split(",").map(Number);
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPellets() {
  const pulse = 3.5 + Math.sin(Date.now() / 150) * 1.5;
  ctx.fillStyle = "#fde047";
  pellets.forEach((cellKey) => {
    const [row, col] = cellKey.split(",").map(Number);
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPlayer() {
  const player = state.player;
  const cx = player.col * CELL + CELL / 2;
  const cy = player.row * CELL + CELL / 2;
  const radius = CELL / 2 - 2;
  const dir = player.dir || DIRECTIONS.right;
  const facingAngle = Math.atan2(dir.y, dir.x);
  const mouthAngle = state.mouthOpen ? 0.28 * Math.PI : 0.04 * Math.PI;

  ctx.save();
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, facingAngle + mouthAngle, facingAngle - mouthAngle + Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#166534";
  [-0.6, 0, 0.6].forEach((offset) => {
    const angle = facingAngle + Math.PI + offset;
    const bx = cx + Math.cos(angle) * radius * 0.75;
    const by = cy + Math.sin(angle) * radius * 0.75;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 3, by - 5);
    ctx.lineTo(bx - 3, by - 5);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawGhost(ghost) {
  const cx = ghost.col * CELL + CELL / 2;
  const cy = ghost.row * CELL + CELL / 2;
  const radius = CELL / 2 - 2;

  if (ghost.eaten) {
    drawEyes(cx, cy, ghost.dir);
    return;
  }

  const bodyColor = ghost.frightened ? "#1d4ed8" : ghost.color;

  // Tail, pointing opposite the direction of travel.
  ctx.fillStyle = bodyColor;
  const tailAngle = Math.atan2(-ghost.dir.y, -ghost.dir.x);
  const tailBaseX = cx + Math.cos(tailAngle) * radius * 0.6;
  const tailBaseY = cy + Math.sin(tailAngle) * radius * 0.6;
  const tailTipX = cx + Math.cos(tailAngle) * radius * 1.5;
  const tailTipY = cy + Math.sin(tailAngle) * radius * 1.5;
  const perpX = -Math.sin(tailAngle) * radius * 0.35;
  const perpY = Math.cos(tailAngle) * radius * 0.35;
  ctx.beginPath();
  ctx.moveTo(tailBaseX + perpX, tailBaseY + perpY);
  ctx.lineTo(tailTipX, tailTipY);
  ctx.lineTo(tailBaseX - perpX, tailBaseY - perpY);
  ctx.closePath();
  ctx.fill();

  // Two little legs underneath.
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.4, cy + radius * 0.8, radius * 0.3, radius * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.4, cy + radius * 0.8, radius * 0.3, radius * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rounded body.
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.95, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();

  // Little back spikes to keep the dino theme.
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.45, cy - radius * 0.7);
  ctx.lineTo(cx - radius * 0.25, cy - radius * 1.2);
  ctx.lineTo(cx - radius * 0.05, cy - radius * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + radius * 0.05, cy - radius * 0.75);
  ctx.lineTo(cx + radius * 0.25, cy - radius * 1.2);
  ctx.lineTo(cx + radius * 0.45, cy - radius * 0.75);
  ctx.closePath();
  ctx.fill();

  if (ghost.frightened) {
    ctx.fillStyle = "#e0f2fe";
    ctx.fillRect(cx - radius * 0.45, cy - 3, 4, 4);
    ctx.fillRect(cx + radius * 0.2, cy - 3, 4, 4);
  } else {
    drawEyes(cx, cy, ghost.dir);
  }
}

function drawEyes(cx, cy, dir) {
  const eyeOffsetX = CELL * 0.16;
  const eyeY = cy - 2;
  [-1, 1].forEach((side) => {
    const ex = cx + side * eyeOffsetX;
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(ex, eyeY, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(ex + dir.x * 1.4, eyeY + dir.y * 1.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
