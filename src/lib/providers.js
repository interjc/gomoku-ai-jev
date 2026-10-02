/** Server-only provider configuration and transport selection. */
import { askJev, readJevConfig } from './jev/ask.js';
import { askClef, clefModel, readClefConfig } from './workers-ai/ask.js';
import { PROVIDERS, resolveProvider } from './provider-choice.js';

function enabled(value) {
  return value === undefined || value === true || String(value).trim().toLowerCase() === 'true';
}

export function getProviderConfig(env = {}) {
  const providers = PROVIDERS.map(id => {
    const isEnabled = enabled(env[id === 'clef' ? 'AI_CLEF_ENABLED' : 'AI_JEV_ENABLED']);
    const configured = id === 'clef'
      ? typeof env.AI?.run === 'function'
      : Boolean(readJevConfig(env).apiKey);
    return {
      id,
      enabled: isEnabled,
      available: isEnabled && configured,
      reason: !isEnabled ? 'disabled' : !configured ? 'not-configured' : null,
      model: id === 'jev' ? readJevConfig(env).model : null,
    };
  });
  const config = { providers, defaultProvider: env.AI_DEFAULT_PROVIDER ?? 'jev' };
  config.defaultProvider = resolveProvider(config);
  return config;
}

export function createProvider(env, selected, difficulty) {
  const config = getProviderConfig(env);
  const id = selected ?? config.defaultProvider;
  if (id === null) return { id: null, model: null, ask: null, minConfidence: 0 };
  if (!PROVIDERS.includes(id)) throw new Error('Invalid provider');
  if (!config.providers.find(item => item.id === id)?.available) {
    throw new Error('Provider unavailable');
  }
  if (id === 'jev') {
    const jev = readJevConfig(env);
    return { id, model: jev.model, minConfidence: jev.minConfidence, ask: request => askJev(env, request) };
  }
  return {
    id, model: clefModel(difficulty).id, minConfidence: readClefConfig(env).minConfidence,
    ask: request => askClef(env, request, difficulty),
  };
}
