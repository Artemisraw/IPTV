// Global Vitest setup file.
//
// Loaded once per test file by the `test.setupFiles` entry in
// `vitest.config.ts`. It registers Testing Library's jest-dom matchers
// (e.g. `toBeInTheDocument`, `toHaveAttribute`) on Vitest's `expect`
// and resets all `vi.fn()` / `vi.spyOn()` state between tests so a
// stub or call history from one test never leaks into the next.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.resetAllMocks()
})
