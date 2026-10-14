import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { designSystem } from './build/designSystem.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), designSystem()],
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
