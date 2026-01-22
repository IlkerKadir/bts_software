# BTS Teklif Yönetim Sistemi - Design System

> **LOGIC:** When building a specific page, first check `pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** BTS Teklif Yönetim Sistemi
**Generated:** 2025-01-23
**Category:** B2B Quote Management Dashboard

---

## Design Philosophy

This is a **data-dense enterprise dashboard** for preparing 20-30 quotes daily. The UI must be:

1. **Fast to use** - Keyboard navigation, minimal clicks, Excel-like familiarity
2. **Information dense** - Show relevant data without overwhelming
3. **Professional** - Trust-building, clean, corporate feel
4. **Accessible** - WCAG AA compliant, works for all users

---

## Color Palette

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#0F172A` | `slate-900` | Headers, primary text, sidebar |
| Secondary | `#334155` | `slate-700` | Secondary text, labels |
| CTA/Accent | `#0369A1` | `sky-700` | Buttons, links, active states |
| CTA Hover | `#0284C7` | `sky-600` | Button hover states |
| Background | `#F8FAFC` | `slate-50` | Page background |
| Surface | `#FFFFFF` | `white` | Cards, modals, inputs |
| Text | `#020617` | `slate-950` | Body text |
| Muted | `#64748B` | `slate-500` | Placeholder, disabled text |
| Border | `#E2E8F0` | `slate-200` | Borders, dividers |
| Success | `#16A34A` | `green-600` | Success states, "Kazanıldı" |
| Warning | `#D97706` | `amber-600` | Warnings, "Onay Bekliyor" |
| Error | `#DC2626` | `red-600` | Errors, "Kaybedildi" |
| Info | `#2563EB` | `blue-600` | Info badges |

### Status Colors

| Status | Background | Text | Border |
|--------|------------|------|--------|
| Taslak | `slate-100` | `slate-700` | `slate-300` |
| Onay Bekliyor | `amber-50` | `amber-700` | `amber-300` |
| Onaylandı | `sky-50` | `sky-700` | `sky-300` |
| Gönderildi | `blue-50` | `blue-700` | `blue-300` |
| Takipte | `purple-50` | `purple-700` | `purple-300` |
| Revizyon | `orange-50` | `orange-700` | `orange-300` |
| Kazanıldı | `green-50` | `green-700` | `green-300` |
| Kaybedildi | `red-50` | `red-700` | `red-300` |
| İptal | `gray-100` | `gray-500` | `gray-300` |

---

## Typography

### Font Stack

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

- **Primary Font:** Inter (clean, professional, excellent for data)
- **Monospace (numbers):** `font-variant-numeric: tabular-nums` for aligned numbers in tables

### Type Scale

| Element | Size | Weight | Line Height | Class |
|---------|------|--------|-------------|-------|
| H1 (Page title) | 24px | 700 | 1.2 | `text-2xl font-bold` |
| H2 (Section) | 20px | 600 | 1.3 | `text-xl font-semibold` |
| H3 (Card title) | 16px | 600 | 1.4 | `text-base font-semibold` |
| Body | 14px | 400 | 1.5 | `text-sm` |
| Small/Caption | 12px | 400 | 1.4 | `text-xs` |
| Table data | 13px | 400 | 1.4 | `text-[13px]` |
| Input | 14px | 400 | 1.5 | `text-sm` |

### Turkish Character Support

Ensure fonts support Turkish characters: ç, ğ, ı, İ, ö, ş, ü

---

## Spacing System

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| xs | 4px | `p-1` | Tight gaps, icon margins |
| sm | 8px | `p-2` | Inline spacing, small gaps |
| md | 12px | `p-3` | Input padding, compact cards |
| base | 16px | `p-4` | Standard padding |
| lg | 24px | `p-6` | Section padding |
| xl | 32px | `p-8` | Large gaps |
| 2xl | 48px | `p-12` | Page sections |

---

## Layout

### Sidebar Navigation

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────────┐                                                   │
│ │ LOGO   │  ══════════════════════════════════════════════  │
│ │        │                                                   │
│ ├────────┤                                                   │
│ │ Menu   │           Main Content Area                      │
│ │ Items  │                                                   │
│ │        │                                                   │
│ │        │                                                   │
│ ├────────┤                                                   │
│ │ User   │                                                   │
│ └────────┘                                                   │
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar width:** 240px (expanded), 64px (collapsed)
- **Main content:** Fluid, max-width 1440px centered
- **Sidebar background:** `slate-900` (dark)
- **Sidebar text:** `slate-300` (default), `white` (active)

