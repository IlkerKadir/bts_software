# Quote Editor Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add subtotal rows, unified table, section templates, montaj cost distribution, PDF preview, and unit selection to the quote editor.

**Architecture:** Extend the flat QuoteItem model with a SUBTOTAL item type and parentItemId for sub-rows. Merge SERVICE items into the main table. Add section templates as convenience shortcuts that create pre-populated items.

**Tech Stack:** Next.js 16, React 19, Prisma (PostgreSQL), TypeScript, TailwindCSS, Puppeteer (PDF), Zod validation

**Design doc:** `docs/plans/2026-02-17-quote-editor-improvements-design.md`

---

## Task 1: Schema Migration — Add SUBTOTAL enum and parentItemId

**Files:**
- Modify: `prisma/schema.prisma:237-273`
- Create: Prisma migration via `npx prisma migrate dev`

**Step 1: Update QuoteItemType enum**

In `prisma/schema.prisma`, at line 237, change:

```prisma
enum QuoteItemType {
  PRODUCT
  HEADER
  NOTE
  CUSTOM
  SERVICE
  SUBTOTAL
}
```

**Step 2: Add parentItemId to QuoteItem model**

In `prisma/schema.prisma`, inside the QuoteItem model (after `serviceMeta Json?` at line 268), add:

```prisma
  parentItemId  String?
  parentItem    QuoteItem?  @relation("ItemSubRows", fields: [parentItemId], references: [id], onDelete: Cascade)
  subRows       QuoteItem[] @relation("ItemSubRows")
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name add-subtotal-and-parent-item
```

Expected: Migration created and applied successfully.

**Step 4: Verify Prisma client**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: add SUBTOTAL item type and parentItemId to QuoteItem schema"
```

---

## Task 2: Update Validation Schemas

**Files:**
- Modify: `src/lib/validations/quote.ts:17,38-60`

**Step 1: Add SUBTOTAL to quoteItemTypeEnum**

At line 17, change to:

```typescript
export const quoteItemTypeEnum = z.enum(['PRODUCT', 'HEADER', 'NOTE', 'CUSTOM', 'SERVICE', 'SUBTOTAL']);
```

**Step 2: Add parentItemId to quoteItemUpdateSchema**

At lines 54-60, change to:

```typescript
export const quoteItemUpdateSchema = quoteItemSchema.extend({
  id: z.string().min(1, 'Item ID is required'),
  sortOrder: z.number().int().optional(),
  isManualPrice: z.boolean().optional(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
  parentItemId: z.string().nullish(),
});
```

**Step 3: Add parentItemId to quoteItemSchema**

At lines 38-52, add `parentItemId` field:

```typescript
export const quoteItemSchema = z.object({
  itemType: quoteItemTypeEnum,
  productId: z.string().nullish(),
  parentItemId: z.string().nullish(),
  code: z.string().nullish(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(0, 'Quantity must be non-negative').default(1),
  unit: z.string().default('Adet'),
  listPrice: z.number().min(0, 'List price must be non-negative').default(0),
  katsayi: z.number().positive('Katsayi must be positive').default(1),
  discountPct: z.number().min(0).max(100, 'Discount cannot exceed 100%').default(0),
  vatRate: z.number().min(0).max(100).default(20),
  notes: z.string().nullish(),
});
```

**Step 4: Commit**

```bash
git add src/lib/validations/quote.ts
git commit -m "feat: add SUBTOTAL to item type enum and parentItemId to validation schemas"
```

---

## Task 3: Update Items API — Support SUBTOTAL and parentItemId

**Files:**
- Modify: `src/app/api/quotes/[id]/items/route.ts`

**Step 1: Update POST handler to support SUBTOTAL and parentItemId**

In the POST handler (line 100), add `parentItemId` to the create data. Also handle SUBTOTAL items that need no price calculation.

Replace lines 88-129 with:

```typescript
    // Calculate prices using tested calculation module
    const { listPrice, katsayi, quantity, discountPct, vatRate } = data;
    const isManualPrice = body.isManualPrice === true;
    const isSubtotal = data.itemType === 'SUBTOTAL';
    const isNonPriced = data.itemType === 'HEADER' || data.itemType === 'NOTE' || isSubtotal;

    // For SUBTOTAL/HEADER/NOTE: no price calculation needed
    // For manual price items (CUSTOM): use provided unitPrice; otherwise calculate
    const unitPrice = isNonPriced ? 0
      : isManualPrice && body.unitPrice != null
        ? Number(body.unitPrice)
        : calculateUnitPrice(listPrice, katsayi);
    const totalPrice = isNonPriced ? 0
      : isManualPrice && body.totalPrice != null
        ? Number(body.totalPrice)
        : calculateItemTotal({ quantity, unitPrice, discountPct });

    const item = await db.quoteItem.create({
      data: {
        quoteId,
        productId: data.productId || null,
        parentItemId: data.parentItemId || null,
        itemType: data.itemType,
        sortOrder: body.sortOrder ?? nextSortOrder,
        code: data.code || null,
        brand: data.brand || null,
        model: data.model || null,
        description: data.description,
        quantity,
        unit: data.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct,
        vatRate,
        totalPrice,
        isManualPrice,
        notes: data.notes || null,
      },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
        subRows: true,
      },
    });
```

**Step 2: Update PUT handler to persist parentItemId**

In the PUT handler transaction (line 185-204), add `parentItemId` to the update data:

```typescript
        await tx.quoteItem.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            code: item.code || null,
            brand: item.brand || null,
            model: item.model || null,
            description: item.description,
            quantity,
            unit: item.unit,
            listPrice,
            katsayi,
            unitPrice,
            discountPct,
            vatRate,
            totalPrice,
            isManualPrice,
            notes: item.notes || null,
            parentItemId: item.parentItemId || null,
          },
        });
