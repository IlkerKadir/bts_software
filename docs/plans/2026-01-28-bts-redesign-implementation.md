# BTS Yangin Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the BTS quote management system to match the client's actual workflow, pricing model, and business requirements based on their Excel system and email correspondence.

**Architecture:** Incremental modification of existing Next.js 16 + Prisma + PostgreSQL app. Schema changes first, then backend APIs, then frontend UI. Each phase builds on the previous. We keep existing auth, CRUD, and infrastructure intact.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6, PostgreSQL, Tailwind CSS 4, ExcelJS, TypeScript 5, Vitest

---

## Phase 1: Schema & Data Foundation (Tasks 1-4)

Everything else depends on having the right data model in place.

### Task 1: Schema Updates - Product & Pricing Models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add fields to Product model**

Add `nameEn` and `pricingType` to the Product model:

```prisma
enum PricingType {
  LIST_PRICE
  PROJECT_BASED
}

model Product {
  // ... existing fields ...
  nameEn      String?
  pricingType PricingType @default(LIST_PRICE)
  // ... existing relations ...
  brandDiscounts BrandDiscount[] // add this relation
}
```

**Step 2: Create BrandDiscount model**

```prisma
model BrandDiscount {
  id           String       @id @default(cuid())
  brandId      String
  brand        ProductBrand @relation(fields: [brandId], references: [id])
  coefficient  Decimal      @default(1) @db.Decimal(5, 3) // default katsayi
  updatedAt    DateTime     @updatedAt
  updatedById  String?

  @@unique([brandId])
}
```

Also add relation to ProductBrand:
```prisma
model ProductBrand {
  // ... existing ...
  brandDiscount BrandDiscount?
}
```

**Step 3: Add fields to QuoteItem model**

```prisma
model QuoteItem {
  // ... existing fields ...
  isManualPrice Boolean  @default(false)
  costPrice     Decimal? @db.Decimal(12, 2)
  serviceMeta   Json?    // stores service cost breakdown
}
```

**Step 4: Add SERVICE to QuoteItemType enum**

```prisma
enum QuoteItemType {
  PRODUCT
  HEADER
  NOTE
  CUSTOM
  SERVICE
}
```

**Step 5: Add language field to Quote**

```prisma
model Quote {
  // ... existing fields ...
  language String @default("TR") // TR or EN
}
```

**Step 6: Add canOverrideKatsayi to Role**

```prisma
model Role {
  // ... existing fields ...
  canOverrideKatsayi Boolean @default(false)
}
```

**Step 7: Run migration**

Run: `npx prisma migrate dev --name add-pricing-models`

**Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add BrandDiscount, PricingType, SERVICE item type, quote language"
```

---

### Task 2: Schema Updates - Service Cost Config

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Create ServiceCostConfig model**

```prisma
model ServiceCostConfig {
  id                String   @id @default(cuid())
  dailySalary       Decimal  @db.Decimal(10, 2) // adam/gun maas
  dailyHotel        Decimal  @db.Decimal(10, 2) // adam/gun otel
  dailyMealsOutCity Decimal  @db.Decimal(10, 2) // sehir disi yemek
  dailyMealsOffice  Decimal  @db.Decimal(10, 2) // ofis yemek
  dailyVehicle      Decimal  @db.Decimal(10, 2) // arac gunluk
  perKmCost         Decimal  @db.Decimal(10, 2) // arac km
  distanceBrackets  Json     // [75, 150, 200, 250, 500, 750, 1000, 1250]
  validFrom         DateTime @default(now())
  isActive          Boolean  @default(true)
  createdById       String?
  createdAt         DateTime @default(now())

  @@index([isActive, validFrom])
}
```

**Step 2: Create LiftingEquipmentRate model**

```prisma
model LiftingEquipmentRate {
  id            String   @id @default(cuid())
  name          String   // e.g., "Akulu Eklemli Platform 12-15m"
  dailyRate     Decimal  @db.Decimal(10, 2)
  transportCost Decimal  @db.Decimal(10, 2) // gelis-gidis maliyet
  validFrom     DateTime @default(now())
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
}
```

**Step 3: Run migration**

Run: `npx prisma migrate dev --name add-service-cost-config`

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ServiceCostConfig and LiftingEquipmentRate models"
```

