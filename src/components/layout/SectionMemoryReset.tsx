'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Scopes the list-state memory (usePersistentState → sessionStorage) to its
 * own section (client 30.06): going Teklifler → a quote → back keeps the page
 * and filters, but switching to ANOTHER section (e.g. Siparişler) and coming
 * back starts Teklifler fresh on page 1.
 *
 * Convention: persistent keys are prefixed with their section's first path
 * segment ("quotes:page", "quotes:search", ...). When the pathname's first
 * segment changes, every key of the section being LEFT is dropped. Detail
 * pages live under the same segment, so list → detail → back never clears.
 */
export function SectionMemoryReset() {
  const pathname = usePathname();

  useEffect(() => {
    const section = pathname.split('/')[1] || '';
    try {
      const prev = window.sessionStorage.getItem('nav:section');
      if (prev && prev !== section) {
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const key = window.sessionStorage.key(i);
          if (key && key.startsWith(`${prev}:`)) {
            window.sessionStorage.removeItem(key);
          }
        }
      }
      window.sessionStorage.setItem('nav:section', section);
    } catch {
      /* disabled storage — nothing to reset */
    }
  }, [pathname]);

  return null;
}
