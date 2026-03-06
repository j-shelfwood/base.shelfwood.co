// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  env: {
    schema: {
      INFLUX_URL:    envField.string({ context: 'server', access: 'secret' }),
      INFLUX_TOKEN:  envField.string({ context: 'server', access: 'secret' }),
      INFLUX_ORG:    envField.string({ context: 'server', access: 'secret', optional: true, default: 'shelfwood' }),
      INFLUX_BUCKET: envField.string({ context: 'server', access: 'secret', optional: true, default: 'mc' }),
    },
  },
  image: {
    // No image optimisation needed — avoids sharp dependency
    service: { entrypoint: 'astro/assets/services/noop' },
  },
  integrations: [
    icon({
      include: {
        lucide: ['*'],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