---

### Task 3: Seed Data - Roles, Users, Service Costs

**Files:**
- Modify: `prisma/seed.ts`

**Step 1: Update seed script with BTS roles and users**

Replace existing role/user seed data with:

- Role "Yonetim": all permissions true including canOverrideKatsayi
- Role "Satis": canExport true, everything else false
- Users: Levent Ceylan (lceylan/Yonetim), Cansu Ceylan (cceylan/Yonetim), Murat Demirhan (mdemirhan/Yonetim), Firat Filiz (ffiliz/Satis), Selale Acar (sacar/Satis)
- Default passwords: hashed "1111" (matching their Excel system, users change after first login)

**Step 2: Seed ServiceCostConfig with July 2025 rates**

```typescript
// From TEMMUZ_2025 MALİYETLER_.xlsx
{
  dailySalary: 3575,
  dailyHotel: 2000,
  dailyMealsOutCity: 475,
  dailyMealsOffice: 270,
  dailyVehicle: 1800,
  perKmCost: 4,
  distanceBrackets: [75, 150, 200, 250, 500, 750, 1000, 1250],
  validFrom: new Date('2025-07-01'),
  isActive: true,
}
```

**Step 3: Seed LiftingEquipmentRates**

```typescript
// Akulu Eklemli Platform 12-15m: daily 466 TL, transport 5000 TL
// Akulu Makasli Platform 6-8m: daily 45 TL, transport 5000 TL
```

**Step 4: Seed CommercialTermTemplates with BTS defaults**

Seed all 8 categories from the Excel: uretici_firmalar, onaylar, garanti, teslim_yeri, odeme, kdv, teslimat, opsiyon. Include all options from TicariSartlar2 sheet.

**Step 5: Run seed**

Run: `npx prisma db seed`

**Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed BTS roles, users, service costs, commercial terms"
```

---

### Task 4: Service Cost Calculator Library

**Files:**
- Create: `src/lib/service-cost.ts`
- Create: `src/lib/service-cost.test.ts`

**Step 1: Write failing tests**

Test cases:
- `calculateServiceCost({teamSize: 1, days: 1, distanceKm: 500})` → 12120 TL (matching Excel)
- `calculateServiceCost({teamSize: 2, days: 1, distanceKm: 500})` → 18440 TL
- `calculateServiceCost({teamSize: 1, days: 5, distanceKm: 750})` → 46600 TL
- `calculateServiceCost({teamSize: 1, days: 15, distanceKm: 1000})` → 129800 TL
- City (Istanbul) calculation: teamSize 1, sehirIci: true → 5845/day
- Office calculation: teamSize 1, office: true → 5645/day
- With lifting equipment: adds daily rate * days + transport cost

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/service-cost.test.ts`

**Step 3: Implement service cost calculator**

```typescript
export interface ServiceCostInput {
  teamSize: 1 | 2;
  days: number;
  locationType: 'sehir_ici' | 'ofis' | 'sehir_disi';
  distanceKm?: number; // required if sehir_disi
  liftingEquipment?: {
    dailyRate: number;
    transportCost: number;
    rentalDays: number;
  };
}

export interface ServiceCostBreakdown {
  dailySalary: number;
  dailyHotel: number;
  dailyMeals: number;
  dailyVehicle: number;
  kmCost: number;
  dailyTotal: number;
  subtotal: number; // dailyTotal * days * teamSize
  liftingCost: number;
  grandTotal: number;
}

export function calculateServiceCost(
  input: ServiceCostInput,
  config: ServiceCostConfig
): ServiceCostBreakdown
```

