const storageKey = "dinohat-session";
const initialRoomCode = new URLSearchParams(window.location.search).get("room") || "";

const state = {
  roomCode: "",
  playerId: "",
  snapshot: null,
  pollTimer: null,
  globalMessage: "",
  globalError: false,
};

const authSection = document.getElementById("auth-section");
const roomSection = document.getElementById("room-section");
const globalMessage = document.getElementById("global-message");
const createForm = document.getElementById("create-form");
const joinForm = document.getElementById("join-form");
const clueForm = document.getElementById("clue-form");
const guessForm = document.getElementById("guess-form");
const clueTextInput = document.getElementById("clue-text");
const targetPlayerSelect = document.getElementById("target-player");
const guessPlayerSelect = document.getElementById("guess-player");
const clueSubmitButton = clueForm.querySelector("button[type=submit]");
const guessSubmitButton = guessForm.querySelector("button[type=submit]");
const startGameButton = document.getElementById("start-game");
const leaveButton = document.getElementById("leave-room");
const copyInviteButton = document.getElementById("copy-invite");
const playersList = document.getElementById("players-list");
const roomCodeLabel = document.getElementById("room-code");
const phaseLabel = document.getElementById("phase-label");
const statusMessage = document.getElementById("status-message");
const roundLabel = document.getElementById("round-label");
const guessPanel = document.getElementById("guess-panel");
const activeClue = document.getElementById("active-clue");
const adminPanel = document.getElementById("admin-panel");
const finishedPanel = document.getElementById("finished-panel");
const winnerSummary = document.getElementById("winner-summary");
const inviteLinkInput = document.getElementById("invite-link");
const inviteCodeLabel = document.getElementById("invite-code");
const joinRoomInput = document.getElementById("join-room");
const countdownLabel = document.getElementById("countdown-label");

joinRoomInput.value = initialRoomCode.toUpperCase();

restoreSession();
bindEvents();
render();

if (state.roomCode && state.playerId) {
  startPolling();
}

function bindEvents() {
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const result = await postForm("/api/create-room", formData);
    setSession(result.roomCode, result.playerId);
    createForm.reset();
    startPolling(true);
  });

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(joinForm);
    const roomCode = String(formData.get("roomCode") || "").toUpperCase();
    formData.set("roomCode", roomCode);
    const result = await postForm("/api/join-room", formData);
    setSession(result.roomCode, result.playerId);
    joinForm.reset();
    startPolling(true);
  });

  clueForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    ensureSession();
    const formData = new FormData(clueForm);
    formData.append("roomCode", state.roomCode);
    formData.append("playerId", state.playerId);
    await postForm("/api/submit-clue", formData);
    clueForm.reset();
    await refreshState();
  });

  startGameButton.addEventListener("click", async () => {
    ensureSession();
    const formData = new FormData();
    formData.append("roomCode", state.roomCode);
    formData.append("playerId", state.playerId);
    await postForm("/api/start-game", formData);
    await refreshState();
  });

  guessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    ensureSession();
    const formData = new FormData(guessForm);
    formData.append("roomCode", state.roomCode);
    formData.append("playerId", state.playerId);
    await postForm("/api/guess", formData);
    await refreshState();
  });

  copyInviteButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildInviteLink());
      setStatus("Invite link copied.");
    } catch (error) {
      inviteLinkInput.focus();
      inviteLinkInput.select();
      setStatus("Copy failed, but the invite link is selected for you.", true);
    }
  });

  playersList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-kick-player-id]");
    if (!button) {
      return;
    }

    const playerId = button.getAttribute("data-kick-player-id");
    const playerName = button.getAttribute("data-player-name") || "that player";
    if (!window.confirm(`Kick ${playerName} from the room?`)) {
      return;
    }

    ensureSession();
    const formData = new FormData();
    formData.append("roomCode", state.roomCode);
    formData.append("playerId", state.playerId);
    formData.append("targetPlayerId", playerId);
    await postForm("/api/kick-player", formData);
    await refreshState();
  });

  leaveButton.addEventListener("click", () => {
    clearSession();
    render();
  });
}

function restoreSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.roomCode = saved.roomCode || "";
    state.playerId = saved.playerId || "";
    if (!joinRoomInput.value && state.roomCode) {
      joinRoomInput.value = state.roomCode;
    }
  } catch (error) {
    localStorage.removeItem(storageKey);
  }
}

