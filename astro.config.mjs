// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The Worker searches positions and calls Clef or Jev through the remote AI binding.
// The browser searches offline or without providers.
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
});
