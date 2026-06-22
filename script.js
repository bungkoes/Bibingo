const MIN_SIZE = 5;
const MAX_SIZE = 12;
const BINGO_BASE = ["B", "I", "N", "G", "O"];
const DEFAULT_THEME = { hue: 156, saturation: 72, lightness: 27 };
const ROOM_PREFIX = "bibingo-room-";

const DEFAULT_SUPABASE_URL = "https://dvabhbvilbbebrjuwhkb.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YWJoYnZpbGJiZWJyanV3aGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTM3MzYsImV4cCI6MjA5NzYyOTczNn0.qX__u6GoYspMqRMCNJojQxYaXYe8KZknNecM2AQvs9E";

function getOrCreatePlayerId() {
  let id = localStorage.getItem("bibingo-player-id");
  if (!id) {
    const random = Math.random().toString(36).slice(2, 8);
    id = `player-${Date.now().toString(36)}-${random}`;
    localStorage.setItem("bibingo-player-id", id);
  }
  return id;
}

const state = {
  size: MIN_SIZE,
  theme: { ...DEFAULT_THEME },
  gameStarted: false,
  historyGuardActive: false,
  cells: [],
  marked: new Set(),
  selectedIndex: null,
  entry: "",
  completedLines: [],
  mode: "local",
  winnerShown: false,
  localWinnerAnnounced: false,
  playerId: getOrCreatePlayerId(),
  playerName: "",
  online: {
    role: null,
    peer: null,
    hostConnection: null,
    connections: new Map(),
    room: null,
    ready: false,
    winnerReported: false,
  },
};

const lobbyScreen = document.querySelector("#lobbyScreen");
const setupScreen = document.querySelector("#setupScreen");
const gameScreen = document.querySelector("#gameScreen");
const boardSize = document.querySelector("#boardSize");
const startButton = document.querySelector("#startButton");
const newGameButton = document.querySelector("#newGameButton");
const exitToLobbyButton = document.querySelector("#exitToLobbyButton");
const backToLobbyFromSetupButton = document.querySelector("#backToLobbyFromSetupButton");
const currentSize = document.querySelector("#currentSize");
const fillRandomButton = document.querySelector("#fillRandomButton");
const clearBoardButton = document.querySelector("#clearBoardButton");
const boardGrid = document.querySelector("#boardGrid");
const statusLine = document.querySelector("#statusLine");
const selectedCell = document.querySelector("#selectedCell");
const entryDisplay = document.querySelector("#entryDisplay");
const numpadPanel = document.querySelector("#numpadPanel");
const bingoWord = document.querySelector("#bingoWord");
const numpadButtons = Array.from(document.querySelectorAll("[data-number]"));
const backspaceButton = document.querySelector("#backspaceButton");
const applyNumberButton = document.querySelector("#applyNumberButton");
const confirmModal = document.querySelector("#confirmModal");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const cancelConfirmButton = document.querySelector("#cancelConfirmButton");
const acceptConfirmButton = document.querySelector("#acceptConfirmButton");
const winnerModal = document.querySelector("#winnerModal");
const winnerTitle = document.querySelector("#winnerTitle");
const winnerMessage = document.querySelector("#winnerMessage");
const closeWinnerButton = document.querySelector("#closeWinnerButton");
const colorWheel = document.querySelector("#colorWheel");
const colorMarker = document.querySelector("#colorMarker");
const brightnessSlider = document.querySelector("#brightnessSlider");
const playerNameInput = document.querySelector("#playerName");
const createRoomButton = document.querySelector("#createRoomButton");
const joinRoomButton = document.querySelector("#joinRoomButton");
const offlineButton = document.querySelector("#offlineButton");
const roomCodeInput = document.querySelector("#roomCodeInput");
const roomCodeDisplay = document.querySelector("#roomCodeDisplay");
const lobbyStatus = document.querySelector("#lobbyStatus");
const playerList = document.querySelector("#playerList");
const setupRoomInfo = document.querySelector("#setupRoomInfo");
const setupRoomCode = document.querySelector("#setupRoomCode");
const setupPlayers = document.querySelector("#setupPlayers");
const readyButton = document.querySelector("#readyButton");
const onlinePanel = document.querySelector("#onlinePanel");
const gameRoomCode = document.querySelector("#gameRoomCode");
const gamePlayers = document.querySelector("#gamePlayers");
let bingoLetters = [];
let confirmResolver = null;

function makeId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function getPlayerName() {
  const name = playerNameInput.value.trim();
  return name || "Player";
}

function setMode(mode) {
  state.mode = mode;
  startButton.textContent = "Start Game";
  const isClientInOnline = mode === "online" && state.online.role !== "host";
  startButton.classList.toggle("hidden", isClientInOnline);
  startButton.disabled = isClientInOnline;
  setupRoomInfo.classList.toggle("hidden", mode !== "online");
  updateSetupControls();
}

function showLobby() {
  lobbyScreen.classList.remove("hidden");
  setupScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  startLobbyPolling();
}

function showSetup() {
  lobbyScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  updateSetupRoomInfo();
  updateSetupControls();
  const isClientInOnline = state.mode === "online" && state.online.role !== "host";
  startButton.classList.toggle("hidden", isClientInOnline);
  startButton.disabled = isClientInOnline;
  stopLobbyPolling();
}

function leaveGameForSetup() {
  state.gameStarted = false;
  state.historyGuardActive = false;
  state.online.ready = false;
  state.online.winnerReported = false;
  state.winnerShown = false;
  state.localWinnerAnnounced = false;

  if (state.mode === "online" && state.online.room) {
    const roomCode = state.online.room.code;
    localStorage.removeItem(`bibingo-board-cells-${state.playerId}-${roomCode}`);
    localStorage.removeItem(`bibingo-board-marked-${state.playerId}-${roomCode}`);
  }

  state.cells = [];
  state.marked.clear();
  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  readyButton.disabled = false;
  readyButton.textContent = "READY!";
  showSetup();
}

