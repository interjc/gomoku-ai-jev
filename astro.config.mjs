// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Same adapter entry as elb-re. This game has no KV, D1, R2, or Images
// bindings: the minimax search runs in the browser.
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
});
