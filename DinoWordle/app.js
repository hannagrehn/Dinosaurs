const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const FLIP_DURATION_MS = 500;
const FLIP_STAGGER_MS = 250;
const statsKey = "dinowordle-stats";

// Every word is 5 letters and tied to dinosaurs, fossils, or the Mesozoic world.
const WORDS = [
  "TITAN", "CLAWS", "FANGS", "SCALE", "SCALY", "BONES", "ROARS", "TEETH",
  "STOMP", "HORNS", "SPIKE", "PLATE", "TALON", "FROND", "SWAMP", "GIANT",
  "HERDS", "NESTS", "HATCH", "PREYS", "BEAST", "AMBER", "ROCKS", "STONE",
  "CRAWL", "CRUSH", "CHOMP", "GNASH", "PROWL", "STALK", "GLIDE", "SWOOP",
  "FLOCK", "BROOD", "SHELL", "YOLKS", "STORM", "QUAKE", "CRAGS", "CLIFF",
  "CAVES", "MUDDY", "RIDGE", "SPINE", "SPINY", "ARMOR", "FRILL", "BEAKS",
  "CREST", "WINGS", "ROOST", "PACKS", "ALPHA", "HUNTS", "TRAIL", "TRACK",
  "PRINT", "CASTS",
];

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const messageBanner = document.getElementById("message-banner");
const shareButton = document.getElementById("share-button");
const newWordButton = document.getElementById("new-word-button");
const statPlayed = document.getElementById("stat-played");
const statWinPct = document.getElementById("stat-winpct");
const statStreak = document.getElementById("stat-streak");
const statBest = document.getElementById("stat-best");

const state = {
  secret: "",
  guesses: [],
  currentGuess: "",
  currentRow: 0,
  gameOver: false,
  locked: false,
  keyStates: {},
  rowResults: [],
};

newWordButton.addEventListener("click", startGame);
shareButton.addEventListener("click", copyResult);
window.addEventListener("keydown", handleKeydown);

startGame();

function startGame() {
  state.secret = pickWord();
  state.guesses = [];
  state.currentGuess = "";
  state.currentRow = 0;
  state.gameOver = false;
  state.locked = false;
  state.keyStates = {};
  state.rowResults = [];

  hideMessage();
  shareButton.classList.add("hidden");
  buildBoard();
  buildKeyboard();
  renderStats();
}

function pickWord() {
  const previous = state.secret;
  let next = previous;
  while (next === previous && WORDS.length > 1) {
    next = WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  return next;
}

function buildBoard() {
  board.innerHTML = "";
  for (let row = 0; row < MAX_GUESSES; row++) {
    const rowEl = document.createElement("div");
    rowEl.className = "board-row";
    rowEl.id = `row-${row}`;
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.id = `tile-${row}-${col}`;
      rowEl.appendChild(tile);
    }
    board.appendChild(rowEl);
  }
}

function buildKeyboard() {
  keyboard.innerHTML = "";
  KEYBOARD_ROWS.forEach((rowKeys) => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    rowKeys.forEach((key) => {
      const keyEl = document.createElement("button");
      keyEl.type = "button";
      keyEl.className = "key";
      keyEl.id = `key-${key}`;
      if (key === "ENTER" || key === "BACKSPACE") {
        keyEl.classList.add("wide");
        keyEl.textContent = key === "ENTER" ? "Enter" : "⌫";
      } else {
        keyEl.textContent = key;
      }
      keyEl.addEventListener("click", () => handleKeyInput(key));
      rowEl.appendChild(keyEl);
    });
    keyboard.appendChild(rowEl);
  });
}

function handleKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  const key = event.key;
  if (key === "Enter") {
    handleKeyInput("ENTER");
  } else if (key === "Backspace") {
    handleKeyInput("BACKSPACE");
  } else if (/^[a-zA-Z]$/.test(key)) {
    handleKeyInput(key.toUpperCase());
  }
}

function handleKeyInput(key) {
  if (state.gameOver || state.locked) {
    return;
  }

  if (key === "ENTER") {
    submitGuess();
    return;
  }

  if (key === "BACKSPACE") {
    state.currentGuess = state.currentGuess.slice(0, -1);
    renderCurrentRow();
    return;
  }

  if (/^[A-Z]$/.test(key) && state.currentGuess.length < WORD_LENGTH) {
    state.currentGuess += key;
    renderCurrentRow();
  }
}

function renderCurrentRow() {
  const letters = state.currentGuess.split("");
  for (let col = 0; col < WORD_LENGTH; col++) {
    const tile = document.getElementById(`tile-${state.currentRow}-${col}`);
    const letter = letters[col] || "";
    tile.textContent = letter;
    tile.classList.toggle("filled", Boolean(letter));
  }
}

