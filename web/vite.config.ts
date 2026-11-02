import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { codeSnippets } from './plugins/code-snippets.ts';

export default defineConfig({
  base: '/tehran-house-price/',
  plugins: [react(), codeSnippets({ trainingDir: '../training', stagesDir: 'src/lab/stages' })],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'plugins/**/*.test.ts'],
  },
});
