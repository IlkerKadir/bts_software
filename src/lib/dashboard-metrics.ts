/**
 * Pure dashboard metric helpers (client 10.2026 — "Dashboard'daki veriler
 * doğru değil"). The old dashboard summed EUR/TRY/USD amounts as if all
 * were euros, bucketed by quote creation/update date instead of the
 * send/win/loss date, counted every revision of the same quote, and
 * treated rows without a cost as 100% margin. Everything here is pure so
 * it can be unit-tested; data loading lives in dashboard-data.ts.
 */

/** Türkiye is UTC+3 all year (no DST since 2016). */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** 'YYYY-MM' of the instant, in Istanbul time. */
export function istanbulMonthKey(d: Date): string {
  const t = new Date(d.getTime() + ISTANBUL_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `n` Istanbul months ending with the month of `now`, oldest first. */
export function lastMonths(now: Date, n: number): { key: string; label: string }[] {
  const t = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const out: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 15));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    });
  }
  return out;
}

export type RateMatrix = Record<string, Record<string, number>>;

/** currency→EUR rate on a date, from the ExchangeRate table (fallback). */
export type EurRateLookup = (currency: string, at: Date) => number | null;

/**
 * Convert an amount in `currency` to EUR. Prefers the quote's frozen
 * rate matrix (rateSnapshot[currency].EUR — the rates the quote was
 * priced with), then the historical rate table. Returns null when no
 * rate is known (the caller leaves the amount out rather than guess).
 */
export function toEur(
  amount: number,
  currency: string,
  rateSnapshot: unknown,
  at: Date,
  fallback: EurRateLookup,
): number | null {
  if (currency === 'EUR') return amount;
  const snap = rateSnapshot as RateMatrix | null | undefined;
  const r = snap && typeof snap === 'object' ? snap[currency]?.EUR : undefined;
  if (typeof r === 'number' && r > 0) return amount * r;
  const f = fallback(currency, at);
  return f != null && f > 0 ? amount * f : null;
}

/**
 * Builds an EurRateLookup (latest at/before the date, else the earliest
 * after). Accepts direct X→EUR rows and X→TRY rows; when a day has no
 * direct X→EUR rate it is derived as (X→TRY) / (EUR→TRY) of that day.
 */
export function makeEurRateLookup(
  input: { fromCurrency: string; toCurrency?: string; rate: number; fetchedAt: Date }[],
): EurRateLookup {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const direct = input.filter((r) => (r.toCurrency ?? 'EUR') === 'EUR');
  const directKeys = new Set(direct.map((r) => `${r.fromCurrency}|${day(r.fetchedAt)}`));
  const tryRows = input.filter((r) => r.toCurrency === 'TRY');
  const eurTryByDay = new Map<string, { rate: number; at: Date }>();
  for (const r of tryRows) if (r.fromCurrency === 'EUR' && r.rate > 0) eurTryByDay.set(day(r.fetchedAt), { rate: r.rate, at: r.fetchedAt });
  const derived: { fromCurrency: string; rate: number; fetchedAt: Date }[] = [];
  for (const [d, eurTry] of eurTryByDay) {
    if (!directKeys.has(`TRY|${d}`)) derived.push({ fromCurrency: 'TRY', rate: 1 / eurTry.rate, fetchedAt: eurTry.at });
  }
  for (const r of tryRows) {
    if (r.fromCurrency === 'EUR' || r.fromCurrency === 'TRY') continue;
    const eurTry = eurTryByDay.get(day(r.fetchedAt));
    if (eurTry && !directKeys.has(`${r.fromCurrency}|${day(r.fetchedAt)}`)) {
      derived.push({ fromCurrency: r.fromCurrency, rate: r.rate / eurTry.rate, fetchedAt: r.fetchedAt });
    }
  }
  const rows = [...direct, ...derived];
  const byCur = new Map<string, { rate: number; t: number }[]>();
  for (const r of rows) {
    const list = byCur.get(r.fromCurrency) ?? [];
    list.push({ rate: r.rate, t: r.fetchedAt.getTime() });
    byCur.set(r.fromCurrency, list);
  }
  for (const list of byCur.values()) list.sort((a, b) => a.t - b.t);
  return (currency, at) => {
    const list = byCur.get(currency);
    if (!list || list.length === 0) return null;
    const t = at.getTime();
    let best: { rate: number; t: number } | null = null;
    for (const p of list) {
      if (p.t <= t) best = p;
      else break;
    }
    return (best ?? list[0]).rate;
  };
}

export interface DashQuote {
  id: string;
  companyId: string;
  quoteNumber: string;
  parentQuoteId: string | null;
  status: string;
  currency: string;
  grandTotal: number;
  rateSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
  /** STATUS_CHANGE history: target status + when. */
  events: { to: string; at: Date }[];
}

/**
 * Revision family = same company + same root quote number. Every revision
 * scheme numbers off the root: "Revizyon Oluştur" → `${root}.${n}`, legacy
 * parent-linked revisions → `${root}.${n}` too, revert → `${root}-R${v}`.
 * Keying on the stripped number (not parentQuoteId) keeps the root and
 * its parent-linked children in ONE family.
 */
export function familyKey(q: Pick<DashQuote, 'companyId' | 'quoteNumber'>): string {
  return `${q.companyId}|${q.quoteNumber.replace(/(?:\.\d+|-R\d+)+$/, '')}`;
}