Core logic:
- `dailyTotal = salary + hotel + meals + vehicle + (nearestBracketKm * perKmCost)`
- For sehir_ici: no hotel, use office meals rate, no km
- For ofis: no hotel, use office meals rate, no km
- For sehir_disi: full daily with hotel, out-of-city meals, snap distanceKm to nearest bracket
- `subtotal = dailyTotal * days * teamSize`
- `liftingCost = equipment.dailyRate * equipment.rentalDays + equipment.transportCost`
- `grandTotal = subtotal + liftingCost`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/service-cost.test.ts`

**Step 5: Commit**

```bash
git add src/lib/service-cost.ts src/lib/service-cost.test.ts
git commit -m "feat: service cost calculator with tests matching Excel values"
```

---

## Phase 2: Backend API Updates (Tasks 5-9)

### Task 5: BrandDiscount API

**Files:**
- Create: `src/app/api/brands/[id]/discount/route.ts`
- Modify: `src/app/api/products/brands/route.ts` (include discount in response)

**Step 1: Add GET/PUT endpoint for brand discount**

GET returns current coefficient for a brand.
PUT allows Yonetim to set/update the default katsayi for a brand.
Requires `canEditProducts` permission.

**Step 2: Update brands list API to include discounts**

When listing brands, include the BrandDiscount relation so the frontend knows the default coefficient per brand.

**Step 3: Commit**

```bash
git add src/app/api/brands/ src/app/api/products/brands/route.ts
git commit -m "feat: brand discount/coefficient API"
```

---

### Task 6: Product Import API

**Files:**
- Create: `src/app/api/products/import/route.ts`
- Create: `src/lib/product-import.ts`

**Step 1: Create import parser library**

Parses the Master Price List Excel format:
- Reads MARKA, MODEL, KISA KOD, URUN KODU, URUN ADI, LISTE FIYATI, PARA BIRIMI columns
- Groups TR and ING rows by product code (column G = "TR" or "ING")
- Returns structured product array with both language descriptions

**Step 2: Create preview endpoint**

`POST /api/products/import` with `action: "preview"`:
- Accepts multipart form upload of .xlsx file
- Parses and returns summary: total products, new products, price changes, unchanged
- Does NOT write to database

**Step 3: Create confirm endpoint**

`POST /api/products/import` with `action: "confirm"`:
- Accepts the same file + confirmation flag
- Upserts products (create new, update existing prices)
- Creates PriceHistory entries for any price changes
- Creates ProductBrand entries for new brands
- Returns import results summary

**Step 4: Commit**

```bash
git add src/app/api/products/import/ src/lib/product-import.ts
git commit -m "feat: product bulk import from Excel with preview and confirm"
```

---

### Task 7: Price History API for Quote Context

**Files:**
- Create: `src/app/api/products/price-history/by-company/route.ts`
- Modify: `src/app/api/quotes/[id]/items/route.ts`

**Step 1: Create company-specific price history endpoint**

`GET /api/products/price-history/by-company?companyId=X&productIds=1,2,3`

Returns the most recent price given to company X for each product:
```json
{
  "productId1": { "unitPrice": 100, "katsayi": 0.8, "quotedAt": "2025-06-15", "quoteNumber": "BTS-2025-0042" },
  "productId2": { "unitPrice": 200, "katsayi": 1.2, "quotedAt": "2025-05-10", "quoteNumber": "BTS-2025-0031" }
}
```

**Step 2: Update quote items POST to record price history**

When a quote transitions to GONDERILDI (sent to customer), automatically create PriceHistory entries for all PRODUCT-type items in the quote.

**Step 3: Commit**

```bash
git add src/app/api/products/price-history/ src/app/api/quotes/
git commit -m "feat: price history lookup by company for quote context"
```

---

### Task 8: Service Cost Config API

**Files:**
- Create: `src/app/api/settings/service-costs/route.ts`
- Create: `src/app/api/quotes/[id]/items/service/route.ts`

**Step 1: CRUD for service cost configuration**

`GET /api/settings/service-costs` - returns active config
`POST /api/settings/service-costs` - creates new config (sets previous as inactive)
Requires `canManageUsers` or admin permission.

**Step 2: Service item calculation endpoint**

`POST /api/quotes/[id]/items/service`:
- Accepts: serviceType, teamSize, locationType, distanceKm, days, liftingEquipment
- Calculates cost using active ServiceCostConfig
- Creates a SERVICE-type QuoteItem with calculated price
- Stores breakdown in `serviceMeta` JSON field

**Step 3: Commit**

```bash
git add src/app/api/settings/service-costs/ src/app/api/quotes/
git commit -m "feat: service cost config API and service quote item creation"
```

---

### Task 9: Quote Profit/Cost Calculation

**Files:**
- Modify: `src/lib/quote-calculations.ts`
- Modify: `src/lib/quote-calculations.test.ts`
- Modify: `src/app/api/quotes/[id]/route.ts`

**Step 1: Add profit calculation functions**

```typescript
export interface QuoteItemWithCost extends QuoteItem {
  costPrice: number;
}