function setLobbyStatus(message) {
  lobbyStatus.textContent = message;
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getSelfPlayer(ready = false) {
  state.playerName = getPlayerName();
  return {
    id: state.playerId,
    name: state.playerName,
    ready,
    connected: true,
  };
}

function ensureSelfInRoom(ready = false) {
  const room = state.online.room;
  if (!room) {
    return;
  }

  const self = getSelfPlayer(ready);
  const existingIndex = room.players.findIndex((player) => player.id === state.playerId);

  if (existingIndex === -1) {
    room.players.unshift(self);
  } else {
    room.players[existingIndex] = { ...room.players[existingIndex], ...self };
  }
}

let supabaseClient = null;
let activeChannel = null;
let heartbeatInterval = null;
let lobbyPollInterval = null;

function startLobbyPolling() {
  if (lobbyPollInterval) clearInterval(lobbyPollInterval);
  fetchAvailableRooms();
  lobbyPollInterval = setInterval(() => {
    if (!state.gameStarted && supabaseClient && lobbyScreen && !lobbyScreen.classList.contains("hidden")) {
      fetchAvailableRooms();
    } else {
      stopLobbyPolling();
    }
  }, 10000);
}

function stopLobbyPolling() {
  if (lobbyPollInterval) {
    clearInterval(lobbyPollInterval);
    lobbyPollInterval = null;
  }
}

async function fetchAvailableRooms() {
  if (!supabaseClient) return;
  const listContainer = document.querySelector("#availableRoomsList");
  if (!listContainer) return;

  try {
    const { data: dbRooms, error: roomsError } = await supabaseClient
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (roomsError) throw roomsError;

    const { data: dbPlayers, error: playersError } = await supabaseClient
      .from("players")
      .select("id, room_code");

    if (playersError) throw playersError;

    const playerCounts = {};
    const memberRooms = new Set();
    (dbPlayers || []).forEach((player) => {
      playerCounts[player.room_code] = (playerCounts[player.room_code] || 0) + 1;
      if (player.id === state.playerId) {
        memberRooms.add(player.room_code);
      }
    });

    const now = new Date();
    const staleRoomCodes = [];
    const activeRooms = [];

    dbRooms.forEach((room) => {
      const count = playerCounts[room.code] || 0;
      const createdAt = new Date(room.created_at);
      const ageInMinutes = (now - createdAt) / (1000 * 60);

      if (count === 0 && ageInMinutes > 30) {
        staleRoomCodes.push(room.code);
      } else {
        activeRooms.push(room);
      }
    });

    if (staleRoomCodes.length > 0) {
      console.log("Deleting empty rooms > 30 minutes:", staleRoomCodes);
      supabaseClient
        .from("rooms")
        .delete()
        .in("code", staleRoomCodes)
        .then(({ error }) => {
          if (error) console.error("Failed to delete empty rooms:", error);
        });
    }

    const roomsToRender = activeRooms.slice(0, 10);

    if (roomsToRender.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <div class="empty-title">No Active Rooms</div>
          <div class="empty-desc">Create a new room above to start playing online.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = roomsToRender
      .map((room) => {
        const count = playerCounts[room.code] || 0;
        const phaseLabel = room.phase === "playing" ? "Playing" : room.phase === "setup" ? "Setup" : "Lobby";
        const badgeColor = room.phase === "playing" ? "var(--coral)" : room.phase === "setup" ? "var(--blue)" : "var(--green-dark)";
        const isMember = memberRooms.has(room.code);
        const canJoin = room.phase === "lobby" || isMember;
        const btnStyle = isMember
          ? "min-height: auto; height: 32px; padding: 0 12px; font-size: 0.8rem; margin: 0; background: var(--green); color: white; border-color: var(--green-dark); font-weight: bold;"
          : (canJoin
              ? "min-height: auto; height: 32px; padding: 0 12px; font-size: 0.8rem; margin: 0;"
              : "min-height: auto; height: 32px; padding: 0 12px; font-size: 0.8rem; margin: 0; opacity: 0.5; cursor: not-allowed;");

        const btnText = isMember ? "Rejoin" : (canJoin ? "Join" : "Locked");

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: white; font-size: 0.9rem; gap: 10px;">
            <div style="display: flex; flex-direction: column; text-align: left;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="color: var(--green-dark); font-size: 0.95rem;">${escapeHtml(room.code)}</strong>
                <span style="font-size: 0.72rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; color: white; background: ${badgeColor}; text-transform: uppercase;">${phaseLabel}</span>
              </div>
              <span style="color: var(--muted); font-size: 0.78rem; margin-top: 2px;">Players: ${count}</span>
            </div>
            <button class="secondary-button" style="${btnStyle}" ${canJoin ? `onclick="joinRoomByCode('${escapeHtml(room.code)}')"` : "disabled"}>${btnText}</button>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Failed to fetch room list:", err);
    listContainer.innerHTML = `
      <div class="empty-state" style="border-color: var(--coral); background: rgba(228, 93, 69, 0.04);">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title" style="color: var(--coral);">Failed to Load Rooms</div>
        <div class="empty-desc">Please check your internet connection and try again.</div>
      </div>
    `;
  }
}

window.joinRoomByCode = (code) => {
  const nameInput = document.querySelector("#playerName");
  if (!nameInput.value.trim()) {
    setLobbyStatus("Please enter your name before joining a room!");
    nameInput.focus();
    return;
  }

  const tabCreateBtn = document.querySelector("#tabCreateBtn");
  const tabJoinBtn = document.querySelector("#tabJoinBtn");
  const contentCreateRoom = document.querySelector("#contentCreateRoom");
  const contentJoinRoom = document.querySelector("#contentJoinRoom");
  if (tabJoinBtn && tabCreateBtn && contentJoinRoom && contentCreateRoom) {
    tabJoinBtn.classList.add("active");
    tabCreateBtn.classList.remove("active");
    contentJoinRoom.classList.remove("hidden");
    contentCreateRoom.classList.add("hidden");
  }

  roomCodeInput.value = code;
  joinRoom();
};

function initSupabase() {
  const url = DEFAULT_SUPABASE_URL;
  const key = DEFAULT_SUPABASE_KEY;
  if (url && key) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      return true;
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
  return false;
}

function checkSupabaseConfigured() {
  if (!supabaseClient) {
    if (!initSupabase()) {
      setLobbyStatus("Online connection disabled (empty Supabase credentials in script.js).");
      return false;
    }
  }
  return true;
}

function convertDbRoomToStateRoom(dbRoom, dbPlayers) {
  return {
    code: dbRoom.code,
    hostId: dbRoom.host_id,
    size: dbRoom.size,
    phase: dbRoom.phase,
    turnIndex: dbRoom.turn_index,
    calledNumbers: dbRoom.called_numbers || [],
    lastCall: dbRoom.last_call,
    winner: dbRoom.winner,
    lastWinnerId: dbRoom.last_winner_id,
    players: dbPlayers.map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: true
    }))
  };
}

async function fetchAndSyncRoom(roomCode) {
  if (!supabaseClient) return;
  try {
    const { data: rooms, error: roomError } = await supabaseClient
      .from("rooms")
      .select("*")
      .eq("code", roomCode);

    if (roomError) throw roomError;
    if (!rooms || rooms.length === 0) return;

    const dbRoom = rooms[0];

    const { data: dbPlayers, error: playersError } = await supabaseClient
      .from("players")
      .select("*")
      .eq("room_code", roomCode)
      .order("id", { ascending: true });

    if (playersError) throw playersError;

    const now = new Date();
    const activeDbPlayers = (dbPlayers || []).filter(p => {
      const lastActive = new Date(p.last_active_at);
      return (now - lastActive) < 60000;
    });

    const inactiveDbPlayers = (dbPlayers || []).filter(p => {
      const lastActive = new Date(p.last_active_at);
      return (now - lastActive) >= 60000;
    });

    const isFirstActivePlayer = activeDbPlayers.length > 0 && activeDbPlayers[0].id === state.playerId;

    if (inactiveDbPlayers.length > 0 && isFirstActivePlayer) {
      const inactiveIds = inactiveDbPlayers.map(p => p.id);
      console.log("Cleaning up inactive players in database:", inactiveIds);
      supabaseClient
        .from("players")
        .delete()
        .in("id", inactiveIds)
        .eq("room_code", roomCode)
        .then(({ error }) => {
          if (error) console.error("Error cleaning up inactive players:", error);
        });
    }

    const hostActive = activeDbPlayers.some(p => p.id === dbRoom.host_id);

    if (!hostActive && activeDbPlayers.length > 0) {
      const newHost = activeDbPlayers[0];
      if (isFirstActivePlayer) {
        console.log(`Host ${dbRoom.host_id} is inactive. Electing new host: ${newHost.name} (${newHost.id})`);
        supabaseClient
          .from("rooms")
          .update({ host_id: newHost.id })
          .eq("code", roomCode)
          .then(({ error }) => {
            if (error) console.error("Error electing new host:", error);
          });
      }
      dbRoom.host_id = newHost.id;
    }

    const syncedRoom = convertDbRoomToStateRoom(dbRoom, activeDbPlayers);
    applyRoomState(syncedRoom);
  } catch (err) {
    console.error("Error fetching room/players:", err);
  }
}

function subscribeToRoom(roomCode) {
  if (!supabaseClient) return;
  if (activeChannel) {
    activeChannel.unsubscribe();
  }

  activeChannel = supabaseClient.channel(`room-channel-${roomCode}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `code=eq.${roomCode}` },
      () => {
        fetchAndSyncRoom(roomCode);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_code=eq.${roomCode}` },
      () => {
        fetchAndSyncRoom(roomCode);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Subscribed to realtime updates for room:", roomCode);
        startPlayerHeartbeat(roomCode);
      }
    });
}

