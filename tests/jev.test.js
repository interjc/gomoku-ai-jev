import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BLACK, WHITE, createBoard, placeStone } from '../src/lib/gomoku.js';
import { WIN_SCORE } from '../src/lib/ai.js';
import {
  chooseMove, findImmediateWin, buildJevRequest, parseMoveKey, shortlist, LEVELS,
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

  it('accepts a confident Jev choice from the hard shortlist', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    let offered = null;
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0.5,
      history: [{ row: 7, col: 7, player: BLACK }],
      ask: async (request) => {
        offered = Object.keys(request.criteria);
        assert.equal(request.state.history.length, 1);
        assert.equal(request.state.history[0].point, 'H8');
        return { choice: offered[0], confidence: 0.9, probabilities: { [offered[0]]: 0.9 } };
      },
    });
    assert.ok(offered.length >= 2, 'hard should offer a band of near-equal points');
    assert.equal(move.source, 'jev');
    assert.deepEqual(parseMoveKey(offered[0]), [move.row, move.col]);
  });

  it('ignores a Jev pick outside the searched band on hard', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0,
      // Legal, but far from any stone and never offered.
      ask: async () => ({ choice: 'r0c0', confidence: 1 }),
    });
    assert.equal(move.source, 'search');
    assert.notDeepEqual([move.row, move.col], [0, 0]);
  });

  it('falls back to the search when confidence is below the floor', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0.5,
      ask: async (request) => ({ choice: Object.keys(request.criteria)[0], confidence: 0.2 }),
    });
    assert.equal(move.source, 'search');
    assert.ok(Number.isInteger(move.row), 'the server still returns a move');
    assert.ok(move.depth >= 2);
  });

  it('falls back to the search when Jev fails', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'medium',
      ask: async () => { throw new Error('down'); },
    });
    assert.equal(move.source, 'search');
    assert.ok(Number.isInteger(move.row));
  });

  it('searches without Jev when no key-backed ask function is provided', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'hard',
    });
    assert.equal(move.source, 'search');
    assert.ok(Number.isInteger(move.row));
  });

  it('asks Jev on easy with the move history and no lookahead', async () => {
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
    assert.equal(seen.state.searched_plies, undefined);
    assert.equal(seen.criteria.r7c8.touches_latest_stone, true);
    assert.equal(seen.criteria.r7c8.score_after_line, undefined);
    assert.equal(seen.criteria.r7c8.score_after_reply, undefined);
    assert.equal(move.source, 'jev');
    assert.deepEqual([move.row, move.col], [7, 8]);
  });

  it('plays a random nearby point on easy when Jev fails', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'easy',
      ask: async () => { throw new Error('down'); },
    });
    assert.equal(move.source, 'local');
    assert.ok(Number.isInteger(move.row));
  });

  it('runs a second Jev round on hard when the first is unsure', async () => {
    let b = placeStone(createBoard(), 7, 7, BLACK);
    b = placeStone(b, 7, 8, WHITE);
    b = placeStone(b, 8, 8, BLACK);
    const rounds = [];
    const move = await chooseMove({
      board: b,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0,
      ask: async (request) => {
        rounds.push(request);
        const keys = Object.keys(request.criteria);
        return { choice: keys[0], confidence: 0.3 };
      },
    });
    assert.equal(rounds.length, 2, 'low confidence should trigger the runoff');
    assert.equal(Object.keys(rounds[1].criteria).length, 2);
    assert.match(rounds[1].instructions.standard, /re-searched deeper/);
    assert.ok(rounds[1].state.searched_plies >= rounds[0].state.searched_plies);
    assert.equal(move.rounds, 2);
  });

  it('plays a forced win outright without asking', async () => {
    // Four in a row with both ends open: the search sees the win itself.
    let b = placeRow(createBoard(), 7, 5, WHITE, 3);
    b = placeStone(b, 3, 3, BLACK);
    let asked = 0;
    const move = await chooseMove({
      board: b,
      player: WHITE,
      difficulty: 'hard',
      minConfidence: 0,
      ask: async (request) => { asked += 1; return { choice: Object.keys(request.criteria)[0], confidence: 1 }; },
    });
    assert.ok(Number.isInteger(move.row));
    assert.ok(asked <= 2);
  });
});

describe('shortlist', () => {
  it('plays a forced win alone', () => {
    const ranked = [
      { row: 0, col: 0, score: WIN_SCORE, line: [] },
      { row: 1, col: 1, score: 500, line: [] },
    ];
    assert.equal(shortlist(ranked, LEVELS.hard).length, 1);
  });

  it('drops candidates that lose by force', () => {
    const ranked = [
      { row: 0, col: 0, score: 400, line: [] },
      { row: 1, col: 1, score: 390, line: [] },
      { row: 2, col: 2, score: -WIN_SCORE, line: [] },
    ];
    const band = shortlist(ranked, LEVELS.hard);
    assert.equal(band.length, 2);
    assert.ok(band.every(entry => entry.score > 0));
  });

  it('keeps only points within the noise band', () => {
    const ranked = [
      { row: 0, col: 0, score: 1000, line: [] },
      { row: 1, col: 1, score: 900, line: [] },
      { row: 2, col: 2, score: 100, line: [] },
    ];
    const band = shortlist(ranked, LEVELS.hard);
    assert.equal(band.length, 2);
  });

  it('takes the top of the list when there is no band', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => ({ row: 0, col: i, score: -i, line: [] }));
    assert.equal(shortlist(ranked, LEVELS.medium).length, LEVELS.medium.shortlist);
  });
});

describe('buildJevRequest', () => {
  it('names candidate points as r{row}c{col}', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE, {
      difficulty: 'easy',
      history: [{ row: 7, col: 7, player: BLACK }],
    });
    assert.deepEqual(parseMoveKey('r7c8'), [7, 8]);
    assert.equal(request.criteria.r7c8.point, 'I8');
    assert.equal(request.state.side_to_move, 'white (O)');
    assert.equal(request.state.history[0].point, 'H8');
  });

  it('gives medium the reply and hard the verified line', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const history = [{ row: 7, col: 7, player: BLACK }];
    const ranked = [{ row: 7, col: 8, score: 120, line: [[7, 8], [6, 6], [7, 9]] }];

    const medium = buildJevRequest(board, WHITE, {
      difficulty: 'medium', history, ranked, depth: 2,
    });
    assert.equal(medium.criteria.r7c8.score_after_reply, 120);
    assert.equal(medium.criteria.r7c8.opponent_best_reply, 'G7');
    assert.equal(medium.criteria.r7c8.best_line, undefined);
    assert.match(medium.instructions.standard, /two plies/);

    const hard = buildJevRequest(board, WHITE, {
      difficulty: 'hard', history, ranked, depth: 8,
    });
    assert.equal(hard.criteria.r7c8.best_line, 'I8 G7 J8');
    assert.equal(hard.criteria.r7c8.searched_plies, 8);
    assert.equal(hard.criteria.r7c8.score_behind_best, 0);
    assert.equal(hard.criteria.r7c8.wins_by_force, false);
    assert.equal(hard.criteria.r7c8.loses_by_force, false);
    assert.equal(hard.state.searched_plies, 8);
    assert.match(hard.instructions.standard, /alpha-beta/);
  });

  it('drops a history entry that does not match the board', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE, {
      difficulty: 'easy',
      history: [{ row: 7, col: 7, player: WHITE }],
    });
    assert.deepEqual(request.state.history, []);
  });
});
