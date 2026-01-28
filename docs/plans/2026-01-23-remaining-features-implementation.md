# BTS Teklif - Remaining Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all remaining features from the original design document including Price History, Documents, Notifications UI, Approval Queue, Bulk Operations, and Audit Log.

**Architecture:** Continue using Next.js 14 App Router, Prisma ORM, and existing component patterns. File uploads use local storage with database path references.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Prisma, Lucide React

---

## Phase 2 Completion: Enhanced Workflow

### Task 2.1: Price History Popup

**Files:**
- Create: `src/components/quotes/PriceHistoryPopup.tsx`
- Create: `src/app/api/products/[id]/price-history/route.ts`
- Modify: `src/app/(dashboard)/quotes/[id]/QuoteItemRow.tsx` (add history button)

**What it does:**
- Shows historical prices for a product when clicking the history icon
- Displays previous prices to the current company
- Shows all recent prices across all companies
- Statistics: average, min, max katsayi
- "Apply this price" quick action

**API Response:**
```typescript
{
  companyHistory: [{ quoteNumber, date, unitPrice, katsayi, quantity }],
  allHistory: [{ company, quoteNumber, date, unitPrice, katsayi }],
  stats: { avgKatsayi, minKatsayi, maxKatsayi, avgUnitPrice }
}
```

---

### Task 2.2: Document Upload Service

**Files:**
- Create: `src/lib/services/document-service.ts`
- Create: `src/lib/services/document-service.test.ts`
- Create: `uploads/` directory with `.gitkeep`

**What it does:**
- Handles file upload to local storage
- Generates unique filenames
- Returns file path for database storage
- Supports PDF, DOC, DOCX, XLS, XLSX, images

---

### Task 2.3: Quote Documents API

**Files:**
- Create: `src/app/api/quotes/[id]/documents/route.ts` (GET, POST)
- Create: `src/app/api/quotes/[id]/documents/[docId]/route.ts` (GET, DELETE)

**What it does:**
- Upload documents to a quote
- List documents for a quote
- Download/view a document
- Delete a document

---

### Task 2.4: Quote Documents UI

**Files:**
- Create: `src/components/quotes/QuoteDocuments.tsx`
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx` (add documents section)

**What it does:**
- File upload dropzone
- List of attached documents with icons
- Download and delete actions
- File size and upload date display

---

### Task 2.5: Project Documents API & UI

**Files:**
- Create: `src/app/api/projects/[id]/documents/route.ts`
- Create: `src/app/api/projects/[id]/documents/[docId]/route.ts`
- Create: `src/components/projects/ProjectDocuments.tsx`
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx`

**What it does:**
- Same as quote documents but for projects
- Reuses document service

---

### Task 2.6: Notification API Routes

**Files:**
- Create: `src/app/api/notifications/route.ts` (GET list, POST create)
- Create: `src/app/api/notifications/[id]/route.ts` (PATCH mark as read)
- Create: `src/app/api/notifications/mark-all-read/route.ts` (POST)
- Create: `src/app/api/notifications/unread-count/route.ts` (GET)

**Endpoints:**
- `GET /api/notifications` - List user's notifications (paginated)
- `POST /api/notifications` - Create notification (internal use)
- `PATCH /api/notifications/[id]` - Mark as read
- `POST /api/notifications/mark-all-read` - Mark all as read
- `GET /api/notifications/unread-count` - Get unread count

---

### Task 2.7: Notification Triggers

**Files:**
- Modify: `src/app/api/quotes/[id]/status/route.ts`

**Add notification creation when:**
- Status → ONAY_BEKLIYOR: Notify users with canApprove role
- Status → ONAYLANDI: Notify quote creator
- Status → REVIZYON: Notify quote creator with revision reason

---

### Task 2.8: Notification UI Components

**Files:**
- Create: `src/components/notifications/NotificationDropdown.tsx`
- Create: `src/components/notifications/NotificationItem.tsx`
- Modify: `src/components/layout/Header.tsx` (integrate dropdown)

**What it does:**
- Bell icon with unread count badge
- Dropdown showing recent notifications
- Click to mark as read and navigate
- "Mark all as read" action
- "View all" link to full notifications page

---

### Task 2.9: Notifications Page

**Files:**
- Create: `src/app/(dashboard)/notifications/page.tsx`

**What it does:**
- Full list of all notifications
- Filter by read/unread
- Pagination
- Bulk mark as read

---

### Task 2.10: Approval Queue Page

