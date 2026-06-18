/**
 * STF numbering: base numbers start at 6000 and increment (STF-6000, STF-6001, …).
 * Revision suffixes (STF-6001-R1) are NOT part of the base sequence.
 * Legacy SIP-* order numbers are ignored.
 */
const STF_BASE_START = 6000;

export function nextStfNumber(existingNumbers: string[]): string {
  let maxSeq = STF_BASE_START - 1;
  for (const n of existingNumbers) {
    const m = /^STF-(\d+)$/.exec(n.trim()); // base numbers only (no -R#)
    if (m) {
      const seq = parseInt(m[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return `STF-${maxSeq + 1}`;
}
