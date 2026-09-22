import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHOICES,
  canonicalChoice,
  commitManualChoice,
  explicitFromSearch,
  loadPrefs,
  readChoice,
  resolveChoice,
  urlWithChoice,
  writeChoice,
} from '../src/lib/prefs.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    dump() {
      return { ...data };
    },
  };
}

describe('resolveChoice', () => {
  it('uses the built-in default when nothing else is set', () => {
    assert.equal(resolveChoice('lang', null, null), 'en');
    assert.equal(resolveChoice('difficulty', undefined, ''), 'hard');
    assert.equal(resolveChoice('color', null, null), 'black');
    assert.equal(resolveChoice('theme', null, null), 'light');
  });

  it('prefers a manual or URL value over storage, then storage over the default', () => {
    assert.equal(resolveChoice('lang', 'zh', 'ja'), 'zh');
    assert.equal(resolveChoice('difficulty', null, 'master'), 'master');
    assert.equal(resolveChoice('color', 'white', 'black'), 'white');
    assert.equal(resolveChoice('theme', 'dark', 'light'), 'dark');
  });

  it('skips invalid explicit and stored values', () => {
    assert.equal(resolveChoice('lang', 'fr', 'ja'), 'ja');
    assert.equal(resolveChoice('lang', 'fr', 'nope'), 'en');
    assert.equal(resolveChoice('difficulty', 'expert', 'medium'), 'medium');
    assert.equal(resolveChoice('color', 'red', 'white'), 'white');
    assert.equal(resolveChoice('theme', 'sepia', null), 'light');
  });

  it('trims and lowercases accepted values', () => {
    assert.equal(canonicalChoice('lang', ' ZH '), 'zh');
    assert.equal(canonicalChoice('difficulty', 'Master'), 'master');
    assert.equal(canonicalChoice('color', 'White'), 'white');
    assert.equal(canonicalChoice('theme', ' DARK '), 'dark');
    assert.equal(canonicalChoice('lang', 1), null);
  });
});

describe('loadPrefs', () => {
  it('reads storage when the URL does not carry the choice', () => {
    const storage = memoryStorage({
      gomoku_lang: 'ja',
      gomoku_difficulty: 'medium',
      gomoku_color: 'white',
      gomoku_theme: 'dark',
    });
    assert.deepEqual(loadPrefs('', storage), {
      lang: 'ja',
      difficulty: 'medium',
      color: 'white',
      theme: 'dark',
    });
  });

  it('lets a valid URL value win without writing storage', () => {
    const storage = memoryStorage({
      gomoku_lang: 'ja',
      gomoku_difficulty: 'medium',
      gomoku_color: 'white',
      gomoku_theme: 'dark',
    });
    const before = storage.dump();
    assert.deepEqual(loadPrefs('?lang=en&difficulty=master&color=black&theme=light', storage), {
      lang: 'en',
      difficulty: 'master',
      color: 'black',
      theme: 'light',
    });
    assert.deepEqual(storage.dump(), before);
  });

  it('falls through an invalid URL value to storage, then to the default', () => {
    const storage = memoryStorage({ gomoku_lang: 'zh', gomoku_theme: 'nope' });
    assert.deepEqual(loadPrefs('?lang=fr&difficulty=expert&color=red', storage), {
      lang: 'zh',
      difficulty: 'hard',
      color: 'black',
      theme: 'light',
    });
  });

  it('accepts the first valid query value, ignoring case in the name and the value', () => {
    assert.equal(explicitFromSearch('?Lang=fr&lang=ZH', 'lang'), 'zh');
    assert.equal(explicitFromSearch('?Difficulty=Easy', 'difficulty'), 'easy');
    assert.equal(explicitFromSearch('?color=WHITE', 'color'), 'white');
  });

  it('survives a storage object that throws', () => {
    const storage = {
      getItem() {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(loadPrefs('?theme=dark', storage), {
      lang: 'en',
      difficulty: 'hard',
      color: 'black',
      theme: 'dark',
    });
    assert.equal(readChoice(storage, 'lang'), null);
  });
});

describe('commitManualChoice', () => {
  it('saves a manual change and leaves a clean URL alone', () => {
    const storage = memoryStorage({ gomoku_lang: 'ja' });
    const result = commitManualChoice('http://localhost:4321/', storage, 'difficulty', 'master');
    assert.deepEqual(result, { ok: true, value: 'master', href: null });
    assert.equal(storage.getItem('gomoku_difficulty'), 'master');
    assert.equal(storage.getItem('gomoku_lang'), 'ja');
  });

  it('updates a query param the URL already carries', () => {
    const storage = memoryStorage();
    const result = commitManualChoice(
      'http://localhost:4321/?foo=1&Difficulty=easy#board',
      storage,
      'difficulty',
      'Medium',
    );
    assert.equal(result.ok, true);
    assert.equal(result.value, 'medium');
    assert.equal(result.href, '/?foo=1&difficulty=medium#board');
    assert.equal(storage.getItem('gomoku_difficulty'), 'medium');
  });

  it('rejects an unknown value and does not touch storage or the URL', () => {
    const storage = memoryStorage({ gomoku_lang: 'ja' });
    const result = commitManualChoice('http://localhost:4321/?lang=ja', storage, 'lang', 'fr');
    assert.deepEqual(result, { ok: false, value: null, href: null });
    assert.equal(storage.getItem('gomoku_lang'), 'ja');
  });

  it('still reports the saved value when storage throws', () => {
    const storage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
    };
    const result = commitManualChoice('http://localhost:4321/?theme=light', storage, 'theme', 'dark');
    assert.equal(result.ok, true);
    assert.equal(result.value, 'dark');
    assert.equal(result.href, '/?theme=dark');
    assert.equal(writeChoice(storage, 'color', 'white'), false);
  });
});

describe('urlWithChoice', () => {
  it('returns null when the URL does not carry that choice', () => {
    assert.equal(urlWithChoice('http://localhost:4321/?lang=en', 'color', 'white'), null);
    assert.equal(urlWithChoice('http://localhost:4321/?lang=en', 'lang', 'nope'), null);
  });

  it('collapses repeated params onto the canonical name', () => {
    assert.equal(
      urlWithChoice('http://localhost:4321/?lang=en&lang=ja', 'lang', 'zh'),
      '/?lang=zh',
    );
  });
});

describe('early boot markup', () => {
  it('uses the same language and theme keys as CHOICES', () => {
    const src = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
    for (const key of ['lang', 'theme']) {
      const choice = CHOICES[key];
      assert.ok(src.includes(choice.storageKey), choice.storageKey);
      assert.ok(src.includes(`param: '${choice.param}'`), choice.param);
      for (const value of choice.allowed) {
        assert.ok(src.includes(`'${value}'`), value);
      }
    }
  });
});
