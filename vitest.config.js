import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vitest uses esbuild for its own transform pipeline, which doesn't
  // automatically inject the React JSX runtime. Tell esbuild explicitly.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Resolve from this config file so linked Git worktrees do not inherit the
    // parent checkout's working directory through Vite's config loader.
    setupFiles: [new URL('./tests/setup.js', import.meta.url).pathname],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      reporter: ['text', 'html'],
    },
  },
});
