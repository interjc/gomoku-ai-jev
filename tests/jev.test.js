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
      history: [{ row: 7, col: 7, player: BLACK }],
      ask: async (request) => {
        assert.equal(request.criteria.r7c8.point, 'I8');
        assert.equal(request.state.history.length, 1);
        assert.equal(request.state.history[0].point, 'H8');
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

  it('asks Jev on easy with the move history and no search scores', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    let seen = null;
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'easy',
      history: [{ row: 7, col: 7, player: BLACK }],
      ask: async (request) => {
        seen = request;
        return { choice: 'r7c8', confidence: 1 };
      },
    });
    assert.equal(seen.state.difficulty, 'easy');
    assert.equal(seen.state.history[0].point, 'H8');
    assert.equal(seen.state.evaluation, undefined);
    assert.equal(seen.criteria.r7c8.touches_latest_stone, true);
    assert.equal(seen.criteria.r7c8.evaluation_after_move, undefined);
    assert.equal(move.source, 'jev');
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
    const request = buildJevRequest(board, WHITE, {
      history: [{ row: 7, col: 7, player: BLACK }],
    });
    assert.equal(parseMoveKey('r7c8')[0], 7);
    assert.equal(request.criteria.r7c8.point, 'I8');
    assert.equal(request.state.side_to_move, 'white (O)');
    assert.equal(request.state.history[0].point, 'H8');
  });

  it('gives medium the pattern score and hard the opponent reply', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const history = [{ row: 7, col: 7, player: BLACK }];
    const medium = buildJevRequest(board, WHITE, { difficulty: 'medium', history });
    const hard = buildJevRequest(board, WHITE, { difficulty: 'hard', history });
    assert.equal(typeof medium.criteria.r7c8.evaluation_after_move, 'number');
    assert.equal(medium.criteria.r7c8.opponent_reply, undefined);
    assert.match(medium.instructions.standard, /depth-2/);
    assert.equal(typeof hard.criteria.r7c8.evaluation_after_opponent_reply, 'number');
    assert.equal(typeof hard.criteria.r7c8.opponent_reply, 'string');
    assert.match(hard.instructions.standard, /depth-4/);
  });

  it('drops a history entry that does not match the board', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE, {
      history: [{ row: 7, col: 7, player: WHITE }],
    });
    assert.deepEqual(request.state.history, []);
  });
});