```

**Step 3: Update GET handler to include subRows**

In the GET handler (lines 31-42), add subRows to the include:

```typescript
    const items = await db.quoteItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
        subRows: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
```

**Step 4: Commit**

```bash
git add src/app/api/quotes/[id]/items/route.ts
git commit -m "feat: support SUBTOTAL items and parentItemId in items API"
```

---

## Task 4: Update QuoteItemData Type and mapApiItemToLocal

**Files:**
- Modify: `src/components/quotes/QuoteItemRow.tsx:18-39`
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx:64-87`

**Step 1: Add parentItemId and subRows to QuoteItemData interface**

In `QuoteItemRow.tsx`, update the interface at lines 18-39:

```typescript
export interface QuoteItemData {
  id: string;
  productId?: string | null;
  parentItemId?: string | null;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE' | 'SUBTOTAL';
  sortOrder: number;
  code?: string | null;
  brand?: string | null;
  model?: string | null;
  description: string;
  quantity: number;
  unit: string;
  listPrice: number;
  katsayi: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  totalPrice: number;
  notes?: string | null;
  isManualPrice?: boolean;
  costPrice?: number | null;
  serviceMeta?: any;
  subRows?: QuoteItemData[];
}
```

**Step 2: Update mapApiItemToLocal in QuoteEditor.tsx**

In `QuoteEditor.tsx`, update the helper at lines 64-87:

```typescript
function mapApiItemToLocal(item: any): QuoteItemData {
  return {
    id: item.id,
    productId: item.productId ?? null,
    parentItemId: item.parentItemId ?? null,
    itemType: item.itemType,
    sortOrder: Number(item.sortOrder),
    code: item.code ?? null,
    brand: item.brand ?? null,
    model: item.model ?? item.product?.model ?? null,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    listPrice: Number(item.listPrice),
    katsayi: Number(item.katsayi),
    unitPrice: Number(item.unitPrice),
    discountPct: Number(item.discountPct),
    vatRate: Number(item.vatRate),
    totalPrice: Number(item.totalPrice),
    notes: item.notes ?? null,
    isManualPrice: item.isManualPrice ?? false,
    costPrice: item.costPrice != null ? Number(item.costPrice) : null,
    serviceMeta: item.serviceMeta ?? undefined,
    subRows: item.subRows?.map(mapApiItemToLocal) ?? undefined,
  };
}
```

**Step 3: Commit**

```bash
git add src/components/quotes/QuoteItemRow.tsx src/app/\(dashboard\)/quotes/\[id\]/edit/QuoteEditor.tsx
git commit -m "feat: add parentItemId and SUBTOTAL to QuoteItemData type"
```

---

