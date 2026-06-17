const MIN_SIZE = 5;
const MAX_SIZE = 12;
const BINGO_BASE = ["B", "I", "N", "G", "O"];

const state = {
  size: MIN_SIZE,
  mode: "random",
  cells: [],
  marked: new Set(),
  selectedIndex: null,
  entry: "",
  completedLines: [],
};

const setupScreen = document.querySelector("#setupScreen");
const gameScreen = document.querySelector("#gameScreen");
const boardSize = document.querySelector("#boardSize");
const decreaseSize = document.querySelector("#decreaseSize");
const increaseSize = document.querySelector("#increaseSize");
const startButton = document.querySelector("#startButton");
const newGameButton = document.querySelector("#newGameButton");
const currentSize = document.querySelector("#currentSize");
const randomModeButton = document.querySelector("#randomModeButton");
const manualModeButton = document.querySelector("#manualModeButton");
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
let bingoLetters = [];

function setSize(size) {
  const nextSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(size)));
  boardSize.value = String(nextSize);
  state.size = nextSize;
}

function startGame() {
  setSize(boardSize.value);
  state.cells = Array.from({ length: state.size * state.size }, () => "");
  state.marked.clear();
  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  currentSize.textContent = `${state.size} x ${state.size}`;
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  setMode("random");
  renderBingoLetters();
  renderBoard();
  updateBingo();
  setStatus("Pilih Random untuk isi otomatis, atau Isi sendiri untuk input angka.");
}

function setMode(mode) {
  state.mode = mode;
  randomModeButton.classList.toggle("active", mode === "random");
  manualModeButton.classList.toggle("active", mode === "manual");
  fillRandomButton.disabled = mode !== "random";
  updateNumpadState();
  setStatus(mode === "random" ? "Mode random aktif. Tekan Isi random untuk mengisi board." : "Mode isi sendiri aktif. Pilih kolom lalu input angka.");
}

