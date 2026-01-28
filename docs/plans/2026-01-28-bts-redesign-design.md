# BTS Yangin - Teklif Yonetim Sistemi Redesign
## Design Document - January 28, 2026

Based on client correspondence (13 emails with Cansu Ceylan), analysis of their current Excel macro system (BTS Teklif Formati 2020.REV9.xlsm), and review of the existing codebase.

---

## 1. Project Context

**Client:** BTS Yangin Guvenlik Yapi Teknolojileri Ltd.
**Contact:** Cansu Ceylan (Industrial Engineer / Business Development Manager)
**Scope:** Module 1 (Quote Preparation) + Module 2 (Quote Tracking / Project Tracking)
**Price:** 5,000 USD + KDV | **Delivery:** 2 months | **Advance paid:** 1,167.77 USD

### Deferred to future phases:
- Module 3: Order Confirmation Form (Siparis Teyit Formu)
- Module 4: Full reporting/analytics

---

## 2. Pricing Model

### Formula
```
unitPrice = listPrice * katsayi (coefficient)
totalPrice = unitPrice * quantity
quoteLevelDiscount applied to grand total
```

### Two product pricing types:
1. **LIST_PRICE (default):** Product has a catalog list price. Katsayi is set by management per brand or per item (e.g., "1.2 for Tyco, 0.6 for another brand").
2. **PROJECT_BASED:** One specific brand has no price list. Salesperson enters the price manually at quote time.

### Currency handling:
- Products have native currencies (EUR, USD, GBP, TRY)
- Quotes issued in any of the 4 currencies
- TCMB rates as base with configurable protection percentages per currency pair
- Cross-rate matrix maintained in system settings

---

## 3. Schema Changes

### Product model additions:
- `nameEn` (String) - English product description
- `pricingType` (Enum: LIST_PRICE | PROJECT_BASED)
- `shortCode` field used meaningfully for category/coefficient grouping

### New model: BrandDiscount
```
BrandDiscount {
  id
  brandId        -> ProductBrand
  discountRate   Float    // master default discount rate
  coefficient    Float    // default katsayi for this brand
  updatedAt
  updatedById    -> User
}
```

### QuoteItem additions:
- `isManualPrice` (Boolean) - true for project-based brand items
- `costPrice` (Float) - cost to BTS, for profit calculation (management only)

### New model: ServiceCostConfig
```
ServiceCostConfig {
  id
  dailySalary        Float   // adam/gun maas maliyeti
  dailyHotel         Float   // adam/gun otel maliyeti
  dailyMealsOutCity  Float   // sehir disi adam/gun yemek
  dailyMealsOffice   Float   // ofis adam/gun yemek
  dailyVehicle       Float   // arac gunluk maliyet
  perKmCost          Float   // arac km maliyet
  distanceBrackets   Json    // [75, 150, 200, 250, 500, 750, 1000, 1250]
  validFrom          DateTime
  createdById        -> User
}
```

### Quote additions:
- `language` (Enum: TR | EN) - determines product description language in export

### Role additions:
- `canOverrideKatsayi` (Boolean) - controls whether user can change management-set coefficients

---

## 4. Quote Editor UI Design

### Three-zone layout:

**Top Bar - Quote Header:**
- Left: Customer (searchable dropdown), Project, Marka ve Sistem Adi
- Right: Quote number (BTS-YYYY-NNNN), Date, Ref.No, Status badge
- Currency selector with live TCMB rate
- Language toggle (TR/EN)

**Main Area - Quote Line Items Table:**
- All users see: POZ NO, ACIKLAMA, MIKTAR, BIRIM FIYAT, TOPLAM FIYAT
- Management only (canViewCosts): KATSAYI, LISTE FIYATI, MALIYET, KAR, KAR %
- Inline editing for quantity, katsayi, description
- Row types: PRODUCT, HEADER (section divider), NOTE, SERVICE, CUSTOM (manual price)
- Drag-to-reorder
- Right-click context menu: duplicate, delete, insert header
- Price history indicator: icon per product row, hover for last price to this customer
- Bottom: Subtotal, Discount %, VAT total, Grand Total
- Management view adds: Toplam Maliyet, Toplam Kar, Kar Marji %

**Right Panel - Product Catalog (toggled):**
- Opens via "Urun Ekle" button, ~40% width
- Search bar + brand/category/short code filters
- Product cards: code, name, list price, currency
- Customer price history badge per card
- Click to add to quote, panel stays open
- Dismissed when done

**Below Table - Two collapsible sections:**
1. Engineering Services: cost calculator (team size, distance, days -> auto-calculated)
2. Commercial Terms: tabbed (Uretici Firmalar, Onaylar, Garanti, Teslim Yeri, Odeme, KDV, Teslimat, Opsiyon, Notlar) with template dropdowns + free text override

---

## 5. Technical Service Cost Calculator

### Integration:
Expands below product table in quote editor.

### Inputs:
- Service type: Supervizyon, Test ve Devreye Alma, Egitim
- Team size: 1 Kisi / 2 Kisi
- Location: Sehir Ici | Ofis | Sehir Disi
- Distance bracket (if Sehir Disi): 75-1250km options
- Days: 1-15 (15-day max rule)
- Lifting equipment (optional): type + duration