## Task 5: Unify Table — Remove Service Item Separation

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx:248-257,986-1043`
- Modify: `src/components/quotes/QuoteItemsTable.tsx` (props)

**Step 1: Remove service/non-service split in QuoteEditor**

In `QuoteEditor.tsx`, remove lines 248-257 (the `serviceItems` and `nonServiceItems` split). Pass ALL items to QuoteItemsTable.

Replace:
```typescript
  const serviceItems = items
    .filter((item) => item.itemType === 'SERVICE')
    .map((item) => ({
      id: item.id,
      description: item.description,
      totalPrice: item.totalPrice,
      serviceMeta: item.serviceMeta,
    }));

  const nonServiceItems = items.filter((item) => item.itemType !== 'SERVICE');
```

With:
```typescript
  // All items go into the unified table (no service split)
  const topLevelItems = items.filter((item) => !item.parentItemId);
```

**Step 2: Update QuoteItemsTable props in QuoteEditor render**

Change the `items={nonServiceItems}` prop at line 987 to `items={topLevelItems}`. Add new props for service and subtotal handlers:

```typescript
      <QuoteItemsTable
        items={topLevelItems}
        allItems={items}
        currency={headerFields.currency}
        discountPct={headerFields.discountPct}
        canViewCosts={user.role.canViewCosts}
        canOverrideKatsayi={user.role.canOverrideKatsayi}
        priceHistoryBatch={priceHistoryBatch}
        onItemUpdate={handleItemUpdate}
        onItemDelete={handleItemDelete}
        onItemDuplicate={handleItemDuplicate}
        onReorder={handleReorder}
        onDiscountPctChange={handleDiscountPctChange}
        onAddProduct={() => setCatalogOpen(true)}
        onAddHeader={handleAddHeader}
        onAddNote={handleAddNote}
        onAddCustomItem={handleAddCustomItem}
        onAddSubtotal={handleAddSubtotal}
        onAddService={() => setServiceCalculatorOpen(true)}
        onShowPriceHistory={handleShowPriceHistory}
      />
```

**Step 3: Remove ServiceCostSection from QuoteEditor render**

Remove lines 1037-1043 (the `<ServiceCostSection ... />` block). The service cost calculator will now be opened from within QuoteItemsTable via a modal.

**Step 4: Add handleAddSubtotal handler in QuoteEditor**

Add after the `handleAddCustomItem` handler (after line 777):

```typescript
  const handleAddSubtotal = useCallback(async () => {
    const tempId = crypto.randomUUID();
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'SUBTOTAL',
      sortOrder: items.length + 1,
      description: 'Ara Toplam',
      quantity: 0,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 0,
      totalPrice: 0,
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'SUBTOTAL',
          description: 'Ara Toplam',
          quantity: 0,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          discountPct: 0,
          vatRate: 0,
          sortOrder: newItem.sortOrder,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? mapApiItemToLocal(data.item) : item
          )
        );
      }
    } catch (err) {
      console.error('Add subtotal error:', err);
    }
  }, [quoteId, items.length]);
```

**Step 5: Add service calculator modal state**

Add state and handler for service calculator modal in QuoteEditor:

```typescript
  const [serviceCalculatorOpen, setServiceCalculatorOpen] = useState(false);
```

And at the end of the render, add the ServiceCostCalculator as a modal (replacing the old ServiceCostSection):

```typescript
      {/* Service cost calculator modal */}
      {serviceCalculatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setServiceCalculatorOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <ServiceCostCalculator
              quoteId={quoteId}
              currency={headerFields.currency}
              onServiceAdded={(item) => {
                handleServiceAdded(item);
                setServiceCalculatorOpen(false);
              }}
            />
          </div>
        </div>
      )}
```

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/quotes/\[id\]/edit/QuoteEditor.tsx src/components/quotes/QuoteItemsTable.tsx
git commit -m "feat: unify all item types into single table, remove ServiceCostSection"
```

---

## Task 6: SUBTOTAL Row Rendering and Computation

**Files:**
- Modify: `src/components/quotes/QuoteItemRow.tsx`
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

**Step 1: Add SUBTOTAL rendering in QuoteItemRow**

In `QuoteItemRow.tsx`, add a new rendering block before the PRODUCT/CUSTOM/SERVICE section (after the NOTE block, around line 395). The SUBTOTAL row receives a computed `subtotalValue` prop:

Add to `QuoteItemRowProps` interface:
```typescript
  subtotalValue?: number;
```