function lastEventAt(q: DashQuote, to: string): Date | null {
  let last: Date | null = null;
  for (const e of q.events) if (e.to === to && (!last || e.at > last)) last = e.at;
  return last;
}

/** When the quote was won: last status change to KAZANILDI (legacy rows without history: updatedAt). */
export function wonAt(q: DashQuote): Date {
  return lastEventAt(q, 'KAZANILDI') ?? q.updatedAt;
}

function groupFamilies(quotes: DashQuote[]): Map<string, DashQuote[]> {
  const fam = new Map<string, DashQuote[]>();
  for (const q of quotes) {
    const k = familyKey(q);
    const list = fam.get(k) ?? [];
    list.push(q);
    fam.set(k, list);
  }
  return fam;
}

export interface FamilyDecision {
  kind: 'won' | 'lost';
  quote: DashQuote;
  at: Date;
}

/**
 * One decision per revision family:
 *  - won: any member is KAZANILDI → the most recently won member;
 *  - lost: no member won AND the newest member is KAYBEDILDI.
 * Families still open (newest member not decided) have no decision.
 */
export function familyDecisions(quotes: DashQuote[]): FamilyDecision[] {
  const out: FamilyDecision[] = [];
  for (const members of groupFamilies(quotes).values()) {
    const won = members.filter((m) => m.status === 'KAZANILDI');
    if (won.length > 0) {
      const best = won.reduce((a, b) => (wonAt(b) > wonAt(a) ? b : a));
      out.push({ kind: 'won', quote: best, at: wonAt(best) });
      continue;
    }
    const newest = members.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    if (newest.status === 'KAYBEDILDI') {
      out.push({ kind: 'lost', quote: newest, at: lastEventAt(newest, 'KAYBEDILDI') ?? newest.updatedAt });
    }
  }
  return out;
}

/** Won amount (EUR) per month, bucketed by the WIN date. */
export function monthlyWonEur(
  decisions: FamilyDecision[],
  months: { key: string }[],
  convert: (q: DashQuote, at: Date) => number | null,
): number[] {
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const sums = months.map(() => 0);
  for (const d of decisions) {
    if (d.kind !== 'won') continue;
    const i = idx.get(istanbulMonthKey(d.at));
    if (i == null) continue;
    const eur = convert(d.quote, d.at);
    if (eur != null) sums[i] += eur;
  }
  return sums.map((v) => Math.round(v * 100) / 100);
}

/** Win rate per month = won / (won + lost) families decided that month; null when none decided. */
export function monthlyWinRate(decisions: FamilyDecision[], months: { key: string }[]): (number | null)[] {
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const won = months.map(() => 0);
  const lost = months.map(() => 0);
  for (const d of decisions) {
    const i = idx.get(istanbulMonthKey(d.at));
    if (i == null) continue;
    if (d.kind === 'won') won[i]++;
    else lost[i]++;
  }
  return months.map((_, i) => (won[i] + lost[i] > 0 ? Math.round((won[i] / (won[i] + lost[i])) * 1000) / 10 : null));
}

/** Last GONDERILDI change of the quote that falls in one of `monthKeys`, or null. */
function sentInMonths(q: DashQuote, monthKeys: ReadonlySet<string>): Date | null {
  let last: Date | null = null;
  for (const e of q.events) {
    if (e.to === 'GONDERILDI' && monthKeys.has(istanbulMonthKey(e.at)) && (!last || e.at > last)) last = e.at;
  }
  // Legacy rows without any GONDERILDI history but currently GONDERILDI.
  if (!last && q.status === 'GONDERILDI' && !q.events.some((e) => e.to === 'GONDERILDI')) {
    if (monthKeys.has(istanbulMonthKey(q.updatedAt))) last = q.updatedAt;
  }
  return last;
}

/**
 * Quotes sent in the given months, one per revision family (the latest
 * sent version) — a quote revised and re-sent counts once, at its final
 * value. Independent of the CURRENT status (a sent quote already won still
 * counts).
 */
export function sentInPeriod(quotes: DashQuote[], monthKeys: ReadonlySet<string>): { quote: DashQuote; at: Date }[] {
  const out: { quote: DashQuote; at: Date }[] = [];
  for (const members of groupFamilies(quotes).values()) {
    let best: { quote: DashQuote; at: Date } | null = null;
    for (const m of members) {
      const at = sentInMonths(m, monthKeys);
      if (at && (!best || at > best.at)) best = { quote: m, at };
    }
    if (best) out.push(best);
  }
  return out;
}

/** Single-month convenience wrapper. */
export function sentThisMonth(quotes: DashQuote[], monthKey: string): { quote: DashQuote; at: Date }[] {
  return sentInPeriod(quotes, new Set([monthKey]));
}

/** Families WON in the given months (one per family, at the win date). */
export function wonInPeriod(decisions: FamilyDecision[], monthKeys: ReadonlySet<string>): FamilyDecision[] {
  return decisions.filter((d) => d.kind === 'won' && monthKeys.has(istanbulMonthKey(d.at)));
}

export type SummaryPeriod = 'month' | '3m' | '6m' | '12m';
export const SUMMARY_PERIOD_MONTHS: Record<SummaryPeriod, number> = { month: 1, '3m': 3, '6m': 6, '12m': 12 };
export function isSummaryPeriod(v: unknown): v is SummaryPeriod {
  // own keys only — `in` would accept "toString", "constructor", …
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SUMMARY_PERIOD_MONTHS, v);
}
