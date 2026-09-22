/**
 * gomoku.js — Core game logic for Gomoku (五目並べ)
 * Board state, move validation, win detection (immutable operations)
 */

export const BOARD_SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

/** Create a fresh 15x15 board filled with EMPTY */
export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(EMPTY));
}

/** Return a new board with the stone placed (immutable) */
export function placeStone(board, row, col, player) {
  const next = board.map(r => r.slice());
  next[row][col] = player;
  return next;
}

/** True if the cell is on the board and empty */
export function isValidMove(board, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
  return board[row][col] === EMPTY;
}

/**
 * Check whether placing player's stone at (row, col) wins the game.
 * Assumes the stone is already on the board.
 */
export function checkWin(board, row, col, player) {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal ↘
    [1, -1],  // diagonal ↙
  ];
  for (const [dr, dc] of directions) {
    let count = 1;
    count += countDir(board, row, col, player, dr, dc);
    count += countDir(board, row, col, player, -dr, -dc);
    if (count >= 5) return true;
  }
  return false;
}

function countDir(board, row, col, player, dr, dc) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

/**
 * Return the array of [row, col] making up the winning line, or null if no win.
 */
export function getWinLine(board, row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    const cells = collectLine(board, row, col, player, dr, dc);
    if (cells.length >= 5) return cells;
  }
  return null;
}

function collectLine(board, row, col, player, dr, dc) {
  const cells = [[row, col]];
  // forward
  let r = row + dr, c = col + dc;
  while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
    cells.push([r, c]);
    r += dr; c += dc;
  }
  // backward
  r = row - dr; c = col - dc;
  while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
    cells.unshift([r, c]);
    r -= dr; c -= dc;
  }
  return cells;
}

/** True if every cell is occupied */
export function isFull(board) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY) return false;
    }
  }
  return true;
}

/** All empty cells on the board */
export function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY) cells.push([r, c]);
    }
  }
  return cells;
}

/**
 * Empty cells within `radius` of any placed stone (for AI move pruning).
 * Falls back to the centre cell on an empty board.
 */
export function getNearbyCells(board, radius = 2) {
  const occupied = new Set();
  const candidates = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== EMPTY) occupied.add(`${r},${c}`);
    }
  }

  if (occupied.size === 0) {
    const mid = Math.floor(BOARD_SIZE / 2);
    return [[mid, mid]];
  }

  for (const key of occupied) {
    const [sr, sc] = key.split(',').map(Number);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = sr + dr, nc = sc + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
            board[nr][nc] === EMPTY) {
          candidates.add(`${nr},${nc}`);
        }
      }
    }
  }

  return [...candidates].map(k => k.split(',').map(Number));
}