### Grid System

- **Dashboard cards:** 12-column grid, responsive
- **Form layouts:** Max 2 columns on desktop
- **Tables:** Full width with horizontal scroll on mobile

---

## Components

### Buttons

```jsx
// Primary Button
<button className="
  bg-sky-700 hover:bg-sky-600
  text-white font-medium
  px-4 py-2.5 rounded-lg
  transition-colors duration-200
  cursor-pointer
  disabled:opacity-50 disabled:cursor-not-allowed
">
  Kaydet
</button>

// Secondary Button
<button className="
  bg-white hover:bg-slate-50
  text-slate-700 font-medium
  border border-slate-300
  px-4 py-2.5 rounded-lg
  transition-colors duration-200
  cursor-pointer
">
  İptal
</button>

// Danger Button
<button className="
  bg-red-600 hover:bg-red-700
  text-white font-medium
  px-4 py-2.5 rounded-lg
  transition-colors duration-200
  cursor-pointer
">
  Sil
</button>
```

### Form Inputs

```jsx
// Text Input
<div className="space-y-1.5">
  <label className="text-sm font-medium text-slate-700">
    Firma Adı
  </label>
  <input
    type="text"
    className="
      w-full px-3 py-2
      border border-slate-300 rounded-lg
      text-sm text-slate-900
      placeholder:text-slate-400
      focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent
      transition-shadow duration-200
    "
    placeholder="Firma adı giriniz..."
  />
</div>

// Select Dropdown
<select className="
  w-full px-3 py-2
  border border-slate-300 rounded-lg
  text-sm text-slate-900
  bg-white
  focus:outline-none focus:ring-2 focus:ring-sky-500
  cursor-pointer
">
  <option>Seçiniz...</option>
</select>
```

### Cards

```jsx
// Stats Card
<div className="
  bg-white rounded-xl
  border border-slate-200
  p-5
  hover:shadow-md
  transition-shadow duration-200
">
  <p className="text-sm text-slate-500">Bekleyen Teklifler</p>
  <p className="text-2xl font-bold text-slate-900 mt-1">24</p>
</div>

// Content Card
<div className="
  bg-white rounded-xl
  border border-slate-200
  overflow-hidden
">
  <div className="px-5 py-4 border-b border-slate-200">
    <h3 className="font-semibold text-slate-900">Card Title</h3>
  </div>
  <div className="p-5">
    {/* Content */}
  </div>
</div>
```

### Data Tables

```jsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50">
        <th className="text-left px-4 py-3 font-semibold text-slate-700">
          Teklif No
        </th>
        {/* ... */}
      </tr>
    </thead>
    <tbody>
      <tr className="
        border-b border-slate-100
        hover:bg-slate-50
        transition-colors duration-150
        cursor-pointer
      ">
        <td className="px-4 py-3 text-slate-900">2025-0142</td>
        {/* ... */}
      </tr>
    </tbody>
  </table>
</div>
```

### Quote Editor Grid (Spreadsheet-like)

```jsx
// Editable cell
<td className="
  px-2 py-1.5
  border border-slate-200
  focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-inset
">
  <input
    type="text"
    className="
      w-full h-full
      text-sm text-right
      font-[tabular-nums]
      bg-transparent
      focus:outline-none
    "
    value="0.85"
  />
</td>

// Header row (section divider)
<tr className="bg-slate-100">
  <td colSpan={8} className="
    px-4 py-2
    font-semibold text-slate-700 text-sm
    border-y border-slate-300
  ">
    YANGIN ALGILAMA SİSTEMİ
  </td>
</tr>
```

### Status Badges

```jsx
// Status Badge Component
const statusStyles = {
  taslak: 'bg-slate-100 text-slate-700 border-slate-300',
  onay_bekliyor: 'bg-amber-50 text-amber-700 border-amber-300',
  onaylandi: 'bg-sky-50 text-sky-700 border-sky-300',
  gonderildi: 'bg-blue-50 text-blue-700 border-blue-300',
  kazanildi: 'bg-green-50 text-green-700 border-green-300',
  kaybedildi: 'bg-red-50 text-red-700 border-red-300',
};

<span className={`
  inline-flex items-center
  px-2.5 py-0.5
  text-xs font-medium
  rounded-full
  border
  ${statusStyles[status]}
