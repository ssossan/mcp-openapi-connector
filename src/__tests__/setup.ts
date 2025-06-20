// Jest setup file
import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock console.error to reduce noise in tests
console.error = jest.fn();

// Restore console.error after each test if needed
afterEach(() => {
  jest.clearAllMocks();
});