function startPlayerHeartbeat(roomCode) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (state.mode !== "online" || !supabaseClient) {
      clearInterval(heartbeatInterval);
      return;
    }
    try {
      await supabaseClient
        .from("players")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", state.playerId)
        .eq("room_code", roomCode);
    } catch (err) {
      console.warn("Heartbeat update failed:", err);
    }
  }, 15000);
}

async function deleteSelfFromRoom() {
  if (state.mode === "online" && supabaseClient) {
    try {
      await supabaseClient
        .from("players")
        .delete()
        .eq("id", state.playerId);
    } catch (err) {
      console.warn("Failed to delete self from room:", err);
    }
  }
}

async function resetOnlineRoom() {
  if (activeChannel) {
    activeChannel.unsubscribe();
    activeChannel = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  stopLobbyPolling();

  state.online.role = null;
  state.online.room = null;
  state.online.ready = false;
  roomCodeDisplay.classList.add("hidden");
  playerList.classList.add("hidden");
  setupRoomInfo.classList.add("hidden");
  const isClientInOnline = state.mode === "online" && state.online.role !== "host";
  startButton.classList.toggle("hidden", isClientInOnline);
  startButton.disabled = state.mode === "online";
}

function ensurePeerAvailable() {
  return checkSupabaseConfigured();
}

async function createRoom() {
  if (!ensurePeerAvailable()) {
    return;
  }

  await deleteSelfFromRoom();
  await resetOnlineRoom();
  const code = generateRoomCode();
  state.online.role = "host";

  const roomData = {
    code,
    host_id: state.playerId,
    size: Number(boardSize.value),
    phase: "lobby",
    turn_index: 0,
    called_numbers: [],
    last_call: null,
    winner: null,
    last_winner_id: null
  };

  setLobbyStatus("Creating room...");
  startButton.classList.remove("hidden");
  startButton.disabled = true;

  try {
    const { error: roomError } = await supabaseClient
      .from("rooms")
      .insert(roomData);

    if (roomError) throw roomError;

    const player = getSelfPlayer(false);
    const { error: playerError } = await supabaseClient
      .from("players")
      .insert({
        id: player.id,
        room_code: code,
        name: player.name,
        ready: player.ready
      });

    if (playerError) throw playerError;

    state.online.room = convertDbRoomToStateRoom(roomData, [player]);
    setMode("online");
    roomCodeDisplay.textContent = `Room code: ${code}`;
    roomCodeDisplay.classList.remove("hidden");
    startButton.classList.remove("hidden");
    startButton.disabled = false;
    setLobbyStatus("");

    subscribeToRoom(code);
    await fetchAndSyncRoom(code);
    showSetup();
  } catch (err) {
    console.error("Error creating room:", err);
    setLobbyStatus("Failed to create room: " + err.message);
    const isClientInOnline = state.mode === "online" && state.online.role !== "host";
    startButton.classList.toggle("hidden", isClientInOnline);
    startButton.disabled = true;
  }
}

async function joinRoom() {
  if (!ensurePeerAvailable()) {
    return;
  }

  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    setLobbyStatus("Please enter a room code first.");
    return;
  }

  await resetOnlineRoom();
  setMode("online");
  startButton.classList.add("hidden");
  startButton.disabled = true;
  setLobbyStatus("Connecting to room...");

  try {
    const { data: rooms, error: roomError } = await supabaseClient
      .from("rooms")
      .select("*")
      .eq("code", code);

    if (roomError) throw roomError;
    if (!rooms || rooms.length === 0) {
      setLobbyStatus("Room not found. Please check the room code.");
      const isClientInOnline = state.mode === "online" && state.online.role !== "host";
      startButton.classList.toggle("hidden", isClientInOnline);
      startButton.disabled = isClientInOnline;
      return;
    }

    const room = rooms[0];

    const { data: playersInRoom, error: playersError } = await supabaseClient
      .from("players")
      .select("id, last_active_at")
      .eq("room_code", code);

    if (playersError) throw playersError;

    const isRejoining = (playersInRoom || []).some(p => p.id === state.playerId);

    if (room.phase !== "lobby" && !isRejoining) {
      const phaseLabel = room.phase === "playing" ? "playing" : "setting up";
      setLobbyStatus(`Room is ${phaseLabel}. You can only join when the room is in the lobby.`);
      const isClientInOnline = state.mode === "online" && state.online.role !== "host";
      startButton.classList.toggle("hidden", isClientInOnline);
      startButton.disabled = isClientInOnline;
      return;
    }

    if (!isRejoining) {
      await deleteSelfFromRoom();
    }

    const now = new Date();
    const activePlayers = (playersInRoom || []).filter(p => {
      if (p.id === state.playerId) return false;
      const lastActive = new Date(p.last_active_at);
      return (now - lastActive) < 60000;
    });

    const inactivePlayers = (playersInRoom || []).filter(p => {
      const lastActive = new Date(p.last_active_at);
      return (now - lastActive) >= 60000;
    });

    if (inactivePlayers.length > 0) {
      const inactiveIds = inactivePlayers.map(p => p.id);
      try {
        await supabaseClient
          .from("players")
          .delete()
          .in("id", inactiveIds)
          .eq("room_code", code);
      } catch (delErr) {
        console.warn("Failed to clean up inactive players on join:", delErr);
      }
    }

    const isEmpty = activePlayers.length === 0;

    if (isEmpty) {
      const { error: updateHostError } = await supabaseClient
        .from("rooms")
        .update({ host_id: state.playerId })
        .eq("code", code);

      if (updateHostError) throw updateHostError;
      state.online.role = "host";
    } else {
      if (room.host_id === state.playerId) {
        state.online.role = "host";
      } else {
        state.online.role = "client";
      }
    }

    const player = getSelfPlayer(false);
    const { error: playerError } = await supabaseClient
      .from("players")
      .upsert({
        id: player.id,
        room_code: code,
        name: player.name,
        ready: player.ready,
        last_active_at: new Date().toISOString()
      });

    if (playerError) throw playerError;

    roomCodeDisplay.textContent = `Room code: ${code}`;
    roomCodeDisplay.classList.remove("hidden");

    if (state.online.role === "host") {
      setLobbyStatus("Connected as Host.");
    } else {
      setLobbyStatus("Connected. Waiting for host to start the game.");
    }

    subscribeToRoom(code);
    await fetchAndSyncRoom(code);
  } catch (err) {
    console.error("Error joining room:", err);
    setLobbyStatus("Failed to join room: " + err.message);
  }
}

