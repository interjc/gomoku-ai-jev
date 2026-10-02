/** Opponent availability and defaults are deployment state, including redirects. */
export async function onRequest({ url }, next) {
  const response = await next();
  if (['/', '/clef', '/jev'].includes(url.pathname)) {
    response.headers.set('cache-control', 'no-store');
  }
  return response;
}
