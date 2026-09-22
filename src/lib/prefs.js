/**
 * prefs.js — UI choices: difficulty, language, stone color, theme.
 *
 * Applied in this order:
 *   1. The value carried in the URL, or the value the user just chose
 *   2. localStorage
 *   3. The built-in default
 *
 * A URL value applies only for this visit. It is written to localStorage
 * when the user changes that control. If the URL already carries the
 * control, the query is updated too, so a reload does not restore the
 * previous URL value over the new choice.
 *
 * Query names: lang, difficulty, color, theme.
 * Storage keys stay stable; gomoku_lang was the original language key.
 */

export const CHOICES = {
  lang: {
    param: 'lang',
    storageKey: 'gomoku_lang',
    allowed: ['en', 'ja', 'zh'],
    fallback: 'en',
  },
  difficulty: {
    param: 'difficulty',
    storageKey: 'gomoku_difficulty',
    allowed: ['easy', 'medium', 'hard', 'master'],
    fallback: 'hard',
  },
  color: {
    param: 'color',
    storageKey: 'gomoku_color',
    allowed: ['black', 'white'],
    fallback: 'black',
  },
  theme: {
    param: 'theme',
    storageKey: 'gomoku_theme',
    allowed: ['light', 'dark'],
    fallback: 'light',
  },
};

export function canonicalChoice(key, value) {
  const choice = CHOICES[key];
  if (!choice || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return choice.allowed.includes(normalized) ? normalized : null;
}

function asParams(search) {
  if (!search) return new URLSearchParams();
  if (typeof search === 'string') {
    const query = search.startsWith('?') ? search.slice(1) : search;
    return new URLSearchParams(query);
  }
  return search;
}

/** First valid query value for this choice, or null when the URL does not carry one. */
export function explicitFromSearch(search, key) {
  const choice = CHOICES[key];
  if (!choice) return null;
  for (const [param, value] of asParams(search).entries()) {
    if (param.toLowerCase() !== choice.param) continue;
    const canonical = canonicalChoice(key, value);
    if (canonical) return canonical;
  }
  return null;
}

export function readChoice(storage, key) {
  const choice = CHOICES[key];
  if (!choice || !storage) return null;
  try {
    return storage.getItem(choice.storageKey);
  } catch {
    return null;
  }
}

export function writeChoice(storage, key, value) {
  const canonical = canonicalChoice(key, value);
  if (!canonical || !storage) return false;
  try {
    storage.setItem(CHOICES[key].storageKey, canonical);
    return true;
  } catch {
    return false;
  }
}

/** explicit (URL or a manual choice) wins, then storage, then the default. */
export function resolveChoice(key, explicit, stored) {
  return canonicalChoice(key, explicit)
    ?? canonicalChoice(key, stored)
    ?? CHOICES[key].fallback;
}

export function loadPrefs(search, storage) {
  const prefs = {};
  for (const key of Object.keys(CHOICES)) {
    prefs[key] = resolveChoice(key, explicitFromSearch(search, key), readChoice(storage, key));
  }
  return prefs;
}

/**
 * Replace a query param the URL already carries.
 * Returns null when that param is absent, so a clean URL stays clean.
 */
export function urlWithChoice(href, key, value) {
  const canonical = canonicalChoice(key, value);
  const choice = CHOICES[key];
  if (!canonical || !choice) return null;
  const url = new URL(href);
  const keys = [...url.searchParams.keys()];
  let found = false;
  for (const existing of keys) {
    if (existing.toLowerCase() === choice.param) {
      url.searchParams.delete(existing);
      found = true;
    }
  }
  if (!found) return null;
  url.searchParams.set(choice.param, canonical);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Record a manual change. `href` is null when the URL did not already
 * carry this choice.
 */
export function commitManualChoice(href, storage, key, value) {
  const canonical = canonicalChoice(key, value);
  if (!canonical) return { ok: false, value: null, href: null };
  writeChoice(storage, key, canonical);
  return { ok: true, value: canonical, href: urlWithChoice(href, key, canonical) };
}
