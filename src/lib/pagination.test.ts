import { describe, it, expect } from 'vitest';
import { paginationArgs, paginationMeta } from './pagination';

describe('paginationArgs', () => {
  it('returns skip/take for a positive limit', () => {
    expect(paginationArgs(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(paginationArgs(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it('returns no skip/take when limit is 0 (fetch all)', () => {
    expect(paginationArgs(1, 0)).toEqual({});
    expect(paginationArgs(5, 0)).toEqual({});
  });
});

describe('paginationMeta', () => {
  it('computes totalPages for a positive limit', () => {
    expect(paginationMeta(2, 20, 45)).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('reports a single page covering all rows when limit is 0', () => {
    expect(paginationMeta(1, 0, 173)).toEqual({
      page: 1,
      limit: 173,
      total: 173,
      totalPages: 1,
    });
  });

  it('handles zero rows without dividing by zero', () => {
    expect(paginationMeta(1, 0, 0)).toEqual({
      page: 1,
      limit: 0,
      total: 0,
      totalPages: 1,
    });
    expect(paginationMeta(1, 20, 0)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });
});
