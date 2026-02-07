'use client';

import { useEffect } from 'react';

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        // Only allow Ctrl+S in inputs
        if (!(e.key === 's' && (e.ctrlKey || e.metaKey))) return;
      }
      const key = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.key.toUpperCase()}`;
      const action = shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