`}>
  {statusLabel}
</span>
```

### Modals

```jsx
// Modal Overlay
<div className="
  fixed inset-0
  bg-black/50
  backdrop-blur-sm
  z-50
  flex items-center justify-center
">
  {/* Modal Content */}
  <div className="
    bg-white
    rounded-xl
    shadow-2xl
    w-full max-w-lg
    mx-4
    max-h-[90vh]
    overflow-hidden
  ">
    {/* Header */}
    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-slate-900">Modal Title</h2>
      <button className="text-slate-400 hover:text-slate-600 cursor-pointer">
        <XIcon className="w-5 h-5" />
      </button>
    </div>

    {/* Body */}
    <div className="px-6 py-4 overflow-y-auto">
      {/* Content */}
    </div>

    {/* Footer */}
    <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
      <button>İptal</button>
      <button>Kaydet</button>
    </div>
  </div>
</div>
```

---

## Icons

Use **Lucide React** icons consistently throughout the app.

```bash
npm install lucide-react
```

Common icons for this app:
- `Plus` - Add new
- `Pencil` - Edit
- `Trash2` - Delete
- `Download` - Export/Download
- `Upload` - Import/Upload
- `Search` - Search
- `Filter` - Filter
- `ChevronDown` - Dropdown
- `ChevronRight` - Expand/Navigate
- `Check` - Success/Complete
- `X` - Close/Cancel
- `AlertCircle` - Warning/Error
- `FileText` - Document/Quote
- `Building2` - Company
- `FolderOpen` - Project
- `Users` - Users/Team
- `Settings` - Settings
- `History` - History/Versions
- `Clock` - Time/Pending
- `TrendingUp` - Analytics

---

## Animations & Transitions

### Standard Transitions

```css
/* Default transition for most elements */
transition-colors duration-200

/* For shadows and transforms */
transition-all duration-200

/* For modals and overlays */
transition-opacity duration-300
```

### Loading States

```jsx
// Skeleton loading
<div className="animate-pulse">
  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
</div>

// Spinner
<svg className="animate-spin h-5 w-5 text-sky-600" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
```

### Reduced Motion

```jsx
// Respect user preferences
<div className="
  transition-transform duration-200
  motion-reduce:transition-none
  motion-reduce:transform-none
">
```

---

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Small tablets |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### Mobile Considerations

- Sidebar collapses to hamburger menu on `< lg`
- Tables get horizontal scroll wrapper
- Quote editor switches to stacked card view on mobile
- Touch targets minimum 44x44px

---

## Accessibility Checklist

- [ ] All interactive elements have `cursor-pointer`
- [ ] Focus states visible (ring-2 ring-sky-500)
- [ ] Color contrast minimum 4.5:1 for text
- [ ] Form inputs have associated labels
- [ ] Tables have proper `<th>` headers
- [ ] Modals trap focus and close with Escape
- [ ] Loading states announced to screen readers
- [ ] No emojis as icons (use SVG)
- [ ] `prefers-reduced-motion` respected

---

## Anti-Patterns (DO NOT USE)

- ❌ Emojis as icons — Use Lucide React SVG icons
- ❌ Missing `cursor-pointer` on clickable elements
- ❌ Scale transforms on hover that shift layout
- ❌ Low contrast text (< 4.5:1)
- ❌ Instant state changes without transitions
- ❌ Ornate/decorative design — Keep it functional
- ❌ Hidden or unclear navigation
- ❌ Tables without filtering/sorting capability
- ❌ Forms without validation feedback
- ❌ Buttons without loading states during async operations

---

## File Naming Conventions

```
components/
  ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Card.tsx
    Modal.tsx
    Badge.tsx
    Table.tsx
  quote/
    QuoteEditor.tsx
    QuoteItemRow.tsx
    QuoteTotals.tsx
  layout/
    Sidebar.tsx
    Header.tsx
    PageWrapper.tsx
```

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons
- [ ] All icons from Lucide React
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (200ms)
- [ ] Text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `motion-reduce` classes where appropriate
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed elements
- [ ] No horizontal scroll on mobile (except tables)
- [ ] Loading states for async operations
- [ ] Form validation with clear error messages
