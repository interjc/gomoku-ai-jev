/**
 * main.js — DOM, Canvas rendering, event handling
 */

import {
  BOARD_SIZE, EMPTY, BLACK, WHITE,
  createBoard, placeStone, isValidMove, checkWin, getWinLine, isFull,
} from '../lib/gomoku.js';
import { getAIMove } from '../lib/ai.js';
import { t } from '../lib/i18n.js';

// ── State ─────────────────────────────────────────────────────────────────────
let board = createBoard();
let currentPlayer = BLACK;
let playerColor = BLACK;       // human is black by default
let difficulty = 'hard';
let gameOver = false;
let lang = 'en';
try {
  const savedLang = localStorage.getItem('gomoku_lang');
  if (savedLang && ['en', 'ja', 'zh'].includes(savedLang)) {
    lang = savedLang;
  }
} catch {}
let dark = false;
let moveHistory = [];          // [{row, col, player}]
let winLine = null;
let aiBusy = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas        = document.getElementById('board-canvas');
const ctx           = canvas.getContext('2d');
const statusEl      = document.getElementById('status');
const histEl        = document.getElementById('history-list');
const thinkEl       = document.getElementById('thinking');
const langDropdown  = document.getElementById('lang-dropdown');
const langBtn       = document.getElementById('btn-lang');
const langBtnText   = document.getElementById('btn-lang-text');
const langMenuItems = document.querySelectorAll('#lang-menu .dropdown-item');
const themeBtn      = document.getElementById('btn-theme');
const newBtn        = document.getElementById('btn-new');
const undoBtn       = document.getElementById('btn-undo');
const diffSel       = document.getElementById('sel-difficulty');
const colorSel      = document.getElementById('sel-color');

// ── Canvas geometry ───────────────────────────────────────────────────────────
const PADDING   = 32;
let CELL_SIZE;
let CANVAS_SIZE;

function resize() {
  const container = canvas.parentElement;
  const maxW = Math.min(container.clientWidth, window.innerHeight * 0.7, 560);
  CANVAS_SIZE = maxW;
  CELL_SIZE   = (CANVAS_SIZE - PADDING * 2) / (BOARD_SIZE - 1);
  canvas.width  = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  draw();
}

function colToX(c) { return PADDING + c * CELL_SIZE; }
function rowToY(r) { return PADDING + r * CELL_SIZE; }
function xyToCell(x, y) {
  const col = Math.round((x - PADDING) / CELL_SIZE);
  const row = Math.round((y - PADDING) / CELL_SIZE);
  return [row, col];
}

// ── Draw ──────────────────────────────────────────────────────────────────────
const BOARD_COLOR_LIGHT = '#DEB887';
const BOARD_COLOR_DARK  = '#7A5230';
const LINE_COLOR_LIGHT  = '#5a3e1b';
const LINE_COLOR_DARK   = '#3a2010';
const DOT_COLOR         = '#3a2010';

function draw() {
  const boardBg = dark ? BOARD_COLOR_DARK : BOARD_COLOR_LIGHT;
  const lineCol = dark ? LINE_COLOR_DARK  : LINE_COLOR_LIGHT;

  // Background
  ctx.fillStyle = boardBg;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Grid
  ctx.strokeStyle = lineCol;
  ctx.lineWidth   = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(colToX(0), rowToY(i));
    ctx.lineTo(colToX(BOARD_SIZE - 1), rowToY(i));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(colToX(i), rowToY(0));
    ctx.lineTo(colToX(i), rowToY(BOARD_SIZE - 1));
    ctx.stroke();
  }

  // Star points (standard 5-point pattern for 15×15)
  const stars = [3, 7, 11];
  for (const r of stars) {
    for (const c of stars) {
      ctx.beginPath();
      ctx.arc(colToX(c), rowToY(r), CELL_SIZE * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = DOT_COLOR;
      ctx.fill();
    }
  }

  // Stones
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        drawStone(r, c, board[r][c]);
      }
    }
  }

  // Win line highlight
  if (winLine) {
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.75)';
    ctx.lineWidth   = CELL_SIZE * 0.25;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(colToX(winLine[0][1]), rowToY(winLine[0][0]));
    for (let i = 1; i < winLine.length; i++) {
      ctx.lineTo(colToX(winLine[i][1]), rowToY(winLine[i][0]));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.lineCap   = 'butt';
  }

  // Last move marker
  if (moveHistory.length > 0) {
    const last = moveHistory[moveHistory.length - 1];
    const x = colToX(last.col), y = rowToY(last.row);
    ctx.beginPath();
    ctx.arc(x, y, CELL_SIZE * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = last.player === BLACK ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
    ctx.fill();
  }
}

const STONE_RADIUS_RATIO = 0.45;

