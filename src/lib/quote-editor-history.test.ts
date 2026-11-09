import { describe, it, expect } from 'vitest';
import { isTempId, remapTempIds, scrubIds, computeDeletedIds, reviveGhostRows } from './quote-editor-history';

const TEMP = '3f2b6c1e-8a4d-4c6e-9b1a-2d3e4f5a6b7c';
const TEMP_CHILD = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('quote-editor-history', () => {
  it('detects temp (UUID) vs server (cuid) ids', () => {
    expect(isTempId(TEMP)).toBe(true);
    expect(isTempId('clx9abc123def456')).toBe(false);
  });

  it('remaps temp ids and children parentItemId; returns the same array when untouched', () => {
    const rows = [
      { id: 'a1', parentItemId: null },
      { id: TEMP, parentItemId: null },
      { id: TEMP_CHILD, parentItemId: TEMP },
    ];
    const out = remapTempIds(rows, new Map([[TEMP, 'srv1'], [TEMP_CHILD, 'srv2']]));
    expect(out).toEqual([
      { id: 'a1', parentItemId: null },
      { id: 'srv1', parentItemId: null },
      { id: 'srv2', parentItemId: 'srv1' },
    ]);
    expect(out[0]).toBe(rows[0]); // untouched rows keep identity
    expect(remapTempIds(rows, new Map([['zzz', 'yyy']]))).toBe(rows);
  });

  it('scrubs ids together with their children', () => {
    const rows = [
      { id: 'set', parentItemId: null },
      { id: 'c1', parentItemId: 'set' },
      { id: 'keep', parentItemId: null },
    ];
    expect(scrubIds(rows, new Set(['set']))).toEqual([{ id: 'keep', parentItemId: null }]);
    expect(scrubIds(rows, new Set(['nope']))).toBe(rows);
  });

  it('computes deleted ids as known server ids missing from state', () => {
    const known = new Set(['a', 'b', 'c']);
    expect(computeDeletedIds(known, [{ id: 'a' }, { id: 'c' }, { id: TEMP }])).toEqual(['b']);
    expect(computeDeletedIds(known, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual([]);
  });
});

describe('remapTempIds — alias chains', () => {
  it('follows original → server → temp → server to the current row', () => {
    const map = new Map([['G', 's1'], ['s1', TEMP], [TEMP, 's2']]);
    expect(remapTempIds([{ id: 'G' }, { id: 'c', parentItemId: 'G' }], map)).toEqual([
      { id: 's2' },
      { id: 'c', parentItemId: 's2' },
    ]);
  });

  it('stops on a self-reference or a loop', () => {
    expect(remapTempIds([{ id: 'a' }], new Map([['a', 'a']]))).toEqual([{ id: 'a' }]);
    expect(remapTempIds([{ id: 'a' }], new Map([['a', 'b'], ['b', 'a']]))[0].id).toMatch(/^[ab]$/);
  });
});

describe('reviveGhostRows', () => {
  let n = 0;
  const newId = () => `0000000${++n}-aaaa-4bbb-8ccc-dddddddddddd`;

  it('gives rows a save already deleted a new temp id and re-points their children', () => {
    n = 0;
    const known = new Set(['keep']);
    const { rows, revived } = reviveGhostRows(
      [{ id: 'keep' }, { id: 'gone' }, { id: 'goneChild', parentItemId: 'gone' }, { id: 'keepChild2', parentItemId: 'keep' }],
      known,
      newId,
    );
    expect(rows[0]).toEqual({ id: 'keep' });
    expect(isTempId(rows[1].id)).toBe(true);
    expect(rows[2]).toEqual({ id: rows[2].id, parentItemId: rows[1].id });
    expect(isTempId(rows[2].id)).toBe(true);
    // A child row the save deleted under a parent that still exists.
    expect(isTempId(rows[3].id)).toBe(true);
    expect(rows[3].parentItemId).toBe('keep');
    expect(revived).toEqual(new Map([[rows[1].id, 'gone'], [rows[2].id, 'goneChild'], [rows[3].id, 'keepChild2']]));
  });

  it('with `revivable`, drops rows another session deleted (and their children) instead of reviving them', () => {
    n = 0;
    const { rows, revived } = reviveGhostRows(
      [{ id: 'keep' }, { id: 'mine' }, { id: 'theirs' }, { id: 'theirsChild', parentItemId: 'theirs' }],
      new Set(['keep']),
      newId,
      new Set(['mine']),
    );
    expect(rows.map((r) => revived.get(r.id) ?? r.id)).toEqual(['keep', 'mine']);
    expect(revived.size).toBe(1);
  });

  it('does not list a revivable child of a dropped parent as revived', () => {
    const { rows, revived } = reviveGhostRows(
      [{ id: 'theirs' }, { id: 'mineChild', parentItemId: 'theirs' }],
      new Set(),
      newId,
      new Set(['mineChild']),
    );
    expect(rows).toEqual([]);
    expect(revived.size).toBe(0);
  });

  it('leaves known and in-flight (temp) rows alone and returns the same array when nothing is gone', () => {
    const input = [{ id: 'a' }, { id: TEMP }];
    const { rows, revived } = reviveGhostRows(input, new Set(['a']), newId);
    expect(rows).toBe(input);
    expect(revived.size).toBe(0);
  });
});