export function calculateItemProfit(item: QuoteItemWithCost): {
  cost: number;      // costPrice * quantity
  profit: number;    // totalPrice - cost
  marginPct: number; // (profit / totalPrice) * 100
}

export function calculateQuoteProfitSummary(items: QuoteItemWithCost[]): {
  totalCost: number;
  totalProfit: number;
  overallMarginPct: number;
}
```

**Step 2: Write tests for profit calculations**

**Step 3: Update quote GET endpoint**

When the requesting user has `canViewCosts`, include profit summary in the response. When they don't, omit costPrice, profit, and margin fields entirely.

**Step 4: Commit**

```bash
git add src/lib/quote-calculations.ts src/lib/quote-calculations.test.ts src/app/api/quotes/
git commit -m "feat: profit/cost calculations with role-based visibility"
```

---

## Phase 3: Excel Export Redesign (Task 10)

### Task 10: Redesign Excel Export to Match BTS Template

**Files:**
- Modify: `src/lib/excel/excel-service.ts`
- Modify: `src/app/api/quotes/[id]/export/excel/route.ts`

**Step 1: Redesign the Excel generation**

The export must produce a customer-facing document matching BTS screenshots:

**Header area (rows 1-4):**
- BTS logo from `/public/btslogo.png` (left, merged A1:C4)
- Company name bold, address, phone/fax/email/website, Ticaret Sicil No (D1:H4)
- Anniversary/secondary logo if exists (right side)

**Customer block (rows 5-9):**
- A5: "FİRMA CARİ" label + company name
- A6: "Firma adres" + address
- Right side (J5-K9): "PROFORMA FATURA", Tarih, Ref.No, Teklif No
- A8: "PROJE ADI" + project name
- A9: "MARKA VE SİSTEM ADI" + system brand

**Product table (row 10+):**
- Header row dark background (#1F3864 or similar), white bold text
- 5 visible columns: POZ NO (A) | AÇIKLAMA (B-F merged) | MİKTAR (G) | BİRİM FİYAT (H) | TOPLAM FİYAT (I)
- HEADER-type rows: bold, merged across full width, section separator
- PRODUCT rows: sequential POZ NO numbering
- NOTE rows: italic, merged description
- Bottom: subtotal row

**Engineering services section:**
- "Mühendislik, Test ve Devreye Alma Çalışmaları" bold header
- Description paragraph with actual values (not xxx placeholders)
- Numbered service items in same table format
- "Dahil Olmayan Hizmetler" disclaimer

**Commercial terms section:**
- "TİCARİ ŞARTLAR" bold header
- Each category: bold title row + content row
- Order: ÜRETİCİ FİRMALAR, ONAYLAR, GARANTİ, TESLİM YERİ, ÖDEME, KDV, TESLİMAT, OPSİYON

**Notes section:**
- "NOTLAR" bold header
- Numbered notes with confidentiality clause

**Step 2: Styling details**
- BTS red (#E31E24) for accent lines
- Professional fonts, consistent borders
- A4 landscape print area with proper margins
- Page breaks between product table and commercial terms if needed

**Step 3: Never export internal columns**
- katsayi, listPrice, costPrice, discountRate, shortCode, currency conversion details are NEVER in the output

**Step 4: Update PDF export route to use same layout**

The PDF route should render an HTML version of this same layout and convert via Puppeteer.

**Step 5: Commit**

```bash
git add src/lib/excel/ src/app/api/quotes/[id]/export/
git commit -m "feat: redesign Excel export to match BTS proforma fatura template"
```

---

## Phase 4: Frontend - Quote Editor (Tasks 11-15)

This is the core user-facing feature. Build it component by component.

### Task 11: Quote Editor Layout & Header

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/page.tsx`
- Create: `src/components/quotes/QuoteEditorHeader.tsx`

