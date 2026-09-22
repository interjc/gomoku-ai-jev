/**
 * i18n.js — Japanese / English / Chinese translations
 */

export const SUPPORTED_LANGS = ['en', 'ja', 'zh'];

export const languages = [
  { code: 'en', label: 'English', name: 'English' },
  { code: 'ja', label: '日本語', name: '日本語' },
  { code: 'zh', label: '简体中文', name: '简体中文' },
];

export const translations = {
  ja: {
    title:          'Gomoku AI JEV',
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
    langLabel:      '日本語',
    selectLang:     '言語を選択',
    themeToggle:    '🌙',
    themeDark:      '🌙',
    themeLight:     '☀️',
  },
  en: {
    title:          'Gomoku AI JEV',
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
    langLabel:      'English',
    selectLang:     'Select language',
    themeToggle:    '🌙',
    themeDark:      '🌙',
    themeLight:     '☀️',
  },
  zh: {
    title:          'Gomoku AI JEV',
    newGame:        '新游戏',
    undo:           '悔棋',
    difficulty:     '难度',
    easy:           '初级',
    medium:         '中级',
    hard:           '高级',
    playerColor:    '执子',
    black:          '黑棋（先手）',
    white:          '白棋（后手）',
    thinking:       'AI 思考中…',
    yourTurn:       '你的回合',
    aiTurn:         'AI 的回合',
    blackWins:      '黑棋获胜！',
    whiteWins:      '白棋获胜！',
    draw:           '平局',
    history:        '棋谱',
    moveN:          (n) => `第 ${n} 手`,
    langLabel:      '简体中文',
    selectLang:     '选择语言',
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