function setSession(roomCode, playerId) {
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.snapshot = null;
  state.globalMessage = "";
  state.globalError = false;
  localStorage.setItem(storageKey, JSON.stringify({ roomCode, playerId }));
  updateUrl(roomCode);
  render();
}

function clearSession() {
  state.roomCode = "";
  state.playerId = "";
  state.snapshot = null;
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  localStorage.removeItem(storageKey);
  updateUrl("");
}

function updateUrl(roomCode) {
  const nextUrl = roomCode
    ? `${window.location.pathname}?room=${encodeURIComponent(roomCode)}`
    : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
  joinRoomInput.value = roomCode || initialRoomCode.toUpperCase();
}

function startPolling(immediate = false) {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
  }
  state.pollTimer = setInterval(refreshState, 250);
  if (immediate) {
    refreshState();
  }
}

async function refreshState() {
  if (!state.roomCode || !state.playerId) {
    return;
  }

  try {
    const response = await fetch(`/api/state?roomCode=${encodeURIComponent(state.roomCode)}&playerId=${encodeURIComponent(state.playerId)}`);
    const payload = await parseJson(response);
    state.snapshot = payload;
    state.globalMessage = "";
    state.globalError = false;
    render();
  } catch (error) {
    if (error.message === "Player not found in this room." || error.message === "Room not found.") {
      clearSession();
      setGlobalMessage("You are no longer in that room.", true);
      render();
      return;
    }
    setStatus(error.message, true);
  }
}

function render() {
  const inRoom = Boolean(state.roomCode && state.playerId);
  authSection.classList.toggle("hidden", inRoom);
  roomSection.classList.toggle("hidden", !inRoom);
  globalMessage.textContent = state.globalMessage;
  globalMessage.classList.toggle("hidden", !state.globalMessage);
  globalMessage.classList.toggle("error", Boolean(state.globalMessage) && state.globalError);

  if (!inRoom || !state.snapshot) {
    roomCodeLabel.textContent = state.roomCode || "-----";
    phaseLabel.textContent = "Waiting in lobby.";
    playersList.innerHTML = "";
    targetPlayerSelect.innerHTML = "";
    guessPlayerSelect.innerHTML = "";
    roundLabel.textContent = "";
    guessPanel.classList.add("hidden");
    startGameButton.classList.add("hidden");
    adminPanel.classList.add("hidden");
    finishedPanel.classList.add("hidden");
    countdownLabel.classList.add("hidden");
    countdownLabel.textContent = "";
    activeClue.textContent = "";
    winnerSummary.textContent = "";
    inviteLinkInput.value = "";
    inviteCodeLabel.textContent = "";
    statusMessage.textContent = "";
    statusMessage.classList.remove("error");
    clueForm.classList.add("hidden");
    clueTextInput.disabled = true;
    targetPlayerSelect.disabled = true;
    clueSubmitButton.disabled = true;
    guessPlayerSelect.disabled = true;
    guessSubmitButton.disabled = true;
    return;
  }

  const snapshot = state.snapshot;
  roomCodeLabel.textContent = snapshot.roomCode;
  phaseLabel.textContent = phaseText(snapshot.phase);
  statusMessage.textContent = snapshot.lastResult || "";
  statusMessage.classList.remove("error");

  adminPanel.classList.toggle("hidden", !snapshot.isHost);
  finishedPanel.classList.toggle("hidden", snapshot.phase !== "FINISHED");
  inviteLinkInput.value = buildInviteLink(snapshot.roomCode);
  inviteCodeLabel.textContent = snapshot.roomCode;
  winnerSummary.textContent = snapshot.finishedSummary || "";

  roundLabel.textContent = roundText(snapshot);
  activeClue.textContent = snapshot.activeClueText || "";
  countdownLabel.classList.toggle("hidden", !(snapshot.phase === "CLUE_ENTRY" || snapshot.phase === "GUESSING"));
  countdownLabel.textContent = timerText(snapshot);

  playersList.innerHTML = "";
  snapshot.players.forEach((player) => {
    const item = document.createElement("li");
    item.className = "player-item";
    const isSelf = player.id === snapshot.selfId;
    const action = player.canBeKicked
      ? `<button type="button" class="danger small" data-kick-player-id="${player.id}" data-player-name="${escapeHtml(player.name)}">Kick</button>`
      : "";
    item.innerHTML = `
      <div class="player-meta">
        <span>
          <strong>${escapeHtml(player.name)}</strong>
          ${isSelf ? '<span class="pill">you</span>' : ""}
          ${player.isHost ? '<span class="pill accent">host</span>' : ""}
          ${player.isCurrentTurn ? '<span class="pill accent">turn</span>' : ""}
        </span>
        <span class="muted">${player.score} pts · ${player.clueCount}/${snapshot.maxCluesPerPlayer} clues</span>
      </div>
      ${action}
    `;
    playersList.appendChild(item);
  });

  fillTargetPlayerSelect(targetPlayerSelect, snapshot.players, snapshot.maxCluesPerPlayer);
  fillGuessPlayerSelect(guessPlayerSelect, snapshot.players);

  clueForm.classList.toggle("hidden", snapshot.phase !== "CLUE_ENTRY");
  clueTextInput.disabled = !snapshot.canSubmitClues;
  targetPlayerSelect.disabled = !snapshot.canSubmitClues;
  clueSubmitButton.disabled = !snapshot.canSubmitClues;
  startGameButton.classList.toggle("hidden", !snapshot.canStart);

  guessPanel.classList.toggle("hidden", snapshot.phase !== "GUESSING");
  guessPlayerSelect.disabled = !snapshot.canGuess;
  guessSubmitButton.disabled = !snapshot.canGuess;
}

