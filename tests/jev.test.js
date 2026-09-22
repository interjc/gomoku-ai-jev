import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BLACK, WHITE, createBoard, placeStone } from '../src/lib/gomoku.js';
import {
  chooseMove, findImmediateWin, buildJevRequest, parseMoveKey,
} from '../src/lib/jev/move.js';

function placeRow(board, row, colStart, player, len) {
  let next = board;
  for (let i = 0; i < len; i++) next = placeStone(next, row, colStart + i, player);
  return next;
}

describe('findImmediateWin', () => {
  it('finds the fifth stone in a row of four', () => {
    const board = placeRow(createBoard(), 7, 0, BLACK, 4);
    assert.deepEqual(findImmediateWin(board, BLACK), [7, 4]);
  });
});

describe('chooseMove', () => {
  it('plays an immediate win without asking Jev', async () => {
    const board = placeRow(createBoard(), 7, 0, BLACK, 4);
    let asked = false;
    const move = await chooseMove({
      board,
      player: BLACK,
      difficulty: 'hard',
      ask: async () => { asked = true; return { choice: 'r0c0', confidence: 1 }; },
    });
    assert.equal(asked, false);
    assert.deepEqual([move.row, move.col], [7, 4]);
    assert.equal(move.source, 'rule');
  });

  it('blocks an opponent five before asking Jev', async () => {
    const board = placeRow(createBoard(), 3, 0, WHITE, 4);
    let asked = false;
    const move = await chooseMove({
      board,
      player: BLACK,
      difficulty: 'medium',
      ask: async () => { asked = true; return { choice: 'r0c0', confidence: 1 }; },
    });
    assert.equal(asked, false);
    assert.deepEqual([move.row, move.col], [3, 4]);
    assert.equal(move.source, 'rule');
  });

  it('accepts a confident legal Jev choice', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0.5,
      ask: async (request) => {
        assert.equal(request.criteria.r7c8.includes('I8'), true);
        return { choice: 'r7c8', confidence: 0.8 };
      },
    });
    assert.deepEqual([move.row, move.col], [7, 8]);
    assert.equal(move.source, 'jev');
  });

  it('accepts a modest confidence when many points are legal', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0,
      ask: async () => ({ choice: 'r7c6', confidence: 0.14 }),
    });
    assert.deepEqual([move.row, move.col], [7, 6]);
    assert.equal(move.source, 'jev');
  });

  it('leaves the move to local search when confidence is low', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0.5,
      ask: async () => ({ choice: 'r7c8', confidence: 0.2 }),
    });
    assert.equal(move.source, 'minimax');
    assert.equal(move.row, undefined);
  });

  it('leaves the move to local search when Jev fails', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'medium',
      ask: async () => { throw new Error('down'); },
    });
    assert.equal(move.source, 'minimax');
  });

  it('does not call Jev on easy', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    let asked = false;
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'easy',
      ask: async () => { asked = true; return { choice: 'r7c8', confidence: 1 }; },
    });
    assert.equal(asked, false);
    assert.equal(move.source, 'local');
  });

  it('does not call Jev when no key-backed ask function is provided', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
    });
    assert.equal(move.source, 'minimax');
  });
});

describe('buildJevRequest', () => {
  it('names candidate points as r{row}c{col}', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE);
    assert.equal(parseMoveKey('r7c8')[0], 7);
    assert.ok(request.criteria.r7c8);
    assert.equal(request.state.side_to_move, 'white (O)');
  });
});
