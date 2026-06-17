import { describe, it, expect } from 'vitest';
import { insertItemBefore } from './quote-item-order';

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
