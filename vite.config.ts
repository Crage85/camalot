import { defineConfig } from 'vite';

const GAMES = ['wyrm', 'hole', 'tractor', 'match3', 'runner', 'trail'];

// Multi-page build: the hub (index.html) plus one page per game. Relative base so the site works from any
// folder (GitHub Pages project path or a local preview).
export default defineConfig({
  base: './',
  server: { watch: { ignored: ['**/.claude/**', '**/shots/**'] } },
  build: {
    // Family laptops and tablets may run older browsers: emit ES2020 syntax (needs WebGL2).
    target: 'es2020',
    rolldownOptions: {
      input: {
        main: 'index.html',
        ...Object.fromEntries(GAMES.map((g) => [g, `games/${g}/index.html`])),
      },
    },
  },
});