**Step 1: Build QuoteEditorHeader component**

- Left section: Company selector (searchable dropdown using existing companies API), Project selector, "Marka ve Sistem Adi" text input
- Right section: Quote number (read-only), Date picker, Ref.No (auto or manual), Status badge
- Currency selector (EUR/USD/GBP/TRY) with exchange rate display
- Language toggle (TR/EN)
- Save draft button, Submit for approval button

**Step 2: Wire up to the edit page**

The edit page fetches quote data and passes to QuoteEditorHeader. Changes auto-save or save on button click.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/edit/ src/components/quotes/QuoteEditorHeader.tsx
git commit -m "feat: quote editor header with company, project, currency selection"
```

---

### Task 12: Quote Line Items Table

**Files:**
- Create: `src/components/quotes/QuoteItemsTable.tsx`
- Create: `src/components/quotes/QuoteItemRow.tsx`

**Step 1: Build QuoteItemsTable**

- Renders all quote items in a table
- Columns for all users: POZ NO, AÇIKLAMA, MİKTAR, BİRİM FİYAT, TOPLAM FİYAT
- Columns for canViewCosts users: KATSAYI, LİSTE FİYATI, MALİYET, KAR, KAR %
- HEADER rows render as full-width bold section dividers
- NOTE rows render as full-width italic text
- SERVICE rows render with a service icon indicator
- Sortable via drag handles (use HTML drag and drop, no extra library)
- Right-click context menu: duplicate, delete, insert header above/below
- Bottom summary row: Subtotal, Discount % input, VAT total, Grand Total
- For Yonetim: additional row showing Toplam Maliyet, Toplam Kar, Kar Marji %

**Step 2: Build QuoteItemRow**

- Inline editing: click cell to edit quantity, katsayi (if permitted), description
- For PRODUCT type: show product code, brand as subtle labels
- For manual price items (isManualPrice): unitPrice is directly editable
- For regular items: unitPrice = listPrice * katsayi (calculated, read-only)
- Price history icon: small clock icon, hover tooltip shows last price to this customer

**Step 3: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx src/components/quotes/QuoteItemRow.tsx
git commit -m "feat: quote items table with inline editing, role-based columns"
```

---

### Task 13: Product Catalog Side Panel

**Files:**
- Create: `src/components/quotes/ProductCatalogPanel.tsx`
- Create: `src/components/quotes/ProductSearchCard.tsx`

**Step 1: Build ProductCatalogPanel**

- Right-side sliding panel, ~40% viewport width
- Toggle open/close via "Urun Ekle" button
- Top: search input (searches code, name, nameTr, model)
- Filter row: Brand dropdown, Category dropdown, Short Code dropdown
- Results: scrollable list of ProductSearchCard components
- Loading states, empty states, error handling

**Step 2: Build ProductSearchCard**

- Shows: product code, name (TR or EN based on quote language), list price + currency
- Brand badge
- Price history section: if companyId is set on the quote, shows last quoted price to this company with date and quote number
- "Ekle" (Add) button: clicking adds product as a new PRODUCT-type QuoteItem
  - Sets listPrice from product
  - Sets katsayi from BrandDiscount default (if exists) or 1.0
  - Calculates unitPrice = listPrice * katsayi
  - Appends to bottom of quote items table
