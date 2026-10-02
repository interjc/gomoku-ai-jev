/** Provider identifiers and selection among the deployment's available opponents. */
export const PROVIDERS = ['clef', 'jev'];

export function resolveProvider(config) {
  const available = PROVIDERS.filter(id => config?.providers?.some(
    item => item.id === id && item.available === true,
  ));
  return [config?.defaultProvider, ...available]
    .find(id => available.includes(id)) ?? null;
}
