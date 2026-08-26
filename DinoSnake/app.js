const storageKey = "dinosnake-best-score";

const COLS = 20;
const ROWS = 20;
const CELL = 24;
const START_SPEED_MS = 140;
const MIN_SPEED_MS = 70;
const SPEED_STEP_MS = 4;

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const scoreLabel = document.getElementById("score");
const bestLabel = document.getElementById("best");
const statusMessage = document.getElementById("status-message");
const restartButton = document.getElementById("restart-button");
const dpadButtons = document.querySelectorAll("[data-direction]");

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const state = {
  snake: [],
  direction: DIRECTIONS.right,
  pendingDirection: DIRECTIONS.right,
  food: { x: 0, y: 0 },
  score: 0,
  speedMs: START_SPEED_MS,
  gameOver: false,
  loopHandle: null,
};

restartButton.addEventListener("click", startGame);
window.addEventListener("keydown", handleKeydown);
dpadButtons.forEach((button) => {
  button.addEventListener("click", () => queueDirection(button.dataset.direction));
});

loadBest();
startGame();

function startGame() {
  if (state.loopHandle) {
    clearTimeout(state.loopHandle);
  }

  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);
  state.snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];
  state.direction = DIRECTIONS.right;
  state.pendingDirection = DIRECTIONS.right;
  state.score = 0;
  state.speedMs = START_SPEED_MS;
  state.gameOver = false;

  scoreLabel.textContent = "0";
  statusMessage.classList.add("hidden");
  statusMessage.textContent = "";

  placeFood();
  draw();
  tick();
}

function tick() {
  if (state.gameOver) {
    return;
  }
  update();
  draw();
  state.loopHandle = setTimeout(tick, state.speedMs);
}

function update() {
  state.direction = state.pendingDirection;
  const head = state.snake[0];
  const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  if (
    newHead.x < 0 ||
    newHead.x >= COLS ||
    newHead.y < 0 ||
    newHead.y >= ROWS ||
    state.snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y)
  ) {
    endGame();
    return;
  }

  state.snake.unshift(newHead);

  if (newHead.x === state.food.x && newHead.y === state.food.y) {
    state.score += 1;
    scoreLabel.textContent = String(state.score);
    state.speedMs = Math.max(MIN_SPEED_MS, START_SPEED_MS - state.score * SPEED_STEP_MS);
    placeFood();
  } else {
    state.snake.pop();
  }
}

function placeFood() {
  let candidate;
  do {
    candidate = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (state.snake.some((segment) => segment.x === candidate.x && segment.y === candidate.y));
  state.food = candidate;
}

function endGame() {
  state.gameOver = true;
  if (state.loopHandle) {
    clearTimeout(state.loopHandle);
  }
  statusMessage.textContent = `Game over! Final score: ${state.score}. Press Restart to try again.`;
  statusMessage.classList.remove("hidden");
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
  if (!next) {
    return;
  }
  const current = state.direction;
  const isReverse = next.x === -current.x && next.y === -current.y;
  if (!isReverse) {
    state.pendingDirection = next;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawFood();

  for (let i = state.snake.length - 1; i >= 1; i--) {
    drawBodySegment(state.snake[i], i);
  }
  drawHead(state.snake[0], state.direction);
}

function drawFood() {
  const cx = state.food.x * CELL + CELL / 2;
  const cy = state.food.y * CELL + CELL / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#f5f0dc";
  ctx.beginPath();
  ctx.ellipse(0, 0, CELL * 0.32, CELL * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#a3785a";
  ctx.beginPath();
  ctx.arc(-CELL * 0.1, -CELL * 0.08, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CELL * 0.08, CELL * 0.05, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CELL * 0.02, -CELL * 0.15, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBodySegment(segment, index) {
  const x = segment.x * CELL;
  const y = segment.y * CELL;
  const shade = index % 2 === 0 ? "#22c55e" : "#16a34a";

  ctx.fillStyle = shade;
  roundedRect(x + 2, y + 2, CELL - 4, CELL - 4, 6);
  ctx.fill();

  ctx.fillStyle = "#166534";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2 - 4, y + 3);
  ctx.lineTo(x + CELL / 2 + 4, y + 3);
  ctx.lineTo(x + CELL / 2, y - 3);
  ctx.closePath();
  ctx.fill();
}

function drawHead(head, direction) {
  const x = head.x * CELL;
  const y = head.y * CELL;

  ctx.fillStyle = "#4ade80";
  roundedRect(x + 1, y + 1, CELL - 2, CELL - 2, 7);
  ctx.fill();

  ctx.fillStyle = "#166534";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2 - 5, y + 2);
  ctx.lineTo(x + CELL / 2 + 5, y + 2);
  ctx.lineTo(x + CELL / 2, y - 5);
  ctx.closePath();
  ctx.fill();

  const snoutSize = CELL * 0.4;
  ctx.fillStyle = "#86efac";
  let snoutX = x + CELL / 2;
  let snoutY = y + CELL / 2;
  if (direction === DIRECTIONS.right) snoutX = x + CELL - snoutSize / 2;
  if (direction === DIRECTIONS.left) snoutX = x + snoutSize / 2;
  if (direction === DIRECTIONS.up) snoutY = y + snoutSize / 2;
  if (direction === DIRECTIONS.down) snoutY = y + CELL - snoutSize / 2;
  ctx.beginPath();
  ctx.ellipse(snoutX, snoutY, snoutSize / 2, snoutSize / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.ellipse(snoutX, snoutY, snoutSize / 4, snoutSize / 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const eyeOffsetX = direction === DIRECTIONS.left ? -CELL * 0.18 : CELL * 0.18;
  const eyeOffsetY = direction === DIRECTIONS.up ? -CELL * 0.05 : CELL * 0.02;
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(x + CELL / 2 + eyeOffsetX * 0.5, y + CELL / 2 - CELL * 0.18 + eyeOffsetY * 0.2, 2.2, 0, Math.PI * 2);
  ctx.fill();
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

function loadBest() {
  const saved = Number(localStorage.getItem(storageKey)) || 0;
  bestLabel.textContent = String(saved);
}

function saveBest(score) {
  const saved = Number(localStorage.getItem(storageKey)) || 0;
  if (score > saved) {
    localStorage.setItem(storageKey, String(score));
  }
  loadBest();
}
