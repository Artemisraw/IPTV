import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest configuration for the renderer + shared modules.
//
// This config extends the existing vite.config.ts so module resolution
// (path aliases, the electron plugin's renderer-mode opt-out, etc.) stays
// in sync with the dev/build pipeline. The electron plugin disables its
// renderer transform when NODE_ENV === 'test', which Vitest sets
// automatically.
//
// Component-style tests need a DOM, so we run under JSDOM and load
// jest-dom matchers + a global mock-reset hook from
// `src/tests/setup-tests.ts` before each test file.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup-tests.ts'],
      include: [
        '**/*.property.test.ts',
        '**/*.property.test.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  }),
)