**Files:**
- Create: `src/app/(dashboard)/approvals/page.tsx`
- Create: `src/components/approvals/ApprovalCard.tsx`

**What it does:**
- Lists quotes with status ONAY_BEKLIYOR
- Shows approval metrics for each (value, discount, katsayi flags)
- Quick approve/reject buttons
- Only visible to users with canApprove permission

---

## Phase 3: Polish & Optimization

### Task 3.1: Quote History Service

**Files:**
- Create: `src/lib/services/quote-history-service.ts`
- Create: `src/lib/services/quote-history-service.test.ts`

**Functions:**
```typescript
logQuoteAction(quoteId, userId, action, changes?)
getQuoteHistory(quoteId)
```

**Actions:** CREATE, UPDATE, STATUS_CHANGE, APPROVE, EXPORT, ITEM_ADD, ITEM_UPDATE, ITEM_DELETE

---

### Task 3.2: Quote History Integration

**Files:**
- Modify: `src/app/api/quotes/route.ts` (log CREATE)
- Modify: `src/app/api/quotes/[id]/route.ts` (log UPDATE)
- Modify: `src/app/api/quotes/[id]/status/route.ts` (log STATUS_CHANGE, APPROVE)
- Modify: `src/app/api/quotes/[id]/items/route.ts` (log ITEM changes)

---

### Task 3.3: Quote History UI

**Files:**
- Create: `src/components/quotes/QuoteHistoryPanel.tsx`
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx` (add history tab/section)

**What it does:**
- Timeline view of all quote changes
- Shows who, when, what changed
- Expandable details for field changes
- Filter by action type

---

### Task 3.4: Bulk Price Update

**Files:**
- Create: `src/app/api/products/bulk-update/route.ts`
- Create: `src/components/products/BulkPriceUpdateModal.tsx`
- Modify: `src/app/(dashboard)/products/page.tsx` (add bulk action)

**What it does:**
- Select multiple products
- Apply percentage increase/decrease to list price
- Apply to specific brand or category
- Preview changes before applying
- Confirm and execute

---

### Task 3.5: Bulk Status Change

**Files:**
- Create: `src/app/api/quotes/bulk-status/route.ts`
- Create: `src/components/quotes/BulkStatusModal.tsx`
- Modify: `src/app/(dashboard)/quotes/page.tsx` (add bulk action)

**What it does:**
- Select multiple quotes
- Change status in bulk (limited transitions)
- Add note for status change
- Permission checks

---

### Task 3.6: Saved Filters

**Files:**
- Create: Prisma model `SavedFilter`
- Create: `src/app/api/saved-filters/route.ts`
- Create: `src/components/common/SavedFiltersDropdown.tsx`
- Modify: `src/app/(dashboard)/quotes/page.tsx` (integrate saved filters)

**What it does:**
- Save current filter combination with a name
- Load saved filter
- Delete saved filter
- Per-user filters

---

## Implementation Order

1. **Task 2.1** - Price History Popup
2. **Task 2.2** - Document Upload Service
3. **Task 2.3** - Quote Documents API
4. **Task 2.4** - Quote Documents UI
5. **Task 2.5** - Project Documents
6. **Task 2.6** - Notification API Routes
7. **Task 2.7** - Notification Triggers
8. **Task 2.8** - Notification UI Components
9. **Task 2.9** - Notifications Page
10. **Task 2.10** - Approval Queue Page
11. **Task 3.1** - Quote History Service
12. **Task 3.2** - Quote History Integration
13. **Task 3.3** - Quote History UI
14. **Task 3.4** - Bulk Price Update
15. **Task 3.5** - Bulk Status Change
16. **Task 3.6** - Saved Filters

---

## Verification

After each task:
1. Run `npm test` - all tests should pass
2. Manual testing of the feature
3. Verify Turkish localization

After all tasks:
1. Full regression test
2. Test all user flows end-to-end
3. Verify permissions work correctly

---

## Critical Files Reference

| Area | Key Files |
|------|-----------|
| Quotes | `src/app/(dashboard)/quotes/[id]/page.tsx`, `src/app/api/quotes/` |
| Products | `src/app/(dashboard)/products/page.tsx`, `src/app/api/products/` |
| Projects | `src/app/(dashboard)/projects/[id]/page.tsx` |
| Layout | `src/components/layout/Header.tsx`, `Sidebar.tsx` |
| Notifications | `src/lib/services/notification-service.ts` |
| Schema | `prisma/schema.prisma` |