function drawStone(row, col, player) {
  const x = colToX(col), y = rowToY(row);
  const r = CELL_SIZE * STONE_RADIUS_RATIO;

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur    = r * 0.6;
  ctx.shadowOffsetX = r * 0.15;
  ctx.shadowOffsetY = r * 0.2;

  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r);
  if (player === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#000');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#ccc');
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// ── Language Dropdown ─────────────────────────────────────────────────────────
function openLangDropdown() {
  langDropdown?.classList.add('open');
  langBtn?.setAttribute('aria-expanded', 'true');
}

function closeLangDropdown() {
  langDropdown?.classList.remove('open');
  langBtn?.setAttribute('aria-expanded', 'false');
}

function toggleLangDropdown() {
  if (langDropdown?.classList.contains('open')) {
    closeLangDropdown();
  } else {
    openLangDropdown();
  }
}

function setLanguage(newLang) {
  if (!['en', 'ja', 'zh'].includes(newLang)) return;
  lang = newLang;
  try {
    localStorage.setItem('gomoku_lang', lang);
  } catch {}
  updateUI();
  closeLangDropdown();
}

// ── UI text ───────────────────────────────────────────────────────────────────
function updateUI() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  document.title            = t(lang, 'title');
  thinkEl.textContent       = t(lang, 'thinking');
  document.getElementById('app-title').textContent = t(lang, 'title');
  newBtn.textContent        = t(lang, 'newGame');
  undoBtn.textContent       = t(lang, 'undo');
  if (langBtnText) {
    langBtnText.textContent = t(lang, 'langLabel');
  } else if (langBtn) {
    langBtn.textContent     = t(lang, 'langLabel');
  }
  langBtn?.setAttribute('aria-label', t(lang, 'selectLang'));
  themeBtn.textContent      = dark ? t(lang, 'themeLight') : t(lang, 'themeDark');
  document.getElementById('label-difficulty').textContent = t(lang, 'difficulty');
  document.getElementById('label-color').textContent      = t(lang, 'playerColor');
  diffSel.options[0].text  = t(lang, 'easy');
  diffSel.options[1].text  = t(lang, 'medium');
  diffSel.options[2].text  = t(lang, 'hard');
  colorSel.options[0].text = t(lang, 'black');
  colorSel.options[1].text = t(lang, 'white');
  document.getElementById('history-title').textContent = t(lang, 'history');

  langMenuItems.forEach(item => {
    const itemLang = item.getAttribute('data-lang');
    const isActive = itemLang === lang;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });

  updateStatus();
  renderHistory();
}

function updateStatus() {
  if (gameOver) return;
  if (aiBusy) {
    statusEl.textContent = t(lang, 'thinking');
  } else if (currentPlayer === playerColor) {
    statusEl.textContent = t(lang, 'yourTurn');
  } else {
    statusEl.textContent = t(lang, 'aiTurn');
  }
}

function showResult(winner) {
  if (winner === null) {
    statusEl.textContent = t(lang, 'draw');
  } else if (winner === BLACK) {
    statusEl.textContent = t(lang, 'blackWins');
  } else {
    statusEl.textContent = t(lang, 'whiteWins');
  }
}

function renderHistory() {
  histEl.innerHTML = '';
  moveHistory.forEach((mv, i) => {
    const li = document.createElement('li');
    const label = mv.player === BLACK ? '●' : '○';
    const colLetter = String.fromCharCode(65 + mv.col);
    li.textContent = `${t(lang, 'moveN', i + 1)} ${label} ${colLetter}${mv.row + 1}`;
    histEl.appendChild(li);
  });
  histEl.scrollTop = histEl.scrollHeight;
}

// ── Game logic ────────────────────────────────────────────────────────────────
function newGame() {
  board         = createBoard();
  currentPlayer = BLACK;
  gameOver      = false;
  winLine       = null;
  moveHistory   = [];
  aiBusy        = false;
  thinkEl.hidden = true;
  draw();
  updateUI();

  // If human is white, AI (black) goes first
  if (playerColor === WHITE) {
    doAIMove();
  }
}

function makeMove(row, col) {
  if (gameOver || aiBusy || !isValidMove(board, row, col)) return;
  if (currentPlayer !== playerColor) return;

  applyMove(row, col, currentPlayer);

  if (checkGameEnd(row, col, currentPlayer)) return;
  currentPlayer = currentPlayer === BLACK ? WHITE : BLACK;
  updateStatus();
  doAIMove();
}

function applyMove(row, col, player) {
  board = placeStone(board, row, col, player);
  moveHistory.push({ row, col, player });
  draw();
  renderHistory();
}

function checkGameEnd(row, col, player) {
  if (checkWin(board, row, col, player)) {
    winLine  = getWinLine(board, row, col, player);
    gameOver = true;
    draw();
    showResult(player);
    return true;
  }
  if (isFull(board)) {
    gameOver = true;
    showResult(null);
    return true;
  }
  return false;
}

