import { describe, it, expect } from 'vitest';
import { insertItemBefore, nextSortOrder, renumberByDisplayOrder } from './quote-item-order';

const mk = (id: string, sortOrder: number) => ({ id, sortOrder });

describe('insertItemBefore', () => {
  const base = [mk('a', 1), mk('b', 2), mk('c', 3)];

  it('inserts before a middle row and renumbers sequentially', () => {
    const r = insertItemBefore(base, mk('new', 99), 'b');
    expect(r.map((i) => i.id)).toEqual(['a', 'new', 'b', 'c']);
    expect(r.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4]);
  });

  it('inserts before the first row', () => {
    const r = insertItemBefore(base, mk('new', 99), 'a');
    expect(r.map((i) => i.id)).toEqual(['new', 'a', 'b', 'c']);
    expect(r.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4]);
  });

  it('appends when beforeId is null', () => {
    const r = insertItemBefore(base, mk('new', 99), null);
    expect(r.map((i) => i.id)).toEqual(['a', 'b', 'c', 'new']);
    expect(r[3].sortOrder).toBe(4);
  });

  it('appends when beforeId is not found', () => {
    const r = insertItemBefore(base, mk('new', 99), 'missing');
    expect(r.map((i) => i.id)).toEqual(['a', 'b', 'c', 'new']);
  });

  it('does not mutate the input array', () => {
    const copy = [...base];
    insertItemBefore(base, mk('new', 99), 'b');
    expect(base).toEqual(copy);
  });
});

describe('nextSortOrder', () => {
  it('is one past the largest sortOrder, not the row count (gaps from deletes)', () => {
    // 3 rows left after deleting rows 2 and 4 of a 1..5 quote
    expect(nextSortOrder([mk('a', 1), mk('c', 3), mk('e', 5)])).toBe(6);
  });

  it('never collides when values are below the row count (legacy overlaps)', () => {
    expect(nextSortOrder([mk('a', 1), mk('b', 1), mk('c', 2)])).toBe(4);
  });

  it('starts at 1 for an empty quote', () => {
    expect(nextSortOrder([])).toBe(1);
  });
});

describe('renumberByDisplayOrder', () => {
  const row = (id: string, sortOrder: number, parentItemId?: string) => ({ id, sortOrder, parentItemId });

  it('numbers each top-level row followed by its children', () => {
    // A child loaded before its parent (low legacy number) is still placed under it.
    const r = renumberByDisplayOrder([row('c1', 2, 'S'), row('a', 1), row('S', 3), row('c2', 2, 'S'), row('b', 2)]);
    expect(r.map((i) => i.id)).toEqual(['a', 'S', 'c1', 'c2', 'b']);
    expect(r.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4, 5]);
  });

  it('removes ties so the stored order is exactly the shown order', () => {
    const r = renumberByDisplayOrder([row('x', 8), row('y', 8), row('z', 8)]);
    expect(r.map((i) => i.id)).toEqual(['x', 'y', 'z']);
    expect(r.map((i) => i.sortOrder)).toEqual([1, 2, 3]);
  });

  it('keeps rows whose parent is missing (placed last) instead of dropping them', () => {
    const r = renumberByDisplayOrder([row('o', 1, 'gone'), row('a', 2)]);
    expect(r.map((i) => i.id)).toEqual(['a', 'o']);
    expect(r).toHaveLength(2);
  });

  it('reuses unchanged row objects and does not mutate the input', () => {
    const a = row('a', 1);
    const input = [a, row('b', 5)];
    const r = renumberByDisplayOrder(input);
    expect(r[0]).toBe(a);
    expect(input[1].sortOrder).toBe(5);
  });
});
