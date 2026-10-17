import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { designSystem } from './build/designSystem.ts';

// https://vite.dev/config/
// which build is running: Netlify's commit, else "local"; and when it was built (spec 09 OP-3, OP-5)
const buildId = (process.env.COMMIT_REF ?? 'local').slice(0, 12);

export default defineConfig({
  plugins: [react(), designSystem()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