/** Search limits for the offline fallback, tighter than the Worker's. */
const FALLBACK_LIMITS = {
  easy:   {},
  medium: {},
  hard:   { maxDepth: 6, nodeBudget: 60_000 },
};

async function playAITurn(boardAtStart, aiColor) {
  let move = null;
  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        board: boardAtStart,
        player: aiColor,
        difficulty,
        history: moveHistory.map(mv => ({
          row: mv.row,
          col: mv.col,
          player: mv.player,
        })),
      }),
    });
    if (!res.ok) throw new Error('move request failed');
    const data = await res.json();
    if (board !== boardAtStart || gameOver) return;
    if (isValidMove(board, data.row, data.col)) move = [data.row, data.col];
  } catch {
    if (board !== boardAtStart || gameOver) return;
  }

  if (!move) {
    if (board !== boardAtStart || gameOver) return;
    // Only reached when the Worker is unreachable. This runs on the main
    // thread, so cap the search well below what the server allows.
    move = getAIMove(board, aiColor, difficulty, FALLBACK_LIMITS[difficulty]);
  }

  const [row, col] = move;
  applyMove(row, col, aiColor);
  aiBusy = false;
  thinkEl.hidden = true;
  if (!checkGameEnd(row, col, aiColor)) {
    currentPlayer = playerColor;
    updateStatus();
  }
}

function doAIMove() {
  const aiColor = playerColor === BLACK ? WHITE : BLACK;
  if (currentPlayer !== aiColor || gameOver) return;

  aiBusy = true;
  thinkEl.hidden = false;
  updateStatus();

  const boardAtStart = board;
  setTimeout(() => { void playAITurn(boardAtStart, aiColor); }, 20);
}

function undo() {
  if (gameOver && winLine) {
    // Allow undo even after game over to replay
    gameOver = false;
    winLine  = null;
  }
  if (moveHistory.length === 0) return;

  // Remove last two moves (player + AI), or one if AI hasn't moved yet
  const toRemove = moveHistory.length >= 2 ? 2 : 1;
  for (let i = 0; i < toRemove; i++) {
    if (moveHistory.length === 0) break;
    moveHistory.pop();
  }

  // Rebuild board from history
  board = createBoard();
  for (const mv of moveHistory) {
    board = placeStone(board, mv.row, mv.col, mv.player);
  }
  currentPlayer = playerColor;
  aiBusy = false;
  thinkEl.hidden = true;
  draw();
  renderHistory();
  updateStatus();
}

// ── Events ────────────────────────────────────────────────────────────────────
/**
 * Canvas coordinates for a mouse or touch event, or null when the event
 * carries no usable point.
 *
 * On `touchend` the lifted finger is in `changedTouches`; `touches` is an empty
 * list, and an empty TouchList is still truthy, so it has to be read by length
 * rather than existence.
 */
function getCanvasPos(e) {
  const point = e.changedTouches?.[0] ?? e.touches?.[0] ?? e;
  if (typeof point.clientX !== 'number' || typeof point.clientY !== 'number') return null;

  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  // The canvas is laid out by CSS, so its backing size and its on-screen size
  // differ; scale the point into backing-store coordinates.
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return [(point.clientX - rect.left) * scaleX, (point.clientY - rect.top) * scaleY];
}

function placeFromEvent(e) {
  const pos = getCanvasPos(e);
  if (!pos) return;
  const [row, col] = xyToCell(pos[0], pos[1]);
  makeMove(row, col);
}

canvas.addEventListener('click', placeFromEvent);

canvas.addEventListener('touchend', e => {
  // Suppresses the synthetic click that would otherwise replay this tap.
  e.preventDefault();
  placeFromEvent(e);
}, { passive: false });

newBtn.addEventListener('click',   newGame);
undoBtn.addEventListener('click',  undo);

diffSel.addEventListener('change', e => {
  difficulty = e.target.value;
});

colorSel.addEventListener('change', e => {
  playerColor = e.target.value === 'white' ? WHITE : BLACK;
  newGame();
});

langBtn?.addEventListener('click', e => {
  e.stopPropagation();
  toggleLangDropdown();
});

langMenuItems.forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const targetLang = item.getAttribute('data-lang');
    setLanguage(targetLang);
  });
});

document.addEventListener('click', e => {
  if (langDropdown && !langDropdown.contains(e.target)) {
    closeLangDropdown();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && langDropdown?.classList.contains('open')) {
    closeLangDropdown();
    langBtn?.focus();
  }
});

themeBtn.addEventListener('click', () => {
  dark = !dark;
  document.body.classList.toggle('dark', dark);
  draw();
  themeBtn.textContent = dark ? t(lang, 'themeLight') : t(lang, 'themeDark');
});

window.addEventListener('resize', resize);

// ── Init ──────────────────────────────────────────────────────────────────────
resize();
newGame();