Add rendering block:
```typescript
  // ---- SUBTOTAL row ----
  if (item.itemType === 'SUBTOTAL') {
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-40')}
        >
          <td className="w-8 border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={spanColCount - 1}
            className="border border-accent-200 bg-accent-100 px-3 py-2 text-right font-bold text-accent-800 text-sm"
          >
            Ara Toplam
          </td>
          {columnVisibility.fiyat && (
            <td className="border border-accent-200 bg-accent-100 px-2 py-2 text-right tabular-nums font-bold text-accent-900 whitespace-nowrap">
              {formatPrice(subtotalValue ?? 0, currency)}
            </td>
          )}
          <td className="w-10 border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
              title="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        </tr>
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            menuRef={menuRef}
            onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
            onDelete={() => { onDelete(); setContextMenu(null); }}
          />
        )}
      </>
    );
  }
```

**Step 2: Compute section subtotals in QuoteItemsTable**

In `QuoteItemsTable.tsx`, add a `useMemo` that computes subtotal values for each SUBTOTAL row. Add this after the `pozMap` useMemo (around line 235):

```typescript
  // Compute section subtotal values for each SUBTOTAL row
  const subtotalMap = useMemo(() => {
    const map = new Map<string, number>();
    let sectionSum = 0;

    for (const item of items) {
      if (item.itemType === 'SUBTOTAL') {
        map.set(item.id, sectionSum);
        sectionSum = 0; // reset for next section
      } else if (
        item.itemType === 'PRODUCT' ||
        item.itemType === 'CUSTOM' ||
        (item.itemType === 'SERVICE' && !item.parentItemId)
      ) {
        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        sectionSum += qty * up * (1 - disc / 100);
      }
    }
    return map;
  }, [items]);
```

**Step 3: Pass subtotalValue to QuoteItemRow**

In the `filteredItems.map()` call (around line 643), pass the computed value:

```typescript
                <QuoteItemRow
                  key={item.id}
                  item={item}
                  pozNo={pozMap.get(item.id) ?? null}
                  currency={currency}
                  canViewCosts={canViewCosts}
                  isDragging={!hasActiveFilter && dragIndex === origIdx}
                  columnVisibility={columnVisibility}
                  priceHistory={item.productId ? priceHistoryBatch?.[item.productId] : undefined}
                  totalColCount={totalColCount}
                  subtotalValue={item.itemType === 'SUBTOTAL' ? subtotalMap.get(item.id) : undefined}
                  onUpdate={(updates) => onItemUpdate(item.id, updates)}
                  onDelete={() => onItemDelete(item.id)}
                  onDuplicate={() => onItemDuplicate(item.id)}
                  onDragStart={hasActiveFilter ? noopDrag : handleDragStart(origIdx)}
                  onDragOver={hasActiveFilter ? noopDrag : handleDragOver(origIdx)}
                  onDrop={hasActiveFilter ? noopDrag : handleDrop(origIdx)}
                  canOverrideKatsayi={canOverrideKatsayi}
                  onShowPriceHistory={
                    item.productId && onShowPriceHistory
                      ? () => onShowPriceHistory(item.productId!)
                      : undefined
                  }
                  onInsertHeaderAbove={onAddHeader}
                />
```

**Step 4: Update footer — Genel Toplam uses subtotals when present**

In the `summary` useMemo (lines 260-304), update the logic to be aware of subtotals:

```typescript
  const summary = useMemo(() => {
    let araTotal = 0;
    let totalCost = 0;
    let totalVat = 0;

    const hasSubtotals = items.some((item) => item.itemType === 'SUBTOTAL');

    if (hasSubtotals) {
      // Sum all section subtotals
      for (const [, value] of subtotalMap) {
        araTotal += value;
      }
      // Add any trailing items after the last SUBTOTAL
      let lastSubtotalIdx = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].itemType === 'SUBTOTAL') {
          lastSubtotalIdx = i;
          break;
        }
      }
      if (lastSubtotalIdx < items.length - 1) {
        for (let i = lastSubtotalIdx + 1; i < items.length; i++) {
          const item = items[i];
          if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') continue;
          if (item.parentItemId) continue;
          const qty = Number(item.quantity) || 0;
          const up = Number(item.unitPrice) || 0;
          const disc = Number(item.discountPct) || 0;
          araTotal += qty * up * (1 - disc / 100);
        }
      }
    } else {
      for (const item of items) {
        if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') continue;
        if (item.parentItemId) continue;
        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        araTotal += qty * up * (1 - disc / 100);
      }
    }

    // Cost totals (always full items)
    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') continue;
      if (item.parentItemId) continue;
      if (item.costPrice != null) {
        totalCost += Number(item.costPrice) * (Number(item.quantity) || 0);
      }
    }

    const discountAmount = araTotal * (discountPct / 100);
    const afterDiscount = araTotal - discountAmount;

    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') continue;
      if (item.parentItemId) continue;
      const qty = Number(item.quantity) || 0;
      const up = Number(item.unitPrice) || 0;
      const disc = Number(item.discountPct) || 0;
      const itemBeforeVat = qty * up * (1 - disc / 100);
      const itemAfterOverallDiscount = itemBeforeVat * (1 - discountPct / 100);
      totalVat += itemAfterOverallDiscount * (Number(item.vatRate) / 100);
    }

    const grandTotal = afterDiscount + totalVat;
    const totalProfit = afterDiscount - totalCost;
    const profitMargin = afterDiscount > 0 ? (totalProfit / afterDiscount) * 100 : 0;

    return { araTotal, discountAmount, afterDiscount, totalVat, grandTotal, totalCost, totalProfit, profitMargin };
  }, [items, discountPct, subtotalMap]);
```