function fillTargetPlayerSelect(select, players, maxCluesPerPlayer) {
  const previousValue = select.value;
  select.innerHTML = "";
  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = `${player.name} (${player.clueCount}/${maxCluesPerPlayer})`;
    option.disabled = player.clueSlotsLeft <= 0;
    select.appendChild(option);
  });
  if (previousValue && Array.from(select.options).some((option) => option.value === previousValue && !option.disabled)) {
    select.value = previousValue;
  } else {
    const firstAvailable = Array.from(select.options).find((option) => !option.disabled);
    if (firstAvailable) {
      select.value = firstAvailable.value;
    }
  }
}

function fillGuessPlayerSelect(select, players) {
  const previousValue = select.value;
  select.innerHTML = "";
  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    select.appendChild(option);
  });
  if (previousValue) {
    select.value = previousValue;
  }
}

function buildInviteLink(roomCode = state.roomCode) {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomCode)}`;
}

function phaseText(phase) {
  switch (phase) {
    case "LOBBY":
      return "Lobby: start the timed game when everyone is ready.";
    case "CLUE_ENTRY":
      return "Shared clue entry: everyone gets 30 seconds to throw things into the hat.";
    case "GUESSING":
      return "Timed guessing: each player gets 10 seconds per guess.";
    case "FINISHED":
      return "Finished: the stop screen is live.";
    default:
      return phase;
  }
}

function roundText(snapshot) {
  switch (snapshot.phase) {
    case "LOBBY":
      return "The host starts a timed round. Then everyone gets one shared 30-second clue window.";
    case "CLUE_ENTRY":
      return "Everyone can write right now. Add as many clues as you can before the 30-second window ends.";
    case "GUESSING":
      return snapshot.isMyTurn
        ? "Your 10-second guess turn is live."
        : `${snapshot.currentTurnPlayerName} is guessing this clue.`;
    case "FINISHED":
      return "No more clues. Final scores are locked.";
    default:
      return "";
  }
}

function timerText(snapshot) {
  if (snapshot.phase === "CLUE_ENTRY") {
    return `Everyone has ${snapshot.turnSecondsLeft} seconds to add clues.`;
  }
  if (snapshot.phase === "GUESSING") {
    return `${snapshot.currentTurnPlayerName} has ${snapshot.turnSecondsLeft} seconds to guess.`;
  }
  return "";
}

async function postForm(url, formData) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams(formData),
  });
  return parseJson(response);
}

async function parseJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", Boolean(message) && isError);
}

function setGlobalMessage(message, isError = false) {
  state.globalMessage = message;
  state.globalError = isError;
}

function ensureSession() {
  if (!state.roomCode || !state.playerId) {
    throw new Error("Join a room first.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
