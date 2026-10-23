import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement window.scrollTo; provide standard mock to eliminate test console noise
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}