function submitGuess() {
  if (state.currentGuess.length < WORD_LENGTH) {
    showMessage("Not enough letters.", "");
    shakeRow(state.currentRow);
    return;
  }

  const guess = state.currentGuess;
  const results = evaluateGuess(guess, state.secret);
  state.rowResults.push(results);
  state.guesses.push(guess);

  revealRow(state.currentRow, guess, results, () => {
    updateKeyboardColors(guess, results);

    const won = results.every((result) => result === "correct");
    const outOfGuesses = state.currentRow === MAX_GUESSES - 1;

    if (won) {
      state.gameOver = true;
      showMessage("Great job! You matched every letter.", "win");
      updateStats(true);
      shareButton.classList.remove("hidden");
    } else if (outOfGuesses) {
      state.gameOver = true;
      showMessage(`Out of tries. The word was ${state.secret}.`, "lose");
      updateStats(false);
      shareButton.classList.remove("hidden");
    } else {
      state.currentRow += 1;
      state.currentGuess = "";
    }
    state.locked = false;
  });
}

function evaluateGuess(guess, secret) {
  const results = new Array(WORD_LENGTH).fill("absent");
  const letterCounts = {};
  for (const letter of secret) {
    letterCounts[letter] = (letterCounts[letter] || 0) + 1;
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      results[i] = "correct";
      letterCounts[guess[i]] -= 1;
    }
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (results[i] === "correct") {
      continue;
    }
    const letter = guess[i];
    if (letterCounts[letter] > 0) {
      results[i] = "present";
      letterCounts[letter] -= 1;
    }
  }

  return results;
}

function revealRow(row, guess, results, onComplete) {
  state.locked = true;
  for (let col = 0; col < WORD_LENGTH; col++) {
    const tile = document.getElementById(`tile-${row}-${col}`);
    const delay = col * FLIP_STAGGER_MS;
    tile.style.animationDelay = `${delay}ms`;
    tile.classList.add("flip");
    setTimeout(() => {
      tile.classList.add(results[col]);
    }, delay + FLIP_DURATION_MS / 2);
  }
  const totalDelay = (WORD_LENGTH - 1) * FLIP_STAGGER_MS + FLIP_DURATION_MS;
  setTimeout(onComplete, totalDelay);
}

function updateKeyboardColors(guess, results) {
  const priority = { absent: 0, present: 1, correct: 2 };
  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = guess[i];
    const result = results[i];
    const current = state.keyStates[letter];
    if (!current || priority[result] > priority[current]) {
      state.keyStates[letter] = result;
      const keyEl = document.getElementById(`key-${letter}`);
      if (keyEl) {
        keyEl.classList.remove("correct", "present", "absent");
        keyEl.classList.add(result);
      }
    }
  }
}

function shakeRow(row) {
  const rowEl = document.getElementById(`row-${row}`);
  rowEl.classList.add("shake");
  setTimeout(() => rowEl.classList.remove("shake"), 400);
}

function showMessage(text, kind) {
  messageBanner.textContent = text;
  messageBanner.classList.remove("hidden", "win", "lose");
  if (kind) {
    messageBanner.classList.add(kind);
  }
}

function hideMessage() {
  messageBanner.textContent = "";
  messageBanner.classList.add("hidden");
  messageBanner.classList.remove("win", "lose");
}

function loadStats() {
  try {
    const raw = localStorage.getItem(statsKey);
    if (!raw) {
      return { played: 0, wins: 0, streak: 0, bestStreak: 0 };
    }
    return JSON.parse(raw);
  } catch (error) {
    return { played: 0, wins: 0, streak: 0, bestStreak: 0 };
  }
}

function updateStats(won) {
  const stats = loadStats();
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else {
    stats.streak = 0;
  }
  localStorage.setItem(statsKey, JSON.stringify(stats));
  renderStats();
}

function renderStats() {
  const stats = loadStats();
  const winPct = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  statPlayed.textContent = String(stats.played);
  statWinPct.textContent = `${winPct}%`;
  statStreak.textContent = String(stats.streak);
  statBest.textContent = String(stats.bestStreak);
}

async function copyResult() {
  const emojiMap = { correct: "🟩", present: "🟨", absent: "⬛" };
  const grid = state.rowResults
    .map((results) => results.map((result) => emojiMap[result]).join(""))
    .join("\n");
  const summary = `DinoWordle ${state.rowResults.length}/${MAX_GUESSES}\n${grid}`;

  try {
    await navigator.clipboard.writeText(summary);
    showMessage("Result copied to clipboard!", state.rowResults.some((r) => r.every((x) => x === "correct")) ? "win" : "lose");
  } catch (error) {
    showMessage("Couldn't copy automatically, but here's your result in the console.", "");
    console.log(summary);
  }
}