- For PROJECT_BASED products: "Ekle" adds with isManualPrice=true, unitPrice editable

**Step 3: Commit**

```bash
git add src/components/quotes/ProductCatalogPanel.tsx src/components/quotes/ProductSearchCard.tsx
git commit -m "feat: product catalog side panel with search, filters, price history"
```

---

### Task 14: Engineering Services Section

**Files:**
- Create: `src/components/quotes/ServiceCostSection.tsx`
- Create: `src/components/quotes/ServiceCostCalculator.tsx`

**Step 1: Build ServiceCostCalculator**

- Form with inputs: service type dropdown, team size toggle (1/2), location radio (sehir ici/ofis/sehir disi), distance dropdown (if sehir disi), days input (1-15)
- Optional lifting equipment section: type dropdown, rental days
- Live cost breakdown display showing each component
- Total in TL + converted to quote currency
- "Teklife Ekle" (Add to Quote) button

**Step 2: Build ServiceCostSection**

- Collapsible section below the items table
- Header: "Muhendislik, Test ve Devreye Alma Hizmetleri"
- Lists existing SERVICE-type items in the quote
- "Hizmet Ekle" button opens the calculator
- Each service item shows breakdown on hover/expand

**Step 3: Commit**

```bash
git add src/components/quotes/ServiceCostSection.tsx src/components/quotes/ServiceCostCalculator.tsx
git commit -m "feat: service cost calculator UI with live breakdown"
```

---

### Task 15: Commercial Terms Section

**Files:**
- Create: `src/components/quotes/CommercialTermsSection.tsx`

**Step 1: Build CommercialTermsSection**

- Collapsible section below services
- 8 tabs matching BTS structure: Uretici Firmalar, Onaylar, Garanti, Teslim Yeri, Odeme, KDV, Teslimat, Opsiyon
- Plus a "Notlar" tab for notes
- Each tab:
  - Dropdown selector with template options from CommercialTermTemplate table
  - Free text area for custom override or editing the template text
  - Selected value saved as QuoteCommercialTerm
- Auto-selection hint: based on product brands in the quote, suggest relevant manufacturers and approvals (non-blocking suggestion, not automatic)

**Step 2: Commit**

```bash
git add src/components/quotes/CommercialTermsSection.tsx
git commit -m "feat: commercial terms builder with templates and free text"
```

---

## Phase 5: Frontend - Product Management (Tasks 16-17)

### Task 16: Product Import UI

**Files:**
- Create: `src/components/products/ProductImportModal.tsx`
- Modify: `src/app/(dashboard)/products/page.tsx`

**Step 1: Build ProductImportModal**

- File upload dropzone accepting .xlsx files
- Upload triggers preview API call
- Shows summary table: new products, price changes (old -> new), unchanged
- "Onayla ve Iceri Aktar" (Confirm & Import) button
- Progress indicator during import
- Results summary after completion

**Step 2: Add import button to products page**

Add "Excel'den Yukle" button to the products page header (visible to canEditProducts users only). Opens the modal.

**Step 3: Commit**

```bash
git add src/components/products/ProductImportModal.tsx src/app/(dashboard)/products/
git commit -m "feat: product import UI with preview and confirmation"
```

---

### Task 17: Brand Coefficient Management

**Files:**
- Create: `src/components/products/BrandCoefficientTable.tsx`
- Modify: `src/app/(dashboard)/products/page.tsx` or create new settings page

**Step 1: Build BrandCoefficientTable**

- Table showing all brands with their default katsayi (coefficient)
- Inline editable coefficient field (Yonetim only)
- Save changes via BrandDiscount API
- Shows which quotes would be affected by coefficient changes (info only, no auto-recalculation)

**Step 2: Add to products page or settings**

As a tab or section on the products page, accessible to Yonetim users.

**Step 3: Commit**

```bash
git add src/components/products/BrandCoefficientTable.tsx
git commit -m "feat: brand coefficient management for Yonetim"
```