function renderBoard() {
  boardGrid.style.setProperty("--size", state.size);
  boardGrid.innerHTML = "";

  state.cells.forEach((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-button";
    button.textContent = value || "+";
    button.setAttribute("aria-label", `Kolom ${index + 1}${value ? ` bernilai ${value}` : " kosong"}`);
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
  bingoWord.innerHTML = "";
  bingoWord.style.setProperty("--bingo-count", state.size);

  getBingoTarget().forEach((letter) => {
    const span = document.createElement("span");
    span.className = "bingo-letter";
    span.dataset.letter = letter;
    span.textContent = letter;
    bingoWord.appendChild(span);
  });

  bingoLetters = Array.from(bingoWord.querySelectorAll(".bingo-letter"));
}

function handleCellClick(index) {
  if (state.mode === "manual") {
    state.selectedIndex = index;
    state.entry = state.cells[index] ? String(state.cells[index]) : "";
    updateSelectedCell();
    renderBoard();
    return;
  }

  if (!state.cells[index]) {
    setStatus("Kolom ini masih kosong. Isi random dulu atau pindah ke mode isi sendiri.");
    return;
  }

  if (state.marked.has(index)) {
    if (!confirm(`${state.cells[index]} sudah dipilih, hapus?`)) {
      return;
    }

    state.marked.delete(index);
  } else {
    state.marked.add(index);
  }

  state.completedLines = findCompletedLines();
  renderBoard();
  updateBingo();
}

function fillRandom() {
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
  setStatus("Board sudah terisi random. Tap angka untuk menandai.");
}

function clearBoard() {
  state.cells = Array.from({ length: state.size * state.size }, () => "");
  state.marked.clear();
  state.selectedIndex = null;
  state.entry = "";
  state.completedLines = [];
  renderBoard();
  updateBingo();
  updateNumpadState();
  setStatus("Board dikosongkan. Pilih mode random atau isi sendiri.");
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function addDigit(digit) {
  if (!canUseNumpad()) {
    setStatus("Numpad aktif untuk isi sendiri, atau untuk cari angka setelah board penuh.");
    return;
  }

  if (state.mode === "manual" && !isBoardFull() && state.selectedIndex === null) {
    setStatus("Pilih kolom dulu sebelum input angka.");
    return;
  }

  const nextEntry = `${state.entry}${digit}`.replace(/^0+(?=\d)/, "");
  state.entry = nextEntry.slice(0, 4);
  updateSelectedCell();
}

function applyNumber() {
  if (!canUseNumpad()) {
    setStatus("Numpad aktif untuk isi sendiri, atau untuk cari angka setelah board penuh.");
    return;
  }

  if (isBoardFull()) {
    applySearch();
    return;
  }

  if (state.selectedIndex === null) {
    setStatus("Pilih kolom dulu sebelum menyimpan angka.");
    return;
  }

  if (!state.entry) {
    setStatus("Masukkan angka dulu.");
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
  setStatus(nextIndex === null ? "Semua kolom sudah terisi. Tap angka untuk menandai." : "Angka tersimpan. Lanjut isi kolom berikutnya.");
}

function applySearch() {
  if (!state.entry) {
    setStatus("Masukkan angka yang mau dicari.");
    return;
  }

  const number = Number(state.entry);
  const foundIndex = state.cells.findIndex((cell) => Number(cell) === number);
  state.entry = "";

  if (foundIndex === -1) {
    state.selectedIndex = null;
    renderBoard();
    setStatus(`Angka ${number} tidak ada di board.`);
    return;
  }

  state.selectedIndex = foundIndex;

  if (state.marked.has(foundIndex)) {
    renderBoard();
    if (confirm(`${number} sudah dipilih, hapus?`)) {
      state.marked.delete(foundIndex);
      state.completedLines = findCompletedLines();
      renderBoard();
      updateBingo();
      setStatus(`Angka ${number} sudah dihapus dari pilihan.`);
    } else {
      setStatus(`Angka ${number} tetap dipilih.`);
    }
    return;
  }

  state.marked.add(foundIndex);
  state.completedLines = findCompletedLines();
  renderBoard();
  updateBingo();
  setStatus(`Angka ${number} dipilih.`);
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
    selectedCell.textContent = "Cari angka";
    entryDisplay.textContent = state.entry || "0";
    return;
  }

  if (state.selectedIndex === null) {
    selectedCell.textContent = "Pilih kolom";
    entryDisplay.textContent = "0";
    return;
  }

  selectedCell.textContent = `Kolom ${state.selectedIndex + 1}`;
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
    setStatus(completedCount === target.length ? `${word} lengkap!` : `${word} muncul. Lengkapi garis berikutnya.`);
  }
}

function setStatus(message) {
  statusLine.textContent = message;
}

function isBoardFull() {
  return state.cells.length > 0 && state.cells.every(Boolean);
}

function canUseNumpad() {
  return state.mode === "manual" || isBoardFull();
}

function updateNumpadState() {
  numpadPanel.classList.toggle("disabled", !canUseNumpad());
  if (isBoardFull()) {
    selectedCell.textContent = "Cari angka";
  }
}

function getBingoTarget() {
  return Array.from({ length: state.size }, (_, index) => BINGO_BASE[index % BINGO_BASE.length]);
}

decreaseSize.addEventListener("click", () => setSize(Number(boardSize.value) - 1));
increaseSize.addEventListener("click", () => setSize(Number(boardSize.value) + 1));
boardSize.addEventListener("change", () => setSize(boardSize.value));
startButton.addEventListener("click", startGame);
newGameButton.addEventListener("click", () => {
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});
randomModeButton.addEventListener("click", () => setMode("random"));
manualModeButton.addEventListener("click", () => setMode("manual"));
fillRandomButton.addEventListener("click", fillRandom);
clearBoardButton.addEventListener("click", clearBoard);
numpadButtons.forEach((button) => {
  button.addEventListener("click", () => addDigit(button.dataset.number));
});
backspaceButton.addEventListener("click", () => {
  state.entry = state.entry.slice(0, -1);
  updateSelectedCell();
});
applyNumberButton.addEventListener("click", applyNumber);

setSize(MIN_SIZE);