function upsertPlayer(player) {
  const room = state.online.room;
  const existingIndex = room.players.findIndex((item) => item.id === player.id);
  if (existingIndex === -1) {
    room.players.push(player);
  } else {
    room.players[existingIndex] = { ...room.players[existingIndex], ...player };
  }

  renderOnlinePlayers();
}

function removePlayerConnection(peerId) {
  state.online.connections.delete(peerId);
}

function setPlayerReady(playerId, ready) {
  const room = state.online.room;
  const player = room?.players.find((item) => item.id === playerId);
  if (player) {
    player.ready = ready;
  }

  renderOnlinePlayers();
}

function broadcastRoomState() {
  const room = state.online.room;
  if (!room || state.online.role !== "host") {
    return;
  }

  applyRoomState(room);
}

function sendToHost(message) {
  // Logic replaced by Supabase
}

async function submitOnlineCall(number) {
  const room = state.online.room;
  if (!room || room.phase !== "playing") {
    setStatus("Wait for all players to be ready.");
    return;
  }

  if (!isMyTurn()) {
    setStatus(`It's now ${getCurrentPlayerName()}'s turn.`);
    return;
  }

  const num = Number(number);
  if (room.calledNumbers.includes(num)) {
    setStatus(`#${num} has already been chosen.`);
    return;
  }

  setStatus(`Selecting #${num}...`);

  try {
    const updatedCalledNumbers = [...room.calledNumbers, num];
    const nextTurnIndex = (room.turnIndex + 1) % room.players.length;
    const lastCall = {
      id: makeId("call"),
      number: num,
      playerId: state.playerId,
      playerName: state.playerName
    };

    const { error } = await supabaseClient
      .from("rooms")
      .update({
        called_numbers: updatedCalledNumbers,
        last_call: lastCall,
        turn_index: nextTurnIndex
      })
      .eq("code", room.code);

    if (error) throw error;
  } catch (err) {
    console.error("Error submitting call:", err);
    setStatus("Failed to select number. Try again.");
  }
}

function applyRoomState(room) {
  const previousPhase = state.online.room?.phase;
  const previousCall = state.online.room?.lastCall;
  state.online.room = room;

  if (room.hostId === state.playerId) {
    state.online.role = "host";
  } else {
    state.online.role = "client";
  }

  if (!state.gameStarted) {
    const isClientInOnline = state.mode === "online" && state.online.role !== "host";
    startButton.classList.toggle("hidden", isClientInOnline);
    startButton.disabled = isClientInOnline;
  }

  if (room.phase === "lobby") {
    if (state.gameStarted) {
      leaveGameForSetup();
    } else {
      showSetup();
    }
  }

  if (room.phase === "setup" && !state.gameStarted) {
    beginGame("online");
  }

  if (room.phase === "setup" && state.online.role === "host") {
    maybeStartTurns();
  }

  if (room.phase === "playing" && !state.gameStarted) {
    beginGame("online");
  }

  if (room.winner) {
    showWinner(room.winner.name);
  }

  syncCalledNumbers(room.calledNumbers);
  renderOnlinePlayers();
  updateOnlinePanel();
  updateNumpadState();

  if (room.phase === "lobby") {
    setLobbyStatus(state.online.role === "host" ? "Connected as Host." : "Connected. Waiting for host to start the game.");
  }

  if (room.phase === "setup") {
    setStatus("Fill the board completely, then press READY!.");
  }

  if (room.phase === "playing") {
    const lastCall = room.lastCall;
    if (lastCall && (!previousCall || previousCall.id !== lastCall.id)) {
      setStatus(`${lastCall.playerName} selected #${lastCall.number}. It's now ${getCurrentPlayerName()}'s turn.`);
    } else {
      setStatus(`It's now ${getCurrentPlayerName()}'s turn.`);
    }
  }
}

function syncCalledNumbers(numbers) {
  if (!Array.isArray(numbers) || !state.cells.length) {
    return;
  }

  numbers.forEach((number) => markNumber(number));
  state.completedLines = findCompletedLines();
  renderBoard();
  updateBingo();
}

function markNumber(number) {
  state.cells.forEach((cell, index) => {
    if (Number(cell) === Number(number)) {
      state.marked.add(index);
    }
  });
}