---

## Phase 6: UI/UX Overhaul (Tasks 18-21)

Use frontend-design skill for these tasks to create polished, production-grade interfaces.

### Task 18: Dashboard Redesign

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/dashboard/QuotePipeline.tsx`
- Create: `src/components/dashboard/RecentQuotes.tsx`
- Create: `src/components/dashboard/QuickActions.tsx`
- Create: `src/components/dashboard/ProfitSummary.tsx`

**Step 1: Build dashboard components**

- **QuotePipeline**: Visual cards showing quote count per status (TASLAK, ONAY_BEKLIYOR, ONAYLANDI, GONDERILDI, TAKIPTE). Clickable to filter quote list.
- **RecentQuotes**: Table of 10 most recently updated quotes with status, company, total, date
- **QuickActions**: Button cards for Yeni Teklif, Urun Ara, Kur Guncelle
- **ProfitSummary** (Yonetim only): Monthly totals - quotes sent, total value, total profit, avg margin

**Step 2: Compose dashboard page**

Layout: Pipeline across top, RecentQuotes + QuickActions in middle row, ProfitSummary at bottom (conditional).

**Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/ src/components/dashboard/
git commit -m "feat: redesign dashboard with pipeline, recent quotes, quick actions"
```

---

### Task 19: Layout & Navigation Overhaul

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/DashboardLayout.tsx`
- Modify: `src/app/globals.css`

**Step 1: Redesign Sidebar**

- BTS logo at top
- Turkish labels: Anasayfa, Teklifler, Urunler, Firmalar, Projeler, Ayarlar
- Active state with BTS red (#E31E24) accent
- Collapsible with icon-only mode
- User info and logout at bottom
- Remove links to deprioritized pages (Reports, Notifications)

**Step 2: Redesign Header**

- Breadcrumb navigation
- Global quick search (searches quotes by number, companies by name, products by code)
- User role badge
- Minimal and clean

**Step 3: Update global styles**

- BTS brand colors as CSS variables
- Professional typography
- Data-dense defaults (tighter padding, smaller text in tables)

**Step 4: Commit**

```bash
git add src/components/layout/ src/app/globals.css
git commit -m "feat: redesign layout with BTS branding, Turkish labels, clean navigation"
```

---

### Task 20: Quote List Page Redesign

**Files:**
- Modify: `src/app/(dashboard)/quotes/page.tsx`
- Modify: `src/app/(dashboard)/quotes/QuoteList.tsx`

**Step 1: Redesign quote list**

- Clean table with columns: Teklif No, Firma, Proje, Toplam, Durum, Tarih, Olusturan
- Status badges with Turkish labels and color coding
- Filter bar: status multi-select, company dropdown, date range, creator
- Sortable columns
- Click row to navigate to quote detail/edit
- "Yeni Teklif" prominent button
- For Yonetim: additional Kar Marji % column

**Step 2: Commit**

```bash
git add src/app/(dashboard)/quotes/
git commit -m "feat: redesign quote list with filters, Turkish labels, profit column"
```

---

### Task 21: Products Page Redesign

**Files:**
- Modify: `src/app/(dashboard)/products/page.tsx`
- Modify: `src/app/(dashboard)/products/ProductList.tsx`

**Step 1: Redesign products page**

- Search bar searching across code, name, nameTr, model, shortCode
- Filter by brand, category, currency
- Table: Urun Kodu, Kisa Kod, Marka, Model, Urun Adi, Liste Fiyati, Para Birimi
- canViewCosts users also see: Maliyet Fiyati
- Pagination for 6000+ products
- "Excel'den Yukle" import button (canEditProducts only)
- "Urun Ekle" manual add button (canEditProducts only)
- Brand coefficient management section/tab (Yonetim only)

**Step 2: Commit**

```bash
git add src/app/(dashboard)/products/
git commit -m "feat: redesign products page with search, import, coefficient management"
```

---

## Phase 7: Settings & Service Cost Admin (Task 22)

### Task 22: Service Cost Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/service-costs/page.tsx`
- Create: `src/components/settings/ServiceCostForm.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (add link)

**Step 1: Build service cost settings page**

- Current rates display (read-only table showing all base rates)
- "Yeni Tarife" (New Tariff) button opens form
- Form: all 6 base rate inputs + distance brackets + validFrom date
- Lifting equipment rates section: list existing, add new
- Save creates new ServiceCostConfig with validFrom date
- Historical configs visible below in a collapsible section

**Step 2: Add to settings navigation**

Add "Hizmet Maliyetleri" link under Ayarlar in sidebar.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/settings/service-costs/ src/components/settings/
git commit -m "feat: service cost rate management settings page"
```

