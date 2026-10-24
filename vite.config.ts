import { defineConfig } from 'vite'

// GitHub Pages serves the repo at /Jigzaw/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Jigzaw/' : '/',
}))