function renderOnlinePlayers() {
  const room = state.online.room;
  const players = room?.players || [];
  const html = players
    .map((player) => {
      const isHost = room && player.id === room.hostId;
      const icon = isHost ? "👑" : "👤";
      const badgeClass = `player-chip${player.ready ? " ready" : ""}${isHost ? " host" : ""}`;
      return `<span class="${badgeClass}"><span class="chip-icon">${icon}</span><span class="chip-text">${escapeHtml(player.name)}${player.ready ? " ready" : ""}</span></span>`;
    })
    .join("");

  playerList.innerHTML = html;
  setupPlayers.innerHTML = html;
  gamePlayers.innerHTML = html;
  playerList.classList.toggle("hidden", players.length === 0);
  updateSetupRoomInfo();
}

function updateSetupRoomInfo() {
  const room = state.online.room;
  setupRoomInfo.classList.toggle("hidden", state.mode !== "online" || !room);

  if (!room) {
    return;
  }

  setupRoomCode.textContent = room.code;
}

function updateSetupControls() {
  const sizeLocked = state.mode === "online" && state.online.role === "client";
  boardSize.disabled = sizeLocked;
}

function updateOnlinePanel() {
  const room = state.online.room;
  onlinePanel.classList.toggle("hidden", state.mode !== "online" || !state.gameStarted);
  readyButton.classList.toggle("hidden", state.mode !== "online" || !state.gameStarted || room?.phase !== "setup");
  newGameButton.classList.toggle("hidden", state.mode === "online" && state.online.role !== "host");

  if (!room) {
    return;
  }

  gameRoomCode.textContent = room.code;
}

function getCurrentPlayer() {
  const room = state.online.room;
  if (!room || !room.players.length) {
    return null;
  }

  return room.players[room.turnIndex % room.players.length];
}

function getCurrentPlayerName() {
  return getCurrentPlayer()?.name || "player";
}

function isMyTurn() {
  return getCurrentPlayer()?.id === state.playerId;
}

async function maybeStartTurns() {
  const room = state.online.room;
  if (!room || state.online.role !== "host" || room.phase !== "setup") {
    return;
  }

  if (room.players.length > 0 && room.players.every((player) => player.ready)) {
    let startingIndex = -1;
    if (room.lastWinnerId) {
      startingIndex = room.players.findIndex((player) => player.id === room.lastWinnerId);
    }

    let turnIndex = 0;
    if (startingIndex !== -1) {
      turnIndex = startingIndex;
    } else {
      turnIndex = Math.floor(Math.random() * room.players.length);
    }

    try {
      await supabaseClient
        .from("rooms")
        .update({
          phase: "playing",
          turn_index: turnIndex
        })
        .eq("code", room.code);
    } catch (err) {
      console.error("Error starting turns:", err);
    }
  }
}

async function handleOnlineReady() {
  if (!isBoardFull()) {
    setStatus("Board must be full before pressing READY!.");
    return;
  }

  state.online.ready = true;
  readyButton.disabled = true;
  readyButton.textContent = "READY";

  if (state.mode === "online" && supabaseClient && state.online.room) {
    try {
      const { error } = await supabaseClient
        .from("players")
        .update({ ready: true })
        .eq("id", state.playerId)
        .eq("room_code", state.online.room.code);

      if (error) throw error;
      setStatus("You are ready. Waiting for other players.");

      if (state.online.role === "host") {
        await maybeStartTurns();
      }
    } catch (err) {
      console.error("Error setting ready status:", err);
      setStatus("Failed to send ready status.");
      readyButton.disabled = false;
      readyButton.textContent = "READY!";
    }
  }
}

async function startOnlineGame() {
  const room = state.online.room;
  if (state.online.role !== "host" || !room) {
    setLobbyStatus("Waiting for host to start the game.");
    return;
  }

  try {
    await supabaseClient
      .from("players")
      .update({ ready: false })
      .eq("room_code", room.code);

    await supabaseClient
      .from("rooms")
      .update({
        size: Number(boardSize.value),
        phase: "setup",
        called_numbers: [],
        last_call: null,
        winner: null,
        turn_index: 0
      })
      .eq("code", room.code);

    state.online.ready = false;
    state.online.winnerReported = false;
    state.winnerShown = false;
    state.localWinnerAnnounced = false;
  } catch (err) {
    console.error("Error starting online game:", err);
    setLobbyStatus("Failed to start game: " + err.message);
  }
}

async function announceWinner() {
  if (state.mode === "online") {
    const room = state.online.room;
    if (!room || room.phase !== "playing" || room.winner || state.online.winnerReported) {
      return;
    }

    state.online.winnerReported = true;
    const player = getSelfPlayer(true);

    try {
      await supabaseClient
        .from("rooms")
        .update({
          winner: {
            id: player.id,
            name: player.name || "Player"
          },
          last_winner_id: player.id
        })
        .eq("code", room.code)
        .is("winner", null);
    } catch (err) {
      console.error("Error setting winner:", err);
    }
    return;
  }

  if (state.localWinnerAnnounced) {
    return;
  }

  state.localWinnerAnnounced = true;
  showWinner(getPlayerName());
}

function showWinner(name) {
  if (state.winnerShown) {
    return;
  }

  state.winnerShown = true;
  winnerTitle.textContent = "Bingo!";
  winnerMessage.textContent = `${name} wins!`;
  winnerModal.classList.remove("hidden");
  closeWinnerButton.focus();
}

function closeWinner() {
  winnerModal.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSize(size) {
  const nextSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(size)));
  boardSize.value = String(nextSize);
  state.size = nextSize;
}

function setTheme(theme, persist = true) {
  state.theme = {
    hue: clamp(Number(theme.hue), 0, 360),
    saturation: clamp(Number(theme.saturation), 0, 100),
    lightness: clamp(Number(theme.lightness), 30, 65),
  };

  const { hue, saturation, lightness } = state.theme;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--green", `hsl(${hue} ${saturation}% ${lightness}%)`);
  rootStyle.setProperty("--green-dark", `hsl(${hue} ${Math.min(100, saturation + 4)}% ${Math.max(18, lightness - 12)}%)`);
  rootStyle.setProperty("--surface-strong", `hsl(${hue} ${Math.max(22, saturation * 0.42)}% 92%)`);
  rootStyle.setProperty("--line", `hsl(${hue} ${Math.max(14, saturation * 0.24)}% 82%)`);
  rootStyle.setProperty("--cell-marked", `hsl(${hue} ${Math.max(42, saturation * 0.82)}% ${Math.max(16, lightness - 8)}%)`);
  rootStyle.setProperty("--blue", `hsl(${(hue + 52) % 360} 62% 45%)`);
  rootStyle.setProperty("--coral", `hsl(${(hue + 188) % 360} 67% 52%)`);
  rootStyle.setProperty("--glow-one", `hsl(${hue} ${saturation}% ${lightness}% / 0.16)`);
  rootStyle.setProperty("--glow-two", `hsl(${(hue + 70) % 360} 70% 55% / 0.12)`);
  rootStyle.setProperty("--page-start", `hsl(${hue} 32% 97%)`);
  rootStyle.setProperty("--page-end", `hsl(${hue} 30% 92%)`);

  brightnessSlider.value = String(lightness);
  brightnessSlider.style.setProperty("--slider-color", `hsl(${hue} ${saturation}% ${lightness}%)`);
  colorWheel.setAttribute("aria-valuenow", String(Math.round(hue)));
  updateColorMarker();

  if (!persist) {
    return;
  }

  try {
    localStorage.setItem("bibingo-theme", JSON.stringify(state.theme));
  } catch {
    // Theme selection still works when browser storage is unavailable.
  }
}

