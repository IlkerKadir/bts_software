/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

describe('usePersistentState', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('uses the initial value when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentState('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('persists updates to sessionStorage', () => {
    const { result } = renderHook(() => usePersistentState('k', ''));
    act(() => result.current[1]('cansu'));
    expect(result.current[0]).toBe('cansu');
    expect(JSON.parse(window.sessionStorage.getItem('k')!)).toBe('cansu');
  });

  it('rehydrates the stored value on remount (browser-back scenario)', () => {
    const first = renderHook(() => usePersistentState('page', 1));
    act(() => first.result.current[1](15));
    first.unmount();

    // Simulate navigating back: a fresh hook instance with the same key.
    const second = renderHook(() => usePersistentState('page', 1));
    expect(second.result.current[0]).toBe(15);
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => usePersistentState('n', 1));
    act(() => result.current[1]((p) => p + 1));
    expect(result.current[0]).toBe(2);
  });

  it('keeps separate keys independent', () => {
    const a = renderHook(() => usePersistentState('a', 'x'));
    const b = renderHook(() => usePersistentState('b', 'y'));
    act(() => a.result.current[1]('changed'));
    expect(b.result.current[0]).toBe('y');
  });
});
