import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getProviderConfig, createProvider } from '../src/lib/providers.js';
import { chooseMove, buildJevRequest } from '../src/lib/jev/move.js';
import { BLACK, WHITE, createBoard, placeStone } from '../src/lib/gomoku.js';
import { askJev } from '../src/lib/jev/ask.js';

const configured = { AI: { run() {} }, TYPESAFE_API_KEY: 'test-key' };

describe('provider capabilities', () => {
  it('defaults both providers on, selects Jev, and publishes no credentials', () => {
    const config = getProviderConfig(configured);
    assert.equal(config.defaultProvider, 'jev');
    assert.ok(config.providers.every(item => item.enabled && item.available));
    assert.ok(!JSON.stringify(config).includes('test-key'));
  });

  it('honours independent switches, configured default, and unavailable providers', () => {
    const cases = [
      [{ AI_DEFAULT_PROVIDER: 'jev' }, 'jev', [true, true]],
      [{ AI_CLEF_ENABLED: 'false' }, 'jev', [false, true]],
      [{ AI_JEV_ENABLED: 'false', AI_DEFAULT_PROVIDER: 'jev' }, 'clef', [true, false]],
      [{ AI_CLEF_ENABLED: 'false', AI_JEV_ENABLED: 'false' }, null, [false, false]],
      [{ TYPESAFE_API_KEY: '', AI_DEFAULT_PROVIDER: 'jev' }, 'clef', [true, false]],
      [{ AI: undefined }, 'jev', [false, true]],
      [{ AI: undefined, TYPESAFE_API_KEY: '' }, null, [false, false]],
      [{ AI_DEFAULT_PROVIDER: 'unknown' }, 'clef', [true, true]],
    ];
    for (const [overrides, expected, availability] of cases) {
      const config = getProviderConfig({ ...configured, ...overrides });
      assert.equal(config.defaultProvider, expected);
      assert.deepEqual(config.providers.map(item => item.available), availability);
    }
    assert.equal(getProviderConfig({}).providers[1].reason, 'not-configured');
    assert.equal(getProviderConfig({ ...configured, AI_JEV_ENABLED: 'false' }).providers[1].reason, 'disabled');
  });

  it('rejects explicitly unavailable or unknown providers instead of substituting another', () => {
    assert.throws(() => createProvider(configured, 'unknown', 'medium'), /Invalid provider/);
    assert.throws(() => createProvider({ ...configured, AI_JEV_ENABLED: 'false' }, 'jev', 'medium'), /unavailable/);
    assert.throws(() => createProvider({ AI: configured.AI }, 'jev', 'medium'), /unavailable/);
    assert.equal(createProvider({}, undefined, 'medium').ask, null);
  });

  it('keeps the Jev SDK endpoint, model, key and confidence configuration', async t => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE, { difficulty: 'medium' });
    const response = { choice: 'r7c8', confidence: 0.9, probabilities: { r7c8: 0.9 } };
    let sent;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      sent = { url: String(url), options, body: JSON.parse(options.body) };
      return Response.json({ answers: { move: response } });
    });
    const provider = createProvider({
      ...configured, TYPESAFE_BASE_URL: 'https://example.com/proxy',
      TYPESAFE_DEFAULT_MODEL: 'jev-latest', JEV_MIN_CONFIDENCE: '0.7',
    }, 'jev', 'master');
    assert.deepEqual(await provider.ask(request), response);
    assert.equal(provider.model, 'jev-latest');
    assert.equal(provider.minConfidence, 0.7);
    assert.equal(sent.url, 'https://example.com/proxy/v1/systemone');
    assert.equal(new Headers(sent.options.headers).get('authorization'), 'Bearer test-key');
    assert.equal(sent.body.model, 'jev-latest');
    assert.deepEqual(sent.body.questions.move, { type: 'choice', instructions: request.instructions, criteria: request.criteria });
  });

  it('refuses other Jev model configurations before any upstream request', async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected inference'); });
    for (const model of ['custom-jev', '@cf/cloudflare/clef', 'gpt-4o']) {
      const env = { ...configured, TYPESAFE_DEFAULT_MODEL: model };
      assert.equal(getProviderConfig(env).providers.find(item => item.id === 'jev').available, false);
      assert.throws(() => createProvider(env, 'jev', 'hard'), /unavailable/);
      await assert.rejects(askJev(env, {}), /Unsupported Jev model/);
    }
    assert.equal(calls, 0);
  });
});

