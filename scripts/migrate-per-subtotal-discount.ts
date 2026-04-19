/**
 * One-shot backfill: migrate Quote.discountPct + Quote.discountScopeSubtotalId
 * onto QuoteItem.sectionDiscountPct (per-section discount).
 *
 * Rules:
 *   Case 1: scope set  → copy pct onto that SUBTOTAL's sectionDiscountPct
 *   Case 2: scope null → copy pct onto EVERY SUBTOTAL in the quote
 *   Case 3: pct = 0    → skip
 *
 * Idempotent: if any SUBTOTAL in the quote already carries a
 * non-null sectionDiscountPct, the quote is considered already
 * migrated and skipped.
 *
 * Run AFTER `npx prisma migrate deploy`:
 *   npx tsx scripts/migrate-per-subtotal-discount.ts
 * Dry run (prints the plan but makes no DB writes):
 *   npx tsx scripts/migrate-per-subtotal-discount.ts --dry-run
 */
import { db } from '@/lib/db';
import { calculateQuoteTotals, type QuoteItem, type QuoteCurrencyContext } from '@/lib/quote-calculations';

interface Report {
  cases: { case1: number; case2: number; skipped: number; alreadyMigrated: number };
  migrated: Array<{
    quoteId: string;
    quoteNumber: string;
    case: 'case1' | 'case2';
    affectedSubtotalIds: string[];
    pct: number;
    oldGrandTotal: number;
    newGrandTotal: number;
    /** True when the old discountScopeSubtotalId pointed at a row that
     *  no longer exists — the migration fanned the discount across all
     *  surviving SUBTOTALs (Case 2 fallback) rather than failing hard. */
    danglingScope?: boolean;
  }>;
  mismatches: Array<{
    quoteId: string;
    quoteNumber: string;
    oldGrandTotal: number;
    newGrandTotal: number;
    diff: number;
  }>;
}

export async function migratePerSubtotalDiscount(
  options: { dryRun: boolean } = { dryRun: false }
): Promise<Report> {
  const report: Report = {
    cases: { case1: 0, case2: 0, skipped: 0, alreadyMigrated: 0 },
    migrated: [],
    mismatches: [],
  };

  const quotes = await db.quote.findMany({
    where: { discountPct: { gt: 0 } },
    select: {
      id: true,
      quoteNumber: true,
      discountPct: true,
      discountScopeSubtotalId: true,
      grandTotal: true,
      currency: true,
      exchangeRate: true,
      protectionPct: true,
    },
  });

  for (const quote of quotes) {
    const pct = Number(quote.discountPct);
    if (pct === 0) {
      report.cases.skipped++;
      continue;
    }

    const items = await db.quoteItem.findMany({
      where: { quoteId: quote.id },
      orderBy: { sortOrder: 'asc' },
    });

    // Idempotency check: any SUBTOTAL already carrying a pct → skip.
    const alreadyMigrated = items.some(
      (i) => i.itemType === 'SUBTOTAL' && i.sectionDiscountPct != null
    );
    if (alreadyMigrated) {
      report.cases.alreadyMigrated++;
      continue;
    }

    const subtotalItems = items.filter((i) => i.itemType === 'SUBTOTAL');
    if (subtotalItems.length === 0) {
      report.cases.skipped++;
      continue;
    }

    // Decide targets.
    let targets: string[];
    let caseLabel: 'case1' | 'case2';
    let danglingScope = false;
    if (
      quote.discountScopeSubtotalId &&
      subtotalItems.some((i) => i.id === quote.discountScopeSubtotalId)
    ) {
      targets = [quote.discountScopeSubtotalId];
      caseLabel = 'case1';
    } else {
      // Null scope (legacy) or dangling pointer → fan out onto every SUBTOTAL.
      if (quote.discountScopeSubtotalId) danglingScope = true;
      targets = subtotalItems.map((i) => i.id);
      caseLabel = 'case2';
    }

    const oldGrandTotal = Number(quote.grandTotal);

    // Simulate FIRST (before any write). If the recomputed grand total
    // drifts from the stored value by more than ±0.02, flag a mismatch
    // and SKIP the write — the migration would propagate bad data.
    const simulatedItems: QuoteItem[] = items
      .filter((i) => !i.parentItemId)
      .map((i) => ({
        id: i.id,
        itemType: i.itemType as QuoteItem['itemType'],
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountPct: Number(i.discountPct),
        vatRate: Number(i.vatRate),
        priceLabel: i.priceLabel ?? null,
        currency: i.currency ?? null,
        parentItemId: i.parentItemId ?? null,
        sectionDiscountPct: targets.includes(i.id)
          ? pct
          : i.sectionDiscountPct != null
          ? Number(i.sectionDiscountPct)
          : null,
      }));

    const hasMixed = simulatedItems.some(
      (i) => i.currency && i.currency !== quote.currency
    );
    const protPct = Number(quote.protectionPct);
    const protRate = Number(quote.exchangeRate);
    const baseRate = protPct > 0 ? protRate / (1 + protPct / 100) : protRate;
    const ctx: QuoteCurrencyContext | undefined = hasMixed
      ? { quoteCurrency: quote.currency, baseForeignRate: baseRate }
      : undefined;

    const newTotals = calculateQuoteTotals(simulatedItems, 0, ctx);

    const driftsBeyondTolerance =
      oldGrandTotal > 0 && Math.abs(oldGrandTotal - newTotals.grandTotal) > 0.02;
    if (driftsBeyondTolerance) {
      report.mismatches.push({
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        oldGrandTotal,
        newGrandTotal: newTotals.grandTotal,
        diff: Math.abs(oldGrandTotal - newTotals.grandTotal),
      });
      // Do NOT write — leave the quote on old fields so an operator can
      // investigate. The old Quote.discount* columns still drive the UI
      // on this quote until it's resolved or the next release drops them.
      continue;
    }

    if (!options.dryRun) {
      await db.$transaction(async (tx) => {
        for (const subId of targets) {
          await tx.quoteItem.update({
            where: { id: subId },
            data: { sectionDiscountPct: pct },
          });
        }
      });
    }

    report.cases[caseLabel]++;
    report.migrated.push({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      case: caseLabel,
      affectedSubtotalIds: targets,
      pct,
      oldGrandTotal,
      newGrandTotal: newTotals.grandTotal,
      danglingScope,
    });
  }

  return report;
}

// CLI entrypoint.
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  migratePerSubtotalDiscount({ dryRun })
    .then((report) => {
      console.log('\n=== Per-Subtotal Discount Migration ===');
      console.log('Dry run:', dryRun);
      console.log('Cases:', report.cases);
      console.log('Migrated:', report.migrated.length, 'quotes');
      console.log('Mismatches:', report.mismatches.length);
      const dangling = report.migrated.filter((m) => m.danglingScope);
      if (dangling.length > 0) {
        console.log(`\n--- DANGLING SCOPES (${dangling.length} quotes, fanned out as Case 2) ---`);
        for (const d of dangling) {
          console.log(`  ${d.quoteNumber}: pct=${d.pct} → ${d.affectedSubtotalIds.length} SUBTOTALs`);
        }
      }
      if (report.mismatches.length > 0) {
        console.log('\n--- MISMATCHES (NOT migrated — review manually) ---');
        for (const m of report.mismatches) {
          console.log(
            `  ${m.quoteNumber}: old=${m.oldGrandTotal} new=${m.newGrandTotal} diff=${m.diff.toFixed(4)}`
          );
        }
      }
      process.exit(report.mismatches.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(2);
    });
}
