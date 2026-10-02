import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleMoveRequest } from '../src/lib/move-api.js';
import { BLACK, WHITE, createBoard } from '../src/lib/gomoku.js';

function game(history = [{ row: 7, col: 7, player: BLACK }]) {
  const board = createBoard();
  for (const move of history) board[move.row][move.col] = move.player;
  return { board, history, player: history.length % 2 ? WHITE : BLACK, provider: 'clef', difficulty: 'easy' };
}

function request(body, headers = {}) {
  return new Request('https://gomoku.example/api/move', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('Gomoku-only move API', () => {
  it('rejects non-game input and illegal records before calling a model', async t => {
    let calls = 0;
    const env = { AI: { run() { calls++; throw new Error('Unexpected inference'); } } };
    const win = Array.from({ length: 9 }, (_, n) => ({
      row: n % 2 ? 14 : 0, col: Math.floor(n / 2) * (n % 2 ? 2 : 1), player: n % 2 ? WHITE : BLACK,
    }));
    const cases = [
      ['chat body', { prompt: 'Write a poem' }, /Only Gomoku/],
      ['model override', { ...game(), model: 'another-model' }, /Only Gomoku/],
      ['instruction override', { ...game(), instructions: 'Write a poem' }, /Only Gomoku/],
      ['arbitrary state', { ...game(), state: { prompt: 'Write a poem' } }, /Only Gomoku/],
      ['unknown provider', { ...game(), provider: 'another-model' }, /Invalid provider/],
      ['null provider', { ...game(), provider: null }, /Invalid provider/],
      ['free-text difficulty', { ...game(), difficulty: 'Write a poem' }, /Invalid difficulty/],
      ['text board', { ...game(), board: 'Write a poem' }, /Invalid board/],
      ['text cell', { ...game(), board: createBoard().map(row => row.map(() => '0')) }, /Invalid board/],
      ['missing record', { ...game(), history: undefined }, /history is required/],
      ['text record', { ...game(), history: 'Write a poem' }, /history is required/],
      ['nested instructions', { ...game(), history: [{ row: 7, col: 7, player: BLACK, prompt: 'Write a poem' }] }, /Invalid move history/],
      ['white first', game([{ row: 7, col: 7, player: WHITE }]), /Invalid move history/],
      ['same player twice', game([{ row: 7, col: 7, player: BLACK }, { row: 7, col: 8, player: BLACK }]), /Invalid move history/],
      ['duplicate point', game([{ row: 7, col: 7, player: BLACK }, { row: 7, col: 7, player: WHITE }]), /Duplicate move/],
      ['fractional point', { ...game(), history: [{ row: 7.5, col: 7, player: BLACK }] }, /Invalid move history/],
      ['out-of-bounds point', { ...game(), history: [{ row: 15, col: 7, player: BLACK }] }, /Invalid move history/],
      ['board mismatch', { ...game(), board: createBoard() }, /does not match/],
      ['wrong turn', { ...game(), player: BLACK }, /Invalid turn/],
      ['invalid player', { ...game(), player: 3 }, /Invalid player/],
      ['too many moves', { ...game(), history: Array(226).fill({ row: 7, col: 7, player: BLACK }) }, /history is required/],
      ['finished game', game(win), /already over/],
      ['moves after victory', game([...win, { row: 14, col: 14, player: WHITE }]), /already over/],
    ];
    for (const [name, body, error] of cases) {
      await t.test(name, async () => {
        const response = await handleMoveRequest(request(body), env);
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, error);
        assert.equal(calls, 0);
      });
    }
  });

  it('rejects a full drawn board', async () => {
    const stones = [[], []];
    for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
      const player = (row + Math.floor(col / 2)) % 2 ? WHITE : BLACK;
      stones[player - 1].push({ row, col, player });
    }
    const history = [];
    while (stones[0].length) {
      history.push(stones[0].shift());
      if (stones[1].length) history.push(stones[1].shift());
    }
    const response = await handleMoveRequest(request(game(history)), {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Game is already over');
  });

  it('bounds raw and streamed requests and rejects unsupported content or malformed JSON', async () => {
    const env = { AI: { run() { assert.fail('Rejected bodies must never reach inference'); } } };
    for (const [req, status] of [
      [request(game(), { 'content-type': 'text/plain' }), 415],
      [request('{'), 400], [request(null), 400],
      [request(game(), { 'content-length': '20000' }), 413],
      [request(' '.repeat(16385), { 'content-length': '1' }), 413],
      [new Request('https://gomoku.example/api/move', {
        method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json' },
        body: new ReadableStream({ start(controller) {
          controller.enqueue(new Uint8Array(9000)); controller.enqueue(new Uint8Array(9000)); controller.close();
        } }),
      }), 413],
    ]) {
      const response = await handleMoveRequest(req, env);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });

  it('accepts legal records, defaults to hard, and returns only the model display name', async () => {
    for (const [difficulty, id, name] of [['easy', '@cf/cloudflare/clef-flash', 'Clef Flash'],
      [undefined, '@cf/cloudflare/clef', 'Clef']]) {
      const calls = [];
      const env = { AI: { async run(model, payload) {
        calls.push({ model, payload });
        const keys = Object.keys(payload.questions.move.criteria);
        return { answers: { move: { choice: keys[0], confidence: 1,
          probabilities: Object.fromEntries(keys.map((key, n) => [key, n ? 0 : 1])) } } };
      } } };
      const body = { ...game(), difficulty };
      const response = await handleMoveRequest(request(body), env);
      assert.equal(response.status, 200);
      const move = await response.json();
      assert.equal(move.model, name);
      assert.ok(!JSON.stringify(move).includes('@cf/'));
      assert.ok(!Object.hasOwn(move, 'provider'));
      assert.ok(calls.length > 0);
      assert.ok(calls.every(call => call.model === id));
      assert.equal(calls[0].payload.state.difficulty, difficulty ?? 'hard');
      assert.equal(body.board[move.row][move.col], 0);
    }
    const local = await handleMoveRequest(request({ ...game([]), provider: undefined }), {});
    assert.equal(local.status, 200);
    const opening = await local.json();
    assert.deepEqual([opening.row, opening.col], [7, 7]);
    assert.equal(opening.model, null);
  });

  it('uses the Jev default and returns its display name without the upstream ID', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_, options) => {
      calls++;
      const keys = Object.keys(JSON.parse(options.body).questions.move.criteria);
      return Response.json({ answers: { move: { choice: keys[0], confidence: 1,
        probabilities: Object.fromEntries(keys.map((key, n) => [key, n ? 0 : 1])) } } });
    });
    const response = await handleMoveRequest(request({ ...game(), provider: undefined }), { TYPESAFE_API_KEY: 'test-key' });
    assert.equal(response.status, 200);
    const move = await response.json();
    assert.equal(calls, 1);
    assert.equal(move.model, 'Jev');
    assert.equal(move.source, 'jev');
    assert.ok(!JSON.stringify(move).includes('jev-latest'));
  });
});