### Calculation:
```
dailyRate = salary + hotel + meals + vehicle + (km * perKmCost)
totalCost = dailyRate * days * teamSize + liftingEquipmentCost
```

### Output:
- Live breakdown showing each component
- Total in TL, converted to quote currency
- "Add to Quote" inserts as SERVICE-type line item
- Breakdown stored as JSON metadata on QuoteItem

### Admin:
- Service Cost Rates page in Settings
- validFrom date per rate set for historical integrity
- "Recalculate" option on existing draft quotes when rates change

---

## 6. Excel Export Design

Matches BTS's current customer-facing quote format exactly.

### Layout:
1. **Header:** BTS logo (left) + secondary logo (right), company name, address, phone/fax/email/website, Ticaret Sicil No
2. **Customer block:** FİRMA CARİ, address (left), PROFORMA FATURA box with Tarih, Ref.No, Teklif No (right), PROJE ADI, MARKA VE SİSTEM ADI
3. **Product table:** 5 columns only - POZ NO | AÇIKLAMA | MİKTAR | BİRİM FİYAT | TOPLAM FİYAT. Internal columns (katsayi, list price, etc.) never exported.
4. **Engineering services:** Header, description paragraph (xxx replaced with actuals), 7 numbered items, excluded services disclaimer
5. **Commercial terms:** TİCARİ ŞARTLAR header, then ÜRETİCİ FİRMALAR, ONAYLAR, GARANTİ, TESLİM YERİ, ÖDEME, KDV, TESLİMAT, OPSİYON
6. **Notes:** NOTLAR header, 7 numbered notes including confidentiality clause

### Styling:
- BTS red (#E31E24) for accents
- Dark header row for column titles
- Clean borders, A4 landscape print area
- Professional typography matching their current output

---

## 7. Product Data Management

### Bulk import:
- Upload Master Price List Excel
- Maps: MARKA -> brand, KISA KOD -> shortCode, URUN KODU -> code, MODEL -> model, TR/ING rows -> nameTr/nameEn, LISTE FIYATI -> listPrice, PARA BIRIMI -> currency
- Preview with diff: "142 products, 38 price changes, 4 new"
- Creates BrandDiscount records from discount rate sheet
- Old prices preserved in PriceHistory

### Manual product creation:
- Full form: code, shortCode, brand, category, model, nameTr, nameEn, listPrice, costPrice, currency, pricingType
- Available from Products page

### Price updates:
- Admin uploads new supplier Excel
- System detects changes, shows preview
- Admin confirms update

---

## 8. Permission Model

### Roles (two roles, no Teknik/Destek users):

| Permission | Yonetim (ust) | Satis (orta) |
|---|---|---|
| canViewCosts | Yes | No |
| canApprove | Yes | No |
| canExport | Yes | Yes |
| canManageUsers | Yes | No |
| canEditProducts | Yes | No |
| canDelete | Yes | No |
| canOverrideKatsayi | Yes | No |

### Users to seed:
- Levent Ceylan (lceylan) - Yonetim
- Cansu Ceylan (cceylan) - Yonetim
- Murat Demirhan (mdemirhan) - Yonetim
- Firat Filiz (ffiliz) - Satis
- Selale Acar (sacar) - Satis

### Profit visibility (Yonetim only):
- Per-item: Maliyet, Kar, Kar %
- Per-quote: Toplam Maliyet, Toplam Kar, Kar Marji %
- Approval notifications include profit margin
- Low-margin items flagged in red
- Never exported to customer-facing documents

---

## 9. UI/UX Overhaul

### Design direction:
- Desktop-first, data-dense layout
- BTS brand: primary red (#E31E24), dark grays, white backgrounds
- Turkish language throughout (labels, buttons, statuses, tooltips)
- Professional feel - not a developer prototype

### Dashboard:
- Quote pipeline by status (visual)
- Pending approvals (Yonetim)
- Recent quotes
- Quick actions: Yeni Teklif, Urun Ara, Kur Guncelle
- Yonetim extras: monthly profit summary, top customers

### Navigation:
- Sidebar: Anasayfa, Teklifler, Urunler, Firmalar, Projeler, Ayarlar
- Breadcrumb navigation
- Header quick search

### Quote list:
- Sortable table with status badges (Turkish labels)
- Filters: status, company, date range, creator
- Quick preview on hover/click

---

## 10. Codebase Triage

### Keep as-is:
- Auth system (JWT, cookies, middleware)
- Company CRUD
- Project CRUD with status tracking
- Quote CRUD, status lifecycle, versioning
- Exchange rate + TCMB integration
- UI component library
- Prisma setup

### Modify:
- Quote items API (manual price, services, price history)
- Product API (shortCode, dual language, pricing type)
- Excel export (complete redesign)
- PDF export (regenerate from redesigned template)
- Quote editor page (full redesign)
- Product list (add import, short code mgmt)
- Role system (add canOverrideKatsayi)
- Prisma schema (per Section 3)

### Deprioritize (not in scope):
- Reports module
- Notifications system
- Saved filters
- Bulk status updates
- Quote comparison modal
- Bulk price update modal

### New to build:
- Service cost calculator
- Product catalog side panel
- Price history display in quote context
- Product Excel import
- Commercial terms builder with auto-selection
- Profit/cost management view
- BrandDiscount management page
- Dashboard redesign
- Overall UI/UX polish
