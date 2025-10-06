module.exports = {
  test: {
    environment: 'jsdom',
    globals: true
  }
};

import { describe, it, expect } from 'vitest';

describe('example test', () => {
  it('should return true when 1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });
});