**Step 5: Add "Ara Toplam Ekle" button to action bar**

In `QuoteItemsTable.tsx`, update the `QuoteItemsTableProps` interface to include:

```typescript
  onAddSubtotal?: () => void;
  onAddService?: () => void;
```

In the action buttons section (around line 354), add:

```typescript
        {onAddSubtotal && (
          <Button variant="secondary" size="sm" onClick={onAddSubtotal}>
            <Calculator className="h-4 w-4" />
            Ara Toplam
          </Button>
        )}
        {onAddService && (
          <Button variant="secondary" size="sm" onClick={onAddService}>
            <Wrench className="h-4 w-4" />
            Hizmet Ekle
          </Button>
        )}
```

**Step 6: Exclude SUBTOTAL from POZ numbering**

Update the `pozMap` useMemo to exclude SUBTOTAL:

```typescript
  const pozMap = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 1;
    for (const item of items) {
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SERVICE') {
        if (!item.parentItemId) {
          map.set(item.id, counter);
          counter++;
        }
      }
    }
    return map;
  }, [items]);
```

**Step 7: Commit**

```bash
git add src/components/quotes/QuoteItemRow.tsx src/components/quotes/QuoteItemsTable.tsx
git commit -m "feat: add SUBTOTAL row rendering and section-based subtotal computation"
```

---

## Task 7: Unit Selection Dropdown

**Files:**
- Modify: `src/components/quotes/QuoteItemRow.tsx:469-483`

**Step 1: Replace static unit display with dropdown**

In `QuoteItemRow.tsx`, at lines 469-483 (the MIKTAR cell), replace the static unit span with a select dropdown:

```typescript
        {/* MIKTAR */}
        <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            <EditableCell
              value={Number(item.quantity)}
              type="number"
              onChange={(v) => {
                const qty = Number(v);
                const total = qty * Number(item.unitPrice) * (1 - Number(item.discountPct) / 100);
                onUpdate({ quantity: qty, totalPrice: total });
              }}
              displayValue={formatNumber(Number(item.quantity), 2)}
              className="text-right"
            />
            <select
              value={item.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              className="text-xs text-accent-600 bg-transparent border-none p-0 pr-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 rounded appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 8 8\'%3E%3Cpath d=\'M0 2l4 4 4-4z\' fill=\'%23666\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center' }}
            >
              <option value="Adet">Ad.</option>
              <option value="Metre">m.</option>
              <option value="Set">Set</option>
              <option value="Kişi/Gün">Kişi/Gün</option>
            </select>
          </div>
        </td>
```

**Step 2: Commit**

```bash
git add src/components/quotes/QuoteItemRow.tsx
git commit -m "feat: add inline unit selection dropdown (Ad, m, Set, Kişi/Gün)"
```

---

## Task 8: Sub-row Rendering (Internal Cost Tracking)

**Files:**
- Modify: `src/components/quotes/QuoteItemRow.tsx`
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

**Step 1: Render sub-rows indented below their parent**

In `QuoteItemsTable.tsx`, update the items rendering loop to show sub-rows after their parent. In the `filteredItems.map()` section, after rendering a SERVICE item with subRows, render each sub-row:

