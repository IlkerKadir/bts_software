# BTS Yangin - Full-Stack Audit Findings

**Audit Date:** 2026-02-07
**Audited By:** 10 parallel agents, each covering one section of the application
**Sections Audited:** Dashboard, Quotes, Orders, Projects, Companies, Products, Reports, Users, Settings, Approvals+Notifications

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [High Priority Issues](#2-high-priority-issues)
3. [Medium Priority Issues](#3-medium-priority-issues)
4. [Low Priority Issues](#4-low-priority-issues)
5. [Cross-Cutting Patterns](#5-cross-cutting-patterns)
6. [Suggested Fix Order](#6-suggested-fix-order)

---

## 1. Critical Issues

### C1. JWT_SECRET Has Hardcoded Fallback (SECURITY)
- **Section:** Users / Auth
- **Files:**
  - `src/lib/auth.ts` (lines 5-7)
  - `src/middleware.ts` (lines 7-9)
- **Current behavior:** Uses `'fallback-secret-change-me'` as default JWT_SECRET if environment variable is missing.
- **Expected behavior:** Require JWT_SECRET to be set; fail startup if missing.
- **Fix:**
  ```typescript
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
  ```

---

### C2. No Company Detail Page — Search Links 404
- **Section:** Companies
- **Files:** Missing file: `src/app/(dashboard)/companies/[id]/page.tsx`
- **Current behavior:** Header global search navigates to `/companies/${c.id}`, but no route exists. Users get a 404.
- **Expected behavior:** A company detail page showing company info, contacts, related quotes, and projects.
- **Fix:** Create `src/app/(dashboard)/companies/[id]/page.tsx` that fetches from `GET /api/companies/[id]` and displays all company data.

---

### C3. Contact Management UI Completely Missing
- **Section:** Companies
- **File:** `src/app/(dashboard)/companies/CompanyForm.tsx`
- **Current behavior:** CompanyForm defines Contact interface (lines 6-11) and includes contacts in the type, but has zero UI for managing contacts. The contacts JSON field is never displayed or edited.
- **Expected behavior:** Form should have dynamic fields to add/edit/remove contacts (name, title, email, phone per contact).
- **Fix:** Add a contacts section to CompanyForm with dynamic array form fields. Wire up to the existing API which already supports the contacts JSON field.

---

### C4. No "Create Order" Button in UI
- **Section:** Orders
- **Files:**
  - `src/app/api/orders/route.ts` (POST endpoint at line 101) — exists and works
  - `src/app/(dashboard)/quotes/[id]/page.tsx` — missing button
- **Current behavior:** The backend POST `/api/orders` endpoint is fully functional and accepts `{ quoteId, notes, deliveryDate }`. However, there is NO button or interface anywhere in the UI to trigger order creation. Users cannot create orders.
- **Expected behavior:** Quote detail page should have a "Siparis Olustur" button (visible when quote status is KAZANILDI) that calls the orders API.
- **Fix:** Add button to quote detail page action buttons section. Add state for `isCreatingOrder`, call `POST /api/orders` with the quoteId, redirect to `/orders` on success.

---

### C5. `nameEn` Field Missing From ProductForm
- **Section:** Products
- **Files:**
  - `src/app/(dashboard)/products/ProductForm.tsx` — missing field
  - `src/lib/validations/product.ts` — missing from Zod schema
  - Prisma schema has `nameEn` field on Product model
- **Current behavior:** ProductForm only handles `nameTr` (Turkish name). The English name field (`nameEn`) cannot be entered or edited through the UI despite existing in the database schema.
- **Expected behavior:** Product form should have an input for both Turkish and English product names.
- **Fix:**
  1. Add `nameEn: z.string().optional().nullable()` to validation schema
  2. Add `nameEn` to ProductFormData interface
  3. Add Input field for English name in the form
  4. Include `nameEn` in the API payload

---

### C6. Dashboard ProfitSummary Calculation Mismatch
- **Section:** Dashboard
- **Files:**
  - `src/app/(dashboard)/dashboard/page.tsx` (lines 54-61)
  - `src/app/api/dashboard/stats/route.ts` (lines 64-65)
- **Current behavior:** The dashboard page's `getProfitSummary()` calculates revenue by summing `item.totalPrice` per item. The stats API calculates revenue as `subtotal - discountTotal` per quote. These produce different results.
- **Expected behavior:** Single source of truth for revenue calculation.
- **Fix:** Update `getProfitSummary()` in page.tsx to use `Number(quote.subtotal) - Number(quote.discountTotal)` instead of summing individual item totalPrices. Add `subtotal` and `discountTotal` to the select query.

---

### C7. Decimal Serialization in Company Detail API
- **Section:** Companies
- **File:** `src/app/api/companies/[id]/route.ts` (lines 20-37)
- **Current behavior:** Returns quote `grandTotal` as raw Prisma Decimal object without conversion. Frontend receives `Decimal { _isDecimal: true, d: [...] }` instead of a number.
- **Expected behavior:** All Decimal fields should be converted to numbers before JSON response.
- **Fix:** Map the response to convert Decimals:
  ```typescript
  quotes: quotes.map(q => ({
    ...q,
    grandTotal: Number(q.grandTotal)
  }))
  ```

---

### C8. `isActive` Boolean Query Parameter Parsing Bug
- **Section:** Companies
- **File:** `src/lib/validations/company.ts` (line 27)
- **Current behavior:** The validation schema uses `.transform(val => val === 'true')` which converts any non-'true' string to `false`, but doesn't properly validate input.
- **Expected behavior:** Properly parse boolean query parameter.
- **Fix:** Use `z.enum(['true', 'false']).transform(val => val === 'true').optional()` or `z.coerce.boolean().optional()`.

---

## 2. High Priority Issues

### H1. Quote `language` Field Not Saved in PUT Endpoint
- **Section:** Quotes
- **File:** `src/app/api/quotes/[id]/route.ts` (lines 109-130)
- **Current behavior:** The PUT endpoint doesn't handle the `language` field. Frontend QuoteEditor sends `language` in header updates, but backend ignores it. Language selection (TR/EN) reverts on page refresh.
- **Expected behavior:** Language should be persisted.
- **Fix:** Add `if (body.language !== undefined) updateData.language = body.language;` to the PUT handler.

---

### H2. Date Range Filter Ignored by Quote List API
- **Section:** Quotes
- **Files:**
  - `src/app/(dashboard)/quotes/QuoteList.tsx` (lines 116-117) — sends `dateFrom` and `dateTo`
  - `src/app/api/quotes/route.ts` — never reads these params
- **Current behavior:** Frontend sends `dateFrom` and `dateTo` query parameters, but the API completely ignores them. Date filtering appears to work in the UI but doesn't actually filter.
- **Expected behavior:** API should filter quotes by `createdAt` date range.
- **Fix:** Parse date params and add to the Prisma where clause:
  ```typescript
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
  if (dateTo) where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };
  ```

---

### H3. Quote List Sorting Done Entirely in Frontend
- **Section:** Quotes
- **Files:**
  - `src/app/(dashboard)/quotes/QuoteList.tsx` (lines 245-265) — frontend sorting
  - `src/app/api/quotes/route.ts` (lines 58-71) — always returns `createdAt: 'desc'`
- **Current behavior:** QuoteList sorts data client-side after fetching from API. API always returns results ordered by `createdAt: 'desc'`.
- **Expected behavior:** Sorting should be done server-side, especially with pagination. Current approach breaks: user sorts page 1, then navigates to page 2 which has a different sort order.
- **Fix:** Add `sortField` and `sortDirection` query parameters to the API. Apply in Prisma `orderBy`.

---

### H4. Reports Export Missing Sales Rep Restriction (SECURITY)
- **Section:** Reports
- **File:** `src/app/api/reports/quotes/export/route.ts` (lines 20-89)
- **Current behavior:** Export checks `canExport` permission but does NOT enforce the sales rep restriction. A sales rep with `canExport` could export all quotes in the system.
- **Expected behavior:** Apply the same `where.createdById = user.id` restriction as the main reports API.
- **Fix:** Add before the query:
  ```typescript
  if (!user.role.canManageUsers && !user.role.canApprove) {
    where.createdById = user.id;
  }
  ```

---

### H5. No Rate Limiting on Login Endpoint
- **Section:** Users / Auth
- **File:** `src/app/api/auth/login/route.ts`
- **Current behavior:** No brute force protection on login endpoint. Unlimited login attempts allowed.
- **Expected behavior:** Rate limiting to prevent brute force attacks.
- **Fix:** Add rate limiting middleware (e.g., in-memory counter per IP, or use `@upstash/ratelimit`).

---

### H6. No Frontend Permission Checks on Users/Roles Pages
- **Section:** Users
- **Files:**
  - `src/app/(dashboard)/users/UserList.tsx`
  - `src/app/(dashboard)/settings/roles/page.tsx`
- **Current behavior:** Pages render without checking if current user has `canManageUsers` permission. Backend rejects unauthorized API calls, but UI loads anyway showing an empty/broken page.
- **Expected behavior:** Check permissions on page load and show "access denied" or redirect.
- **Fix:** Add permission check after `getSession()` call, show unauthorized message or redirect if user lacks `canManageUsers`.

---

### H7. `canOverrideKatsayi` Permission Exists but Never Enforced
- **Section:** Users / Quotes
- **Files:**
  - Prisma schema — `Role` model has `canOverrideKatsayi` field
  - `src/components/quotes/QuoteItemRow.tsx` — katsayi field always editable
- **Current behavior:** The permission field exists in the database and role management UI but is never checked. Any user can edit katsayi values in the quote editor.
- **Expected behavior:** Katsayi editing should be restricted to users with `canOverrideKatsayi` permission.
- **Fix:** Thread `canOverrideKatsayi` prop through QuoteEditor -> QuoteItemsTable -> QuoteItemRow. Make the katsayi cell read-only when the user lacks this permission.

---

### H8. Service Cost History Endpoint Missing
- **Section:** Settings
- **Files:**
  - `src/components/settings/ServiceCostSettings.tsx` (lines 159-171) — calls `?history=true`
  - `src/app/api/settings/service-costs/route.ts` — ignores `history` param
- **Current behavior:** Frontend calls `/api/settings/service-costs?history=true` but the backend GET handler ignores the query parameter. History feature doesn't work.
- **Expected behavior:** Backend should return historical (inactive) configs when `history=true` is passed.
- **Fix:** Add query parameter handling in the GET function:
  ```typescript
  const includeHistory = searchParams.get('history') === 'true';
  if (includeHistory) {
    const history = await db.serviceCostConfig.findMany({
      where: { isActive: false },
      orderBy: { validFrom: 'desc' }
    });
    return NextResponse.json({ history });
  }
  ```

---

### H9. Product Category Column Not Displayed
- **Section:** Products
- **File:** `src/app/(dashboard)/products/ProductList.tsx` (lines 219-229)
- **Current behavior:** Category data is fetched from API and available in the product object, but no table column renders it.
- **Expected behavior:** A category column should appear between Model and Liste Fiyati.
- **Fix:** Add a `<td>` for `product.category?.name || '-'` in the table body.

---

### H10. BulkPriceUpdateModal Exists but Never Integrated
- **Section:** Products
- **Files:**
  - `src/components/products/BulkPriceUpdateModal.tsx` — fully implemented
  - `src/app/(dashboard)/products/ProductList.tsx` — imports it (line 8) but never renders it
- **Current behavior:** The bulk price update modal component is complete but never wired into the product list. Import is dead code.
- **Expected behavior:** Product list should have checkbox selection and a toolbar button to open the bulk update modal.
- **Fix:** Add checkbox column to product table, track selected products, render BulkPriceUpdateModal with a trigger button.

---

### H11. Product Search Doesn't Search by Brand Name
- **Section:** Products
- **File:** `src/app/api/products/route.ts` (lines 27-35)
- **Current behavior:** Search uses OR conditions on code, shortCode, name, nameTr, model. Brand name is not searched.
- **Expected behavior:** Users should be able to find products by typing a brand name.
- **Fix:** Add nested brand search condition: `{ brand: { name: { contains: query, mode: 'insensitive' } } }`

---

### H12. Orders Decimal Type Mismatch
- **Section:** Orders
- **Files:**
  - `src/app/(dashboard)/orders/page.tsx` (lines 131-145)
  - `src/app/(dashboard)/orders/[id]/page.tsx` (lines 135-142)
- **Current behavior:** Frontend `formatPrice` function expects Prisma Decimal objects with `.toNumber()`, but API returns Decimal values serialized as strings.
- **Expected behavior:** Consistent number type from API.
- **Fix:** Either convert Decimals to numbers in the API response, or update frontend formatPrice to handle strings with `parseFloat()`.

---

### H13. Orders Page Shows No Error Messages to Users
- **Section:** Orders
- **File:** `src/app/(dashboard)/orders/page.tsx` (lines 86-107)
- **Current behavior:** If API returns `response.ok === false`, the error is silently ignored. Only logged to console.
- **Expected behavior:** Display error message to user.
- **Fix:** Add `error` state, set it on failed responses, render error banner in UI.

---

### H14. Project API Missing `currency` Field for Quotes
- **Section:** Projects
- **File:** `src/app/api/projects/[id]/route.ts` (line 24)
- **Current behavior:** Quote select only includes `id, quoteNumber, status, grandTotal`. Frontend tries to format with `quote.currency` which is undefined.
- **Expected behavior:** Include `currency` in the select.
- **Fix:** Add `currency: true` to the quotes select in the project detail API.

---

### H15. Project Detail Only Shows 10 Quotes
- **Section:** Projects
- **File:** `src/app/api/projects/[id]/route.ts` (line 26)
- **Current behavior:** `take: 10` limits related quotes to 10 most recent. No pagination.
- **Expected behavior:** Show all quotes or implement pagination.
- **Fix:** Remove `take: 10` or add pagination controls.

---

### H16. Dashboard ActivityFeed and DashboardCharts Have No Error States
- **Section:** Dashboard
- **Files:**
  - `src/components/dashboard/ActivityFeed.tsx` (lines 25-28)
  - `src/components/dashboard/DashboardCharts.tsx` (lines 34-42)
- **Current behavior:** Both components catch errors and log to console. No visual error feedback to user. If API fails, components show nothing.
- **Expected behavior:** Show error message or empty state with retry option.
- **Fix:** Add `error` state, check `response.ok`, render error UI.

---

## 3. Medium Priority Issues

### M1. Turkish Character Encoding Broken in Multiple Files
- **Section:** Dashboard, Orders, Approvals
- **Files:**
  - `src/components/dashboard/ActivityFeed.tsx` (lines 17-21): `olusturdu` -> `olusturdu`, `guncelledi` -> `guncelledi`, `degistirdi` -> `degistirdi`
  - `src/app/(dashboard)/orders/page.tsx` (lines 46-60): `Hazirlaniyor` -> `Hazirlaniyor`, `Onaylandi` -> `Onaylandi`
  - `src/app/(dashboard)/orders/[id]/page.tsx` (lines 55-61): Same as above
  - `src/app/api/cron/reminders/route.ts` (lines 37-56): `Hatirlatmasi` -> `Hatirlatmasi`, `gundur` -> `gundur`
- **Current behavior:** ASCII transliteration used instead of proper Turkish characters (i, s, u, g, c missing diacritics).
- **Expected behavior:** Proper Turkish: `olusturdu`, `guncelledi`, `Hazirlaniyor`, `Onaylandi`, `Gonderildi`, `Tamamlandi`, `Hatirlatmasi`.
- **Fix:** Find and replace all affected strings with proper Turkish characters.

---

### M2. Dashboard ActivityFeed Wrong Date Method
- **Section:** Dashboard
- **File:** `src/components/dashboard/ActivityFeed.tsx` (line 51)
- **Current behavior:** Uses `toLocaleDateString('tr-TR', { day, month, hour, minute })` but `hour` and `minute` options don't work with `toLocaleDateString()`.
- **Expected behavior:** Use `toLocaleString()` instead to include both date and time.
- **Fix:** Change `toLocaleDateString` to `toLocaleString`.

---

### M3. Dashboard `/api/dashboard/stats` Route Never Called (Dead API)
- **Section:** Dashboard
- **File:** `src/app/api/dashboard/stats/route.ts`
- **Current behavior:** API route exists with pipeline counts and profit summary, but the dashboard page.tsx uses server-side functions instead. This route is never called from any frontend page.
- **Expected behavior:** Either remove the dead route or use it from the frontend.
- **Fix:** Remove the file, or refactor dashboard to use it as a client-side fetch.

---

### M4. Quote Number Generation Race Condition
- **Section:** Quotes
- **File:** `src/app/api/quotes/route.ts` (lines 92-104)
- **Current behavior:** Quote number generation reads the last quote, then generates the next number. Not atomic — two simultaneous requests could get the same number.
- **Expected behavior:** Use database-level locking or atomic operations.
- **Fix:** Use a transaction with a serializable isolation level, or use a database sequence.

---

### M5. Cost Price Data May Leak in profitSummary
- **Section:** Quotes
- **File:** `src/app/api/quotes/[id]/route.ts` (lines 76-81)
- **Current behavior:** API strips costPrice from items for users without `canViewCosts`, but the profitSummary (which derives from cost data) is still returned.
- **Expected behavior:** profitSummary should be omitted or nullified for users without `canViewCosts`.
- **Fix:** Conditionally omit profitSummary from the response when user lacks `canViewCosts`.

---

### M6. Decimal-to-Number Conversion Inconsistent Across APIs
- **Section:** Quotes, Products, Orders, Companies
- **Files:** Multiple API routes handle Prisma Decimal values differently:
  - Some explicitly convert with `Number()` (e.g., `products/search/route.ts`)
  - Some return raw Decimal objects (e.g., `companies/[id]/route.ts`)
  - Some rely on JSON serialization (e.g., `products/route.ts`)
- **Expected behavior:** All API routes should explicitly convert Decimal fields to numbers before returning JSON.
- **Fix:** Create a utility function and apply consistently:
  ```typescript
  function toNumber(val: Decimal | number | string | null): number {
    if (val === null) return 0;
    return typeof val === 'number' ? val : parseFloat(String(val));
  }
  ```

---

### M7. Orders — No Permission Check for Order Creation
- **Section:** Orders
- **File:** `src/app/api/orders/route.ts` (lines 101-168)
- **Current behavior:** POST endpoint checks authentication but NOT role-based permissions. Any authenticated user can create orders.
- **Expected behavior:** Restrict order creation to authorized users.
- **Fix:** Add role-based permission check (e.g., require quote to be in KAZANILDI status, or add a `canCreateOrders` permission).

---

### M8. Orders — No Edit UI for Notes or Delivery Date
- **Section:** Orders
- **File:** `src/app/(dashboard)/orders/[id]/page.tsx`
- **Current behavior:** PATCH API supports updating `status`, `notes`, and `deliveryDate`, but UI only allows status changes. No edit capability for notes or delivery date.
- **Expected behavior:** Order detail page should have inline editing for notes and a date picker for delivery date.
- **Fix:** Add edit mode for notes (textarea) and delivery date (date input) with save button that calls PATCH.

---

### M9. Settings — Lifting Equipment Rates Are Read-Only
- **Section:** Settings
- **Files:**
  - `src/components/settings/ServiceCostSettings.tsx` (lines 441-484) — display only
  - No CRUD API endpoints for lifting equipment
- **Current behavior:** Lifting rates are displayed in the settings page but cannot be created, updated, or deleted through the UI or API.
- **Expected behavior:** Full CRUD for lifting equipment rates.
- **Fix:** Create API endpoints at `/api/settings/lifting-equipment` (GET, POST, PUT, DELETE) and add management UI.

---

### M10. Settings — Commercial Terms API Only Has GET
- **Section:** Settings
- **File:** `src/app/api/settings/commercial-terms/route.ts`
- **Current behavior:** Only GET endpoint exists. No POST, PUT, or DELETE for managing commercial term templates.
- **Expected behavior:** Full CRUD API for commercial terms management.
- **Fix:** Add POST (create), PUT (update), DELETE endpoints.

---

### M11. Reports — No Pagination for Quotes List
- **Section:** Reports
- **Files:**
  - `src/app/(dashboard)/reports/page.tsx` (lines 429-478)
  - `src/app/api/reports/quotes/route.ts`
- **Current behavior:** Returns ALL quotes matching filter. Large datasets (1000+ quotes) load entirely.
- **Expected behavior:** Paginated results with limit/offset.
- **Fix:** Add `limit` and `offset` query params, return paginated results, add pagination controls in UI.

---

### M12. Reports — `groupedData` Calculated but Never Displayed
- **Section:** Reports
- **Files:**
  - `src/app/api/reports/quotes/route.ts` (lines 117-147)
  - `src/app/(dashboard)/reports/page.tsx` (lines 40-53)
- **Current behavior:** Backend calculates `groupedData` by status/company/user/month and returns it. Frontend defines it in the interface but never renders it. `groupBy` query param is never sent.
- **Expected behavior:** Either display groupedData or remove the dead code.
- **Fix:** Either implement grouping UI or remove from API and interface.

---

### M13. Reports — No Error Messages Shown to User
- **Section:** Reports
- **File:** `src/app/(dashboard)/reports/page.tsx` (lines 85-105)
- **Current behavior:** API failures logged to console. No visual feedback.
- **Expected behavior:** Show error alert/toast.
- **Fix:** Add error state, check `response.ok`, display error banner.

---

### M14. Approvals — NotificationPanel PATCH Missing Body
- **Section:** Approvals / Notifications
- **File:** `src/components/notifications/NotificationPanel.tsx` (line 50)
- **Current behavior:** Sends `PATCH` without body or Content-Type header: `fetch(\`/api/notifications/${id}\`, { method: 'PATCH' })`.
- **Expected behavior:** Send proper JSON body with `{ isRead: true }` and Content-Type header.
- **Fix:**
  ```typescript
  fetch(`/api/notifications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
  ```

---

### M15. Approvals — No DELETE Notification Endpoint
- **Section:** Approvals / Notifications
- **Files:**
  - No DELETE route in `src/app/api/notifications/`
  - `src/app/(dashboard)/notifications/page.tsx` (line 5) — imports `Trash2` icon (unused)
- **Current behavior:** Notifications cannot be deleted. They accumulate indefinitely.
- **Expected behavior:** Users should be able to delete notifications.
- **Fix:** Create DELETE endpoint at `/api/notifications/[id]/route.ts` and add delete button to notification UI.

---

### M16. Approvals — `STATUS_CHANGED` Type Never Created
- **Section:** Approvals / Notifications
- **File:** `src/app/(dashboard)/notifications/page.tsx` (lines 18-34)
- **Current behavior:** `STATUS_CHANGED` notification type is defined in the UI type labels/variants, but no API ever creates notifications of this type. Dead code path.
- **Expected behavior:** Either create STATUS_CHANGED notifications when quote status changes, or remove from UI mappings.
- **Fix:** Add notification creation in the quote status change handler, or remove the type from the UI.

---

### M17. Products — Import Preview Type Mismatch
- **Section:** Products
- **File:** `src/components/products/ProductImportModal.tsx` (lines 27-35)
- **Current behavior:** PreviewProduct type uses `brand: string` but the API returns `brandName: string`.
- **Expected behavior:** Types should match API response.
- **Fix:** Change `brand` to `brandName` in the PreviewProduct interface.

---

### M18. Companies — Header Search Expects `sector` Field
- **Section:** Companies
- **File:** `src/components/layout/Header.tsx` (line 121)
- **Current behavior:** Header search expects companies to have optional `sector` field for subtitle display. Company model has no `sector` field. Shows `undefined`.
- **Expected behavior:** Either add sector field to Company model or remove from search display.
- **Fix:** Remove `subtitle: c.sector` from search results, or add `sector` to Company schema.

---

### M19. Projects — Delete Button Has No Loading State
- **Section:** Projects
- **File:** `src/app/(dashboard)/projects/ProjectList.tsx` (line 337)
- **Current behavior:** Delete confirmation button has no loading/disabled state during deletion. Users can double-click.
- **Expected behavior:** Button should show loading state and be disabled while deletion is in progress.
- **Fix:** Add `isDeleting` state, pass as `disabled` prop to button, show spinner.

---

### M20. Approvals — No Sidebar Link to Notifications Page
- **Section:** Approvals / Notifications
- **File:** `src/components/layout/Sidebar.tsx` (lines 25-32)
- **Current behavior:** No link to `/notifications` page in sidebar. Only accessible via header bell icon.
- **Expected behavior:** Add navigation link for discoverability.
- **Fix:** Add notifications link to sidebar menu.

---

## 4. Low Priority Issues

### L1. Products — BulkPriceUpdateModal Always Shows EUR Symbol
- **File:** `src/components/products/BulkPriceUpdateModal.tsx` (line 113)
- **Issue:** `formatPrice` always uses EUR regardless of actual product currency.
- **Fix:** Pass currency as parameter from product data.

---

### L2. Products — Missing Error Handling for Brands/Categories Fetch
- **File:** `src/app/(dashboard)/products/ProductForm.tsx` (lines 72-91)
- **Issue:** If brands/categories fetch fails, form silently continues with empty arrays. No error shown.
- **Fix:** Capture errors and display warning to user.

---

### L3. Quotes — Context Menu Positioning Can Go Offscreen
- **File:** `src/components/quotes/QuoteItemRow.tsx` (lines 534-577)
- **Issue:** Context menu uses `position: fixed` at cursor position. Can render outside viewport near screen edges.
- **Fix:** Add viewport bounds checking before positioning.

---

### L4. Quotes — Quote Comparison and Revert APIs Have No UI
- **Files:**
  - `src/app/api/quotes/[id]/compare/[compareId]/route.ts` — API exists
  - `src/app/api/quotes/[id]/revert/route.ts` — API exists
- **Issue:** Both APIs work but have no corresponding UI buttons or modals.
- **Fix:** Add "Compare" button on revision history and "Revert" button with confirmation modal.

---

### L5. Dashboard — Unused `Trash2` Import in ActivityFeed
- **File:** `src/components/dashboard/ActivityFeed.tsx` (line 4)
- **Issue:** `Trash2` imported but used for `ITEM_DELETE` action (line 15). Actually used — not dead code.
- **Status:** False positive — no fix needed.

---

### L6. Products — Unused BulkPriceUpdateModal Import
- **File:** `src/app/(dashboard)/products/ProductList.tsx` (line 8)
- **Issue:** `BulkPriceUpdateModal` imported but never rendered. Dead import.
- **Fix:** Remove import (or integrate the modal — see H10).

---

### L7. Settings — Template GET Has No Permission Check
- **File:** `src/app/api/settings/template/route.ts` (lines 54-77)
- **Issue:** GET endpoint only checks authentication, not role permissions. Any logged-in user can read template settings.
- **Fix:** Either add permission check or document this as intentional (needed for quote exports by all users).

---

### L8. Users — Weak Password Policy
- **File:** `src/lib/validations/user.ts` (lines 8-10)
- **Issue:** Minimum password length is only 6 characters.
- **Fix:** Increase to 8+ characters, consider requiring uppercase, numbers, special characters.

---

### L9. Users — No Audit Logging for User/Role Management
- **Files:** All user/role management API endpoints
- **Issue:** No audit trail for who created, modified, or deleted users and roles.
- **Fix:** Create AuditLog table and log all sensitive operations.

---

### L10. Orders — No Confirmation Modal for Status Changes
- **File:** `src/app/(dashboard)/orders/[id]/page.tsx`
- **Issue:** Changing order status (especially IPTAL) applies immediately without confirmation.
- **Fix:** Add confirmation modal for irreversible status changes.

---

## 5. Cross-Cutting Patterns

These issues appear repeatedly across multiple sections:

### Pattern 1: Turkish Character Encoding
**Affected sections:** Dashboard, Orders, Approvals
**Description:** ASCII transliteration used instead of proper Turkish characters throughout status labels, action labels, and notification messages. All instances of `i`, `s`, `u`, `g`, `c` should use proper Turkish diacritics.

### Pattern 2: Prisma Decimal Serialization
**Affected sections:** Companies, Orders, Products, Quotes
**Description:** Different API endpoints handle Prisma Decimal-to-number conversion differently. Some use `Number()`, some rely on JSON serialization, some return raw Decimal objects.
**Solution:** Create a shared utility function and apply consistently across all APIs.

### Pattern 3: Silent Error Handling
**Affected sections:** Dashboard, Orders, Reports
**Description:** Multiple components catch fetch errors and only log to console. No user-facing error messages.
**Solution:** Add error state management and error UI components to all data-fetching components.

### Pattern 4: Missing Frontend Permission Checks
**Affected sections:** Users, Approvals
**Description:** Pages render their full UI before discovering (via failed API calls) that the user lacks permissions.
**Solution:** Check permissions on page load and show access-denied message or redirect.

### Pattern 5: Dead/Unused Code
**Affected sections:** Products, Reports, Approvals, Dashboard
**Description:** Imported components, defined interfaces, and API endpoints that are never used.
**Solution:** Audit and remove all dead code in a cleanup pass.

---

## 6. Suggested Fix Order

### Phase 1: Security (Do First)
1. C1 — Remove JWT_SECRET fallback
2. H4 — Fix reports export sales rep restriction
3. H5 — Add rate limiting on login
4. M5 — Hide profitSummary from users without canViewCosts
5. L8 — Strengthen password policy

### Phase 2: Broken Features (Critical Path)
6. C2 — Create company detail page
7. C4 — Add "Create Order" button
8. C5 — Add nameEn to ProductForm
9. H1 — Save language field in quote PUT
10. H2 — Implement date range filter in quotes API
11. C7 — Fix Decimal serialization in company API
12. C8 — Fix isActive boolean parsing
13. H8 — Implement service cost history endpoint

### Phase 3: Data Consistency
14. M6 — Standardize Decimal-to-number conversion across all APIs
15. M1 — Fix Turkish characters everywhere
16. C6 — Fix dashboard profit calculation
17. H12 — Fix orders Decimal type handling
18. H14 — Add currency to project quotes API
19. M2 — Fix ActivityFeed date method

### Phase 4: Missing UI / Features
20. C3 — Add contact management UI to company form
21. H6 — Add frontend permission checks
22. H7 — Enforce canOverrideKatsayi
23. H9 — Display product category column
24. H10 — Wire BulkPriceUpdateModal
25. H11 — Add brand name to product search
26. M8 — Add order notes/delivery date editing
27. M14 — Fix NotificationPanel PATCH body
28. M15 — Add notification DELETE endpoint
29. M20 — Add notifications sidebar link

### Phase 5: Backend Improvements
30. H3 — Move quote sorting to backend
31. H15 — Remove 10-quote limit on project detail
32. M4 — Fix quote number race condition
33. M7 — Add order creation permission check
34. M9 — Lifting equipment CRUD
35. M10 — Commercial terms full CRUD
36. M11 — Reports pagination

### Phase 6: Polish & Cleanup
37. H13 — Orders error display
38. H16 — Dashboard error states
39. M13 — Reports error display
40. M3 — Remove dead dashboard stats API
41. M12 — Remove or implement groupedData
42. M16 — Create or remove STATUS_CHANGED notification type
43. L1-L10 — All low priority items
44. Pattern 5 — Dead code cleanup pass
