const ICONS = ["🦕", "🦖", "🥚", "🦴", "🌋", "🌿", "🦎", "🐊"];
const storageKey = "dinomemory-best-moves";

const board = document.getElementById("board");
const movesLabel = document.getElementById("moves");
const timerLabel = document.getElementById("timer");
const bestLabel = document.getElementById("best");
const winMessage = document.getElementById("win-message");
const restartButton = document.getElementById("restart-button");

const state = {
  tiles: [],
  flippedIndexes: [],
  matchedCount: 0,
  moves: 0,
  busy: false,
  startTime: null,
  timerInterval: null,
};

restartButton.addEventListener("click", startGame);

loadBest();
startGame();

function startGame() {
  clearInterval(state.timerInterval);
  state.tiles = buildDeck();
  state.flippedIndexes = [];
  state.matchedCount = 0;
  state.moves = 0;
  state.busy = false;
  state.startTime = null;
  state.timerInterval = null;

  movesLabel.textContent = "0";
  timerLabel.textContent = "00:00";
  winMessage.classList.add("hidden");
  winMessage.textContent = "";

  renderBoard();
}

function buildDeck() {
  const pairs = ICONS.flatMap((icon) => [icon, icon]);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map((icon) => ({ icon, flipped: false, matched: false }));
}

function renderBoard() {
  board.innerHTML = "";
  state.tiles.forEach((tile, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    button.setAttribute("aria-label", "Hidden dino card");
    button.innerHTML = `
      <div class="tile-inner">
        <div class="tile-face tile-front"></div>
        <div class="tile-face tile-back">${tile.icon}</div>
      </div>
    `;
    button.addEventListener("click", () => flipTile(index));
    board.appendChild(button);
  });
}

function flipTile(index) {
  const tile = state.tiles[index];
  if (state.busy || tile.flipped || tile.matched) {
    return;
  }

  if (!state.startTime) {
    state.startTime = Date.now();
    state.timerInterval = setInterval(updateTimer, 1000);
  }

  tile.flipped = true;
  state.flippedIndexes.push(index);
  updateTileClasses();

  if (state.flippedIndexes.length === 2) {
    state.moves += 1;
    movesLabel.textContent = String(state.moves);
    checkForMatch();
  }
}

function checkForMatch() {
  const [firstIndex, secondIndex] = state.flippedIndexes;
  const first = state.tiles[firstIndex];
  const second = state.tiles[secondIndex];

  if (first.icon === second.icon) {
    first.matched = true;
    second.matched = true;
    state.matchedCount += 2;
    state.flippedIndexes = [];
    updateTileClasses();

    if (state.matchedCount === state.tiles.length) {
      finishGame();
    }
    return;
  }

  state.busy = true;
  setTimeout(() => {
    first.flipped = false;
    second.flipped = false;
    state.flippedIndexes = [];
    state.busy = false;
    updateTileClasses();
  }, 800);
}

function updateTileClasses() {
  const tileElements = board.querySelectorAll(".tile");
  state.tiles.forEach((tile, index) => {
    const element = tileElements[index];
    element.classList.toggle("flipped", tile.flipped);
    element.classList.toggle("matched", tile.matched);
    element.classList.toggle("disabled", tile.flipped || tile.matched);
  });
}

function updateTimer() {
  const elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  timerLabel.textContent = `${minutes}:${seconds}`;
}

function finishGame() {
  clearInterval(state.timerInterval);
  winMessage.textContent = `You matched every dino in ${state.moves} moves and ${timerLabel.textContent}!`;
  winMessage.classList.remove("hidden");
  saveBest(state.moves);
}

function loadBest() {
  const saved = localStorage.getItem(storageKey);
  bestLabel.textContent = saved ? `${saved} moves` : "--";
}

function saveBest(moves) {
  const saved = Number(localStorage.getItem(storageKey));
  if (!saved || moves < saved) {
    localStorage.setItem(storageKey, String(moves));
  }
  loadBest();
}