```typescript
            {filteredItems.map((item) => {
              const origIdx = itemIndexMap.get(item.id) ?? 0;
              return (
                <React.Fragment key={item.id}>
                  <QuoteItemRow
                    key={item.id}
                    item={item}
                    /* ... existing props ... */
                  />
                  {/* Render sub-rows for SET parents */}
                  {item.subRows && item.subRows.length > 0 && item.subRows.map((sub) => (
                    <QuoteItemRow
                      key={sub.id}
                      item={sub}
                      pozNo={null}
                      currency={currency}
                      canViewCosts={canViewCosts}
                      isDragging={false}
                      columnVisibility={columnVisibility}
                      totalColCount={totalColCount}
                      isSubRow={true}
                      onUpdate={(updates) => onItemUpdate(sub.id, updates)}
                      onDelete={() => onItemDelete(sub.id)}
                      onDuplicate={() => onItemDuplicate(sub.id)}
                      onDragStart={noopDrag}
                      onDragOver={noopDrag}
                      onDrop={noopDrag}
                    />
                  ))}
                </React.Fragment>
              );
            })}
```

**Step 2: Style sub-rows with indentation**

In `QuoteItemRow.tsx`, add `isSubRow` to the props interface:

```typescript
  isSubRow?: boolean;
```

In the PRODUCT/CUSTOM/SERVICE rendering section, add sub-row styling. At the start of the row `<tr>`:

```typescript
        className={cn(
          'group text-sm hover:bg-accent-50 transition-colors',
          isDragging && 'opacity-40',
          isLowMargin && canViewCosts && 'bg-red-50',
          isSubRow && 'bg-blue-50/30 text-accent-500',
        )}
```

And modify the description cell for sub-rows to show "↳" prefix:

```typescript
            {isSubRow && <span className="text-accent-400 mr-1">↳</span>}
```

**Step 3: Commit**

```bash
git add src/components/quotes/QuoteItemRow.tsx src/components/quotes/QuoteItemsTable.tsx
git commit -m "feat: render sub-rows indented below SET parent items"
```

---

## Task 9: Section Template Dropdown

**Files:**
- Create: `src/components/quotes/SectionTemplateDropdown.tsx`
- Modify: `src/components/quotes/QuoteItemsTable.tsx`
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`

**Step 1: Create SectionTemplateDropdown component**

Create `src/components/quotes/SectionTemplateDropdown.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutTemplate, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui';

export type SectionTemplate =
  | 'MUHENDISLIK_SET'
  | 'MUHENDISLIK_KISI_GUN'
  | 'MONTAJ_PER_ITEM'
  | 'MONTAJ_TEMINI_VE_MONTAJI'
  | 'GRAFIK_IZLEME';

const templates: { key: SectionTemplate; label: string; description: string }[] = [
  {
    key: 'MUHENDISLIK_SET',
    label: 'Müh. Test ve Devreye Alma (SET)',
    description: 'Başlık + SET satırı + maliyet alt-satırları',
  },
  {
    key: 'MUHENDISLIK_KISI_GUN',
    label: 'Müh. Test ve Devreye Alma (Kişi/Gün)',
    description: 'Başlık + Kişi/Gün satırları',
  },
  {
    key: 'MONTAJ_PER_ITEM',
    label: 'Montaj ve İşçilik (kalem bazlı)',
    description: 'Başlık + montaj satırları için boş bölüm',
  },
  {
    key: 'MONTAJ_TEMINI_VE_MONTAJI',
    label: 'Montaj ve İşçilik (temini ve montajı)',
    description: 'Başlık + malzeme temini ve montajı satırları',
  },
  {
    key: 'GRAFIK_IZLEME',
    label: 'Grafik İzleme Yazılım Çalışmaları',
    description: 'Başlık + SET satırı + otomatik not',
  },
];

interface Props {
  onSelect: (template: SectionTemplate) => void;
}

