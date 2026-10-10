import { describe, it, expect } from 'vitest';
import { isTempId, remapTempIds, scrubIds, computeDeletedIds } from './quote-editor-history';

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
