import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['youtube-dl-exec', 'ffmpeg-static', 'koffi']
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
