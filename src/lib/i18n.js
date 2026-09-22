/**
 * i18n.js — Japanese / English translations
 */

export const translations = {
  ja: {
    title:          '五目並べ AI',
    newGame:        '新しいゲーム',
    undo:           '待った',
    difficulty:     '難易度',
    easy:           '初級',
    medium:         '中級',
    hard:           '上級',
    playerColor:    '手番',
    black:          '黒（先手）',
    white:          '白（後手）',
    thinking:       'AI 考え中…',
    yourTurn:       'あなたの番',
    aiTurn:         'AI の番',
    blackWins:      '黒の勝ち！',
    whiteWins:      '白の勝ち！',
    draw:           '引き分け',
    history:        '棋譜',
    moveN:          (n) => `${n} 手目`,
    langToggle:     'EN',
    themeToggle:    '🌙',
    themeDark:      '🌙',
    themeLight:     '☀️',
  },
  en: {
    title:          'Gomoku AI',
    newGame:        'New Game',
    undo:           'Undo',
    difficulty:     'Difficulty',
    easy:           'Easy',
    medium:         'Medium',
    hard:           'Hard',
    playerColor:    'Play as',
    black:          'Black (first)',
    white:          'White (second)',
    thinking:       'AI thinking…',
    yourTurn:       'Your turn',
    aiTurn:         "AI's turn",
    blackWins:      'Black wins!',
    whiteWins:      'White wins!',
    draw:           'Draw',
    history:        'Move History',
    moveN:          (n) => `Move ${n}`,
    langToggle:     'JA',
    themeToggle:    '🌙',
    themeDark:      '🌙',
    themeLight:     '☀️',
  },
};

export function t(lang, key, ...args) {
  const v = translations[lang]?.[key] ?? translations.en[key];
  if (typeof v === 'function') return v(...args);
  return v ?? key;
}