export function SectionTemplateDropdown({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
        <LayoutTemplate className="h-4 w-4" />
        Bölüm Ekle
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-primary-200 rounded-lg shadow-lg z-50 py-1">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { onSelect(t.key); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-primary-50 cursor-pointer transition-colors"
            >
              <div className="text-sm font-medium text-primary-800">{t.label}</div>
              <div className="text-xs text-primary-500">{t.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add section template handler in QuoteEditor**

Add `handleAddSectionTemplate` in `QuoteEditor.tsx` that creates the appropriate items based on template type. This is a large handler — it creates multiple items via API calls:

```typescript
  const handleAddSectionTemplate = useCallback(async (template: SectionTemplate) => {
    const baseOrder = items.length + 1;

    const createItem = async (data: any) => {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        return mapApiItemToLocal(result.item);
      }
      return null;
    };

    const newItems: QuoteItemData[] = [];

    switch (template) {
      case 'MUHENDISLIK_SET': {
        // Header
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);

        // SET parent
        const parent = await createItem({
          itemType: 'SERVICE', description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
          quantity: 1, unit: 'Set', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (parent) {
          newItems.push(parent);
          // Sub-rows
          const sub1 = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'Süpervizyon Hizmeti', quantity: 1, unit: 'Kişi/Gün',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
          });
          if (sub1) newItems.push(sub1);
          const sub2 = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'Test ve Devreye Alma Hizmeti', quantity: 1, unit: 'Kişi/Gün',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 3,
          });
          if (sub2) newItems.push(sub2);
        }
        break;
      }
      case 'MUHENDISLIK_KISI_GUN': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        const svc1 = await createItem({
          itemType: 'SERVICE', description: 'Süpervizyon Hizmeti',
          quantity: 1, unit: 'Kişi/Gün', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (svc1) newItems.push(svc1);
        const svc2 = await createItem({
          itemType: 'SERVICE', description: 'Test ve Devreye Alma Hizmeti',
          quantity: 1, unit: 'Kişi/Gün', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
        });
        if (svc2) newItems.push(svc2);
        break;
      }
      case 'MONTAJ_PER_ITEM': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj ve İşçilik',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        break;
      }
      case 'MONTAJ_TEMINI_VE_MONTAJI': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj ve İşçilik (Temini ve Montajı)',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        break;
      }
      case 'GRAFIK_IZLEME': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Grafik İzleme Yazılım Çalışmaları',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        const parent = await createItem({
          itemType: 'SERVICE', description: 'Grafik İzleme Yazılım Çalışmaları',
          quantity: 1, unit: 'Set', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (parent) {
          newItems.push(parent);
          const sub = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'Test ve Devreye Alma Hizmeti (Ofis)', quantity: 1, unit: 'Kişi/Gün',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
          });
          if (sub) newItems.push(sub);
        }
        const note = await createItem({
          itemType: 'NOTE',
          description: 'Çalışma yapılması için mimari projelerde mahal bilgilerinin tamamı sağlanmış olmalı, zone bilgisinin harita üzerinde işaretli olarak iletilmesi, zone isimleri iletilmesi gereklidir.',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder + 3,
        });
        if (note) newItems.push(note);
        break;
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
    }
  }, [quoteId, items.length]);
```

**Step 3: Wire SectionTemplateDropdown into QuoteItemsTable**

Add `onAddSectionTemplate` to `QuoteItemsTableProps` and render the dropdown in the action bar.

**Step 4: Commit**

```bash
git add src/components/quotes/SectionTemplateDropdown.tsx src/components/quotes/QuoteItemsTable.tsx src/app/\(dashboard\)/quotes/\[id\]/edit/QuoteEditor.tsx
git commit -m "feat: add section template dropdown with 5 pre-defined quote section types"
```

---

## Task 10: PDF Preview Modal

**Files:**
- Create: `src/components/quotes/PdfPreviewModal.tsx`
- Modify: `src/components/quotes/QuoteEditorHeader.tsx`

**Step 1: Create PdfPreviewModal component**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
}

export function PdfPreviewModal({ isOpen, onClose, quoteId }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) { setPdfUrl(null); return; }

    setIsLoading(true);
    setError(null);

    fetch(`/api/quotes/${quoteId}/export/pdf`)
      .then((res) => {
        if (!res.ok) throw new Error('PDF oluşturulamadı');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));

    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [isOpen, quoteId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <h2 className="text-sm font-semibold text-primary-900">Teklif Ön İzleme</h2>
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a href={pdfUrl} download={`teklif-${quoteId}.pdf`}>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4" /> İndir
              </Button>
            </a>
          )}
          <button type="button" onClick={onClose} className="p-1 hover:bg-primary-100 rounded cursor-pointer">
            <X className="h-5 w-5 text-primary-600" />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-gray-100">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            <span className="ml-2 text-sm text-primary-600">PDF oluşturuluyor...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {pdfUrl && <iframe src={pdfUrl} className="w-full h-full" title="PDF Preview" />}
      </div>
    </div>
  );
}
```

**Step 2: Add preview button to QuoteEditorHeader**

In `QuoteEditorHeader.tsx`, add state and button. Import PdfPreviewModal. Add an "Ön İzleme" button next to the export button (around line 417):

```typescript
          <Button variant="ghost" size="sm" onClick={() => setShowPdfPreview(true)} title="Ön İzleme">
            <Eye className="h-4 w-4" />
            <span className="hidden lg:inline">Ön İzleme</span>
          </Button>
