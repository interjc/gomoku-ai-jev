import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE, EMPTY, BLACK, WHITE,
  createBoard, placeStone, isValidMove,
  checkWin, getWinLine, isFull, getNearbyCells,
} from '../src/lib/gomoku.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function placeRow(board, row, colStart, player, len) {
  let b = board;
  for (let i = 0; i < len; i++) b = placeStone(b, row, colStart + i, player);
  return b;
}
function placeCol(board, col, rowStart, player, len) {
  let b = board;
  for (let i = 0; i < len; i++) b = placeStone(b, rowStart + i, col, player);
  return b;
}

// ── createBoard ───────────────────────────────────────────────────────────────
describe('createBoard', () => {
  it('returns 15×15 grid', () => {
    const b = createBoard();
    assert.equal(b.length, BOARD_SIZE);
    for (const row of b) assert.equal(row.length, BOARD_SIZE);
  });

  it('is all EMPTY initially', () => {
    const b = createBoard();
    for (const row of b) for (const cell of row) assert.equal(cell, EMPTY);
  });
});

// ── placeStone ────────────────────────────────────────────────────────────────
describe('placeStone', () => {
  it('places the correct player value', () => {
    const b = placeStone(createBoard(), 3, 4, BLACK);
    assert.equal(b[3][4], BLACK);
  });

  it('does not mutate the original board (immutability)', () => {
    const original = createBoard();
    placeStone(original, 0, 0, BLACK);
    assert.equal(original[0][0], EMPTY);
  });

  it('other cells remain EMPTY', () => {
    const b = placeStone(createBoard(), 7, 7, WHITE);
    assert.equal(b[0][0], EMPTY);
    assert.equal(b[14][14], EMPTY);
  });
});

// ── isValidMove ───────────────────────────────────────────────────────────────
describe('isValidMove', () => {
  it('returns true for an empty cell', () => {
    assert.equal(isValidMove(createBoard(), 0, 0), true);
  });

  it('returns false for an occupied cell', () => {
    const b = placeStone(createBoard(), 5, 5, BLACK);
    assert.equal(isValidMove(b, 5, 5), false);
  });

  it('returns false for negative row', () => {
    assert.equal(isValidMove(createBoard(), -1, 0), false);
  });

  it('returns false for negative col', () => {
    assert.equal(isValidMove(createBoard(), 0, -1), false);
  });

  it('returns false for row >= BOARD_SIZE', () => {
    assert.equal(isValidMove(createBoard(), BOARD_SIZE, 0), false);
  });

  it('returns false for col >= BOARD_SIZE', () => {
    assert.equal(isValidMove(createBoard(), 0, BOARD_SIZE), false);
  });
});

// ── checkWin ──────────────────────────────────────────────────────────────────
describe('checkWin', () => {
  it('detects horizontal 5', () => {
    let b = placeRow(createBoard(), 2, 3, BLACK, 5);
    assert.equal(checkWin(b, 2, 7, BLACK), true);
  });

  it('detects vertical 5', () => {
    let b = placeCol(createBoard(), 5, 0, WHITE, 5);
    assert.equal(checkWin(b, 4, 5, WHITE), true);
  });

  it('detects diagonal ↘ 5', () => {
    let b = createBoard();
    for (let i = 0; i < 5; i++) b = placeStone(b, i, i, BLACK);
    assert.equal(checkWin(b, 4, 4, BLACK), true);
  });

  it('detects diagonal ↙ 5', () => {
    let b = createBoard();
    for (let i = 0; i < 5; i++) b = placeStone(b, i, 4 - i, WHITE);
    assert.equal(checkWin(b, 4, 0, WHITE), true);
  });

  it('returns false for 4 in a row', () => {
    let b = placeRow(createBoard(), 0, 0, BLACK, 4);
    assert.equal(checkWin(b, 0, 3, BLACK), false);
  });

  it('6 in a row still wins', () => {
    let b = placeRow(createBoard(), 1, 0, BLACK, 6);
    assert.equal(checkWin(b, 1, 5, BLACK), true);
  });

  it('returns false when the cell belongs to opponent', () => {
    let b = placeRow(createBoard(), 0, 0, BLACK, 5);
    assert.equal(checkWin(b, 0, 4, WHITE), false);
  });
});

// ── getWinLine ────────────────────────────────────────────────────────────────
describe('getWinLine', () => {
  it('returns exactly 5 cells for a horizontal win', () => {
    let b = placeRow(createBoard(), 3, 5, BLACK, 5);
    const line = getWinLine(b, 3, 9, BLACK);
    assert.ok(line !== null);
    assert.equal(line.length, 5);
  });

  it('returns null when no win', () => {
    let b = placeRow(createBoard(), 0, 0, BLACK, 4);
    assert.equal(getWinLine(b, 0, 3, BLACK), null);
  });

  it('win line contains the last placed cell', () => {
    let b = placeRow(createBoard(), 7, 0, WHITE, 5);
    const line = getWinLine(b, 7, 4, WHITE);
    const found = line.some(([r, c]) => r === 7 && c === 4);
    assert.ok(found);
  });
});

// ── isFull ────────────────────────────────────────────────────────────────────
describe('isFull', () => {
  it('empty board is not full', () => {
    assert.equal(isFull(createBoard()), false);
  });

  it('board with one stone is not full', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    assert.equal(isFull(b), false);
  });

  it('completely filled board is full', () => {
    let b = createBoard();
    let player = BLACK;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        b = placeStone(b, r, c, player);
        player = player === BLACK ? WHITE : BLACK;
      }
    }
    assert.equal(isFull(b), true);
  });
});

// ── getNearbyCells ────────────────────────────────────────────────────────────
describe('getNearbyCells', () => {
  it('returns centre on empty board', () => {
    const cells = getNearbyCells(createBoard(), 2);
    assert.equal(cells.length, 1);
    const mid = Math.floor(BOARD_SIZE / 2);
    assert.deepEqual(cells[0], [mid, mid]);
  });

  it('all returned cells are EMPTY', () => {
    let b = placeStone(createBoard(), 7, 7, BLACK);
    const cells = getNearbyCells(b, 2);
    for (const [r, c] of cells) assert.equal(b[r][c], EMPTY);
  });

  it('radius 1 returns at most 8 cells around a centre stone', () => {
    let b = placeStone(createBoard(), 7, 7, BLACK);
    const cells = getNearbyCells(b, 1);
    assert.ok(cells.length <= 8);
  });

  it('returns cells within the given radius', () => {
    let b = placeStone(createBoard(), 7, 7, BLACK);
    const cells = getNearbyCells(b, 2);
    for (const [r, c] of cells) {
      assert.ok(Math.abs(r - 7) <= 2 && Math.abs(c - 7) <= 2,
        `cell [${r},${c}] is outside radius 2 from [7,7]`);
    }
  });
});