---

## Phase 8: Integration & Polish (Tasks 23-25)

### Task 23: Quote Editor Integration

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/page.tsx`

**Step 1: Wire all components together**

Compose the full quote editor page:
1. QuoteEditorHeader (top)
2. QuoteItemsTable (main area)
3. ProductCatalogPanel (right side, toggled)
4. ServiceCostSection (below table, collapsible)
5. CommercialTermsSection (below services, collapsible)

**Step 2: State management**

- Use React state for the quote being edited
- Auto-recalculate totals when items change
- Optimistic updates with API sync
- Unsaved changes warning on navigation

**Step 3: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/edit/
git commit -m "feat: integrate all quote editor components into cohesive editor"
```

---

### Task 24: Quote Detail/View Page

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx`

**Step 1: Redesign quote detail page**

- Read-only view of all quote data
- Same layout as editor but without editing controls
- Export buttons: "Excel Indir", "PDF Indir" (canExport users)
- Status change dropdown (valid transitions only)
- Approval actions (canApprove users): Onayla / Reddet
- Version history sidebar showing revisions
- "Revizyon Olustur" (Create Revision) button → duplicates quote as V2 in TASLAK
- Quote history/audit trail at bottom

**Step 2: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/page.tsx
git commit -m "feat: redesign quote detail page with export, approval, versioning"
```

---

### Task 25: Final Polish & Testing

**Files:**
- Multiple files across the project

**Step 1: End-to-end workflow testing**

Manually test the complete flow:
1. Login as Satis user → create new quote → add products → set quantities/katsayi → add services → set commercial terms → submit for approval
2. Login as Yonetim user → see approval with profit data → approve → export Excel → verify export matches BTS template
3. Test revision flow: approved quote → create revision → edit → resubmit
4. Test product import: upload sample Excel → preview → confirm
5. Test service cost calculator against known values from TEMMUZ_2025 spreadsheet

**Step 2: Fix any issues found during testing**

**Step 3: Update seed data with realistic demo data**

Create a few sample quotes, companies, and projects for the demo to BTS.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: final polish, integration testing, demo data"
```

---

## Task Dependency Summary

```
Phase 1 (Schema):     Task 1 → Task 2 → Task 3 → Task 4
Phase 2 (APIs):       Task 5, 6, 7, 8, 9 (can run in parallel after Phase 1)
Phase 3 (Excel):      Task 10 (after Phase 2)
Phase 4 (Editor):     Task 11 → Task 12 → Task 13 → Task 14 → Task 15 (sequential)
Phase 5 (Products):   Task 16, 17 (after Phase 2, parallel with Phase 4)
Phase 6 (UI):         Task 18, 19, 20, 21 (parallel with Phase 4-5)
Phase 7 (Settings):   Task 22 (after Task 8)
Phase 8 (Integration): Task 23 → Task 24 → Task 25 (after all others)
```

## Parallelization Opportunities

These groups can be worked on simultaneously:
- **Group A:** Tasks 5-9 (APIs - all independent after schema)
- **Group B:** Tasks 16-17 (Product mgmt) + Tasks 18-21 (UI) can run in parallel with Tasks 11-15 (Editor)
- **Group C:** Task 10 (Excel export) + Task 22 (Service settings) can run in parallel