```

And render the modal at the end of the component.

**Step 3: Commit**

```bash
git add src/components/quotes/PdfPreviewModal.tsx src/components/quotes/QuoteEditorHeader.tsx
git commit -m "feat: add PDF preview modal with full Puppeteer render"
```

---

## Task 11: Diğer Maliyet Distribution Modal

**Files:**
- Create: `src/components/quotes/DigerMaliyetModal.tsx`
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

**Step 1: Create DigerMaliyetModal**

A modal that:
1. Shows inputs for accommodation cost (TL), meals (TL), other costs (TL)
2. Displays total overhead in TL and converted to quote currency
3. Shows checkboxes for selecting which items to distribute across
4. Computes and displays per-birim overhead
5. On apply: updates each selected item's costPrice

**Step 2: Wire into QuoteItemsTable action bar**

Add a "Diğer Maliyet" button that opens the modal. The button is conditionally shown when CUSTOM items with TAŞERON-like brands exist.

**Step 3: Commit**

```bash
git add src/components/quotes/DigerMaliyetModal.tsx src/components/quotes/QuoteItemsTable.tsx
git commit -m "feat: add diğer maliyet distribution modal for installation overhead"
```

---

## Task 12: Update PDF and Excel Export

**Files:**
- Modify: `src/app/api/quotes/[id]/export/pdf/route.ts:62-73`
- Modify: `src/lib/pdf/quote-template.ts:32-43,82-96`
- Modify: `src/app/api/quotes/[id]/export/excel/route.ts:77-93`
- Modify: `src/lib/excel/excel-service.ts:10-16`

**Step 1: Filter sub-rows from PDF export**

In `pdf/route.ts`, filter out items where `parentItemId != null` and add SUBTOTAL support:

```typescript
items: quote.items
  .filter(item => !item.parentItemId)
  .map(item => ({
    itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE' | 'SUBTOTAL',
    // ... rest of mapping
  })),
```

**Step 2: Add SUBTOTAL rendering to PDF template**

In `quote-template.ts`, update `QuoteItemForPdf` to include `'SERVICE' | 'SUBTOTAL'` in itemType union. Add SUBTOTAL rendering logic that computes the section sum and renders a bold row.

**Step 3: Add unit display to PDF template**

Show unit abbreviation next to quantity in the Miktar column.

**Step 4: Update Excel export similarly**

Filter sub-rows, add SUBTOTAL rows, show unit abbreviations.

**Step 5: Commit**

```bash
git add src/app/api/quotes/\[id\]/export/ src/lib/pdf/ src/lib/excel/
git commit -m "feat: update PDF and Excel exports for subtotals, sub-rows, and units"
```

---

## Task Summary

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | Schema migration (SUBTOTAL + parentItemId) | Small |
| 2 | Update validation schemas | Small |
| 3 | Update items API (POST/PUT/GET) | Medium |
| 4 | Update QuoteItemData type + mapper | Small |
| 5 | Unify table (remove service split) | Large |
| 6 | SUBTOTAL rendering + computation | Large |
| 7 | Unit selection dropdown | Small |
| 8 | Sub-row rendering | Medium |
| 9 | Section template dropdown | Large |
| 10 | PDF preview modal | Medium |
| 11 | Diğer maliyet distribution modal | Medium |
| 12 | Update PDF and Excel exports | Medium |

**Dependency chain:** 1 → 2 → 3 → 4 → 5 → 6,7,8 (parallel) → 9 → 10,11 (parallel) → 12

**Parallelizable groups:**
- **Group A (Tasks 1-4):** Schema + API foundation — must be sequential
- **Group B (Tasks 5-8):** Table unification + new row types — 6,7,8 can run in parallel after 5
- **Group C (Tasks 9-11):** Feature additions — 10 and 11 can run in parallel; 9 depends on 5
- **Group D (Task 12):** Export updates — depends on all above
