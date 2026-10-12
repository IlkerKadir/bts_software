import { describe, it, expect, vi, afterEach } from 'vitest';
import { setUnsavedChanges, confirmLeaveIfUnsaved } from './unsaved-changes';

describe('unsaved-changes', () => {
  afterEach(() => {
    setUnsavedChanges(false);
    vi.unstubAllGlobals();
  });

  it('allows leaving without asking when nothing is unsaved', () => {
    const confirm = vi.fn();
    vi.stubGlobal('window', { confirm });
    expect(confirmLeaveIfUnsaved()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks when there are unsaved changes and follows the answer', () => {
    setUnsavedChanges(true);
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true) });
    expect(confirmLeaveIfUnsaved()).toBe(false);
    expect(confirmLeaveIfUnsaved()).toBe(true);
  });
});