function loadTheme() {
  try {
    const savedTheme = JSON.parse(localStorage.getItem("bibingo-theme"));
    return savedTheme && typeof savedTheme === "object" ? savedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function updateThemeFromPointer(event) {
  const rect = colorWheel.getBoundingClientRect();
  const radius = rect.width / 2;
  const x = event.clientX - rect.left - radius;
  const y = event.clientY - rect.top - radius;
  const distance = Math.min(radius, Math.hypot(x, y));
  const hue = (Math.atan2(y, x) * 180) / Math.PI;

  setTheme({
    hue: hue < 0 ? hue + 360 : hue,
    saturation: (distance / radius) * 100,
    lightness: state.theme.lightness,
  });
}

function updateColorMarker() {
  const angle = (state.theme.hue * Math.PI) / 180;
  const distance = state.theme.saturation * 0.5;
  colorMarker.style.left = `${50 + Math.cos(angle) * distance}%`;
  colorMarker.style.top = `${50 + Math.sin(angle) * distance}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function saveLocalBoardState() {
  if (state.mode === "online" && state.online.room) {
    const roomCode = state.online.room.code;
    const cellsKey = `bibingo-board-cells-${state.playerId}-${roomCode}`;
    const markedKey = `bibingo-board-marked-${state.playerId}-${roomCode}`;
    localStorage.setItem(cellsKey, JSON.stringify(state.cells));
    localStorage.setItem(markedKey, JSON.stringify(Array.from(state.marked)));
  }
}

function restoreLocalBoardState(roomCode) {
  const cellsKey = `bibingo-board-cells-${state.playerId}-${roomCode}`;
  const markedKey = `bibingo-board-marked-${state.playerId}-${roomCode}`;
  try {
    const savedCells = localStorage.getItem(cellsKey);
    const savedMarked = localStorage.getItem(markedKey);
    if (savedCells) {
      state.cells = JSON.parse(savedCells);
      if (savedMarked) {
        state.marked = new Set(JSON.parse(savedMarked));
      } else {
        state.marked.clear();
      }
      return true;
    }
  } catch (e) {
    console.error("Failed to restore board from localStorage:", e);
  }
  return false;
}

function startGame() {
  if (state.mode === "online") {
    startOnlineGame();
    return;
  }

  beginGame("local");
}

function beginGame(mode = state.mode) {
  setSize(boardSize.value);
  if (mode === "online" && state.online.room?.size) {
    setSize(state.online.room.size);
  }

  state.mode = mode;
  state.gameStarted = true;
  activateHistoryGuard();

  let boardRestored = false;
  if (mode === "online" && state.online.room) {
    boardRestored = restoreLocalBoardState(state.online.room.code);
  }

  if (!boardRestored) {
    state.cells = Array.from({ length: state.size * state.size }, () => "");
    state.marked.clear();
  }

  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  state.online.ready = false;
  state.online.winnerReported = false;
  state.winnerShown = false;
  state.localWinnerAnnounced = false;
  closeWinner();
  currentSize.textContent = `${state.size} x ${state.size}`;
  lobbyScreen.classList.add("hidden");
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  fillRandomButton.classList.remove("hidden");
  clearBoardButton.classList.remove("hidden");
  readyButton.disabled = false;
  readyButton.textContent = "READY!";
  updateOnlinePanel();
  renderBingoLetters();
  renderBoard();
  updateBingo();
  updateNumpadState();
  setStatus(mode === "online" ? "Fill all cells on the board, then press READY!." : "Select a cell and input a number, or press Fill random.");
}

function renderBoard() {
  const fontSize = getCellFontSize();
  boardGrid.style.setProperty("--size", state.size);
  boardGrid.style.setProperty("--cell-font-size", `${fontSize}rem`);
  boardGrid.innerHTML = "";

  state.cells.forEach((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-button";
    button.textContent = value || "+";
    button.setAttribute("aria-label", `Cell ${index + 1}${value ? ` has value ${value}` : " empty"}`);
    button.classList.toggle("empty", !value);
    button.classList.toggle("marked", state.marked.has(index));
    button.classList.toggle("selected", state.selectedIndex === index);
    button.classList.toggle("completed", isInCompletedLine(index));
    button.addEventListener("click", () => handleCellClick(index));
    boardGrid.appendChild(button);
  });

  updateSelectedCell();
}

function renderBingoLetters() {
  const fontSize = getCellFontSize();
  bingoWord.innerHTML = "";
  bingoWord.style.setProperty("--bingo-count", state.size);
  bingoWord.style.setProperty("--cell-font-size", `${fontSize}rem`);

  getBingoTarget().forEach((letter) => {
    const span = document.createElement("span");
    span.className = "bingo-letter";
    span.dataset.letter = letter;
    span.textContent = letter;
    bingoWord.appendChild(span);
  });

  bingoLetters = Array.from(bingoWord.querySelectorAll(".bingo-letter"));
}

async function handleCellClick(index) {
  if (state.mode === "online" && state.online.ready && state.online.room?.phase === "setup") {
    setStatus("You are ready. Waiting for other players.");
    return;
  }

  if (!isBoardFull()) {
    state.selectedIndex = index;
    state.entry = state.cells[index] ? String(state.cells[index]) : "";
    updateSelectedCell();
    renderBoard();
    return;
  }

  if (state.mode === "online") {
    const room = state.online.room;
    if (room?.phase !== "playing") {
      setStatus("Wait for all players to be ready.");
      return;
    }

    if (!isMyTurn()) {
      setStatus(`It's now ${getCurrentPlayerName()}'s turn.`);
      return;
    }

    submitOnlineCall(state.cells[index]);
    return;
  }

  if (!state.cells[index]) {
    setStatus("This cell is empty. Fill random first or switch to manual input mode.");
    return;
  }

  if (state.marked.has(index)) {
    const shouldRemove = await showConfirm(`${state.cells[index]} is already selected. Remove it?`);
    if (!shouldRemove) {
      return;
    }

    state.marked.delete(index);
  } else {
    state.marked.add(index);
  }

  state.completedLines = findCompletedLines();
  renderBoard();
  updateBingo();
  saveLocalBoardState();
}

function fillRandom() {
  if (state.mode === "online" && state.online.ready && state.online.room?.phase === "setup") {
    setStatus("You are ready. Waiting for other players.");
    return;
  }

  const maxNumber = state.size * state.size;
  const numbers = Array.from({ length: maxNumber }, (_, index) => index + 1);
  shuffle(numbers);
  state.cells = numbers;
  state.marked.clear();
  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  renderBoard();
  updateBingo();
  updateNumpadState();
  saveLocalBoardState();
  setStatus("Board filled randomly. Type a number and press OK, or tap a cell to mark it.");
}

function clearBoard() {
  if (state.mode === "online" && state.online.ready && state.online.room?.phase === "setup") {
    setStatus("You are ready. Waiting for other players.");
    return;
  }

  state.cells = Array.from({ length: state.size * state.size }, () => "");
  state.marked.clear();
  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  renderBoard();
  updateBingo();
  updateNumpadState();
  saveLocalBoardState();
  setStatus("Board cleared. Choose random mode or fill it manually.");
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function addDigit(digit) {
  if (!isBoardFull() && state.selectedIndex === null) {
    setStatus("Select a cell first before entering a number.");
    return;
  }

  const nextEntry = `${state.entry}${digit}`.replace(/^0+(?=\d)/, "");
  state.entry = nextEntry.slice(0, 4);
  updateSelectedCell();
}

function applyNumber() {
  if (state.mode === "online" && state.online.ready && state.online.room?.phase === "setup") {
    setStatus("You are ready. Waiting for other players.");
    return;
  }

  if (isBoardFull()) {
    if (state.mode === "online") {
      if (state.online.room?.phase !== "playing") {
        setStatus("Wait for all players to be ready.");
        return;
      }

      if (!isMyTurn()) {
        setStatus(`It's now ${getCurrentPlayerName()}'s turn.`);
        return;
      }

      if (!state.entry) {
        setStatus("Enter the number you want to choose.");
        return;
      }

      submitOnlineCall(Number(state.entry));
      state.entry = "";
      updateSelectedCell();
      return;
    }

    applySearch();
    return;
  }

  if (state.selectedIndex === null) {
    setStatus("Select a cell first before saving the number.");
    return;
  }

  if (!state.entry) {
    setStatus("Please enter a number first.");
    return;
  }

  state.cells[state.selectedIndex] = Number(state.entry);
  state.marked.delete(state.selectedIndex);
  state.completedLines = findCompletedLines();
  const nextIndex = findNextEmptyIndex(state.selectedIndex + 1);
  state.selectedIndex = nextIndex;
  state.entry = nextIndex === null ? "" : String(state.cells[nextIndex] || "");
  renderBoard();
  updateBingo();
  updateNumpadState();
  saveLocalBoardState();
  if (nextIndex === null) {
    setStatus(state.mode === "online" ? "Board full. Press READY!." : "All cells are filled. Tap a number to mark it.");
  } else {
    setStatus("Number saved. Continue filling the next cell.");
  }
}

async function applySearch() {
  if (!state.entry) {
    setStatus("Enter the number you want to search.");
    return;
  }

  const number = Number(state.entry);
  const foundIndex = state.cells.findIndex((cell) => Number(cell) === number);
  state.entry = "";

  if (foundIndex === -1) {
    state.selectedIndex = null;
    renderBoard();
    setStatus(`Number ${number} is not on the board.`);
    return;
  }

  state.selectedIndex = foundIndex;

  if (state.marked.has(foundIndex)) {
    renderBoard();
    const shouldRemove = await showConfirm(`${number} is already selected. Remove it?`);
    if (shouldRemove) {
      state.marked.delete(foundIndex);
      state.completedLines = findCompletedLines();
      renderBoard();
      updateBingo();
      setStatus(`Number ${number} has been removed from selection.`);
    } else {
      setStatus(`Number ${number} remains selected.`);
    }
    return;
  }

  state.marked.add(foundIndex);
  state.completedLines = findCompletedLines();
  renderBoard();
  updateBingo();
  setStatus(`Number ${number} selected.`);
}

function findNextEmptyIndex(startAt) {
  for (let offset = 0; offset < state.cells.length; offset += 1) {
    const index = (startAt + offset) % state.cells.length;
    if (!state.cells[index]) {
      return index;
    }
  }

  return null;
}

function updateSelectedCell() {
  if (isBoardFull()) {
    selectedCell.textContent = "Search number";
    entryDisplay.textContent = state.entry || "0";
    return;
  }

  if (state.selectedIndex === null) {
    selectedCell.textContent = "Select cell";
    entryDisplay.textContent = "0";
    return;
  }

  selectedCell.textContent = `Cell ${state.selectedIndex + 1}`;
  entryDisplay.textContent = state.entry || "0";
}

function findCompletedLines() {
  const lines = [];

  for (let row = 0; row < state.size; row += 1) {
    const indexes = Array.from({ length: state.size }, (_, col) => row * state.size + col);
    if (isComplete(indexes)) {
      lines.push(indexes);
    }
  }

  for (let col = 0; col < state.size; col += 1) {
    const indexes = Array.from({ length: state.size }, (_, row) => row * state.size + col);
    if (isComplete(indexes)) {
      lines.push(indexes);
    }
  }

  const diagonalDown = Array.from({ length: state.size }, (_, index) => index * state.size + index);
  const diagonalUp = Array.from({ length: state.size }, (_, index) => (index + 1) * state.size - index - 1);

  if (isComplete(diagonalDown)) {
    lines.push(diagonalDown);
  }

  if (isComplete(diagonalUp)) {
    lines.push(diagonalUp);
  }

  return lines;
}

function isComplete(indexes) {
  return indexes.every((index) => state.cells[index] && state.marked.has(index));
}

function isInCompletedLine(index) {
  return state.completedLines.some((line) => line.includes(index));
}

function updateBingo() {
  const target = getBingoTarget();
  const completedCount = Math.min(target.length, state.completedLines.length);
  bingoLetters.forEach((letter, index) => {
    letter.classList.toggle("active", index < completedCount);
  });

  if (completedCount > 0) {
    const word = target.slice(0, completedCount).join("");
    setStatus(completedCount === target.length ? `${word} complete!` : `${word} formed. Complete the next line.`);
  }

  if (completedCount === target.length) {
    announceWinner();
  }
}

function setStatus(message) {
  statusLine.textContent = message;
}

function showConfirm(message, options = {}) {
  confirmTitle.textContent = options.title || "Number already selected";
  confirmMessage.textContent = message;
  acceptConfirmButton.textContent = options.acceptLabel || "Remove";
  cancelConfirmButton.textContent = options.cancelLabel || "Cancel";
  confirmModal.classList.remove("hidden");
  acceptConfirmButton.focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  confirmModal.classList.add("hidden");
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

function activateHistoryGuard() {
  if (state.historyGuardActive) {
    return;
  }

  history.pushState({ bibingoGuard: true }, "", location.href);
  state.historyGuardActive = true;
}

async function handleHistoryBack() {
  if (!state.gameStarted || !state.historyGuardActive) {
    return;
  }

  state.historyGuardActive = false;
  const shouldLeave = await showConfirm("The game will be reset if you leave this page.", {
    title: "Leave the game?",
    acceptLabel: "Leave",
    cancelLabel: "Keep playing",
  });

  if (shouldLeave) {
    state.gameStarted = false;
    history.back();
    return;
  }

  activateHistoryGuard();
}

function isBoardFull() {
  return state.cells.length > 0 && state.cells.every(Boolean);
}

function updateNumpadState() {
  const lockedForReady = state.mode === "online" && state.online.ready && state.online.room?.phase === "setup";
  const lockedForTurn = state.mode === "online" && state.online.room?.phase === "playing" && !isMyTurn();
  numpadPanel.classList.toggle("disabled", lockedForReady || lockedForTurn);
  if (isBoardFull()) {
    selectedCell.textContent = "Search number";
  }
}

function getBingoTarget() {
  return Array.from({ length: state.size }, (_, index) => BINGO_BASE[index % BINGO_BASE.length]);
}

function getCellFontSize() {
  const largest = 1.55;
  const smallest = 0.82;
  const progress = (state.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
  return largest - (largest - smallest) * progress;
}

boardSize.addEventListener("change", () => setSize(boardSize.value));
offlineButton.addEventListener("click", () => {
  resetOnlineRoom();
  setMode("local");
  showSetup();
});
createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
});
colorWheel.addEventListener("pointerdown", (event) => {
  colorWheel.setPointerCapture(event.pointerId);
  updateThemeFromPointer(event);
});
colorWheel.addEventListener("pointermove", (event) => {
  if (colorWheel.hasPointerCapture(event.pointerId)) {
    updateThemeFromPointer(event);
  }
});
colorWheel.addEventListener("keydown", (event) => {
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!direction) {
    return;
  }

  event.preventDefault();
  setTheme({ ...state.theme, hue: (state.theme.hue + direction * 3 + 360) % 360 });
});
brightnessSlider.addEventListener("input", () => {
  setTheme({ ...state.theme, lightness: Number(brightnessSlider.value) });
});
startButton.addEventListener("click", startGame);
newGameButton.addEventListener("click", async () => {
  const mode = state.mode;
  if (mode === "online") {
    if (state.online.role !== "host") {
      setStatus("Waiting for host to start a new game.");
      return;
    }

    const room = state.online.room;
    if (room) {
      try {
        await supabaseClient
          .from("players")
          .update({ ready: false })
          .eq("room_code", room.code);

        await supabaseClient
          .from("rooms")
          .update({
            phase: "lobby",
            called_numbers: [],
            last_call: null,
            winner: null,
            turn_index: 0
          })
          .eq("code", room.code);

        leaveGameForSetup();
      } catch (err) {
        console.error("Error resetting room:", err);
        setStatus("Failed to create a new game.");
      }
    }
    return;
  }

  leaveGameForSetup();
});
fillRandomButton.addEventListener("click", fillRandom);
clearBoardButton.addEventListener("click", clearBoard);
readyButton.addEventListener("click", handleOnlineReady);
numpadButtons.forEach((button) => {
  button.addEventListener("click", () => addDigit(button.dataset.number));
});
backspaceButton.addEventListener("click", () => {
  state.entry = state.entry.slice(0, -1);
  updateSelectedCell();
});
applyNumberButton.addEventListener("click", applyNumber);
cancelConfirmButton.addEventListener("click", () => closeConfirm(false));
acceptConfirmButton.addEventListener("click", () => closeConfirm(true));
closeWinnerButton.addEventListener("click", closeWinner);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeConfirm(false);
  }
});
winnerModal.addEventListener("click", (event) => {
  if (event.target === winnerModal) {
    closeWinner();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.classList.contains("hidden")) {
    closeConfirm(false);
  }

  if (event.key === "Escape" && !winnerModal.classList.contains("hidden")) {
    closeWinner();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (!state.gameStarted) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("popstate", handleHistoryBack);

async function exitToLobby() {
  let shouldExit = true;
  if (state.gameStarted) {
    shouldExit = await showConfirm("Are you sure you want to leave the room and return to the lobby?", {
      title: "Exit Room?",
      acceptLabel: "Leave",
      cancelLabel: "Cancel"
    });
  }

  if (shouldExit) {
    await resetOnlineRoom();
    state.gameStarted = false;
    showLobby();
  }
}

exitToLobbyButton.addEventListener("click", exitToLobby);
backToLobbyFromSetupButton.addEventListener("click", exitToLobby);

playerNameInput.value = localStorage.getItem("bibingo-player-name") || "";
playerNameInput.addEventListener("input", () => {
  localStorage.setItem("bibingo-player-name", playerNameInput.value.trim());
});

setSize(MIN_SIZE);
setTheme(loadTheme());
setMode("local");
if (initSupabase()) {
  startLobbyPolling();
}

// Lobby Tab Navigation
const tabCreateBtn = document.querySelector("#tabCreateBtn");
const tabJoinBtn = document.querySelector("#tabJoinBtn");
const contentCreateRoom = document.querySelector("#contentCreateRoom");
const contentJoinRoom = document.querySelector("#contentJoinRoom");

if (tabCreateBtn && tabJoinBtn && contentCreateRoom && contentJoinRoom) {
  tabCreateBtn.addEventListener("click", () => {
    tabCreateBtn.classList.add("active");
    tabJoinBtn.classList.remove("active");
    contentCreateRoom.classList.remove("hidden");
    contentJoinRoom.classList.add("hidden");
  });

  tabJoinBtn.addEventListener("click", () => {
    tabJoinBtn.classList.add("active");
    tabCreateBtn.classList.remove("active");
    contentJoinRoom.classList.remove("hidden");
    contentCreateRoom.classList.add("hidden");
  });
}
