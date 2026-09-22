import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, t, SUPPORTED_LANGS, languages } from '../src/lib/i18n.js';

test('i18n - supported languages', () => {
  assert.deepEqual(SUPPORTED_LANGS, ['en', 'ja', 'zh']);
  assert.equal(languages.length, 3);
  assert.deepEqual(
    languages.map(l => l.code),
    ['en', 'ja', 'zh'],
  );
  for (const l of languages) {
    assert.equal(t(l.code, 'langLabel'), l.name);
  }
});

test('i18n - key completeness across languages', () => {
  const enKeys = Object.keys(translations.en).sort();
  for (const lang of SUPPORTED_LANGS) {
    const langKeys = Object.keys(translations[lang]).sort();
    assert.deepEqual(
      langKeys,
      enKeys,
      `Language "${lang}" should have exact matching translation keys with English`,
    );
  }
});

test('i18n - translation values validation', () => {
  for (const lang of SUPPORTED_LANGS) {
    const dict = translations[lang];
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === 'function') {
        assert.equal(typeof value(1), 'string', `${lang}.${key}(1) should return a string`);
        assert.ok(value(1).length > 0, `${lang}.${key}(1) should not be empty`);
      } else {
        assert.equal(typeof value, 'string', `${lang}.${key} should be a string`);
        assert.ok(value.length > 0, `${lang}.${key} should not be empty`);
      }
    }
  }
});

test('i18n - t() function behavior', () => {
  // Test Chinese translations
  assert.equal(t('zh', 'newGame'), '新游戏');
  assert.equal(t('zh', 'undo'), '悔棋');
  assert.equal(t('zh', 'difficulty'), '难度');
  assert.equal(t('zh', 'blackWins'), '黑棋获胜！');
  assert.equal(t('zh', 'whiteWins'), '白棋获胜！');
  assert.equal(t('zh', 'draw'), '平局');
  assert.equal(t('zh', 'moveN', 3), '第 3 手');
  assert.equal(t('zh', 'langLabel'), '简体中文');
  assert.equal(t('zh', 'selectLang'), '选择语言');

  // Test Japanese translations
  assert.equal(t('ja', 'newGame'), '新しいゲーム');
  assert.equal(t('ja', 'moveN', 3), '3 手目');
  assert.equal(t('ja', 'langLabel'), '日本語');

  // Test English translations
  assert.equal(t('en', 'newGame'), 'New Game');
  assert.equal(t('en', 'moveN', 3), 'Move 3');
  assert.equal(t('en', 'langLabel'), 'English');

  // Test fallback on unknown key
  assert.equal(t('zh', 'non_existent_key'), 'non_existent_key');

  // Test fallback on unknown lang
  assert.equal(t('fr', 'newGame'), 'New Game');
});
