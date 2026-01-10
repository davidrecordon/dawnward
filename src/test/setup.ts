/**
 * Vitest test setup
 *
 * This file runs before each test file.
 * Configure global mocks and test utilities here.
 */

import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: () => "test-uuid-" + Math.random().toString(36).substr(2, 9),
  },
});

// Clean up after each test
afterEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