describe('Clef move transport', () => {
  it('uses Flash only for easy and medium and the full model for hard and master', async () => {
    for (const [difficulty, selector] of [['easy', 'clef-flash'], ['medium', 'clef-flash'], ['hard', 'clef'], ['master', 'clef']]) {
      let called;
      const env = { AI: { async run(model, payload) {
        called = { model, payload };
        return { answers: { move: { choice: 'r7c8', confidence: 1, probabilities: { r7c8: 1 } } } };
      } } };
      const provider = createProvider(env, 'clef', difficulty);
      const request = { state: { difficulty, board: 'position' }, instructions: { question: 'Choose a point' }, criteria: { r7c8: { point: 'I8' } } };
      const answer = await provider.ask(request);
      assert.equal(provider.model, `@cf/cloudflare/${selector}`);
      assert.deepEqual(called, { model: provider.model, payload: {
        model: selector, state: request.state,
        questions: { move: { type: 'choice', instructions: request.instructions, criteria: request.criteria } },
      } });
      assert.deepEqual(answer, { choice: 'r7c8', confidence: 1, probabilities: { r7c8: 1 } });
    }
  });

  it('rejects malformed answers and times out stalled inference', async () => {
    const request = { state: { difficulty: 'medium' }, instructions: 'Pick', criteria: { r7c8: 'I8', r8c8: 'I9' } };
    const good = { choice: 'r7c8', confidence: 0.8, probabilities: { r7c8: 0.8, r8c8: 0.2 } };
    for (const answer of [null, { ...good, choice: 'r0c0' }, { ...good, confidence: NaN },
      { ...good, confidence: 2 }, { ...good, probabilities: { r7c8: 1 } },
      { ...good, probabilities: { r7c8: -0.1, r8c8: 1.1 } },
      { ...good, probabilities: { r7c8: 0, r8c8: 0 } }]) {
      const provider = createProvider({ AI: { async run() { return { answers: { move: answer } }; } } }, 'clef', 'medium');
      await assert.rejects(provider.ask(request), /Invalid Clef/);
    }
    const stalled = createProvider({ CLEF_TIMEOUT_MS: '5', AI: { run: () => new Promise(() => {}) } }, 'clef', 'medium');
    await assert.rejects(stalled.ask(request), /timed out/);
  });

  it('keeps the model and attribution through both rounds and preserves round one if runoff fails', async () => {
    let board = placeStone(createBoard(), 7, 7, BLACK);
    board = placeStone(board, 7, 8, WHITE);
    board = placeStone(board, 8, 8, BLACK);
    for (const failRunoff of [false, true]) {
      const calls = [];
      const provider = createProvider({ AI: { async run(model, payload) {
        calls.push(model);
        if (failRunoff && calls.length === 2) return { answers: { move: null } };
        const keys = Object.keys(payload.questions.move.criteria);
        return { answers: { move: {
          choice: keys[0], confidence: 0.3,
          probabilities: Object.fromEntries(keys.map(key => [key, 1 / keys.length])),
        } } };
      } } }, 'clef', 'hard');
      const move = await chooseMove({ board, player: WHITE, difficulty: 'hard', ...provider, source: provider.id });
      assert.deepEqual(calls, ['@cf/cloudflare/clef', '@cf/cloudflare/clef']);
      assert.equal(move.source, 'clef');
      assert.equal(move.rounds, failRunoff ? 1 : 2);
    }
  });

  it('falls back to search when the binding fails or confidence is below the Clef floor', async () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    for (const fail of [true, false]) {
      const provider = createProvider({ CLEF_MIN_CONFIDENCE: '0.9', AI: { async run(_, payload) {
        if (fail) throw new Error('AI unavailable');
        const keys = Object.keys(payload.questions.move.criteria);
        return { answers: { move: { choice: keys[0], confidence: 0.1,
          probabilities: Object.fromEntries(keys.map(key => [key, 1 / keys.length])) } } };
      } } }, 'clef', 'medium');
      const move = await chooseMove({ board, player: WHITE, difficulty: 'medium', ...provider, source: provider.id });
      assert.equal(move.source, 'search');
      assert.ok(Number.isInteger(move.row));
    }
  });
});
